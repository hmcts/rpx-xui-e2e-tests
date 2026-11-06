import { createRequire } from "node:module";

import { defineConfig } from "@playwright/test";

import support from "./playwright.harness-support.config";

const require = createRequire(import.meta.url);
const { fullMachineReporters } = require("./scripts/harness-reporting.cjs") as {
  fullMachineReporters: (output: string) => [string, Record<string, unknown>][];
};

// One runner, one report: retain the focused local configs without executing them twice.
export default defineConfig({
  ...support,
  testDir: ".",
  testMatch: [
    ...(support.testMatch as string[]).map((file) => `src/tests/api/${file}`),
    "src/tests/api/exui-central-assurance.api.ts",
    "src/tests/api/exui-historic-replay-packs.api.ts",
  ],
  timeout: 90000,
  reporter: [
    ["failures"],
    ...fullMachineReporters("functional-output/tests/harness/private/ci"),
    ["./scripts/harness-public-odhin-reporter.cjs", { selection: "harness" }],
    [
      "./src/tests/common/reporters/odhin-adaptive.reporter.cjs",
      {
        outputFolder: "functional-output/tests/harness/private/ci/odhin-report",
        indexFilename: "harness-diagnostic.html",
        title: "EXUI Harness private diagnostics",
        testEnvironment: "support and models",
        project: "EXUI Harness diagnostics",
        startServer: false,
        profile: false,
        consoleLog: false,
        consoleError: false,
        testOutput: "only-on-failure",
        lightweight: true,
      },
    ],
  ],
  outputDir: "functional-output/tests/harness/private/ci/test-results",
});
