import { promises as fs } from "node:fs";
import * as fsSync from "node:fs";
import path from "node:path";

import {
  IdamUtils,
  ServiceAuthUtils,
  createLogger,
} from "@hmcts/playwright-common";
import { request } from "@playwright/test";

import { config } from "../config/api";
import { acquireFileLock } from "../utils/file-lock.utils";

type UsersConfig = (typeof config.users)[keyof typeof config.users];
export type ApiUserRole = keyof UsersConfig & string;

const baseUrl = stripTrailingSlash(config.baseUrl);
const storageRoot = path.resolve(
  process.cwd(),
  "test-results",
  "storage-states",
  "api",
);

const mask = (value?: string) => (value ? "***" : "missing");
const present = (value?: string) =>
  value && value.trim().length > 0 ? "yes" : "no";

const resolveLoggerFormat = (): "pretty" | "json" => {
  const reporters = process.env.PLAYWRIGHT_REPORTERS ?? "";
  const odhinEnabled = reporters
    .split(",")
    .some((value) => value.trim() === "odhin");
  if (odhinEnabled || !process.stdout.isTTY) {
    return "json";
  }
  return "pretty";
};

const logger = createLogger({
  serviceName: "node-api-auth",
  format: resolveLoggerFormat(),
});
type LoggerInstance = ReturnType<typeof createLogger>;
type AuthCookieState = { name?: string; value?: string; expires?: number };
type StorageState = { cookies?: AuthCookieState[] };

type StorageDeps = {
  createStorageState: (role: ApiUserRole) => Promise<string>;
  tryReadState: (storagePath: string) => Promise<StorageState | undefined>;
  unlink: (pathValue: string) => Promise<void>;
  acquireLock: (lockPath: string) => Promise<() => Promise<void>>;
  resolveStoragePath: (role: ApiUserRole) => string;
  resolveLockPath: (role: ApiUserRole) => string;
  isStorageStateReusable: (
    storagePath: string,
    state: StorageState,
  ) => Promise<boolean>;
};

type CreateStorageDeps = {
  storageRoot?: string;
  mkdir?: typeof fs.mkdir;
  getCredentials?: typeof getCredentials;
  isTokenBootstrapEnabled?: typeof isTokenBootstrapEnabled;
  tryTokenBootstrap?: typeof tryTokenBootstrap;
  createStorageStateViaForm?: typeof createStorageStateViaForm;
};

type TokenBootstrapDeps = {
  env?: NodeJS.ProcessEnv;
  idamUtils?: {
    generateIdamToken: (opts: Record<string, unknown>) => Promise<string>;
  };
  serviceAuthUtils?: {
    retrieveToken: (opts: Record<string, unknown>) => Promise<string>;
  };
  requestFactory?: typeof request.newContext;
  logger?: LoggerInstance;
  readState?: typeof tryReadState;
};

type FormLoginDeps = {
  requestFactory?: typeof request.newContext;
  extractCsrf?: typeof extractCsrf;
  readState?: typeof tryReadState;
};

const resolveStorageTtlMs = (): number => {
  const raw = process.env.API_STORAGE_TTL_MIN;
  if (!raw) return 15 * 60_000;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 15 * 60_000;
  return Math.max(0, parsed) * 60_000;
};

const resolveApiStoragePath = (role: ApiUserRole, root = storageRoot): string =>
  path.join(root, config.testEnv, `${role}.json`);

const resolveApiStorageLockPath = (
  role: ApiUserRole,
  root = storageRoot,
): string => path.join(root, config.testEnv, `${role}.lock`);

const defaultStorageDeps: StorageDeps = {
  createStorageState,
  tryReadState,
  unlink: fs.unlink,
  acquireLock: (lockPath: string) =>
    acquireFileLock(lockPath, {
      retries: 30,
      retryDelayMs: 1_000,
      maxRetryDelayMs: 5_000,
      staleMs: 10 * 60_000,
    }),
  resolveStoragePath: (role: ApiUserRole) => resolveApiStoragePath(role),
  resolveLockPath: (role: ApiUserRole) => resolveApiStorageLockPath(role),
  isStorageStateReusable,
};

