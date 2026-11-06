import { createRequire } from "node:module";

import { defineConfig } from "@playwright/test";

const require = createRequire(import.meta.url);
const { fullMachineReporters } = require("./scripts/harness-reporting.cjs") as {
  fullMachineReporters: (output: string) => [string, Record<string, unknown>][];
};
const output = process.env.EXUI_REPORTING_OUTPUT;
if (!output) throw new Error("EXPLICIT_PRIVATE_REPORTING_OUTPUT_REQUIRED");

export default defineConfig({
  testDir: ".",
  testMatch: ["src/tests/harness/reporting/outcomes.spec.ts"],
  workers: 1, retries: 0, fullyParallel: false, forbidOnly: true,
  reporter: [
    ["failures"],
    ...fullMachineReporters(output),
    ["./src/tests/common/reporters/odhin-adaptive.reporter.cjs", {
      outputFolder: `${output}/odhin-report`, indexFilename: "reporting.html",
      startServer: false, profile: false, consoleLog: false, consoleError: false,
      testOutput: "only-on-failure", lightweight: true
    }]
  ],
  outputDir: `${output}/test-results`,
  use: { trace: "off", video: "off", screenshot: "off" }
});
