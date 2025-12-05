import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { z } from "zod";

import {
  activeConfigEnvironment,
  applyFeatureToggles,
  layeredConfig,
  resolveReporterPaths,
} from "./configManager.ts";

// Load .env early (mirrors previous environment.ts behavior)
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const cwdEnvPath = path.resolve(process.cwd(), ".env");
const repoEnvPath = path.resolve(moduleDir, "..", ".env");
const envFile = process.env.DOTENV_PATH ?? (fs.existsSync(cwdEnvPath) ? cwdEnvPath : repoEnvPath);

loadEnv({ path: envFile, override: true });
applyFeatureToggles();
resolveReporterPaths();

// Zod schema for required environment variables. Optional items are allowed to be missing.
const EnvSchema = z.object({
  APP_BASE_URL: z.string().url().optional(),
  APP_HEALTH_ENDPOINT: z.string().optional(),
  APP_API_BASE_URL: z.string().url().optional(),
  IDAM_WEB_URL: z.string().url().optional(),
  IDAM_TESTING_SUPPORT_URL: z.string().url().optional(),
  IDAM_CLIENT_ID: z.string().min(1).optional(),
  IDAM_SECRET: z.string().optional(),
  IDAM_RETURN_URL: z.string().url().optional(),
  S2S_URL: z.string().url().optional(),
  S2S_SECRET: z.string().optional(),
  S2S_MICROSERVICE_NAME: z.string().min(1).optional(),
  CASEMANAGER_USERNAME: z.string().email(),
  CASEMANAGER_PASSWORD: z.string().min(1),
  JUDGE_USERNAME: z.string().email(),
  JUDGE_PASSWORD: z.string().min(1),
  SOLICITOR_USERNAME: z.string().email().optional(),
  SOLICITOR_PASSWORD: z.string().min(1).optional(),
  PRL_CASE_TABS_CASE_ID: z.string().optional(),
});

// Parse & surface aggregated errors (fail fast like legacy requireEnv logic)
const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const formatted = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("\n");
  throw new Error(`Missing or invalid required environment variables:\n${formatted}`);
}

const env = parsed.data;

const resolvedAppBaseUrl = (env.APP_BASE_URL ?? layeredConfig.app.baseUrl).replace(/\/$/, "");
const resolvedApiBaseUrl = (env.APP_API_BASE_URL ?? layeredConfig.app.apiBaseUrl).replace(
  /\/$/,
  "",
);
const resolvedHealthEndpoint = (
  env.APP_HEALTH_ENDPOINT ?? layeredConfig.app.healthEndpoint
).startsWith("/")
  ? (env.APP_HEALTH_ENDPOINT ?? layeredConfig.app.healthEndpoint)
  : `/${env.APP_HEALTH_ENDPOINT ?? layeredConfig.app.healthEndpoint}`;

// ServiceConfig mirrors previous environment.ts shape for backward compatibility
export interface UserCredentials {
  username: string;
  password: string;
}
export interface ServiceConfig {
  appBaseUrl: string;
  appHealthEndpoint: string;
  apiBaseUrl: string;
  idamWebUrl: string;
  idamTestingSupportUrl: string;
  idamClientId: string;
  idamSecret?: string;
  idamReturnUrl: string;
  s2sUrl: string;
  s2sSecret?: string;
  s2sMicroservice: string;
  caseManager: UserCredentials;
  judge: UserCredentials;
}

export const environment: ServiceConfig = {
  appBaseUrl: resolvedAppBaseUrl,
  appHealthEndpoint: resolvedHealthEndpoint,
  apiBaseUrl: resolvedApiBaseUrl,
  idamWebUrl: env.IDAM_WEB_URL ?? layeredConfig.idam.webUrl,
  idamTestingSupportUrl: env.IDAM_TESTING_SUPPORT_URL ?? layeredConfig.idam.testingSupportUrl,
  idamClientId: env.IDAM_CLIENT_ID ?? layeredConfig.idam.clientId,
  idamSecret: env.IDAM_SECRET,
  idamReturnUrl:
    env.IDAM_RETURN_URL ??
    `${resolvedAppBaseUrl}${layeredConfig.idam.returnPath.startsWith("/") ? layeredConfig.idam.returnPath : `/${layeredConfig.idam.returnPath}`}`,
  s2sUrl: env.S2S_URL ?? layeredConfig.s2s.url,
  s2sSecret: env.S2S_SECRET,
  s2sMicroservice: env.S2S_MICROSERVICE_NAME ?? layeredConfig.s2s.microservice,
  caseManager: { username: env.CASEMANAGER_USERNAME, password: env.CASEMANAGER_PASSWORD },
  judge: { username: env.JUDGE_USERNAME, password: env.JUDGE_PASSWORD },
};

// Consolidated PRL config (replaces utils/prl/config.ts)
export const prlConfig = {
  manageCasesBaseUrl: env.APP_BASE_URL, // previously APP_BASE_URL or MANAGE_CASES_BASE_URL; centralised
  caseTabsCaseId: env.PRL_CASE_TABS_CASE_ID,
  solicitor: {
    username: env.SOLICITOR_USERNAME,
    password: env.SOLICITOR_PASSWORD,
  },
};

export const validatePrlConfig = (): void => {
  if (!prlConfig.solicitor.username || !prlConfig.solicitor.password) {
    throw new Error("Missing solicitor credentials (SOLICITOR_USERNAME / SOLICITOR_PASSWORD)");
  }
};

export interface UnifiedConfig {
  environment: ServiceConfig;
  prl: typeof prlConfig;
}

export const unifiedConfig: UnifiedConfig = {
  environment,
  prl: prlConfig,
};

export default unifiedConfig;
export { layeredConfig, activeConfigEnvironment };