const AUTH_CREATE_MAX_ATTEMPTS = 3;
const AUTH_CREATE_RETRY_BASE_MS = 750;
const RETRYABLE_AUTH_CREATE_ERROR_MARKERS = [
  "enotfound",
  "eai_again",
  "econnreset",
  "ehostunreach",
  "etimedout",
  "ecanceled",
  "getaddrinfo",
  "network",
  "socket hang up",
  "503",
  "504",
  "502",
];

export async function ensureStorageState(role: ApiUserRole): Promise<string> {
  return ensureStorageStateWith(role);
}

async function ensureStorageStateWith(
  role: ApiUserRole,
  deps: StorageDeps = defaultStorageDeps,
): Promise<string> {
  const storagePath = deps.resolveStoragePath(role);
  const lockPath = deps.resolveLockPath(role);

  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const releaseLock = await deps.acquireLock(lockPath);

  try {
    const state = await deps.tryReadState(storagePath);
    if (state && (await deps.isStorageStateReusable(storagePath, state))) {
      return storagePath;
    }

    if (state) {
      logger.info("auth:refresh", {
        role,
        reason: "stale-or-invalid",
        storagePath: sanitizePathForLogs(storagePath),
      });
    } else {
      logger.info("auth:create", {
        role,
        reason: "missing",
        storagePath: sanitizePathForLogs(storagePath),
      });
    }
    let lastCreateError: unknown;
    for (let attempt = 1; attempt <= AUTH_CREATE_MAX_ATTEMPTS; attempt += 1) {
      await deps.unlink(storagePath).catch(() => undefined);
      try {
        return await deps.createStorageState(role);
      } catch (error) {
        lastCreateError = error;
        const retryable = isRetryableStorageCreationError(error);
        if (!retryable || attempt === AUTH_CREATE_MAX_ATTEMPTS) {
          throw error;
        }

        const delayMs = getAuthCreateRetryDelayMs(attempt);
        logger.warn("auth:create-retry", {
          role,
          attempt,
          maxAttempts: AUTH_CREATE_MAX_ATTEMPTS,
          delayMs,
          storagePath: sanitizePathForLogs(storagePath),
          error: formatUnknownError(error),
        });
        await sleep(delayMs);
      }
    }

    throw new Error(
      `Failed to create storage state for role "${role}": ${formatUnknownError(lastCreateError)}`,
    );
  } finally {
    await releaseLock().catch((error: unknown) => {
      logger.warn("auth:lock-release", {
        role,
        lockPath: sanitizePathForLogs(lockPath),
        error: formatUnknownError(error),
      });
    });
  }
}

export async function getStoredCookie(
  role: ApiUserRole,
  cookieName: string,
): Promise<string | undefined> {
  return getStoredCookieWith(role, cookieName);
}

async function getStoredCookieWith(
  role: ApiUserRole,
  cookieName: string,
  deps: StorageDeps = defaultStorageDeps,
): Promise<string | undefined> {
  const storagePath = await ensureStorageStateWith(role, deps);
  const state = await deps.tryReadState(storagePath);

  if (!state) {
    throw new Error(`Unable to read storage state for role "${role}".`);
  }

  const cookie = Array.isArray(state.cookies)
    ? state.cookies.find((c: { name?: string }) => c.name === cookieName)
    : undefined;
  return cookie?.value;
}

async function createStorageState(role: ApiUserRole): Promise<string> {
  return createStorageStateWith(role);
}

