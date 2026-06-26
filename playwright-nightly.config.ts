import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, totalmem } from "node:os";

import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

import { logResolvedTagFilters, resolveTagFilters, type ResolvedTagFilters } from "./playwright-config-utils.js";

type EnvMap = Record<string, string | undefined>;

const require = createRequire(import.meta.url);
const E2E_GLOBAL_EXCLUDED_TAGS_PATTERN = /^@e2e(?:-.+)?$/;
const support = require("./playwright.integration.config.support.cjs") as {
  resolveWorkerCount: (env: EnvMap) => number;
};

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);
const MAX_E2E_WORKERS = 4;

const isTruthy = (value: string | undefined): boolean => truthy.has(value?.trim().toLowerCase() ?? "");

const safeBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
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

const parseNonNegativeInteger = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed;
};

const resolveE2EWorkerCount = (env: EnvMap = process.env) => {
  const configured = parsePositiveInteger(env.PW_E2E_WORKERS ?? env.PLAYWRIGHT_E2E_WORKERS);
  if (configured) return Math.min(MAX_E2E_WORKERS, configured);
  return Math.min(MAX_E2E_WORKERS, support.resolveWorkerCount(env));
};

const resolveOdhinTestEnvironment = (env: EnvMap = process.env, workers = resolveE2EWorkerCount(env)) => {
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
  const workers = resolveE2EWorkerCount(env);
  logResolvedTagFilters("E2E nightly", e2eTagFilters, env);

  return {
    testDir: "./src/tests/e2e",
    timeout: 120000,
    fullyParallel: true,
    workers,
    reporter: [
      [env.CI ? "dot" : "list"],
      [
        "./src/tests/common/reporters/odhin-progress.reporter.cjs",
        {
          enabled: true,
          graceMs: parseNonNegativeInteger(env.PW_ODHIN_PROGRESS_GRACE_MS) ?? 1500,
          intervalMs: parseNonNegativeInteger(env.PW_ODHIN_PROGRESS_INTERVAL_MS) ?? 5000,
          hardTimeoutMs:
            parseNonNegativeInteger(env.PW_ODHIN_PROGRESS_HARD_TIMEOUT_MS ?? env.PW_ODHIN_HARD_TIMEOUT_MS) ?? 0,
          timeoutExitCode: parseNonNegativeInteger(env.PW_ODHIN_PROGRESS_TIMEOUT_EXIT_CODE) ?? 1,
          completionExitDelayMs: parseNonNegativeInteger(env.PW_ODHIN_COMPLETION_EXIT_DELAY_MS) ?? (env.CI ? 1000 : 0),
          forceExitOnCompletion: safeBoolean(env.PW_ODHIN_FORCE_EXIT_ON_COMPLETION, Boolean(env.CI))
        }
      ],
      [
        "./src/tests/common/reporters/odhin-adaptive.reporter.cjs",
        {
          outputFolder:
            firstNonBlank(env.PLAYWRIGHT_REPORT_FOLDER, env.PW_ODHIN_OUTPUT) ??
            "functional-output/tests/playwright-e2e/odhin-report",
          indexFilename: firstNonBlank(env.PW_ODHIN_INDEX, env.PLAYWRIGHT_REPORT_INDEX_FILENAME) ?? "playwright-odhin-nightly.html",
          title: firstNonBlank(env.PW_ODHIN_TITLE) ?? "rpx-xui-e2e nightly",
          testEnvironment: resolveOdhinTestEnvironment(env, workers),
          project: firstNonBlank(env.PLAYWRIGHT_REPORT_PROJECT, env.PW_ODHIN_PROJECT) ?? "rpx-xui-e2e-tests",
          release:
            firstNonBlank(env.PLAYWRIGHT_REPORT_RELEASE, env.PW_ODHIN_RELEASE) ??
            `branch=${env.PLAYWRIGHT_REPORT_BRANCH ?? env.GIT_BRANCH ?? "local"}`,
          testFolder: firstNonBlank(env.PW_ODHIN_TEST_FOLDER) ?? "src/tests/e2e",
          startServer: safeBoolean(env.PW_ODHIN_START_SERVER, false),
          lightweight: env.CI ? false : true,
          testOutput: env.PW_ODHIN_TEST_OUTPUT ?? "only-on-failure",
          profile: safeBoolean(env.PW_ODHIN_PROFILE, true),
          runtimeHookTimeoutMs:
            parseNonNegativeInteger(env.PW_ODHIN_RUNTIME_HOOK_TIMEOUT_MS ?? env.PW_ODHIN_HARD_TIMEOUT_MS) ??
            (env.CI ? 0 : 15000)
        }
      ]
    ],
    use: {
      baseURL: env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net",
      ignoreHTTPSErrors: true,
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
  resolveOdhinTestEnvironment,
  resolveE2eTagFilters,
  resolveE2EWorkerCount,
  resolveWorkerCount: support.resolveWorkerCount
};

export default defineConfig(buildConfig(process.env));
