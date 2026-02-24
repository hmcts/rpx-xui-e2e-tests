import path from "node:path";
import { pathToFileURL } from "node:url";

export type EnvMap = Record<string, string | undefined>;

export interface ConfigModule {
  __test__?: {
    buildConfig: (env: EnvMap) => unknown;
    resolveWorkerCount: (env: EnvMap) => number;
    resolveRetryCount?: (env: EnvMap) => number;
    resolveBranchName?: (env: EnvMap) => string;
  };
  default?: ConfigModule;
  [key: string]: unknown;
}

export interface TestableConfigModule extends ConfigModule {
  __test__: {
    buildConfig: (env: EnvMap) => unknown;
    resolveWorkerCount: (env: EnvMap) => number;
    resolveRetryCount: (env: EnvMap) => number;
    resolveBranchName: (env: EnvMap) => string;
  };
}

export async function loadConfig(): Promise<TestableConfigModule> {
  const configPath = path.resolve(process.cwd(), "playwright.config.ts");
  const configUrl = pathToFileURL(configPath).href;
  const loaded = await import(configUrl);
  const resolved = resolveConfigModule(loaded as ConfigModule);
  if (
    !resolved.__test__ ||
    typeof resolved.__test__.buildConfig !== "function" ||
    typeof resolved.__test__.resolveWorkerCount !== "function" ||
    typeof resolved.__test__.resolveRetryCount !== "function" ||
    typeof resolved.__test__.resolveBranchName !== "function"
  ) {
    throw new Error("Playwright config module did not expose __test__ helpers");
  }
  return resolved as TestableConfigModule;
}

export function resolveConfigModule(loaded: ConfigModule): ConfigModule {
  return loaded?.__test__ ? loaded : (loaded?.default ?? loaded);
}
