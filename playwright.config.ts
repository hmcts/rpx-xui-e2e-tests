import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, homedir, totalmem } from "node:os";
import path from "node:path";

import { CommonConfig, ProjectsConfig } from "@hmcts/playwright-common";
import { defineConfig, type PlaywrightTestConfig, type ReporterDescription } from "@playwright/test";
import { config as loadEnv } from "dotenv";

import { logResolvedTagFilters, resolveTagFilters, type ResolvedTagFilters } from "./playwright-config-utils.js";
import { resolveUiStoragePath, shouldUseUiStorage } from "./src/utils/ui/storage-state.utils.js";

export type EnvMap = Record<string, string | undefined>;

const runtimeOverrideKeys = [
  "TEST_URL",
  "TEST_ENV",
  "TEST_ENVIRONMENT",
  "PW_UI_STORAGE",
  "PW_UI_STORAGE_STRICT",
  "PW_UI_STORAGE_PATH",
  "PW_UI_USERS",
  "PW_UI_USER",
  "IDAM_WEB_URL",
  "IDAM_TESTING_SUPPORT_URL",
  "IDAM_TESTING_SUPPORT_USERS_URL",
  "IDAM_CLIENT_ID",
  "IDAM_SECRET",
  "IDAM_OAUTH2_SCOPE",
  "IDAM_RETURN_URL",
  "S2S_URL",
  "S2S_MICROSERVICE_NAME",
  "MICROSERVICE",
  "S2S_SECRET",
  "SOLICITOR_USERNAME",
  "SOLICITOR_PASSWORD",
  "CASEOFFICER_R1_USERNAME",
  "CASEOFFICER_R1_PASSWORD",
  "CASEOFFICER_R2_USERNAME",
  "CASEOFFICER_R2_PASSWORD",
  "CASEWORKER_R1_USERNAME",
  "CASEWORKER_R1_PASSWORD",
  "CASEWORKER_R2_USERNAME",
  "CASEWORKER_R2_PASSWORD",
  "JUDGE_USERNAME",
  "JUDGE_PASSWORD",
  "JUDGE_IDAM_ID",
  "JUDGE_DISPLAY_NAME",
  "WA_LOCATION_ID",
  "PLAYWRIGHT_REPORTERS",
  "PLAYWRIGHT_REPORT_FOLDER",
  "PLAYWRIGHT_REPORT_PROJECT",
  "PLAYWRIGHT_REPORT_RELEASE",
  "PW_ODHIN_OUTPUT",
  "PW_ODHIN_INDEX",
  "PW_ODHIN_TITLE",
  "PW_ODHIN_ENV",
  "PW_ODHIN_PROJECT",
  "PW_ODHIN_RELEASE",
  "PW_ODHIN_TEST_FOLDER",
  "PW_ODHIN_API_LOGS",
  "PW_ODHIN_LIGHTWEIGHT",
  "PW_ODHIN_CONSOLE_TEST_OUTPUT"
] as const;

const captureRuntimeOverrides = <TKey extends string>(
  env: EnvMap,
  keys: readonly TKey[]
): Partial<Record<TKey, string>> =>
  Object.fromEntries(
    keys.flatMap((key) => {
      const value = env[key];
      return value === undefined ? [] : [[key, value]];
    })
  ) as Partial<Record<TKey, string>>;

const restoreRuntimeOverrides = <TKey extends string>(
  env: EnvMap,
  overrides: Partial<Record<TKey, string>>
) => {
  for (const key of Object.keys(overrides) as TKey[]) {
    const value = overrides[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
};

const runtimeOverrides = captureRuntimeOverrides(process.env, runtimeOverrideKeys);

loadEnv({
  path: path.resolve(process.cwd(), ".env"),
  quiet: true,
  override: false
});

restoreRuntimeOverrides(process.env, runtimeOverrides);

const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json") as { version: string };

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);
const DEFAULT_MAX_WORKERS = 4;
const ABSOLUTE_MAX_WORKERS = 6;
const MAX_UI_WORKERS = 4;
const API_GLOBAL_EXCLUDED_TAGS_PATTERN = /^(@svc-.+|@wa-action)$/;
const E2E_GLOBAL_EXCLUDED_TAGS_PATTERN = /^@e2e(?:-.+)?$/;
const INTEGRATION_GLOBAL_EXCLUDED_TAGS_PATTERN = /^@integration(?:-.+)?$/;
const INTEGRATION_BUCKET_6_TAG = "@integration-bucket-6";

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

const firstNonBlank = (...values: Array<string | undefined>): string | undefined =>
  values.map((value) => value?.trim()).find((value): value is string => Boolean(value));

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
};

