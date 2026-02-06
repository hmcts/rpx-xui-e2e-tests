import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, homedir } from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

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
  override: !process.env.CI,
  quiet: true,
});

const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json") as {
  version: string;
};

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);

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

const resolveWorkerCount = (env: EnvMap = process.env) => {
  const configured = env.PLAYWRIGHT_WORKERS;
  if (configured) {
    const parsed = Number.parseInt(configured, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const logical = cpus()?.length ?? 1;
  if (env.CI) return 1;
  if (logical <= 2) return 1;
  const approxPhysical = Math.max(1, Math.round(logical / 2));
  return Math.min(8, Math.max(2, approxPhysical));
};

const resolveOdhinOutputFolder = (env: EnvMap = process.env) =>
  env.PLAYWRIGHT_REPORT_FOLDER ??
  env.PW_ODHIN_OUTPUT ??
  "test-results/odhin-report";

const resolveOdhinProject = (env: EnvMap = process.env) =>
  env.PLAYWRIGHT_REPORT_PROJECT ?? env.PW_ODHIN_PROJECT ?? "rpx-xui-e2e-tests";

const normaliseBranchName = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withoutRef = trimmed.replace(/^refs\/heads\//, "");
  const withoutOrigin = withoutRef.replace(/^origin\//, "");
  return withoutOrigin || undefined;
};

const resolveBranchName = (env: EnvMap = process.env): string => {
  const branchCandidates = [
    env.CHANGE_BRANCH,
    env.BRANCH_NAME,
    env.GITHUB_HEAD_REF,
    env.GITHUB_REF_NAME,
    env.GIT_BRANCH,
    env.BUILD_SOURCEBRANCHNAME,
  ];

  for (const candidate of branchCandidates) {
    const normalised = normaliseBranchName(candidate);
    if (normalised) return normalised;
  }

  try {
    const gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    const normalised = normaliseBranchName(gitBranch);
    if (normalised && normalised !== "HEAD") return normalised;
  } catch {
    // Ignore git lookup failures and use safe fallback below.
  }

  return "local";
};

const resolveOdhinRelease = (env: EnvMap = process.env) =>
  env.PLAYWRIGHT_REPORT_RELEASE ??
  env.PW_ODHIN_RELEASE ??
  `${appVersion} | branch=${resolveBranchName(env)}`;

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
          "odhin-reports-playwright",
          {
            outputFolder: resolveOdhinOutputFolder(env),
            indexFilename: env.PW_ODHIN_INDEX ?? "playwright-odhin.html",
            title: env.PW_ODHIN_TITLE ?? "rpx-xui-e2e Playwright",
            testEnvironment:
              env.PW_ODHIN_ENV ??
              `${env.TEST_ENV ?? env.TEST_ENVIRONMENT ?? (env.CI ? "ci" : "local")} | workers=${resolveWorkerCount(env)}`,
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
            consoleTestOutput: safeBoolean(
              env.PW_ODHIN_CONSOLE_TEST_OUTPUT,
              true,
            ),
            testOutput: resolveOdhinTestOutput(env),
            apiLogs: env.PW_ODHIN_API_LOGS ?? "summary",
          },
        ]);
        break;
      default:
        reporters.push([name]);
        break;
    }
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
  const chromiumExecutablePath = resolveChromiumExecutablePath(env);
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
      video: "off",
    },
    projects: [
      {
        name: "ui",
        testMatch: /src\/tests\/e2e\/.*\.spec\.ts/,
        testIgnore: /src\/tests\/e2e\/integration\/.*\.spec\.ts/,
        retries: env.CI ? 1 : 0,
        outputDir: "test-results/ui",
        use: {
          ...ProjectsConfig.chromium.use,
          channel: env.PW_UI_CHANNEL,
          viewport: CommonConfig.DEFAULT_VIEWPORT,
          headless: true,
          trace: "retain-on-failure",
          screenshot: "only-on-failure",
          video: "retain-on-failure",
          storageState: shouldUseUiStorage()
            ? resolveUiStoragePath()
            : undefined,
          launchOptions: chromiumExecutablePath
            ? {
                executablePath: chromiumExecutablePath,
              }
            : undefined,
        },
      },
      {
        name: "integration",
        testMatch: /src\/tests\/e2e\/integration\/.*\.spec\.ts/,
        grepInvert: /@nightly/i,
        retries: env.CI ? 1 : 0,
        outputDir: "test-results/integration",
        use: {
          ...ProjectsConfig.chromium.use,
          channel: env.PW_UI_CHANNEL,
          viewport: CommonConfig.DEFAULT_VIEWPORT,
          headless: true,
          trace: "retain-on-failure",
          screenshot: "only-on-failure",
          video: "retain-on-failure",
          launchOptions: chromiumExecutablePath
            ? {
                executablePath: chromiumExecutablePath,
              }
            : undefined,
        },
      },
      {
        name: "integration-nightly",
        testMatch: /src\/tests\/e2e\/integration\/.*\.spec\.ts/,
        grep: /@nightly/i,
        retries: 0,
        outputDir: "test-results/integration-nightly",
        use: {
          ...ProjectsConfig.chromium.use,
          channel: env.PW_UI_CHANNEL,
          viewport: CommonConfig.DEFAULT_VIEWPORT,
          headless: true,
          trace: "retain-on-failure",
          screenshot: "only-on-failure",
          video: "retain-on-failure",
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
        retries: env.CI ? 1 : 0,
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
  resolveBranchName,
};

export default defineConfig(buildConfig(process.env));
