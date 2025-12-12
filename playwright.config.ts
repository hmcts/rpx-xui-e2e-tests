import { defineConfig, devices, type ReporterDescription } from "@playwright/test";
import CONFIG from "./config/configManager.js";

const defaultReporter = process.env.PLAYWRIGHT_DEFAULT_REPORTER ?? "list";

function resolveReporters(): ReporterDescription[] {
  const configured = process.env.PLAYWRIGHT_REPORTERS
    ? process.env.PLAYWRIGHT_REPORTERS.split(",").map((item) => item.trim()).filter(Boolean)
    : [defaultReporter];

  return configured.map((name): ReporterDescription => {
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
            indexFile: CONFIG.test.reporting?.odhin?.index ?? "playwright-odhin.html"
          }
        ];
      default:
        return [name];
    }
  });
}

export default defineConfig({
  testDir: "./src/tests",
  timeout: CONFIG.test.timeout,
  expect: {
    timeout: CONFIG.test.expectTimeout
  },
  retries: CONFIG.test.retries,
  workers: CONFIG.test.workers,
  reporter: resolveReporters(),
  globalSetup: "./src/hooks/global-setup.ts",
  globalTeardown: "./src/hooks/global-teardown.ts",
  fullyParallel: false,
  use: {
    baseURL: CONFIG.urls.xui,
    trace: (process.env.PW_TRACE as "on" | "off" | "retain-on-failure" | "on-first-retry" | undefined) ?? "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true
  },
  projects: [
    {
      name: "chromium",
      testDir: "./src/tests/ui",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "firefox",
      testDir: "./src/tests/ui",
      use: { ...devices["Desktop Firefox"] }
    },
    {
      name: "webkit",
      testDir: "./src/tests/ui",
      use: { ...devices["Desktop Safari"] }
    },
    {
      name: "api",
      testDir: "./src/tests/api",
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
