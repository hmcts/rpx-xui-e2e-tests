import { defineConfig } from "@playwright/test";

// Synthetic runtime compatibility probes; these carry no product coverage credit.
export default defineConfig({
  testDir: "./src/tests/harness/compatibility",
  testMatch: "*.spec.ts",
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["list"]],
  outputDir: "functional-output/tests/harness/private/playwright165",
  use: {
    browserName: "chromium",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
