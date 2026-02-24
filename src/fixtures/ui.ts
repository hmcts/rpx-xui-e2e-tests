import { createLogger } from "@hmcts/playwright-common";
import {
  test as base,
  expect,
  type Request,
  type Response,
} from "@playwright/test";

import {
  pageFixtures,
  type PageFixtures,
} from "../page-objects/pages/page.fixtures.js";
import {
  attachFailureDiagnosis,
  buildFailureDiagnosis,
  isBackendApiUrl,
  isFailureStatus,
  sanitizeErrorText,
  sanitizeUrlForLogs,
  type ApiErrorSignal,
  type NetworkFailureSignal,
  type SlowCallSignal,
} from "../utils/diagnostics/failure-diagnosis.utils.js";
import {
  acceptAnalyticsCookiesOnPage,
  installAnalyticsAutoAccept,
} from "../utils/ui/analytics.utils.js";
import { buildJurisdictionBootstrapFallbackMock } from "../utils/ui/jurisdiction-fallback.mock.js";
import { attachUiUserContext } from "../utils/ui/user-context.utils.js";
import {
  uiUtilsFixtures,
  type UiUtilsFixtures,
} from "../utils/ui/utils.fixtures.js";

export type UiFixtures = PageFixtures &
  UiUtilsFixtures & {
    autoAcceptAnalytics: void;
    attachFailureDiagnostics: void;
    attachUserContext: void;
  };

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);

const parseBooleanFlag = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (truthy.has(normalised)) return true;
  if (falsy.has(normalised)) return false;
  return fallback;
};

const resolveLoggerFormat = (): "pretty" | "json" => {
  const reporters = process.env.PLAYWRIGHT_REPORTERS ?? "";
  const odhinEnabled = reporters
    .split(",")
    .some((value) => value.trim() === "odhin");
  if (odhinEnabled || !process.stdout.isTTY) {
    return "json";
  }
  return "pretty";
};

const uiFailureLogger = createLogger({
  serviceName: "ui-failure-diagnostics",
  format: resolveLoggerFormat(),
});
const slowThresholdMs = parsePositiveInt(
  process.env.UI_SLOW_API_THRESHOLD_MS,
  5000,
);
const maxTrackedSignals = parsePositiveInt(
  process.env.UI_FAILURE_MAX_TRACKED_SIGNALS,
  500,
);

const JURISDICTION_BOOTSTRAP_5XX_MARKER =
  "jurisdiction-bootstrap-5xx-circuit-breaker";
const JURISDICTION_BOOTSTRAP_MOCK_FALLBACK_MARKER =
  "jurisdiction-bootstrap-mock-fallback";
const JURISDICTION_BOOTSTRAP_PATH_FRAGMENT = "/aggregated/caseworkers/";
const JURISDICTION_BOOTSTRAP_SUFFIX = "/jurisdictions";
const JURISDICTION_BOOTSTRAP_ROUTE =
  "**/aggregated/caseworkers/**/jurisdictions*";

type JurisdictionBootstrapCircuitBreakerState = {
  marker: string;
  status: number;
  url: string;
  timestamp: string;
};

type PageWithCircuitBreaker = {
  __jurisdictionBootstrapCircuitBreaker?: JurisdictionBootstrapCircuitBreakerState;
  __jurisdictionBootstrapFallbackUsed?: boolean;
  __jurisdictionBootstrapFallbackReason?: string;
};