async function createStorageStateWith(
  role: ApiUserRole,
  deps: CreateStorageDeps = {},
): Promise<string> {
  const root = deps.storageRoot ?? storageRoot;
  const mkdir = deps.mkdir ?? fs.mkdir;
  const getCreds = deps.getCredentials ?? getCredentials;
  const shouldTokenBootstrap = (
    deps.isTokenBootstrapEnabled ?? isTokenBootstrapEnabled
  )();
  const tryBootstrap = deps.tryTokenBootstrap ?? tryTokenBootstrap;
  const loginViaForm =
    deps.createStorageStateViaForm ?? createStorageStateViaForm;

  const storagePath = resolveApiStoragePath(role, root);
  await mkdir(path.dirname(storagePath), { recursive: true });

  const credentials = getCreds(role);
  logger.info("auth:createStorageState", {
    role,
    env: config.testEnv,
    baseUrl: sanitizeUrlForLogs(baseUrl),
    user: mask(credentials.username),
    pass: mask(credentials.password),
  });
  logger.info("auth:token-env", {
    mode: "auto",
    IDAM_WEB_URL: present(process.env.IDAM_WEB_URL),
    IDAM_TESTING_SUPPORT_URL: present(process.env.IDAM_TESTING_SUPPORT_URL),
    S2S_URL: present(process.env.S2S_URL),
    IDAM_SECRET: present(process.env.IDAM_SECRET),
  });

  const tokenLoginSucceeded = shouldTokenBootstrap
    ? await tryBootstrap(role, credentials, storagePath)
    : false;

  if (!tokenLoginSucceeded) {
    await loginViaForm(credentials, storagePath, role);
  }

  return storagePath;
}

async function tryTokenBootstrap(
  role: ApiUserRole,
  credentials: { username: string; password: string },
  storagePath: string,
  deps: TokenBootstrapDeps = {},
): Promise<boolean> {
  const env = deps.env ?? process.env;
  const clientId =
    env.IDAM_CLIENT_ID ?? env.SERVICES_IDAM_CLIENT_ID ?? "xuiwebapp";
  const clientSecret = env.IDAM_SECRET;
  const scope =
    env.IDAM_OAUTH2_SCOPE ?? "openid profile roles manage-user search-user";
  const microservice =
    env.S2S_MICROSERVICE_NAME ?? env.MICROSERVICE ?? "xui_webapp";
  const idamWebUrl = env.IDAM_WEB_URL;
  const idamTestingSupportUrl = env.IDAM_TESTING_SUPPORT_URL;
  const s2sUrl = env.S2S_URL;

  if (!clientSecret || !idamWebUrl || !idamTestingSupportUrl || !s2sUrl) {
    return false;
  }

  const activeLogger = deps.logger ?? logger;
  const idamUtils = deps.idamUtils ?? new IdamUtils({ logger: activeLogger });
  const serviceAuthUtils =
    deps.serviceAuthUtils ?? new ServiceAuthUtils({ logger: activeLogger });
  const requestFactory =
    deps.requestFactory ?? ((options) => request.newContext(options));
  const readState = deps.readState ?? tryReadState;

  let context;
  try {
    const accessToken = await idamUtils.generateIdamToken({
      grantType: "password",
      clientId,
      clientSecret,
      scope,
      username: credentials.username,
      password: credentials.password,
      redirectUri: env.IDAM_RETURN_URL ?? `${baseUrl}/oauth2/callback`,
    });
    const serviceToken = await serviceAuthUtils.retrieveToken({ microservice });

    context = await requestFactory({
      baseURL: baseUrl,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        Authorization: `Bearer ${accessToken}`,
        ServiceAuthorization: `Bearer ${serviceToken}`,
      },
    });

    await context.get("auth/login", { failOnStatusCode: false });
    const authCheck = await context.get("auth/isAuthenticated", {
      failOnStatusCode: false,
    });
    const isAuth =
      authCheck.status() === 200
        ? await authCheck.json().catch(() => false)
        : false;

    await context.storageState({ path: storagePath });
    const state = await readState(storagePath);
    const hasRequiredCookies = hasRequiredAuthCookies(state?.cookies ?? []);

    if (isAuth && hasRequiredCookies) {
      return true;
    }
    activeLogger.warn(
      `Token bootstrap for role "${role}" returned isAuthenticated=${String(isAuth)} hasRequiredCookies=${String(hasRequiredCookies)}; falling back to form login`,
    );
    return false;
  } catch (error) {
    activeLogger.warn(
      `Token bootstrap failed for role "${role}": ${formatUnknownError(error)}`,
    );
    return false;
  } finally {
    await context?.dispose();
  }
}