const parseNonNegativeInteger = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed;
};

const formatGib = (bytes: number): string => (bytes / 1024 / 1024 / 1024).toFixed(1);

const readTrimmedFile = (filePath: string): string | undefined => {
  try {
    return readFileSync(filePath, "utf8").trim();
  } catch {
    return undefined;
  }
};

const resolveCgroupCpuCores = (): number | undefined => {
  const cpuMax = readTrimmedFile("/sys/fs/cgroup/cpu.max");
  if (cpuMax) {
    const [quotaRaw, periodRaw] = cpuMax.split(/\s+/);
    const quota = Number(quotaRaw);
    const period = Number(periodRaw);
    if (quotaRaw !== "max" && Number.isFinite(quota) && Number.isFinite(period) && quota > 0 && period > 0) {
      return Math.max(1, Math.round(quota / period));
    }
  }

  const quota = Number(readTrimmedFile("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"));
  const period = Number(readTrimmedFile("/sys/fs/cgroup/cpu/cpu.cfs_period_us"));
  if (Number.isFinite(quota) && Number.isFinite(period) && quota > 0 && period > 0) {
    return Math.max(1, Math.round(quota / period));
  }

  return undefined;
};

const resolveCgroupMemoryLimitBytes = (): number | undefined => {
  const totalMemoryBytes = totalmem();
  for (const filePath of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    const rawLimit = readTrimmedFile(filePath);
    if (!rawLimit || rawLimit === "max") {
      continue;
    }
    const limitBytes = Number(rawLimit);
    if (Number.isFinite(limitBytes) && limitBytes > 0 && limitBytes <= totalMemoryBytes * 2) {
      return limitBytes;
    }
  }
  return undefined;
};

const resolveAgentCpuCores = (): number => resolveCgroupCpuCores() ?? cpus()?.length ?? 1;
const resolveAgentRamGib = (): string => formatGib(resolveCgroupMemoryLimitBytes() ?? totalmem());

const appendEnvironmentSegment = (segments: string[], key: string, value: string) => {
  if (!segments.some((segment) => segment === value || segment.startsWith(`${key}=`))) {
    segments.push(value);
  }
};

const resolveWorkerCount = (env: EnvMap = process.env) => {
  const configured = parsePositiveInteger(env.PLAYWRIGHT_WORKERS ?? env.FUNCTIONAL_TESTS_WORKERS);
  const maxWorkers = Math.min(parsePositiveInteger(env.PLAYWRIGHT_MAX_WORKERS) ?? DEFAULT_MAX_WORKERS, ABSOLUTE_MAX_WORKERS);
  if (configured) return Math.min(maxWorkers, configured);
  return maxWorkers;
};

const resolveApiProjectWorkerCount = (env: EnvMap = process.env) => resolveWorkerCount(env);

const resolveUiProjectWorkerCount = (env: EnvMap = process.env) => {
  const configured = parsePositiveInteger(env.PW_UI_WORKERS ?? env.PLAYWRIGHT_UI_WORKERS);
  if (configured) return configured;
  return Math.min(MAX_UI_WORKERS, resolveWorkerCount(env));
};

