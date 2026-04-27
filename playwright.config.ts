import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, homedir } from "node:os";
import path from "node:path";

import { CommonConfig, ProjectsConfig } from "@hmcts/playwright-common";
import { defineConfig, type PlaywrightTestConfig, type ReporterDescription } from "@playwright/test";
import { config as loadEnv } from "dotenv";

import { resolveTagFilters, type ResolvedTagFilters } from "./playwright-config-utils.js";
import { resolveUiStoragePath, shouldUseUiStorage } from "./src/utils/ui/storage-state.utils.js";

export type EnvMap = Record<string, string | undefined>;

loadEnv({
  path: path.resolve(process.cwd(), ".env"),
  override: !process.env.CI
});

const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json") as { version: string };

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);
const MAX_WORKERS = 4;
const MAX_UI_WORKERS = 2;

const resolveDefaultReporterNames = (env: EnvMap) => {
  const override = env.PLAYWRIGHT_DEFAULT_REPORTER;
  if (override?.trim()) {
    return override
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return [env.CI ? "dot" : "list"];
};

const safeBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalised = value.trim().toLowerCase();
  if (truthy.has(normalised)) return true;
  if (falsy.has(normalised)) return false;
  return defaultValue;
};

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
};

const resolveWorkerCount = (env: EnvMap = process.env) => {
  const configured = parsePositiveInteger(env.PLAYWRIGHT_WORKERS ?? env.FUNCTIONAL_TESTS_WORKERS);
  if (configured) return Math.min(MAX_WORKERS, configured);
  const logical = cpus()?.length ?? 1;
  if (env.CI) return 1;
  if (logical <= 2) return 1;
  const approxPhysical = Math.max(1, Math.round(logical / 2));
  return Math.min(MAX_WORKERS, Math.max(2, approxPhysical));
};

const resolveApiProjectWorkerCount = (env: EnvMap = process.env) => resolveWorkerCount(env);

const resolveUiProjectWorkerCount = (env: EnvMap = process.env) => {
  const configured = parsePositiveInteger(env.PW_UI_WORKERS ?? env.PLAYWRIGHT_UI_WORKERS);
  if (configured) return configured;
  return Math.min(MAX_UI_WORKERS, resolveWorkerCount(env));
};

const resolveApiTagFilters = (env: EnvMap = process.env): ResolvedTagFilters =>
  resolveTagFilters({
    env,
    includeTagsEnvVar: "API_PW_INCLUDE_TAGS",
    excludedTagsEnvVar: "API_PW_EXCLUDED_TAGS_OVERRIDE",
    configPathEnvVar: "API_PW_TAG_FILTER_CONFIG",
    defaultConfigPath: "src/tests/api/service-tag-filter.json"
  });

const resolveE2eTagFilters = (env: EnvMap = process.env): ResolvedTagFilters =>
  resolveTagFilters({
    env,
    includeTagsEnvVar: "E2E_PW_INCLUDE_TAGS",
    excludedTagsEnvVar: "E2E_PW_EXCLUDED_TAGS_OVERRIDE",
    configPathEnvVar: "E2E_PW_TAG_FILTER_CONFIG",
    defaultConfigPath: "src/tests/e2e/tag-filter.json",
    suiteTag: "@e2e"
  });

const resolveOdhinOutputFolder = (env: EnvMap = process.env) =>
  env.PLAYWRIGHT_REPORT_FOLDER ?? env.PW_ODHIN_OUTPUT ?? "test-results/odhin-report";

const resolveOdhinProject = (env: EnvMap = process.env) =>
  env.PLAYWRIGHT_REPORT_PROJECT ?? env.PW_ODHIN_PROJECT ?? "rpx-xui-e2e-tests";

const resolveOdhinRelease = (env: EnvMap = process.env) =>
  env.PLAYWRIGHT_REPORT_RELEASE ??
  env.PW_ODHIN_RELEASE ??
  `${appVersion} | branch=${env.GIT_BRANCH ?? "local"}`;

const resolveOdhinTestOutput = (env: EnvMap = process.env): boolean | "only-on-failure" => {
  const configured = env.PW_ODHIN_TEST_OUTPUT;
  if (configured?.trim()) {
    const normalised = configured.trim().toLowerCase();
    if (normalised === "only-on-failure") {
      return "only-on-failure";
    }
    if (truthy.has(normalised)) {
      return true;
    }
    if (falsy.has(normalised)) {
      return false;
    }
  }
  return "only-on-failure";
};

