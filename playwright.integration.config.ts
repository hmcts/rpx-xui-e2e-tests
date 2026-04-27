import { createRequire } from "node:module";

import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

import { resolveTagFilters, type ResolvedTagFilters } from "./playwright-config-utils.js";
import type { EnvMap } from "./playwright.config.js";

const require = createRequire(import.meta.url);
const support = require("./playwright.integration.config.support.cjs") as {
  buildConfig: (env: EnvMap) => PlaywrightTestConfig;
  resolveOdhinConsoleCapture: (env: EnvMap) => { consoleLog: boolean; consoleError: boolean };
  resolveOdhinHardTimeoutMs: (env: EnvMap) => number;
  resolveOdhinLightweight: (env: EnvMap) => boolean;
  resolveOdhinRuntimeHookTimeoutMs: (env: EnvMap) => number;
  resolveWorkerCount: (env: EnvMap) => number;
};

const resolveIntegrationTagFilters = (env: EnvMap = process.env): ResolvedTagFilters =>
  resolveTagFilters({
    env,
    includeTagsEnvVar: "INTEGRATION_PW_INCLUDE_TAGS",
    excludedTagsEnvVar: "INTEGRATION_PW_EXCLUDED_TAGS_OVERRIDE",
    configPathEnvVar: "INTEGRATION_PW_TAG_FILTER_CONFIG",
    defaultConfigPath: "src/tests/integration/tag-filter.json",
    suiteTag: "@integration"
  });

const buildConfig = (env: EnvMap = process.env): PlaywrightTestConfig => {
  const tagFilters = resolveIntegrationTagFilters(env);
  const config = support.buildConfig(env);

  return {
    ...config,
    projects: config.projects?.map((project) => ({
      ...project,
      grep: tagFilters.grep,
      grepInvert: tagFilters.grepInvert
    }))
  };
};

export const __test__ = {
  buildConfig,
  resolveIntegrationTagFilters,
  resolveOdhinConsoleCapture: support.resolveOdhinConsoleCapture,
  resolveOdhinHardTimeoutMs: support.resolveOdhinHardTimeoutMs,
  resolveOdhinLightweight: support.resolveOdhinLightweight,
  resolveOdhinRuntimeHookTimeoutMs: support.resolveOdhinRuntimeHookTimeoutMs,
  resolveWorkerCount: support.resolveWorkerCount
};

export default defineConfig(buildConfig(process.env));
