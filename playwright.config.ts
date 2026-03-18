import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, homedir, totalmem } from "node:os";
import path from "node:path";

import { CommonConfig, ProjectsConfig } from "@hmcts/playwright-common";
import {
  defineConfig,
  type PlaywrightTestConfig,
  type ReporterDescription,
} from "@playwright/test";
import { config as loadEnv } from "dotenv";

import {
  resolveUiStoragePath,
  shouldUseUiStorage,
} from "./src/utils/ui/storage-state.utils.js";

export type EnvMap = Record<string, string | undefined>;

loadEnv({
  path: path.resolve(process.cwd(), ".env"),
  quiet: true,
  // Preserve explicitly exported shell variables for local/debug runs.
  // .env should provide defaults only.
  override: false,
});

const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json") as {
  version: string;
};

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);
const isCiExecution = (env: EnvMap = process.env): boolean =>
  Boolean(env.CI || env.JENKINS_URL || env.BUILD_ID || env.GITHUB_ACTIONS);

const resolveDefaultReporterNames = (env: EnvMap) => {
  const configured = env.PLAYWRIGHT_DEFAULT_REPORTER?.trim();
  const primaryReporter =
    configured && ["dot", "list", "line"].includes(configured)
      ? configured
      : isCiExecution(env)
        ? "dot"
        : "list";
  return [primaryReporter, "odhin"];
};

const safeBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalised = value.trim().toLowerCase();
  if (truthy.has(normalised)) return true;
  if (falsy.has(normalised)) return false;
  return defaultValue;
};

const parsePositiveInt = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
};

const resolveCpuCores = (env: EnvMap = process.env): number => {
  const configured =
    parsePositiveInt(env.PLAYWRIGHT_CPU_CORES) ??
    (isCiExecution(env)
      ? parsePositiveInt(env.PLAYWRIGHT_CI_CPU_CORES)
      : undefined);
  if (configured) return configured;
  return cpus()?.length ?? 1;
};

const resolveMemoryGiB = (env: EnvMap = process.env): number => {
  const configuredMb =
    parsePositiveInt(env.PLAYWRIGHT_MEMORY_MB) ??
    (isCiExecution(env)
      ? parsePositiveInt(env.PLAYWRIGHT_CI_MEMORY_MB)
      : undefined);
  if (configuredMb) return Math.max(1, Math.floor(configuredMb / 1024));
  return Math.max(1, Math.floor(totalmem() / 1024 ** 3));
};

const resolveWorkerCount = (env: EnvMap = process.env) => {
  const configured = parsePositiveInt(env.PLAYWRIGHT_WORKERS);
  if (configured) {
    return configured;
  }
  const cpuCores = resolveCpuCores(env);
  const memoryGiB = resolveMemoryGiB(env);
  if (cpuCores <= 2 || memoryGiB <= 2) return 1;

  if (isCiExecution(env)) {
    const cpuBudget = Math.max(2, cpuCores);
    const memoryBudget = Math.max(1, Math.floor(memoryGiB / 1.5));
    return Math.max(1, Math.min(12, cpuBudget, memoryBudget));
  }

  const cpuBudget = Math.max(1, Math.floor(cpuCores * 0.75));
  const memoryBudget = Math.max(1, Math.floor(memoryGiB / 2));
  return Math.max(1, Math.min(10, cpuBudget, memoryBudget));
};

const resolveUiWorkerCount = (
  env: EnvMap = process.env,
  fallback = resolveWorkerCount(env),
) =>
  parsePositiveInt(env.PW_UI_WORKERS) ??
  parsePositiveInt(env.PLAYWRIGHT_UI_WORKERS) ??
  fallback;

const resolveApiWorkerCount = (
  env: EnvMap = process.env,
  fallback = resolveWorkerCount(env),
) => {
  const configured =
    parsePositiveInt(env.PW_API_WORKERS) ??
    parsePositiveInt(env.PLAYWRIGHT_API_WORKERS);
  if (configured) return configured;
  // Keep API fan-out conservative in CI to reduce transient auth/rate-limit failures.
  return isCiExecution(env)
    ? Math.max(1, Math.min(4, fallback))
    : Math.max(1, Math.min(6, fallback));
};

const resolveOdhinOutputFolder = (env: EnvMap = process.env) =>
  env.PLAYWRIGHT_REPORT_FOLDER ??
  env.PW_ODHIN_OUTPUT ??
  "functional-output/tests/playwright-e2e/odhin-report";

