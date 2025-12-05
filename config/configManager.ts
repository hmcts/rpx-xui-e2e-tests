import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PlainObject = Record<string, unknown>;

export interface LayeredConfig {
  [key: string]: unknown;
  app: {
    baseUrl: string;
    apiBaseUrl: string;
    healthEndpoint: string;
  };
  idam: {
    webUrl: string;
    testingSupportUrl: string;
    clientId: string;
    returnPath: string;
  };
  s2s: {
    url: string;
    microservice: string;
  };
  features: {
    staffSearchEnabled: boolean;
    caseFlagsEnabled: boolean;
  };
  reporting: {
    junitOutput: string;
    htmlOutput: string;
  };
}

interface EnvironmentConfigFile {
  defaultEnv?: string;
  environments?: Record<string, Partial<LayeredConfig>>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readJson = <T>(relativePath: string): T => {
  const filePath = path.resolve(__dirname, relativePath);
  const contents = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(contents) as T;
};

const isPlainObject = (input: unknown): input is PlainObject =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const mergeObjects = <T extends PlainObject>(base: T, override?: Partial<T>): T => {
  const result: T = structuredClone(base);
  if (!override) {
    return result;
  }

  (Object.keys(override) as (keyof T)[]).forEach((key) => {
    const overrideValue = override[key];
    if (
      overrideValue !== undefined &&
      isPlainObject(overrideValue) &&
      isPlainObject(result[key] as unknown)
    ) {
      result[key] = mergeObjects(
        result[key] as PlainObject,
        overrideValue as PlainObject,
      ) as T[keyof T];
      return;
    }
    if (overrideValue !== undefined) {
      result[key] = overrideValue;
    }
  });

  return result;
};

const baseConfig = readJson<LayeredConfig>("baseConfig.json");
const envConfigFile = readJson<EnvironmentConfigFile>("envConfig.json");

const activeEnv =
  process.env.TEST_ENV ?? process.env.TEST_ENVIRONMENT ?? envConfigFile.defaultEnv ?? "local";

const envOverride = envConfigFile.environments?.[activeEnv];
export const layeredConfig: LayeredConfig = mergeObjects(baseConfig, envOverride);
export const activeConfigEnvironment = activeEnv;

export const resolveReporterPaths = (): void => {
  process.env.PLAYWRIGHT_JUNIT_OUTPUT ??= layeredConfig.reporting.junitOutput;
  process.env.PLAYWRIGHT_HTML_OUTPUT ??= layeredConfig.reporting.htmlOutput;
};

export const applyFeatureToggles = (): void => {
  const boolToString = (value: boolean): string => (value ? "true" : "false");
  process.env.STAFF_SEARCH_ENABLED ??= boolToString(layeredConfig.features.staffSearchEnabled);
  process.env.CASE_FLAGS_ENABLED ??= boolToString(layeredConfig.features.caseFlagsEnabled);
};
