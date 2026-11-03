import { defineConfig } from "@playwright/test";

// Each file supports an executable retained Harness diagnostic/session consumer.
// Keep this list explicit: the old API tree also contains obsolete product support.
export default defineConfig({
  testDir: "./src/tests/api",
  testMatch: [
    "coverage-analytics.api.ts",
    "coverage-helpers.api.ts",
    "auth-coverage-basic.api.ts",
    "auth-coverage-bootstrap.api.ts",
    "auth-coverage-storage.api.ts",
    "coverage-search-case.api.ts",
    "coverage-session-parity.api.ts",
    "unit/dynamic-user.pure.unit.api.ts",
    "unit/auth-journey-guardrails.unit.api.ts",
    "unit/hearing-journey-setup.unit.api.ts",
    "unit/hearing-manager-user-pool.unit.api.ts",
    "unit/ordered-session-fallback.unit.api.ts",
    "unit/search-case-session.unit.api.ts",
    "unit/odhin-adaptive-reporter.unit.api.ts",
    "unit/odhin-report-enhancer.unit.api.ts"
  ],
  retries: 0, workers: 1, fullyParallel: false, forbidOnly: true,
  reporter: [[process.env.CI ? "dot" : "list"]],
  outputDir: "functional-output/tests/harness/private/support",
  use: { baseURL: "http://127.0.0.1:1", trace: "off", video: "off", screenshot: "off" }
});
