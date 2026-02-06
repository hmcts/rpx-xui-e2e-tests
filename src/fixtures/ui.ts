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
      const apiErrors: ApiErrorSignal[] = [];
      const slowCalls: SlowCallSignal[] = [];
      const networkFailures: NetworkFailureSignal[] = [];

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

      page.off("response", onResponse);
      page.off("requestfinished", onRequestFinished);
      page.off("requestfailed", onRequestFailed);

      if (!isFailureStatus(testInfo.status)) {
        return;
      }

      const diagnosis = buildFailureDiagnosis({
        testTitle: testInfo.title,
        errorMessage: testInfo.error?.message ?? "",
        apiErrors,
        slowCalls,
        networkFailures,
        slowThresholdMs,
      });

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
