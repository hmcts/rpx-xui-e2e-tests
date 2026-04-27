import { createRequire } from "node:module";

import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

type EnvMap = Record<string, string | undefined>;

const require = createRequire(import.meta.url);
const support = require("./playwright.integration.config.support.cjs") as {
  resolveWorkerCount: (env: EnvMap) => number;
};

const truthy = new Set(["1", "true", "yes", "on"]);
const MAX_E2E_WORKERS = 2;

const isTruthy = (value: string | undefined): boolean => truthy.has(value?.trim().toLowerCase() ?? "");

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
};

const resolveE2EWorkerCount = (env: EnvMap = process.env) => {
  const configured = parsePositiveInteger(env.PW_E2E_WORKERS ?? env.PLAYWRIGHT_E2E_WORKERS);
  if (configured) return configured;
  return Math.min(MAX_E2E_WORKERS, support.resolveWorkerCount(env));
};

const buildConfig = (env: EnvMap = process.env): PlaywrightTestConfig => ({
  testDir: "./src/tests/e2e",
  timeout: 120000,
  fullyParallel: true,
  workers: resolveE2EWorkerCount(env),
  reporter: [
    [env.CI ? "dot" : "list"],
    [
      "./src/tests/common/reporters/odhin-adaptive.reporter.cjs",
      {
        outputFolder:
          env.PLAYWRIGHT_REPORT_FOLDER ??
          env.PW_ODHIN_OUTPUT ??
          "functional-output/tests/playwright-e2e/odhin-report",
        indexFilename: env.PW_ODHIN_INDEX ?? "playwright-odhin-nightly.html",
        title: env.PW_ODHIN_TITLE ?? "rpx-xui-e2e nightly",
        testEnvironment:
          env.PW_ODHIN_ENV ??
          `${env.TEST_ENV ?? env.TEST_ENVIRONMENT ?? (env.CI ? "ci" : "aat")} | ${env.CI ? "ci" : "local-run"}`,
        project: env.PLAYWRIGHT_REPORT_PROJECT ?? env.PW_ODHIN_PROJECT ?? "rpx-xui-e2e-tests",
        release:
          env.PLAYWRIGHT_REPORT_RELEASE ??
          env.PW_ODHIN_RELEASE ??
          `branch=${env.PLAYWRIGHT_REPORT_BRANCH ?? env.GIT_BRANCH ?? "local"}`,
        testFolder: env.PW_ODHIN_TEST_FOLDER ?? "src/tests/e2e",
        lightweight: env.CI ? false : true,
        testOutput: env.PW_ODHIN_TEST_OUTPUT ?? "only-on-failure"
      }
    ]
  ],
  use: {
    baseURL: env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        headless: !isTruthy(env.HEAD)
      }
    },
    {
      name: "webkit",
      use: {
        browserName: "webkit",
        headless: !isTruthy(env.HEAD)
      }
    }
  ]
});

export const __test__ = {
  buildConfig,
  resolveE2EWorkerCount,
  resolveWorkerCount: support.resolveWorkerCount
};

export default defineConfig(buildConfig(process.env));