const resolveReporters = (env: EnvMap = process.env): ReporterDescription[] => {
  const configured = env.PLAYWRIGHT_REPORTERS
    ?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  const reporterNames =
    configured?.length && configured[0] !== ""
      ? configured
      : resolveDefaultReporterNames(env);

  const reporters: ReporterDescription[] = [];

  for (const name of reporterNames) {
    const normalised = name.toLowerCase();
    switch (normalised) {
      case "list":
        reporters.push(["list"]);
        break;
      case "dot":
        reporters.push(["dot"]);
        break;
      case "line":
        reporters.push(["line"]);
        break;
      case "html":
        reporters.push([
          "html",
          {
            open: env.PLAYWRIGHT_HTML_OPEN ?? "never",
            outputFolder:
              env.PLAYWRIGHT_HTML_OUTPUT ?? "playwright-report"
          }
        ]);
        break;
      case "junit":
        reporters.push([
          "junit",
          {
            outputFile: env.PLAYWRIGHT_JUNIT_OUTPUT ?? "playwright-junit.xml"
          }
        ]);
        break;
      case "odhin":
      case "odhin-reports-playwright":
        reporters.push([
          "./src/tests/common/reporters/odhin-progress.reporter.cjs",
          {
            enabled: true,
            hardTimeoutMs: parsePositiveInteger(env.PW_ODHIN_HARD_TIMEOUT_MS) ?? (env.CI ? 0 : 30000),
            timeoutExitCode: 1
          }
        ]);
        reporters.push([
          "./src/tests/common/reporters/odhin-adaptive.reporter.cjs",
          {
            outputFolder: resolveOdhinOutputFolder(env),
            indexFilename: env.PW_ODHIN_INDEX ?? "playwright-odhin.html",
            title: env.PW_ODHIN_TITLE ?? "rpx-xui-e2e Playwright",
            testEnvironment:
              env.PW_ODHIN_ENV ??
              `${env.TEST_ENV ?? env.TEST_ENVIRONMENT ?? (env.CI ? "ci" : "aat")} | ${env.CI ? "ci" : "local-run"} | workers=${resolveWorkerCount(env)}`,
            project: resolveOdhinProject(env),
            release: resolveOdhinRelease(env),
            testFolder: env.PW_ODHIN_TEST_FOLDER ?? "src/tests",
            startServer: safeBoolean(env.PW_ODHIN_START_SERVER, false),
            lightweight: safeBoolean(env.PW_ODHIN_LIGHTWEIGHT, !env.CI),
            consoleLog: safeBoolean(env.PW_ODHIN_CONSOLE_LOG, true),
            simpleConsoleLog: safeBoolean(env.PW_ODHIN_SIMPLE_CONSOLE_LOG, false),
            consoleError: safeBoolean(env.PW_ODHIN_CONSOLE_ERROR, true),
            consoleTestOutput: safeBoolean(env.PW_ODHIN_CONSOLE_TEST_OUTPUT, true),
            testOutput: resolveOdhinTestOutput(env),
            apiLogs: env.PW_ODHIN_API_LOGS ?? "summary",
            profile: safeBoolean(env.PW_ODHIN_PROFILE, true),
            runtimeHookTimeoutMs: parsePositiveInteger(env.PW_ODHIN_RUNTIME_HOOK_TIMEOUT_MS) ?? (env.CI ? 0 : 15000)
          }
        ]);
        break;
      default:
        reporters.push([name]);
        break;
    }
  }

  if (!safeBoolean(env.PW_FLAKE_GATE_DISABLED, false)) {
    reporters.push(["./src/tests/common/reporters/flake-gate.reporter.cjs"]);
  }

  return reporters;
};

