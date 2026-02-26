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

type JurisdictionBootstrapPayload = Array<{
  id?: unknown;
  caseTypes?: Array<{
    id?: unknown;
  }>;
}>;

const defaultRequiredCreateCaseTypes: string[] = [];

const parseRequiredCaseTypes = (value: string | undefined): string[] => {
  if (!value?.trim()) {
    return defaultRequiredCreateCaseTypes;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const hasRequiredCaseTypes = (
  payload: JurisdictionBootstrapPayload,
  requiredEntries: string[],
): boolean => {
  const available = new Set<string>();
  for (const jurisdiction of payload) {
    const jurisdictionId =
      typeof jurisdiction?.id === "string" ? jurisdiction.id : "";
    if (!jurisdictionId) {
      continue;
    }
    for (const caseType of jurisdiction.caseTypes ?? []) {
      const caseTypeId = typeof caseType?.id === "string" ? caseType.id : "";
      if (!caseTypeId) {
        continue;
      }
      available.add(`${jurisdictionId}:${caseTypeId}`.toLowerCase());
    }
  }
  const isRequirementSatisfied = (required: string): boolean => {
    const [jurisdictionPart, caseTypePart] = required.split(":", 2);
    if (!jurisdictionPart || !caseTypePart) {
      return available.has(required.toLowerCase());
    }
    const jurisdiction = jurisdictionPart.trim().toLowerCase();
    const alternatives = caseTypePart
      .split("|")
      .map((caseType) => caseType.trim().toLowerCase())
      .filter((caseType) => caseType.length > 0);
    if (alternatives.length === 0) {
      return false;
    }
    return alternatives.some((caseType) =>
      available.has(`${jurisdiction}:${caseType}`),
    );
  };
  return requiredEntries.every((required) => isRequirementSatisfied(required));
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
      const fallbackOnSlow = parseBooleanFlag(
        process.env.PW_JURISDICTIONS_FALLBACK_ON_SLOW,
        false,
      );
      const fallbackOnIncompletePayload = parseBooleanFlag(
        process.env.PW_JURISDICTIONS_FALLBACK_ON_INCOMPLETE_PAYLOAD,
        true,
      );
      const fallbackAfterFirst5xx = parseBooleanFlag(
        process.env.PW_JURISDICTIONS_FALLBACK_AFTER_FIRST_5XX,
        true,
      );
      const fallbackOnSlowThresholdMs = parsePositiveInt(
        process.env.PW_JURISDICTIONS_FALLBACK_SLOW_THRESHOLD_MS,
        4500,
      );
      const requiredCreateCaseTypes = parseRequiredCaseTypes(
        process.env.PW_JURISDICTIONS_REQUIRED_CASE_TYPES,
      );
      const isRetryAttempt = testInfo.retry > 0;
      const shouldUseJurisdictionsFallback =
        fallbackForce || (fallbackOnRetry && isRetryAttempt);
      let retryMarkerAnnotated = false;
      let fallbackAnnotated = false;

      const apiErrors: ApiErrorSignal[] = [];
      const slowCalls: SlowCallSignal[] = [];
      const networkFailures: NetworkFailureSignal[] = [];
      let retryReason = "";

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
        const isContextClosedError = (error: unknown): boolean => {
          const message = String(error ?? "");
          return (
            message.includes(
              "Target page, context or browser has been closed",
            ) ||
            message.includes("Target closed") ||
            message.includes("Test ended") ||
            message.includes("browserContext.close")
          );
        };
        const isTransientNetworkFetchError = (error: unknown): boolean => {
          const message = String(error ?? "");
          return (
            message.includes("ECONNRESET") ||
            message.includes("ETIMEDOUT") ||
            message.includes("socket hang up") ||
            message.includes("net::ERR_") ||
            message.includes("read ECONNRESET")
          );
        };
        const safeFulfill = async (
          payload: Parameters<typeof route.fulfill>[0],
          context: string,
        ): Promise<boolean> => {
          try {
            await route.fulfill(payload);
            return true;
          } catch (error) {
            const message = String(error);
            if (!message.includes("Route is already handled")) {
              throw error;
            }
            uiFailureLogger.warn("ui:route-already-handled", {
              context,
              url: sanitizedUrl,
              retry: testInfo.retry,
            });
            return false;
          }
        };
        const circuitBreakerAlreadySet =
          pageWithCircuitBreaker.__jurisdictionBootstrapCircuitBreaker
            ?.marker === JURISDICTION_BOOTSTRAP_5XX_MARKER;
        if (fallbackAfterFirst5xx && circuitBreakerAlreadySet) {
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed = true;
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason =
            "circuit-breaker-active";
          annotateFallbackMode(
            [
              "Mocked /aggregated/caseworkers/*/jurisdictions after first observed upstream 5xx.",
              `retry=${testInfo.retry}.`,
            ].join(" "),
          );
          await safeFulfill(
            {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(buildJurisdictionBootstrapFallbackMock()),
            },
            "jurisdiction-bootstrap-circuit-breaker-fallback",
          );
          return;
        }
        if (fallbackForce) {
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed = true;
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason =
            "forced-mode";
          annotateFallbackMode(
            [
              "Mocked /aggregated/caseworkers/*/jurisdictions in forced mode.",
              `retry=${testInfo.retry}.`,
            ].join(" "),
          );
          await safeFulfill(
            {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(buildJurisdictionBootstrapFallbackMock()),
            },
            "jurisdiction-bootstrap-forced-fallback",
          );
          return;
        }
        let liveResponse;
        const fetchStartedAt = Date.now();
        try {
          liveResponse = await route.fetch();
        } catch (error) {
          if (isContextClosedError(error)) {
            uiFailureLogger.warn("ui:route-fetch-context-closed", {
              url: sanitizedUrl,
              retry: testInfo.retry,
            });
            return;
          }
          const allowFallbackForFetchError =
            shouldUseJurisdictionsFallback ||
            isTransientNetworkFetchError(error);
          if (!allowFallbackForFetchError) {
            throw error;
          }
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed = true;
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason = `request-failed: ${sanitizeErrorText(String(error), 160)}`;
          annotateFallbackMode(
            [
              "Mocked /aggregated/caseworkers/*/jurisdictions after upstream request failure.",
              `Mode=${fallbackForce ? "forced" : shouldUseJurisdictionsFallback ? "retry-only" : "network-failure"}.`,
              `retry=${testInfo.retry}.`,
            ].join(" "),
          );
          await safeFulfill(
            {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(buildJurisdictionBootstrapFallbackMock()),
            },
            "jurisdiction-bootstrap-request-failed-fallback",
          );
          return;
        }
        const fetchDurationMs = Date.now() - fetchStartedAt;

        if (
          fallbackOnIncompletePayload &&
          liveResponse.status() < 500 &&
          requestUrl.includes("access=create")
        ) {
          const livePayload = (await liveResponse
            .json()
            .catch(() => null)) as JurisdictionBootstrapPayload | null;
          if (
            Array.isArray(livePayload) &&
            !hasRequiredCaseTypes(livePayload, requiredCreateCaseTypes)
          ) {
            pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed = true;
            pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason =
              "missing-required-case-types";
            annotateFallbackMode(
              [
                "Mocked /aggregated/caseworkers/*/jurisdictions after incomplete upstream create payload.",
                `required=${requiredCreateCaseTypes.join(",")}.`,
                `retry=${testInfo.retry}.`,
              ].join(" "),
            );
            await safeFulfill(
              {
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(buildJurisdictionBootstrapFallbackMock()),
              },
              "jurisdiction-bootstrap-incomplete-payload-fallback",
            );
            return;
          }
        }

        if (
          fallbackOnSlow &&
          liveResponse.status() < 500 &&
          fetchDurationMs >= fallbackOnSlowThresholdMs
        ) {
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed = true;
          pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason = `slow-upstream-${fetchDurationMs}ms`;
          annotateFallbackMode(
            [
              "Mocked /aggregated/caseworkers/*/jurisdictions after slow upstream response.",
              `upstreamLatencyMs=${fetchDurationMs}.`,
              `thresholdMs=${fallbackOnSlowThresholdMs}.`,
              `retry=${testInfo.retry}.`,
            ].join(" "),
          );
          await safeFulfill(
            {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(buildJurisdictionBootstrapFallbackMock()),
            },
            "jurisdiction-bootstrap-slow-response-fallback",
          );
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

        if (liveResponse.status() === 404) {
          const responseText = await liveResponse.text().catch(() => "");
          const hasUnknownCaseTypeSignal =
            responseText.includes("Unknown case type") &&
            responseText.includes("/jurisdictions");
          if (hasUnknownCaseTypeSignal) {
            pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed = true;
            pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason =
              "upstream-404-unknown-case-type";
            annotateFallbackMode(
              [
                "Mocked /aggregated/caseworkers/*/jurisdictions after upstream 404 Unknown case type response.",
                `retry=${testInfo.retry}.`,
              ].join(" "),
            );
            await safeFulfill(
              {
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(buildJurisdictionBootstrapFallbackMock()),
              },
              "jurisdiction-bootstrap-404-unknown-case-type-fallback",
            );
            return;
          }
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
          await safeFulfill(
            {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(buildJurisdictionBootstrapFallbackMock()),
            },
            "jurisdiction-bootstrap-5xx-fallback",
          );
          return;
        }

        await safeFulfill(
          { response: liveResponse },
          "jurisdiction-bootstrap-pass-through",
        );
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

      const resolveCorrelationId = (
        responseHeaders?: Record<string, string>,
        requestHeaders?: Record<string, string>,
      ): string => {
        const fromResponse =
          responseHeaders?.["x-correlation-id"] ??
          responseHeaders?.["X-Correlation-Id"] ??
          responseHeaders?.["x-request-id"] ??
          responseHeaders?.["X-Request-Id"] ??
          "";
        const fromRequest =
          requestHeaders?.["x-correlation-id"] ??
          requestHeaders?.["X-Correlation-Id"] ??
          requestHeaders?.["x-request-id"] ??
          requestHeaders?.["X-Request-Id"] ??
          "";
        return sanitizeErrorText(fromResponse || fromRequest, 120);
      };

      const onResponse = (response: Response) => {
        const url = response.url();
        if (!isBackendApiUrl(url)) {
          return;
        }

        const status = response.status();
        if (status >= 400) {
          const correlationId = resolveCorrelationId(
            response.headers(),
            response.request().headers(),
          );
          trackSignal(apiErrors, {
            method: response.request().method(),
            status,
            url: sanitizeUrlForLogs(url),
            correlationId,
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
        const correlationId = resolveCorrelationId(
          undefined,
          request.headers(),
        );
        trackSignal(networkFailures, {
          method: request.method(),
          reason,
          url: sanitizeUrlForLogs(url),
          correlationId,
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

      if (!page.isClosed()) {
        const fallbackScreenshot = await page
          .screenshot({ fullPage: true })
          .catch(() => null);
        if (fallbackScreenshot) {
          await testInfo.attach("failure-screenshot-fallback.png", {
            body: fallbackScreenshot,
            contentType: "image/png",
          });
        }
      }

      const setupMarker =
        pageWithCircuitBreaker.__jurisdictionBootstrapFallbackUsed
          ? JURISDICTION_BOOTSTRAP_MOCK_FALLBACK_MARKER
          : (pageWithCircuitBreaker.__jurisdictionBootstrapCircuitBreaker
              ?.marker ?? "ui-fixture");

      retryReason =
        pageWithCircuitBreaker.__jurisdictionBootstrapFallbackReason ??
        pageWithCircuitBreaker.__jurisdictionBootstrapCircuitBreaker?.url ??
        networkFailures[0]?.reason ??
        (apiErrors[0]
          ? `${apiErrors[0].method} ${apiErrors[0].url} -> HTTP ${apiErrors[0].status}`
          : "");

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
        retryDetails:
          testInfo.retry > 0
            ? {
                retryAttempt: testInfo.retry + 1,
                retryReason,
              }
            : undefined,
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
