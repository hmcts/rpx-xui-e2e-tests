/* global process, require, module */
/* eslint-disable @typescript-eslint/no-require-imports */

const { cpus } = require("node:os");

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);
const MAX_WORKERS = 4;

const safeBoolean = (value, defaultValue) => {
  if (value === undefined) return defaultValue;
  const normalised = String(value).trim().toLowerCase();
  if (truthy.has(normalised)) return true;
  if (falsy.has(normalised)) return false;
  return defaultValue;
};

const parsePositiveInteger = (value) => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
};

const resolveWorkerCount = (env = process.env) => {
  const configured = parsePositiveInteger(env.PLAYWRIGHT_WORKERS ?? env.FUNCTIONAL_TESTS_WORKERS);
  if (configured) return Math.min(MAX_WORKERS, configured);
  if (env.CI) return 1;
  const logical = cpus()?.length ?? 1;
  if (logical <= 2) return 1;
  const approxPhysical = Math.max(1, Math.round(logical / 2));
  return Math.min(MAX_WORKERS, Math.max(2, approxPhysical));
};

const resolveOdhinLightweight = (env = process.env) => safeBoolean(env.PW_ODHIN_LIGHTWEIGHT, !env.CI);

const resolveOdhinConsoleCapture = (env = process.env) => ({
  consoleLog: safeBoolean(env.PW_ODHIN_CONSOLE_LOG, Boolean(env.CI)),
  consoleError: safeBoolean(env.PW_ODHIN_CONSOLE_ERROR, Boolean(env.CI))
});

const resolveOdhinRuntimeHookTimeoutMs = (env = process.env) =>
  parsePositiveInteger(env.PW_ODHIN_RUNTIME_HOOK_TIMEOUT_MS) ?? (env.CI ? 0 : 15000);

const resolveOdhinHardTimeoutMs = (env = process.env) =>
  parsePositiveInteger(env.PW_ODHIN_HARD_TIMEOUT_MS) ?? (env.CI ? 0 : 30000);

const resolveReportRelease = (env = process.env) =>
  env.PLAYWRIGHT_REPORT_RELEASE ??
  env.PW_ODHIN_RELEASE ??
  `branch=${env.PLAYWRIGHT_REPORT_BRANCH ?? env.GIT_BRANCH ?? "local"}`;

const resolveBrowserChannel = (env = process.env) => {
  if (env.PLAYWRIGHT_BROWSER_CHANNEL === "") return undefined;
  return env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome";
};

const resolveConfiguredProjectWorkers = (env = process.env) => {
  const configured = parsePositiveInteger(env.PLAYWRIGHT_WORKERS ?? env.FUNCTIONAL_TESTS_WORKERS);
  return configured ? resolveWorkerCount(env) : undefined;
};

const buildConfig = (env = process.env) => {
  const consoleCapture = resolveOdhinConsoleCapture(env);
  return {
    testDir: "./src/tests/integration",
    timeout: 120000,
    expect: {
      timeout: 60000
    },
    reporter: [
      [env.CI ? "dot" : "list"],
      [
        "./src/tests/common/reporters/odhin-progress.reporter.cjs",
        {
          enabled: safeBoolean(env.PW_INTEGRATION_ODHIN, true),
          hardTimeoutMs: resolveOdhinHardTimeoutMs(env),
          timeoutExitCode: 1
        }
      ],
      [
        "./src/tests/common/reporters/odhin-adaptive.reporter.cjs",
        {
          outputFolder:
            env.PLAYWRIGHT_REPORT_FOLDER ??
            env.PW_ODHIN_OUTPUT ??
            "functional-output/tests/playwright-integration/odhin-report",
          indexFilename: env.PW_ODHIN_INDEX ?? "playwright-odhin-integration.html",
          title: env.PW_ODHIN_TITLE ?? "rpx-xui-e2e integration",
          testEnvironment:
            env.PW_ODHIN_ENV ??
            `${env.TEST_ENV ?? env.TEST_ENVIRONMENT ?? (env.CI ? "ci" : "aat")} | ${env.CI ? "ci" : "local-run"}`,
          project: env.PLAYWRIGHT_REPORT_PROJECT ?? env.PW_ODHIN_PROJECT ?? "rpx-xui-e2e-tests",
          release: resolveReportRelease(env),
          testFolder: env.PW_ODHIN_TEST_FOLDER ?? "src/tests/integration",
          lightweight: resolveOdhinLightweight(env),
          consoleLog: consoleCapture.consoleLog,
          consoleError: consoleCapture.consoleError,
          profile: safeBoolean(env.PW_ODHIN_PROFILE, true),
          runtimeHookTimeoutMs: resolveOdhinRuntimeHookTimeoutMs(env),
          testOutput: env.PW_ODHIN_TEST_OUTPUT ?? "only-on-failure",
          apiLogs: env.PW_ODHIN_API_LOGS ?? "summary"
        }
      ]
    ],
    use: {
      baseURL: env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net",
      timezoneId: "Europe/London",
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
      video: "retain-on-failure"
    },
    projects: [
      {
        name: "chromium",
        testMatch: /src\/tests\/integration\/.*\.spec\.ts/,
        workers: resolveConfiguredProjectWorkers(env),
        use: {
          channel: resolveBrowserChannel(env),
          headless: !safeBoolean(env.HEAD, false)
        }
      }
    ]
  };
};

module.exports = {
  buildConfig,
  resolveOdhinConsoleCapture,
  resolveOdhinHardTimeoutMs,
  resolveOdhinLightweight,
  resolveOdhinRuntimeHookTimeoutMs,
  resolveWorkerCount
};
