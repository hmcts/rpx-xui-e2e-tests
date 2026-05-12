import { createRequire } from "node:module";

import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

import { logResolvedTagFilters, resolveTagFilters, type ResolvedTagFilters } from "./playwright-config-utils.js";

type EnvMap = Record<string, string | undefined>;

const require = createRequire(import.meta.url);
const E2E_GLOBAL_EXCLUDED_TAGS_PATTERN = /^@e2e(?:-.+)?$/;
const support = require("./playwright.integration.config.support.cjs") as {
  resolveWorkerCount: (env: EnvMap) => number;
};

const truthy = new Set(["1", "true", "yes", "on"]);
const MAX_E2E_WORKERS = 2;

const isTruthy = (value: string | undefined): boolean => truthy.has(value?.trim().toLowerCase() ?? "");

const firstNonBlank = (...values: Array<string | undefined>): string | undefined =>
  values.map((value) => value?.trim()).find((value): value is string => Boolean(value));

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

const resolveE2eTagFilters = (env: EnvMap = process.env): ResolvedTagFilters =>
  resolveTagFilters({
    env,
    includeTagsEnvVar: "E2E_PW_INCLUDE_TAGS",
    excludedTagsEnvVar: "E2E_PW_EXCLUDED_TAGS_OVERRIDE",
    configPathEnvVar: "E2E_PW_TAG_FILTER_CONFIG",
    defaultConfigPath: "src/tests/e2e/tag-filter.json",
    suiteTag: "@e2e",
    globalExcludedTagsEnvVar: "PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS",
    ignoreGlobalExcludesEnvVar: "PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES",
    globalExcludedTagsPattern: E2E_GLOBAL_EXCLUDED_TAGS_PATTERN
  });

const buildConfig = (env: EnvMap = process.env): PlaywrightTestConfig => {
  const e2eTagFilters = resolveE2eTagFilters(env);
  logResolvedTagFilters("E2E nightly", e2eTagFilters, env);

  return {
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
            firstNonBlank(env.PLAYWRIGHT_REPORT_FOLDER, env.PW_ODHIN_OUTPUT) ??
            "functional-output/tests/playwright-e2e/odhin-report",
          indexFilename: firstNonBlank(env.PW_ODHIN_INDEX, env.PLAYWRIGHT_REPORT_INDEX_FILENAME) ?? "playwright-odhin-nightly.html",
          title: firstNonBlank(env.PW_ODHIN_TITLE) ?? "rpx-xui-e2e nightly",
          testEnvironment:
            firstNonBlank(env.PW_ODHIN_ENV) ??
            `${env.TEST_ENV ?? env.TEST_ENVIRONMENT ?? (env.CI ? "ci" : "aat")} | ${env.CI ? "ci" : "local-run"}`,
          project: firstNonBlank(env.PLAYWRIGHT_REPORT_PROJECT, env.PW_ODHIN_PROJECT) ?? "rpx-xui-e2e-tests",
          release:
            firstNonBlank(env.PLAYWRIGHT_REPORT_RELEASE, env.PW_ODHIN_RELEASE) ??
            `branch=${env.PLAYWRIGHT_REPORT_BRANCH ?? env.GIT_BRANCH ?? "local"}`,
          testFolder: firstNonBlank(env.PW_ODHIN_TEST_FOLDER) ?? "src/tests/e2e",
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
        grep: e2eTagFilters.grep,
        grepInvert: e2eTagFilters.grepInvert,
        use: {
          browserName: "firefox",
          headless: !isTruthy(env.HEAD)
        }
      },
      {
        name: "webkit",
        grep: e2eTagFilters.grep,
        grepInvert: e2eTagFilters.grepInvert,
        use: {
          browserName: "webkit",
          headless: !isTruthy(env.HEAD)
        }
      }
    ]
  };
};

export const __test__ = {
  buildConfig,
  resolveE2eTagFilters,
  resolveE2EWorkerCount,
  resolveWorkerCount: support.resolveWorkerCount
};

export default defineConfig(buildConfig(process.env));
