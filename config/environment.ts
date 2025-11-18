import path from "node:path";

import { config as loadEnv } from "dotenv";

const envFile = process.env.DOTENV_PATH ?? path.resolve(process.cwd(), ".env");
loadEnv({ path: envFile, override: true });

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

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
  idamSecret: string;
  idamReturnUrl: string;
  s2sUrl: string;
  s2sSecret: string;
  s2sMicroservice: string;
  caseManager: UserCredentials;
  judge: UserCredentials;
}

export const environment: ServiceConfig = {
  appBaseUrl: trimTrailingSlash(getEnv("APP_BASE_URL")),
  appHealthEndpoint: process.env.APP_HEALTH_ENDPOINT ?? "/health",
  apiBaseUrl:
    process.env.APP_API_BASE_URL ?? trimTrailingSlash(getEnv("APP_BASE_URL")),
  idamWebUrl: getEnv("IDAM_WEB_URL"),
  idamTestingSupportUrl: getEnv("IDAM_TESTING_SUPPORT_URL"),
  idamClientId: getEnv("IDAM_CLIENT_ID"),
  idamSecret: getEnv("IDAM_SECRET"),
  idamReturnUrl: getEnv("IDAM_RETURN_URL"),
  s2sUrl: getEnv("S2S_URL"),
  s2sSecret: getEnv("S2S_SECRET"),
  s2sMicroservice: getEnv("S2S_MICROSERVICE_NAME"),
  caseManager: {
    username: getEnv("CASEMANAGER_USERNAME"),
    password: getEnv("CASEMANAGER_PASSWORD"),
  },
  judge: {
    username: getEnv("JUDGE_USERNAME"),
    password: getEnv("JUDGE_PASSWORD"),
  },
};
