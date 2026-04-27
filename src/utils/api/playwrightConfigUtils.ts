import path from "node:path";
import { pathToFileURL } from "node:url";

export type EnvMap = Record<string, string | undefined>;
export type ReporterEntry = [string] | [string, Record<string, unknown> | undefined];
export type ProjectConfigShape = {
  grep?: RegExp;
  grepInvert?: RegExp;
  name?: string;
  retries?: number;
  use?: {
    channel?: string;
    headless?: boolean;
    timezoneId?: string;
    [key: string]: unknown;
  };
  workers?: number;
};
export type ConfigShape = {
  expect?: { timeout?: number; [key: string]: unknown };
  projects: ProjectConfigShape[];
  reporter: ReporterEntry[];
  use: { baseURL?: string; timezoneId?: string; [key: string]: unknown };
  workers?: number;
};

export interface ConfigModule {
  __test__?: {
    buildConfig: (env: EnvMap) => unknown;
    resolveWorkerCount: (env: EnvMap) => number;
    [key: string]: unknown;
  };
  default?: ConfigModule;
  [key: string]: unknown;
}

export interface TestableConfigModule extends ConfigModule {
  __test__: {
    buildConfig: (env: EnvMap) => ConfigShape;
    resolveWorkerCount: (env: EnvMap) => number;
    [key: string]: unknown;
  };
}

export async function loadConfig(): Promise<TestableConfigModule> {
  return loadConfigAt("playwright.config.ts");
}

export async function loadConfigAt(configFile: string): Promise<TestableConfigModule> {
  const configPath = path.resolve(process.cwd(), configFile);
  const configUrl = pathToFileURL(configPath).href;
  const loaded = await import(configUrl);
  const resolved = resolveConfigModule(loaded as ConfigModule);
  if (!resolved.__test__) {
    throw new Error(`${configFile} did not expose __test__ helpers`);
  }
  return resolved as TestableConfigModule;
}

export function resolveConfigModule(loaded: ConfigModule): ConfigModule {
  return loaded?.__test__ ? loaded : loaded?.default ?? loaded;
}
