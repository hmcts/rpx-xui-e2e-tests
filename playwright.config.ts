import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices, type ReporterDescription } from "@playwright/test";
import CONFIG from "./config/configManager.js";

const E2E_TESTS = "/**/ui/**/{e2e,E2E}/**/*.spec.ts";
const FUNCTIONAL_TESTS = "/**/ui/**/functional-integration/**/*.spec.ts";
const MULTI_DEVICE_TESTS = "/**/ui/**/multidevice/**/*.spec.ts";
const DESKTOP_TESTS = [E2E_TESTS, FUNCTIONAL_TESTS, MULTI_DEVICE_TESTS];
const MOBILE_TESTS = [E2E_TESTS, FUNCTIONAL_TESTS, MULTI_DEVICE_TESTS];
const ACCESSIBILITY_TESTS = "/**/ui/**/accessibility/**/*.spec.ts";
const API_TESTS = ["/**/api/**/*.spec.ts", "/**/api/**/*.api.ts"];

const defaultReporter = process.env.PLAYWRIGHT_DEFAULT_REPORTER ?? "odhin";

function mapReporter(name: string): ReporterDescription {
  switch (name) {
    case "html":
      return [
        "html",
        {
          outputFolder: CONFIG.test.reporting?.html?.outputFolder ?? "playwright-report",
          open: "never"
        }
      ];
    case "junit":
      return [
        "junit",
        {
          outputFile: CONFIG.test.reporting?.junit?.outputFile ?? "playwright-junit.xml"
        }
      ];
    case "odhin":
      return [
        "odhin-reports-playwright",
        {
          outputFolder: CONFIG.test.reporting?.odhin?.outputFolder ?? "test-results/odhin-report",
          indexFile: CONFIG.test.reporting?.odhin?.index ?? "playwright-odhin.html",
          startServer: false
        }
      ];
    case "blob":
      return ["blob"];
    case "json":
      return ["json"];
    default:
      return [name as ReporterDescription[0]];
  }
}

function resolveReporters(): ReporterDescription[] {
  const configured = process.env.PLAYWRIGHT_REPORTERS
    ? process.env.PLAYWRIGHT_REPORTERS.split(",").map((item) => item.trim()).filter(Boolean)
    : undefined;

  if (configured && configured.length > 0) {
    return configured.map(mapReporter);
  }

  if (process.env.CI) {
    return [mapReporter("list"), mapReporter("junit"), mapReporter("html"), mapReporter("blob")];
  }

  const reporters: ReporterDescription[] = [];
  if (defaultReporter !== "list") {
    reporters.push(mapReporter("list"));
  }
  reporters.push(mapReporter(defaultReporter));
  return reporters;
}

const defaultUserKey = process.env.UI_USER_KEY ?? CONFIG.ui?.defaultUserKey ?? "default";
const storageStatePath = path.resolve(
  process.cwd(),
  CONFIG.ui?.sessionDir ?? ".sessions",
  CONFIG.environment,
  `${defaultUserKey}.json`
);
const hasStorageState = fs.existsSync(storageStatePath);

export default defineConfig({
  testDir: "./src/tests",
  testIgnore: ["**/ui/E2E/**", "**/ui/functional-integration/**"],
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  retries: CONFIG.test.retries ?? (process.env.CI ? 1 : 0),
  workers: CONFIG.test.workers,
  timeout: CONFIG.test.timeout,
  expect: {
    timeout: CONFIG.test.expectTimeout
  },
  reporter: resolveReporters(),
  globalSetup: "./src/hooks/global-setup.ts",
  globalTeardown: "./src/hooks/global-teardown.ts",
  use: {
    baseURL: CONFIG.urls.xui,
    actionTimeout: 3000,
    navigationTimeout: 5000,
    trace:
      (process.env.PW_TRACE as
        | "on"
        | "off"
        | "retain-on-failure"
        | "on-first-retry"
        | undefined) ?? "retain-on-first-failure",
    screenshot: "only-on-failure",
    video: process.env.CI ? "off" : "retain-on-failure",
    ignoreHTTPSErrors: true,
    storageState: hasStorageState ? storageStatePath : undefined
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: DESKTOP_TESTS,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"]
    },
    {
      name: "firefox",
      testMatch: DESKTOP_TESTS,
      use: { ...devices["Desktop Firefox"] },
      dependencies: ["setup"]
    },
    {
      name: "webkit",
      testMatch: DESKTOP_TESTS,
      use: { ...devices["Desktop Safari"] },
      dependencies: ["setup"]
    },
    {
      name: "Mobile Chrome",
      testMatch: MOBILE_TESTS,
      use: {
        ...devices["Galaxy S9+"],
        contextOptions: {
          permissions: ["clipboard-read", "clipboard-write"],
          isMobile: true
        }
      },
      dependencies: ["setup"]
    },
    {
      name: "Mobile Safari",
      testMatch: MOBILE_TESTS,
      use: {
        ...devices["iPhone 12"],
        isMobile: true
      },
      dependencies: ["setup"]
    },
    {
      name: "accessibility-chromium",
      testMatch: [ACCESSIBILITY_TESTS],
      use: {
        ...devices["Desktop Chrome"],
        contextOptions: {
          permissions: ["clipboard-read", "clipboard-write"]
        }
      },
      dependencies: ["setup"]
    },
    {
      name: "api",
      testMatch: API_TESTS,
      use: {
        baseURL: CONFIG.urls.api,
        extraHTTPHeaders: {},
        trace: "off",
        screenshot: "off",
        video: "off"
      }
    }
  ],
  outputDir: "test-results"
});