async function createStorageStateViaForm(
  credentials: { username: string; password: string },
  storagePath: string,
  role: ApiUserRole,
  deps: FormLoginDeps = {},
): Promise<void> {
  const requestFactory =
    deps.requestFactory ?? ((options) => request.newContext(options));
  const extract = deps.extractCsrf ?? extractCsrf;
  const readState = deps.readState ?? tryReadState;
  const context = await requestFactory({
    baseURL: baseUrl,
    ignoreHTTPSErrors: true,
    maxRedirects: 10,
  });

  try {
    const loginPage = await context.get("auth/login");
    if (loginPage.status() >= 400) {
      throw new Error(`GET /auth/login responded with ${loginPage.status()}`);
    }

    const loginUrl = loginPage.url();
    const csrfToken = extract(await loginPage.text());
    const formPayload: Record<string, string> = {
      username: credentials.username,
      password: credentials.password,
      save: "Sign in",
    };
    if (csrfToken) {
      formPayload._csrf = csrfToken;
    }

    const loginResponse = await context.post(loginUrl, { form: formPayload });
    if (loginResponse.status() >= 400) {
      throw new Error(
        `POST ${loginUrl} responded with ${loginResponse.status()}`,
      );
    }

    await context.get("/");
    const authCheck = await context.get("auth/isAuthenticated", {
      failOnStatusCode: false,
    });
    const isAuth =
      authCheck.status() === 200
        ? await authCheck.json().catch(() => false)
        : false;
    if (!isAuth) {
      throw new Error(
        `Login failed for role "${role}" (auth/isAuthenticated status ${authCheck.status()})`,
      );
    }

    await context.storageState({ path: storagePath });
    const state = await readState(storagePath);
    const hasRequiredCookies = hasRequiredAuthCookies(state?.cookies ?? []);
    if (!hasRequiredCookies) {
      throw new Error(
        `Login failed for role "${role}" (required auth cookies missing)`,
      );
    }
  } catch (error) {
    throw new Error(`Failed to login as ${role}: ${formatUnknownError(error)}`);
  } finally {
    await context.dispose();
  }
}

function getCredentials(role: ApiUserRole): {
  username: string;
  password: string;
} {
  const envUsers = config.users[config.testEnv as keyof typeof config.users];
  const userConfig = envUsers?.[role];
  if (!userConfig) {
    throw new Error(
      `No credentials configured for role "${role}" in environment "${config.testEnv}"`,
    );
  }

  return {
    username: userConfig.e ?? "",
    password: userConfig.sec ?? "",
  };
}