const resolveOdhinIndexFilename = (env: EnvMap = process.env): string => {
  const configured =
    env.PLAYWRIGHT_REPORT_INDEX_FILENAME?.trim() ?? env.PW_ODHIN_INDEX?.trim();
  if (configured) {
    return configured;
  }
  const outputFolder = resolveOdhinOutputFolder(env).toLowerCase();
  if (
    outputFolder.includes("playwright-api") ||
    outputFolder.includes("api_functional")
  ) {
    return "xui-playwright-api.html";
  }
  if (outputFolder.includes("playwright-integration")) {
    return "xui-playwright-integration.html";
  }
  return "xui-playwright-e2e.html";
};

const resolveBranchName = (env: EnvMap = process.env): string => {
  const envBranch =
    env.PLAYWRIGHT_REPORT_BRANCH ??
    env.GIT_BRANCH ??
    env.BRANCH_NAME ??
    env.GITHUB_REF_NAME ??
    env.GITHUB_HEAD_REF ??
    env.BUILD_SOURCEBRANCHNAME;
  if (envBranch?.trim()) {
    return envBranch.replace(/^refs\/heads\//, "").trim();
  }
  try {
    const gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .replace(/^refs\/heads\//, "");
    if (gitBranch && gitBranch !== "HEAD") {
      return gitBranch;
    }
  } catch {
    // Fall back to local label when branch cannot be resolved.
  }
  return "local";
};

const resolveOdhinProject = (env: EnvMap = process.env) =>
  env.PLAYWRIGHT_REPORT_PROJECT ?? env.PW_ODHIN_PROJECT ?? "RPX XUI Webapp";

const resolveOdhinRelease = (env: EnvMap = process.env) =>
  env.PLAYWRIGHT_REPORT_RELEASE ??
  env.PW_ODHIN_RELEASE ??
  `${appVersion} | branch=${resolveBranchName(env)}`;

const resolveEnvironmentFromUrl = (baseUrl: string): string => {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "local";
    }
    if (hostname.includes(".aat.")) {
      return "aat";
    }
    if (hostname.includes(".ithc.")) {
      return "ithc";
    }
    if (hostname.includes(".demo.")) {
      return "demo";
    }
    if (hostname.includes(".perftest.")) {
      return "perftest";
    }
    return hostname;
  } catch {
    return "unknown";
  }
};

const resolveOdhinTestEnvironment = (
  env: EnvMap = process.env,
  workerCount = resolveWorkerCount(env),
): string => {
  if (env.PW_ODHIN_ENV?.trim()) {
    return env.PW_ODHIN_ENV;
  }
  const targetEnv =
    env.TEST_TYPE ??
    resolveEnvironmentFromUrl(
      env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net",
    );
  const runContext = isCiExecution(env) ? "ci" : "local-run";
  const cpuCores = resolveCpuCores(env);
  const totalRamGiB = resolveMemoryGiB(env);
  return `${targetEnv} | ${runContext} | workers=${workerCount} | agent_cpu_cores=${cpuCores} | agent_ram_gib=${totalRamGiB}`;
};