const resolveOdhinTestEnvironment = (env: EnvMap = process.env, workers = resolveWorkerCount(env)) => {
  const baseEnvironment = firstNonBlank(env.PW_ODHIN_ENV) ?? env.TEST_ENV ?? env.TEST_ENVIRONMENT ?? (env.CI ? "ci" : "aat");
  const segments = baseEnvironment
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const executionMode = env.CI ? "ci" : "local-run";
  if (!segments.includes("ci") && !segments.includes("local-run")) {
    segments.push(executionMode);
  }
  appendEnvironmentSegment(segments, "workers", `workers=${workers}`);

  if (env.CI) {
    appendEnvironmentSegment(segments, "agent_cpu_cores", `agent_cpu_cores=${resolveAgentCpuCores()}`);
    appendEnvironmentSegment(segments, "agent_ram_gib", `agent_ram_gib=${resolveAgentRamGib()}`);
  }

  return segments.join(" | ");
};

const resolveApiTagFilters = (env: EnvMap = process.env): ResolvedTagFilters =>
  resolveTagFilters({
    env,
    includeTagsEnvVar: "API_PW_INCLUDE_TAGS",
    excludedTagsEnvVar: "API_PW_EXCLUDED_TAGS_OVERRIDE",
    configPathEnvVar: "API_PW_TAG_FILTER_CONFIG",
    defaultConfigPath: "src/tests/api/service-tag-filter.json",
    globalExcludedTagsEnvVar: "PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS",
    ignoreGlobalExcludesEnvVar: "PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES",
    globalExcludedTagsPattern: API_GLOBAL_EXCLUDED_TAGS_PATTERN
  });

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

const resolveIntegrationTagFilters = (env: EnvMap = process.env): ResolvedTagFilters =>
  resolveTagFilters({
    env,
    includeTagsEnvVar: "INTEGRATION_PW_INCLUDE_TAGS",
    excludedTagsEnvVar: "INTEGRATION_PW_EXCLUDED_TAGS_OVERRIDE",
    configPathEnvVar: "INTEGRATION_PW_TAG_FILTER_CONFIG",
    defaultConfigPath: "src/tests/integration/tag-filter.json",
    suiteTag: "@integration",
    globalExcludedTagsEnvVar: "PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS",
    ignoreGlobalExcludesEnvVar: "PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES",
    globalExcludedTagsPattern: INTEGRATION_GLOBAL_EXCLUDED_TAGS_PATTERN
  });

const removeTagInput = (rawTags: string | undefined, tagToRemove: string): string | undefined => {
  if (!rawTags?.trim()) {
    return rawTags;
  }
  return rawTags
    .split(/[\s,]+/)
    .filter((tag) => tag && tag !== tagToRemove)
    .join(",");
};

const withIntegrationBucket6Excluded = (rawTags: string | undefined, fallbackTags: string): string => {
  const tags = (rawTags?.trim() || fallbackTags)
    .split(/[\s,]+/)
    .filter((tag) => tag && tag !== "@none");
  if (!tags.includes(INTEGRATION_BUCKET_6_TAG)) {
    tags.push(INTEGRATION_BUCKET_6_TAG);
  }
  return tags.join(",");
};

const resolveOdhinOutputFolder = (env: EnvMap = process.env) =>
  firstNonBlank(env.PLAYWRIGHT_REPORT_FOLDER, env.PW_ODHIN_OUTPUT) ?? "test-results/odhin-report";

const resolveOdhinIndexFilename = (env: EnvMap = process.env) =>
  firstNonBlank(env.PW_ODHIN_INDEX, env.PLAYWRIGHT_REPORT_INDEX_FILENAME) ?? "playwright-odhin.html";

const resolveOdhinProject = (env: EnvMap = process.env) =>
  firstNonBlank(env.PLAYWRIGHT_REPORT_PROJECT, env.PW_ODHIN_PROJECT) ?? "rpx-xui-e2e-tests";

