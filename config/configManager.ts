import { randomUUID } from "node:crypto";
import merge from "lodash/merge.js";
import baseConfig from "./baseConfig.json" with { type: "json" };
import envConfig from "./envConfig.json" with { type: "json" };

type UserRecord = Record<
  string,
  {
    username: string;
    password: string;
    cookieName?: string;
    sessionFile?: string;
    idamId?: string;
    userIdentifier?: string;
    release?: string;
  }
>;

function parseUsersFromEnv(): UserRecord {
  const raw = process.env.TEST_USERS_JSON ?? process.env.UI_USERS_JSON;
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.entries(parsed as Record<string, unknown>).reduce<UserRecord>((acc, [key, value]) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return acc;
      }
      const username = typeof (value as Record<string, unknown>).username === "string"
        ? (value as Record<string, unknown>).username
        : typeof (value as Record<string, unknown>).email === "string"
          ? (value as Record<string, unknown>).email
          : typeof (value as Record<string, unknown>).e === "string"
            ? (value as Record<string, unknown>).e
            : undefined;
      const password = typeof (value as Record<string, unknown>).password === "string"
        ? (value as Record<string, unknown>).password
        : typeof (value as Record<string, unknown>).key === "string"
          ? (value as Record<string, unknown>).key
          : typeof (value as Record<string, unknown>).sec === "string"
            ? (value as Record<string, unknown>).sec
            : undefined;
      if (!username || !password) {
        return acc;
      }
      acc[key] = {
        username: username as string,
        password: password as string,
        cookieName: (value as Record<string, unknown>).cookieName as string | undefined,
        sessionFile: (value as Record<string, unknown>).sessionFile as string | undefined,
        idamId: (value as Record<string, unknown>).idamId as string | undefined,
        userIdentifier:
          ((value as Record<string, unknown>).userIdentifier as string | undefined) ?? key,
        release: (value as Record<string, unknown>).release as string | undefined
      };
      return acc;
    }, {});
  } catch (error) {
    console.warn(`Failed to parse TEST_USERS_JSON: ${(error as Error).message}`);
    return {};
  }
}

const CONFIG = merge({}, baseConfig, envConfig);

CONFIG.environment = process.env.TEST_ENV ?? process.env.ENVIRONMENT ?? CONFIG.environment;
CONFIG.urls.xui = process.env.TEST_URL ?? CONFIG.urls.xui;
CONFIG.urls.api = process.env.API_URL ?? CONFIG.urls.api;
CONFIG.test.TRI = process.env.TRI ?? randomUUID();
CONFIG.test.projectName = process.env.PROJECT_NAME ?? CONFIG.test.projectName;

if (process.env.PLAYWRIGHT_WORKERS) {
  CONFIG.test.workers = Number(process.env.PLAYWRIGHT_WORKERS);
}

if (process.env.PLAYWRIGHT_RETRIES) {
  CONFIG.test.retries = Number(process.env.PLAYWRIGHT_RETRIES);
}

if (process.env.PLAYWRIGHT_TIMEOUT) {
  CONFIG.test.timeout = Number(process.env.PLAYWRIGHT_TIMEOUT);
}

if (process.env.PLAYWRIGHT_EXPECT_TIMEOUT) {
  CONFIG.test.expectTimeout = Number(process.env.PLAYWRIGHT_EXPECT_TIMEOUT);
}

if (process.env.API_REQUEST_TIMEOUT) {
  CONFIG.test.apiRequestTimeout = Number(process.env.API_REQUEST_TIMEOUT);
}

if (process.env.WIREMOCK_URL) {
  CONFIG.test.wiremock.baseUrl = process.env.WIREMOCK_URL;
}

// Allow runtime override of wiremock toggle for local runs.
if (process.env.WIREMOCK_ENABLED === "true") {
  CONFIG.test.wiremock.enabled = true;
}

const parsedUsers = parseUsersFromEnv();
if (CONFIG.environment && typeof CONFIG.users === "object") {
  CONFIG.users[CONFIG.environment as keyof typeof CONFIG.users] = {
    ...(CONFIG.users[CONFIG.environment as keyof typeof CONFIG.users] as UserRecord | undefined),
    ...parsedUsers
  };
}

Object.freeze(CONFIG);

export type FrameworkConfig = typeof CONFIG;
export const __test__ = { parseUsersFromEnv };
export default CONFIG;