const resolveChromiumExecutablePath = (env: EnvMap = process.env): string | undefined => {
  const override = env.PW_CHROMIUM_PATH;
  if (override?.trim()) return override;
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    return undefined;
  }
  const root =
    env.PLAYWRIGHT_BROWSERS_PATH ??
    path.join(homedir(), "Library", "Caches", "ms-playwright");
  if (!existsSync(root)) return undefined;
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-"))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const aNum = Number.parseInt(a.replace("chromium-", ""), 10);
      const bNum = Number.parseInt(b.replace("chromium-", ""), 10);
      return (Number.isNaN(bNum) ? 0 : bNum) - (Number.isNaN(aNum) ? 0 : aNum);
    });
  for (const name of candidates) {
    const exe = path.join(
      root,
      name,
      "chrome-mac-arm64",
      "Google Chrome for Testing.app",
      "Contents",
      "MacOS",
      "Google Chrome for Testing"
    );
    if (existsSync(exe)) return exe;
  }
  return undefined;
};

const buildConfig = (env: EnvMap = process.env): PlaywrightTestConfig => {
  const chromiumExecutablePath = resolveChromiumExecutablePath(env);
  const apiTagFilters = resolveApiTagFilters(env);
  const e2eTagFilters = resolveE2eTagFilters(env);
  return {
    testDir: "./src/tests",
    globalSetup: "./src/global/ui.global.setup.ts",
    ...CommonConfig.recommended,
    fullyParallel: true,
    workers: resolveWorkerCount(env),
    reporter: resolveReporters(env),
    use: {
      baseURL: env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net",
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
      video: "off"
    },
    projects: [
      {
        name: "ui",
        testMatch: /src\/tests\/e2e\/.*\.spec\.ts/,
        grep: e2eTagFilters.grep,
        grepInvert: e2eTagFilters.grepInvert,
        retries: env.CI ? 1 : 0,
        outputDir: "test-results/ui",
        workers: resolveUiProjectWorkerCount(env),
        use: {
          ...ProjectsConfig.chromium.use,
          channel: env.PW_UI_CHANNEL,
          viewport: CommonConfig.DEFAULT_VIEWPORT,
          headless: !safeBoolean(env.HEAD, false),
          trace: "retain-on-failure",
          screenshot: "only-on-failure",
          video: "retain-on-failure",
          storageState: shouldUseUiStorage() ? resolveUiStoragePath() : undefined,
          launchOptions: chromiumExecutablePath
            ? {
                executablePath: chromiumExecutablePath
              }
            : undefined
        }
      },
      {
        name: "integration",
        testMatch: /src\/tests\/integration\/.*\.spec\.ts/,
        grepInvert: /@nightly/i,
        retries: env.CI ? 1 : 0,
        outputDir: "test-results/integration",
        use: {
          ...ProjectsConfig.chromium.use,
          channel: env.PW_UI_CHANNEL,
          viewport: CommonConfig.DEFAULT_VIEWPORT,
          headless: !safeBoolean(env.HEAD, false),
          trace: "retain-on-failure",
          screenshot: "only-on-failure",
          video: "retain-on-failure",
          launchOptions: chromiumExecutablePath
            ? {
                executablePath: chromiumExecutablePath
              }
            : undefined
        }
      },
      {
        name: "integration-nightly",
        testMatch: /src\/tests\/integration\/.*\.spec\.ts/,
        grep: /@nightly/i,
        retries: env.CI ? 1 : 0,
        outputDir: "test-results/integration-nightly",
        use: {
          ...ProjectsConfig.chromium.use,
          channel: env.PW_UI_CHANNEL,
          viewport: CommonConfig.DEFAULT_VIEWPORT,
          headless: !safeBoolean(env.HEAD, false),
          trace: "retain-on-failure",
          screenshot: "only-on-failure",
          video: "retain-on-failure",
          launchOptions: chromiumExecutablePath
            ? {
                executablePath: chromiumExecutablePath
              }
            : undefined
        }
      },
      {
        name: "api",
        testMatch: /src\/tests\/api\/.*\.api\.ts/,
        grep: apiTagFilters.grep,
        grepInvert: apiTagFilters.grepInvert,
        retries: env.CI ? 1 : 0,
        outputDir: "test-results/api",
        workers: resolveApiProjectWorkerCount(env),
        use: {
          headless: true,
          screenshot: "off",
          video: "off",
          trace: "off"
        }
      }
    ]
  };
};

export const __test__ = {
  buildConfig,
  resolveApiProjectWorkerCount,
  resolveApiTagFilters,
  resolveE2eTagFilters,
  resolveUiProjectWorkerCount,
  resolveWorkerCount
};

export default defineConfig(buildConfig(process.env));