function extractCsrf(html: string): string | undefined {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/i);
  return match?.[1];
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function sanitizeUrlForLogs(urlValue: string): string {
  try {
    const parsed = new URL(urlValue);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return stripTrailingSlash(urlValue).replace(/[?#].*$/, "");
  }
}

function sanitizePathForLogs(pathValue: string): string {
  return pathValue.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[REDACTED_EMAIL]",
  );
}

function getCacheKey(role: ApiUserRole): string {
  return `${config.testEnv}-${role}`;
}

async function tryReadState(
  storagePath: string,
): Promise<StorageState | undefined> {
  try {
    const raw = await fs.readFile(storagePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // swallow and signal failure
  }
  return undefined;
}

function isTokenBootstrapEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const mode = env.API_AUTH_MODE ?? env.API_USE_TOKEN_LOGIN;
  if (
    mode &&
    ["form", "off", "false", "0", "no"].includes(mode.toLowerCase())
  ) {
    return false;
  }
  if (mode && ["token", "true", "1", "yes"].includes(mode.toLowerCase())) {
    return true;
  }
  const hasIdamEnv =
    !!env.IDAM_SECRET && !!env.IDAM_WEB_URL && !!env.IDAM_TESTING_SUPPORT_URL;
  const hasS2S = !!env.S2S_URL;
  return hasIdamEnv && hasS2S;
}

function formatUnknownError(error: unknown): string {
  const redactSensitive = (value: string): string =>
    value
      .replace(/\b[Bb]earer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]")
      .replace(
        /\b(password|passwd|secret|token|client_secret)\b\s*[:=]\s*[^\s,;]+/gi,
        "$1=[REDACTED]",
      )
      .replace(
        /([?&](?:code|token|state|password|secret)=)[^&#]+/gi,
        "$1[REDACTED]",
      )
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");

  if (error instanceof Error) {
    return redactSensitive(error.message);
  }
  if (typeof error === "string") {
    return redactSensitive(error);
  }
  if (typeof error === "object" && error !== null) {
    const value = error as { name?: unknown; message?: unknown };
    const name =
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : "Error";
    if (typeof value.message === "string" && value.message.trim()) {
      return `${name}: ${redactSensitive(value.message)}`;
    }
    return `${name}: [details omitted]`;
  }
  return "Unknown error";
}

function isRetryableStorageCreationError(error: unknown): boolean {
  const message = formatUnknownError(error).toLowerCase();
  return RETRYABLE_AUTH_CREATE_ERROR_MARKERS.some((marker) =>
    message.includes(marker),
  );
}

function getAuthCreateRetryDelayMs(attempt: number): number {
  return Math.min(4_000, AUTH_CREATE_RETRY_BASE_MS * attempt);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveAuthBaseUrl(urlValue: string): string {
  try {
    return new URL(urlValue).origin;
  } catch {
    return stripTrailingSlash(urlValue);
  }
}

function isStorageStateFresh(
  storagePath: string,
  ttlMs: number = resolveStorageTtlMs(),
): boolean {
  if (ttlMs <= 0) return false;
  try {
    const stats = fsSync.statSync(storagePath);
    return Date.now() - stats.mtimeMs <= ttlMs;
  } catch {
    return false;
  }
}

function hasRequiredAuthCookies(cookies: AuthCookieState[]): boolean {
  const names = new Set(cookies.map((cookie) => cookie?.name).filter(Boolean));
  return names.has("Idam.Session") && names.has("__auth__");
}

function hasExpiredAuthCookies(cookies: AuthCookieState[]): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return cookies.some((cookie) => {
    if (!cookie?.name || !["Idam.Session", "__auth__"].includes(cookie.name)) {
      return false;
    }
    const expires = cookie.expires;
    if (typeof expires !== "number") return false;
    if (expires <= 0) return false;
    return expires <= nowSeconds;
  });
}

async function isStorageStateAuthenticated(
  storagePath: string,
): Promise<boolean> {
  if (!path.isAbsolute(storagePath)) {
    return false;
  }
  if (!(await tryReadState(storagePath))) {
    return false;
  }
  const authBaseUrl = resolveAuthBaseUrl(baseUrl);
  let context;
  try {
    context = await request.newContext({
      baseURL: authBaseUrl.replace(/\/+$/, ""),
      ignoreHTTPSErrors: true,
      storageState: storagePath,
    });
    const response = await context.get("auth/isAuthenticated", {
      failOnStatusCode: false,
    });
    if (response.status() !== 200) {
      return false;
    }
    return (await response.json().catch(() => false)) === true;
  } catch {
    return false;
  } finally {
    await context?.dispose();
  }
}

async function isStorageStateReusable(
  storagePath: string,
  state: StorageState,
): Promise<boolean> {
  const cookies = Array.isArray(state.cookies) ? state.cookies : [];
  if (!hasRequiredAuthCookies(cookies)) {
    return false;
  }
  if (hasExpiredAuthCookies(cookies)) {
    return false;
  }
  if (isStorageStateFresh(storagePath)) {
    return true;
  }
  return isStorageStateAuthenticated(storagePath);
}

export const __test__ = {
  extractCsrf,
  stripTrailingSlash,
  getCacheKey,
  isTokenBootstrapEnabled,
  isStorageStateFresh,
  hasRequiredAuthCookies,
  hasExpiredAuthCookies,
  tryReadState,
  ensureStorageStateWith,
  getStoredCookieWith,
  createStorageStateWith,
  tryTokenBootstrap,
  createStorageStateViaForm,
  getCredentials,
  resolveApiStoragePath,
  resolveApiStorageLockPath,
  isStorageStateReusable,
  formatUnknownError,
};
