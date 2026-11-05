import process from "node:process";
import { defineConfig } from "@playwright/test";
if (process.env.EXUI_CALLBACK_FEASIBILITY !== "true") throw Error("CALLBACK_FEASIBILITY_OPT_IN_REQUIRED");
export default defineConfig({
  testDir: "./src/tests/harness/callback-feasibility", testMatch: process.env.EXUI_SELECTOR_EVENT_ROW === "true" ? "selector-event-row.spec.ts" : "recipient-callback.spec.ts", workers: 1, retries: 0, timeout: 90000, globalTimeout: 120000, forbidOnly: true,
  outputDir: process.env.EXUI_HARNESS_TEST_OUTPUT,
  reporter: [["json", { outputFile: process.env.EXUI_CALLBACK_REPORT }]],
  use: { baseURL: "http://127.0.0.1:3100", headless: true, trace: "off", screenshot: "off", video: "off",
    launchOptions: { executablePath: process.env.EXUI_CHROMIUM_EXECUTABLE } },
});
