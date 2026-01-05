import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, homedir } from "node:os";
import path from "node:path";

import { CommonConfig } from "@hmcts/playwright-common";
import { defineConfig, type ReporterDescription, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env") });

const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json") as { version: string };

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);

const resolveDefaultReporterNames = () => {
  const override = process.env.PLAYWRIGHT_DEFAULT_REPORTER;
  if (override?.trim()) {
    return override
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return [process.env.CI ? "dot" : "list"];
};

const safeBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalised = value.trim().toLowerCase();
  if (truthy.has(normalised)) return true;
  if (falsy.has(normalised)) return false;
  return defaultValue;
};

const resolveWorkerCount = () => {
  const configured = process.env.PLAYWRIGHT_WORKERS;
  if (configured) {
    const parsed = Number.parseInt(configured, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const logical = cpus()?.length ?? 1;
  if (process.env.CI) return 1;
  if (logical <= 2) return 1;
  const approxPhysical = Math.max(1, Math.round(logical / 2));
  return Math.min(8, Math.max(2, approxPhysical));
};

const resolveOdhinTestOutput = (): boolean | "only-on-failure" => {
  const configured = process.env.PW_ODHIN_TEST_OUTPUT;
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

const resolveReporters = (): ReporterDescription[] => {
  const configured = process.env.PLAYWRIGHT_REPORTERS
    ?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  const reporterNames =
    configured?.length && configured[0] !== ""
      ? configured
      : resolveDefaultReporterNames();

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
            open: process.env.PLAYWRIGHT_HTML_OPEN ?? "never",
            outputFolder:
              process.env.PLAYWRIGHT_HTML_OUTPUT ?? "playwright-report"
          }
        ]);
        break;
      case "junit":
        reporters.push([
          "junit",
          {
            outputFile:
              process.env.PLAYWRIGHT_JUNIT_OUTPUT ?? "playwright-junit.xml"
          }
        ]);
        break;
      case "odhin":
      case "odhin-reports-playwright":
        reporters.push([
          "odhin-reports-playwright",
          {
            outputFolder:
              process.env.PW_ODHIN_OUTPUT ?? "test-results/odhin-report",
            indexFilename: process.env.PW_ODHIN_INDEX ?? "playwright-odhin.html",
            title: process.env.PW_ODHIN_TITLE ?? "rpx-xui-e2e Playwright",
            testEnvironment:
              process.env.PW_ODHIN_ENV ??
              `${process.env.TEST_ENV ?? process.env.TEST_ENVIRONMENT ?? (process.env.CI ? "ci" : "local")} | workers=${resolveWorkerCount()}`,
            project: process.env.PW_ODHIN_PROJECT ?? "rpx-xui-e2e-tests",
            release:
              process.env.PW_ODHIN_RELEASE ??
              `${appVersion} | branch=${process.env.GIT_BRANCH ?? "local"}`,
            testFolder: process.env.PW_ODHIN_TEST_FOLDER ?? "src/tests",
            startServer: safeBoolean(process.env.PW_ODHIN_START_SERVER, false),
            consoleLog: safeBoolean(process.env.PW_ODHIN_CONSOLE_LOG, true),
            simpleConsoleLog: safeBoolean(process.env.PW_ODHIN_SIMPLE_CONSOLE_LOG, false),
            consoleError: safeBoolean(process.env.PW_ODHIN_CONSOLE_ERROR, true),
            consoleTestOutput: safeBoolean(process.env.PW_ODHIN_CONSOLE_TEST_OUTPUT, true),
            testOutput: resolveOdhinTestOutput(),
            apiLogs: process.env.PW_ODHIN_API_LOGS ?? "summary"
          }
        ]);
        break;
      default:
        reporters.push([name]);
        break;
    }
  }

  return reporters;
};

const resolveChromiumExecutablePath = (): string | undefined => {
  const override = process.env.PW_CHROMIUM_PATH;
  if (override?.trim()) return override;
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    return undefined;
  }
  const root =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
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

const chromiumExecutablePath = resolveChromiumExecutablePath();

export default defineConfig({
  testDir: "./src/tests",
  ...CommonConfig.recommended,
  fullyParallel: true,
  workers: resolveWorkerCount(),
  reporter: resolveReporters(),
  use: {
    baseURL:
      process.env.TEST_URL ??
      "https://manage-case.aat.platform.hmcts.net",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  },
  projects: [
    {
      name: "ui",
      testMatch: /src\/tests\/e2e\/.*\.spec\.ts/,
      retries: process.env.CI ? 1 : 0,
      outputDir: "test-results/ui",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PW_UI_CHANNEL,
        viewport: { width: 1920, height: 1080 },
        headless: true,
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
      retries: process.env.CI ? 1 : 0,
      outputDir: "test-results/api",
      use: {
        headless: true,
        screenshot: "off",
        video: "off",
        trace: "off"
      }
    }
  ]
});
