import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const envFile = process.env.DOTENV_PATH ?? path.resolve(process.cwd(), ".env");
loadEnv({ path: envFile, override: true });

const junitOutput = process.env.PLAYWRIGHT_JUNIT_OUTPUT ?? "test-results/junit/results.xml";
const defaultReporter = process.env.PLAYWRIGHT_DEFAULT_REPORTER ?? (process.env.CI ? "dot" : "list");
const configuredReporters = (process.env.PLAYWRIGHT_REPORTERS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((name) => [name] as [string, Record<string, unknown>?]);

const reporters: [string, Record<string, unknown>?][] = [];

if (configuredReporters.length > 0) {
  reporters.push(...configuredReporters);
} else if (process.env.CI) {
  reporters.push(["dot"], ["junit", { outputFile: junitOutput }]);
} else {
  reporters.push([defaultReporter]);
}

const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3333";
const videoMode = process.env.PLAYWRIGHT_VIDEO_MODE ?? (process.env.CI ? "retain-on-failure" : "off");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: reporters,
  use: {
    baseURL: baseUrl,
    trace: "on-first-retry",
    video: videoMode as "retain-on-failure" | "off" | "on" | "on-first-retry",
    screenshot: "only-on-failure",
    extraHTTPHeaders: {
      "x-test-run-id": process.env.TEST_RUN_ID ?? `local-${Date.now()}`,
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chromium"] } },
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "msedge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  metadata: {
    service: "rpx-xui-webapp",
    environment: process.env.TEST_ENVIRONMENT ?? "local",
  },
});
