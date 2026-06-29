/* global process, module */

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);
const DEFAULT_MAX_WORKERS = 4;
const ABSOLUTE_MAX_WORKERS = 6;

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

const firstNonBlank = (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean);

const resolveWorkerCount = (env = process.env) => {
  const configured = parsePositiveInteger(env.PLAYWRIGHT_WORKERS ?? env.FUNCTIONAL_TESTS_WORKERS);
  const maxWorkers = Math.min(parsePositiveInteger(env.PLAYWRIGHT_MAX_WORKERS) ?? DEFAULT_MAX_WORKERS, ABSOLUTE_MAX_WORKERS);
  if (configured) return Math.min(maxWorkers, configured);
  return maxWorkers;
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
  firstNonBlank(env.PLAYWRIGHT_REPORT_RELEASE, env.PW_ODHIN_RELEASE) ??
  `branch=${env.PLAYWRIGHT_REPORT_BRANCH ?? env.GIT_BRANCH ?? "local"}`;

const resolveBrowserChannel = (env = process.env) => {
  if (env.PLAYWRIGHT_BROWSER_CHANNEL === "") return undefined;
  return env.PLAYWRIGHT_BROWSER_CHANNEL ?? "chrome";
};

const resolveConfiguredProjectWorkers = (env = process.env) => {
  return resolveWorkerCount(env);
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
            firstNonBlank(env.PLAYWRIGHT_REPORT_FOLDER, env.PW_ODHIN_OUTPUT) ??
            "functional-output/tests/playwright-integration/odhin-report",
          indexFilename: firstNonBlank(env.PW_ODHIN_INDEX, env.PLAYWRIGHT_REPORT_INDEX_FILENAME) ?? "playwright-odhin-integration.html",
          title: firstNonBlank(env.PW_ODHIN_TITLE) ?? "rpx-xui-e2e integration",
          testEnvironment:
            firstNonBlank(env.PW_ODHIN_ENV) ??
            `${env.TEST_ENV ?? env.TEST_ENVIRONMENT ?? (env.CI ? "ci" : "aat")} | ${env.CI ? "ci" : "local-run"}`,
          project: firstNonBlank(env.PLAYWRIGHT_REPORT_PROJECT, env.PW_ODHIN_PROJECT) ?? "rpx-xui-e2e-tests",
          release: resolveReportRelease(env),
          testFolder: firstNonBlank(env.PW_ODHIN_TEST_FOLDER) ?? "src/tests/integration",
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
        testMatch: "integration/**/*.spec.ts",
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