const resolveOdhinTestOutput = (
  env: EnvMap = process.env,
): boolean | "only-on-failure" => {
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

const resolveOdhinConsoleTestOutput = (env: EnvMap = process.env): boolean => {
  if (env.PW_ODHIN_CONSOLE_TEST_OUTPUT !== undefined) {
    return safeBoolean(env.PW_ODHIN_CONSOLE_TEST_OUTPUT, true);
  }
  // Keep test stdout/stderr out of passed tests across all suites.
  return false;
};

const resolveOdhinCaptureStdio = (env: EnvMap = process.env): boolean => {
  if (env.PW_ODHIN_CAPTURE_STDIO !== undefined) {
    return safeBoolean(env.PW_ODHIN_CAPTURE_STDIO, false);
  }
  // Keep Odhin stdout/stderr quiet by default; opt-in with PW_ODHIN_CAPTURE_STDIO=true.
  return false;
};

const resolveUiVideoMode = (
  env: EnvMap = process.env,
): "off" | "retain-on-failure" => {
  if (isCiExecution(env)) {
    return "off";
  }
  const configured = env.PW_UI_VIDEO?.trim().toLowerCase();
  if (configured === "off") {
    return "off";
  }
  if (configured === "retain-on-failure" || configured === "on-failure") {
    return "retain-on-failure";
  }
  return "retain-on-failure";
};

const resolveReporters = (env: EnvMap = process.env): ReporterDescription[] => {
  const configured = env.PLAYWRIGHT_REPORTERS?.split(",")
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
            outputFolder: env.PLAYWRIGHT_HTML_OUTPUT ?? "playwright-report",
          },
        ]);
        break;
      case "junit":
        reporters.push([
          "junit",
          {
            outputFile: env.PLAYWRIGHT_JUNIT_OUTPUT ?? "playwright-junit.xml",
          },
        ]);
        break;
      case "odhin":
      case "odhin-reports-playwright":
        reporters.push([
          "./scripts/reporters/odhin-adaptive.reporter.cjs",
          {
            outputFolder: resolveOdhinOutputFolder(env),
            indexFilename: resolveOdhinIndexFilename(env),
            title: env.PW_ODHIN_TITLE ?? "RPX XUI Playwright",
            testEnvironment: resolveOdhinTestEnvironment(env),
            project: resolveOdhinProject(env),
            release: resolveOdhinRelease(env),
            testFolder: env.PW_ODHIN_TEST_FOLDER ?? "src/tests",
            startServer: safeBoolean(env.PW_ODHIN_START_SERVER, false),
            consoleLog: safeBoolean(env.PW_ODHIN_CONSOLE_LOG, true),
            simpleConsoleLog: safeBoolean(
              env.PW_ODHIN_SIMPLE_CONSOLE_LOG,
              false,
            ),
            consoleError: safeBoolean(env.PW_ODHIN_CONSOLE_ERROR, true),
            consoleTestOutput: resolveOdhinConsoleTestOutput(env),
            testOutput: resolveOdhinTestOutput(env),
            apiLogs: env.PW_ODHIN_API_LOGS ?? "summary",
            captureStdio: resolveOdhinCaptureStdio(env),
          },
        ]);
        break;
      default:
        reporters.push([name]);
        break;
    }
  }

  const flakeReporterPath = "./scripts/reporters/flake-gate.reporter.cjs";
  const hasFlakeReporter = reporters.some((reporter) => {
    const reporterName = Array.isArray(reporter) ? reporter[0] : reporter;
    return (
      typeof reporterName === "string" &&
      reporterName.endsWith("flake-gate.reporter.cjs")
    );
  });
  if (safeBoolean(env.PW_FLAKE_GATE, true) && !hasFlakeReporter) {
    reporters.splice(Math.min(1, reporters.length), 0, [flakeReporterPath]);
  }

  return reporters;
};

const resolveChromiumExecutablePath = (
  env: EnvMap = process.env,
): string | undefined => {
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
    .filter(
      (entry) => entry.isDirectory() && entry.name.startsWith("chromium-"),
    )
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
      "Google Chrome for Testing",
    );
    if (existsSync(exe)) return exe;
  }
  return undefined;
};

const buildConfig = (env: EnvMap = process.env): PlaywrightTestConfig => {
  const workerCount = resolveWorkerCount(env);
  const uiWorkers = resolveUiWorkerCount(env, workerCount);
  const apiWorkers = resolveApiWorkerCount(env, workerCount);
  const chromiumExecutablePath = resolveChromiumExecutablePath(env);
  const resolvedUiStorageState = shouldUseUiStorage()
    ? resolveUiStoragePath()
    : undefined;
  const uiStorageState =
    resolvedUiStorageState && existsSync(resolvedUiStorageState)
      ? resolvedUiStorageState
      : undefined;
  return {
    testDir: "./src/tests",
    globalSetup: "./src/global/ui.global.setup.ts",
    ...CommonConfig.recommended,
    fullyParallel: true,
    workers: workerCount,
    reporter: resolveReporters(env),
    use: {
      baseURL: env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net",
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
      video: "off",
    },
    projects: [
      {
        name: "ui",
        testMatch: /src\/tests\/(e2e|integration)\/.*\.spec\.ts/,
        retries: isCiExecution(env) ? 1 : 0,
        workers: uiWorkers,
        outputDir: "test-results/ui",
        use: {
          ...ProjectsConfig.chromium.use,
          channel: env.PW_UI_CHANNEL,
          viewport: CommonConfig.DEFAULT_VIEWPORT,
          headless: true,
          trace: "retain-on-failure",
          screenshot: "only-on-failure",
          video: resolveUiVideoMode(env),
          storageState: uiStorageState,
          launchOptions: chromiumExecutablePath
            ? {
                executablePath: chromiumExecutablePath,
              }
            : undefined,
        },
      },
      {
        name: "api",
        testMatch: /src\/tests\/api\/.*\.api\.ts/,
        retries: isCiExecution(env) ? 1 : 0,
        workers: apiWorkers,
        outputDir: "test-results/api",
        use: {
          headless: true,
          screenshot: "off",
          video: "off",
          trace: "off",
        },
      },
    ],
  };
};

export const __test__ = {
  buildConfig,
  resolveWorkerCount,
};

export default defineConfig(buildConfig(process.env));
