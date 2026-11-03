import { createRequire } from "node:module";

import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const require = createRequire(import.meta.url);
const { buildConfig } = require("./scripts/harness-diagnostic-config.cjs") as {
  buildConfig: (env: NodeJS.ProcessEnv) => PlaywrightTestConfig;
};

const config = buildConfig(process.env);
if (!["frontend", "environment"].includes(process.env.EXUI_DIAGNOSTIC_SELECTION ?? "model")) {
  process.env.TEST_URL = "http://127.0.0.1:3455";
  process.env.TEST_ENV = "local";
}

if (process.env.EXUI_DIAGNOSTIC_SELECTION === "environment") {
  process.env.API_AUTH_MODE = "ui";
}

export default defineConfig(config);