export const test = base.extend<UiFixtures>({
  ...pageFixtures,
  ...uiUtilsFixtures,
  autoAcceptAnalytics: [
    async ({ page }, use) => {
      const handler = async () => {
        await acceptAnalyticsCookiesOnPage(page);
      };
      await installAnalyticsAutoAccept(page);
      page.on("domcontentloaded", handler);
      await acceptAnalyticsCookiesOnPage(page);
      await use(undefined);
      page.off("domcontentloaded", handler);
    },
    { auto: true },
  ],
  attachFailureDiagnostics: [
    async ({ page }, use, testInfo) => {
      const pageWithCircuitBreaker = page as typeof page &
        PageWithCircuitBreaker;
      const fallbackOnRetry = parseBooleanFlag(
        process.env.PW_JURISDICTIONS_FALLBACK_ON_RETRY,
        true,
      );
      const fallbackForce = parseBooleanFlag(
        process.env.PW_JURISDICTIONS_FALLBACK_FORCE,
        false,
      );
      const isRetryAttempt = testInfo.retry > 0;
      const shouldUseJurisdictionsFallback =
        fallbackForce || (fallbackOnRetry && isRetryAttempt);
      let retryMarkerAnnotated = false;
      let fallbackAnnotated = false;

      const apiErrors: ApiErrorSignal[] = [];
      const slowCalls: SlowCallSignal[] = [];
      const networkFailures: NetworkFailureSignal[] = [];

      const annotateRetryMarker = (description: string) => {
        if (retryMarkerAnnotated) {
          return;
        }
        testInfo.annotations.push({
          type: "Retry marker",
          description,
        });
        retryMarkerAnnotated = true;
      };

      const annotateFallbackMode = (description: string) => {
        if (fallbackAnnotated) {
          return;
        }
        testInfo.annotations.push({
          type: "Fallback mode",
          description,
        });
        fallbackAnnotated = true;
      };

      const jurisdictionBootstrapRouteHandler = async (
        route: Parameters<typeof page.route>[1] extends (
          ...args: infer TArgs
        ) => unknown
          ? TArgs[0]
          : never,
      ) => {
        const requestUrl = route.request().url();
        const sanitizedUrl = sanitizeUrlForLogs(requestUrl);
        let liveResponse;
        try {
          liveResponse = await route.fetch();
        } catch (error) {
          if (!shouldUseJurisdictionsFallback) {
            throw error;
          }
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed = true;
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason = `request-failed: ${sanitizeErrorText(String(error), 160)}`;
          annotateFallbackMode(
            [
              "Mocked /aggregated/caseworkers/*/jurisdictions after upstream request failure.",
              `Mode=${fallbackForce ? "forced" : "retry-only"}.`,
              `retry=${testInfo.retry}.`,
            ].join(" "),
          );
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(buildJurisdictionBootstrapFallbackMock()),
          });
          return;
        }

        if (testInfo.retry === 0 && liveResponse.status() >= 500) {
          pageWithCircuitBreaker.__jurisdictionBootstrapCircuitBreaker = {
            marker: JURISDICTION_BOOTSTRAP_5XX_MARKER,
            status: liveResponse.status(),
            url: sanitizedUrl,
            timestamp: new Date().toISOString(),
          };
          annotateRetryMarker(
            "Known transient dependency outage on /aggregated/caseworkers/*/jurisdictions (5xx) on first attempt.",
          );
        }

        if (shouldUseJurisdictionsFallback && liveResponse.status() >= 500) {
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed = true;
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason = `upstream-http-${liveResponse.status()}`;
          annotateFallbackMode(
            [
              "Mocked /aggregated/caseworkers/*/jurisdictions after upstream 5xx response.",
              `status=${liveResponse.status()}.`,
              `Mode=${fallbackForce ? "forced" : "retry-only"}.`,
              `retry=${testInfo.retry}.`,
            ].join(" "),
          );
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(buildJurisdictionBootstrapFallbackMock()),
          });
          return;
        }

        await route.fulfill({ response: liveResponse });
      };
      await page.route(
        JURISDICTION_BOOTSTRAP_ROUTE,
        jurisdictionBootstrapRouteHandler,
      );

      const trackSignal = <T>(collection: T[], entry: T) => {
        collection.push(entry);
        if (collection.length > maxTrackedSignals) {
          collection.shift();
        }
      };

      const onResponse = (response: Response) => {
        const url = response.url();
        if (!isBackendApiUrl(url)) {
          return;
        }

        const status = response.status();
        if (status >= 400) {
          trackSignal(apiErrors, {
            method: response.request().method(),
            status,
            url: sanitizeUrlForLogs(url),
          });
        }

        const lowerUrl = url.toLowerCase();
        if (
          status >= 500 &&
          lowerUrl.includes(JURISDICTION_BOOTSTRAP_PATH_FRAGMENT) &&
          lowerUrl.includes(JURISDICTION_BOOTSTRAP_SUFFIX)
        ) {
          pageWithCircuitBreaker.__jurisdictionBootstrapCircuitBreaker = {
            marker: JURISDICTION_BOOTSTRAP_5XX_MARKER,
            status,
            url: sanitizeUrlForLogs(url),
            timestamp: new Date().toISOString(),
          };
        }
      };

      const onRequestFinished = (request: Request) => {
        const url = request.url();
        if (!isBackendApiUrl(url)) {
          return;
        }

        const durationMs = request.timing().responseEnd;
        if (
          Number.isFinite(durationMs) &&
          durationMs > slowThresholdMs &&
          durationMs > 0
        ) {
          trackSignal(slowCalls, {
            method: request.method(),
            durationMs,
            url: sanitizeUrlForLogs(url),
          });
        }
      };

      const onRequestFailed = (request: Request) => {
        const url = request.url();
        if (!isBackendApiUrl(url)) {
          return;
        }

        const reason = sanitizeErrorText(
          request.failure()?.errorText ?? "request failed",
          200,
        );
        trackSignal(networkFailures, {
          method: request.method(),
          reason,
          url: sanitizeUrlForLogs(url),
        });
      };

      page.on("response", onResponse);
      page.on("requestfinished", onRequestFinished);
      page.on("requestfailed", onRequestFailed);

      await use(undefined);

      await page.unroute(
        JURISDICTION_BOOTSTRAP_ROUTE,
        jurisdictionBootstrapRouteHandler,
      );
      page.off("response", onResponse);
      page.off("requestfinished", onRequestFinished);
      page.off("requestfailed", onRequestFailed);

      if (!isFailureStatus(testInfo.status)) {
        return;
      }

      const setupMarker =
        pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed
          ? JURISDICTION_BOOTSTRAP_MOCK_FALLBACK_MARKER
          : (pageWithCircuitBreaker.__jurisdictionBootstrapCircuitBreaker
              ?.marker ?? "ui-fixture");

      const diagnosis = buildFailureDiagnosis({
        testTitle: testInfo.title,
        errorMessage: testInfo.error?.message ?? "",
        apiErrors,
        slowCalls,
        networkFailures,
        slowThresholdMs,
        testStatus: testInfo.status,
        setupMarker,
        fallbackUsed:
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed ?? false,
        fallbackReason:
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason,
      });

      if (setupMarker === JURISDICTION_BOOTSTRAP_5XX_MARKER) {
        annotateRetryMarker(
          "Known transient dependency outage on /aggregated/caseworkers/*/jurisdictions (5xx).",
        );
      }
      if (setupMarker === JURISDICTION_BOOTSTRAP_MOCK_FALLBACK_MARKER) {
        annotateRetryMarker(
          "Downstream /aggregated/caseworkers/*/jurisdictions instability detected; retry switched to mock fallback.",
        );
      }

      uiFailureLogger.error("ui:failure-diagnosis", {
        testTitle: testInfo.title,
        failureType: diagnosis.failureType,
        apiErrors: diagnosis.apiErrors.length,
        serverErrors: diagnosis.serverErrors.length,
        clientErrors: diagnosis.clientErrors.length,
        slowCalls: diagnosis.slowCalls.length,
        networkFailures: diagnosis.networkFailures.length,
        networkTimeout: diagnosis.networkTimeout,
      });

      await attachFailureDiagnosis(testInfo, diagnosis);
    },
    { auto: true },
  ],
  attachUserContext: [
    async ({ page }, use, testInfo) => {
      await use(undefined);
      await attachUiUserContext(page, testInfo);
    },
    { auto: true },
  ],
});

export { expect };
