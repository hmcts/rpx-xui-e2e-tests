import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices, type ReporterDescription } from "@playwright/test";
import { config as loadEnv } from "dotenv";

const envFile = process.env.DOTENV_PATH ?? path.resolve(process.cwd(), ".env");
loadEnv({ path: envFile, override: true });

const parseBool = (value: string | undefined, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes"].includes(value.toLowerCase());
};

const resolveReporterDescriptor = (name: string): ReporterDescription => {
  switch (name) {
    case "odhin":
    case "odhin-reports-playwright":
      return [
        "odhin-reports-playwright",
        {
          outputFolder: process.env.PW_ODHIN_OUTPUT ?? "test-results/odhin-report",
          indexFilename: process.env.PW_ODHIN_INDEX ?? "playwright-odhin.html",
          title: process.env.PW_ODHIN_TITLE ?? "rpx-xui-e2e-tests Playwright",
          testEnvironment:
            process.env.PW_ODHIN_ENV ??
            `${process.env.TEST_ENVIRONMENT ?? (process.env.CI ? "ci" : "local")}`,
          project: process.env.PW_ODHIN_PROJECT ?? "rpx-xui-e2e-tests",
          release:
            process.env.PW_ODHIN_RELEASE ??
            (process.env.GIT_COMMIT ? `sha-${process.env.GIT_COMMIT}` : "local"),
          testFolder: process.env.PW_ODHIN_TEST_FOLDER ?? "tests",
          // Explicitly disable auto-serving the report to ensure no local HTTP server is started.
          // Even if PW_ODHIN_START_SERVER is set, we ignore it to enforce "never serve" policy.
          startServer: false,
          consoleLog: parseBool(process.env.PW_ODHIN_CONSOLE_LOG, true),
          consoleError: parseBool(process.env.PW_ODHIN_CONSOLE_ERROR, true),
        },
      ];
    default:
      return [name];
  }
};

const junitOutput = process.env.PLAYWRIGHT_JUNIT_OUTPUT ?? "test-results/junit/results.xml";
const defaultReporter =
  process.env.PLAYWRIGHT_DEFAULT_REPORTER ?? (process.env.CI ? "dot" : "list");
const htmlOutput = process.env.PLAYWRIGHT_HTML_OUTPUT ?? "playwright-report";
const enableHtml = parseBool(process.env.PLAYWRIGHT_HTML);
const enableOdhin = parseBool(process.env.PLAYWRIGHT_ODHIN, true);
const jsonOutput = process.env.PLAYWRIGHT_JSON_OUTPUT;
const configuredReporters: ReporterDescription[] = (process.env.PLAYWRIGHT_REPORTERS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((name) => resolveReporterDescriptor(name));

const reporters: ReporterDescription[] = [];
const reporterName = (entry: ReporterDescription): string =>
  Array.isArray(entry) ? String(entry[0]) : String(entry);
const hasReporter = (name: string): boolean =>
  reporters.some((entry) => reporterName(entry) === name);

if (configuredReporters.length > 0) {
  reporters.push(...configuredReporters);
} else if (process.env.CI) {
  reporters.push(["dot"], ["junit", { outputFile: junitOutput }]);
} else {
  reporters.push([defaultReporter]);
}

if (enableHtml && !hasReporter("html")) {
  reporters.push(["html", { outputFolder: htmlOutput }]);
}

if (jsonOutput && !hasReporter("json")) {
  reporters.push(["json", { outputFile: jsonOutput }]);
}

if (enableOdhin && !configuredReporters.length && !hasReporter("odhin-reports-playwright")) {
  reporters.push(resolveReporterDescriptor("odhin"));
}

const defaultLocalBaseUrl = "http://localhost:3000";
const defaultCiBaseUrl = "https://manage-case.aat.platform.hmcts.net";
const baseUrl =
  process.env.APP_BASE_URL ?? (process.env.CI ? defaultCiBaseUrl : defaultLocalBaseUrl);
const videoMode =
  process.env.PLAYWRIGHT_VIDEO_MODE ?? (process.env.CI ? "retain-on-failure" : "off");
const shardTotal = Number.parseInt(process.env.PLAYWRIGHT_SHARD_TOTAL ?? "", 10);
const shardCurrent = Number.parseInt(process.env.PLAYWRIGHT_SHARD_INDEX ?? "", 10);
const shard =
  Number.isInteger(shardTotal) && shardTotal > 0 && Number.isInteger(shardCurrent)
    ? { total: shardTotal, current: shardCurrent }
    : undefined;

const normaliseStorageName = (name: string): string[] => {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  switch (cleaned) {
    case "casemanager":
      return ["caseManager", "casemanager"];
    case "staffadmin":
    case "staff_admin":
    case "staff-admin":
      return ["staff_admin", "staffadmin"];
    default:
      return [cleaned];
  }
};

const storageStatePath = (defaultName: string, projectName: string): string | undefined => {
  if (process.env.USE_STORAGE_STATE !== "1") {
    return undefined;
  }
  const override =
    process.env[`PLAYWRIGHT_STORAGE_USER_${projectName.toUpperCase()}`] ??
    process.env.PLAYWRIGHT_STORAGE_USER;
  const candidates = override
    ? normaliseStorageName(override)
    : normaliseStorageName(defaultName);

  for (const name of candidates) {
    const candidate = path.resolve(process.cwd(), "storage", `${name}.json`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.spec.ts", "**/*.test.ts", "**/*.api.ts"],
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 15_000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : 10,
  reporter: reporters,
  use: {
    baseURL: baseUrl,
    trace: "on-first-retry",
    video: videoMode as "retain-on-failure" | "off" | "on" | "on-first-retry",
    screenshot: { mode: "only-on-failure", fullPage: true },
    viewport: { width: 1920, height: 1080 },
    extraHTTPHeaders: {
      "x-test-run-id": process.env.TEST_RUN_ID ?? `local-${Date.now()}`,
    },
    storageState: storageStatePath("caseManager"),
  },
  projects: [
    {
      name: "api",
      testDir: "./tests/api",
      testMatch: ["**/*.api.ts"],
      use: { baseURL: baseUrl },
    },
    {
      name: "chromium",
      testIgnore: ["**/tests/api/**"],
      use: { ...devices["Desktop Chromium"], storageState: storageStatePath("caseManager", "chromium") },
    },
    {
      name: "firefox",
      testIgnore: ["**/tests/api/**"],
      use: { ...devices["Desktop Firefox"], storageState: storageStatePath("judge", "firefox") },
    },
    {
      name: "webkit",
      testIgnore: ["**/tests/api/**"],
      use: { ...devices["Desktop Safari"] },
    },
  ],
  metadata: {
    service: "rpx-xui-webapp",
    environment: process.env.TEST_ENVIRONMENT ?? "local",
    baseURL: baseUrl,
  },
  shard,
});