const resolveOdhinRelease = (env: EnvMap = process.env) =>
  firstNonBlank(env.PLAYWRIGHT_REPORT_RELEASE, env.PW_ODHIN_RELEASE) ??
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
      case "ci-brief":
        reporters.push(["./src/tests/common/reporters/ci-brief.reporter.cjs"]);
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
            graceMs: parseNonNegativeInteger(env.PW_ODHIN_PROGRESS_GRACE_MS) ?? 1500,
            intervalMs: parseNonNegativeInteger(env.PW_ODHIN_PROGRESS_INTERVAL_MS) ?? 5000,
            hardTimeoutMs:
              parseNonNegativeInteger(env.PW_ODHIN_PROGRESS_HARD_TIMEOUT_MS ?? env.PW_ODHIN_HARD_TIMEOUT_MS) ??
              (env.CI ? 0 : 30000),
            timeoutExitCode: parseNonNegativeInteger(env.PW_ODHIN_PROGRESS_TIMEOUT_EXIT_CODE) ?? 1,
            completionExitDelayMs: parseNonNegativeInteger(env.PW_ODHIN_COMPLETION_EXIT_DELAY_MS) ?? (env.CI ? 1000 : 0),
            forceExitOnCompletion: safeBoolean(env.PW_ODHIN_FORCE_EXIT_ON_COMPLETION, Boolean(env.CI))
          }
        ]);
        reporters.push([
          "./src/tests/common/reporters/odhin-adaptive.reporter.cjs",
          {
            outputFolder: resolveOdhinOutputFolder(env),
            indexFilename: resolveOdhinIndexFilename(env),
            title: firstNonBlank(env.PW_ODHIN_TITLE) ?? "rpx-xui-e2e Playwright",
            testEnvironment: resolveOdhinTestEnvironment(env, resolveWorkerCount(env)),
            project: resolveOdhinProject(env),
            release: resolveOdhinRelease(env),
            testFolder: firstNonBlank(env.PW_ODHIN_TEST_FOLDER) ?? "src/tests",
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
  const integrationTagFilters = resolveIntegrationTagFilters({
    ...env,
    INTEGRATION_PW_INCLUDE_TAGS: removeTagInput(env.INTEGRATION_PW_INCLUDE_TAGS, "@nightly"),
    INTEGRATION_PW_EXCLUDED_TAGS_OVERRIDE: withIntegrationBucket6Excluded(env.INTEGRATION_PW_EXCLUDED_TAGS_OVERRIDE, "@nightly")
  });
  const integrationNightlyTagFilters = resolveIntegrationTagFilters({
    ...env,
    INTEGRATION_PW_INCLUDE_TAGS: env.INTEGRATION_PW_INCLUDE_TAGS ?? "@nightly",
    INTEGRATION_PW_EXCLUDED_TAGS_OVERRIDE:
      removeTagInput(withIntegrationBucket6Excluded(env.INTEGRATION_PW_EXCLUDED_TAGS_OVERRIDE, INTEGRATION_BUCKET_6_TAG), "@nightly") ||
      INTEGRATION_BUCKET_6_TAG
  });
  logResolvedTagFilters("API", apiTagFilters, env);
  logResolvedTagFilters("E2E", e2eTagFilters, env);
  logResolvedTagFilters("Integration", integrationTagFilters, env);
  return {
    testDir: "./src/tests",
    globalSetup: "./src/global/ui.global.setup.ts",
    ...CommonConfig.recommended,
    fullyParallel: true,
    workers: resolveWorkerCount(env),
    reporter: resolveReporters(env),
    use: {
      baseURL: env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net",
      ignoreHTTPSErrors: true,
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
      video: "off"
    },
    projects: [
      {
        name: "ui",
        testMatch: "e2e/**/*.spec.ts",
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
        testMatch: "integration/**/*.spec.ts",
        grep: integrationTagFilters.grep,
        grepInvert: integrationTagFilters.grepInvert,
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
        testMatch: "integration/**/*.spec.ts",
        grep: integrationNightlyTagFilters.grep,
        grepInvert: integrationNightlyTagFilters.grepInvert,
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
        testMatch: "api/**/*.api.ts",
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
  resolveIntegrationTagFilters,
  resolveOdhinTestEnvironment,
  resolveUiProjectWorkerCount,
  resolveWorkerCount
};

export default defineConfig(buildConfig(process.env));
