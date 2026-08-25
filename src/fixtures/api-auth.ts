import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as fsSync from "node:fs";
import path from "node:path";

import { IdamUtils, ServiceAuthUtils, createLogger } from "@hmcts/playwright-common";
import { request } from "@playwright/test";

import { config } from "../config/api";
import { ensureUiStorageStateForUser } from "../utils/ui/session-storage.utils.js";
import { resolveUiStoragePathForUser } from "../utils/ui/storage-state.utils.js";

type UsersConfig = typeof config.users[keyof typeof config.users];
export type ApiUserRole = (keyof UsersConfig) & string;

const baseUrl = stripTrailingSlash(config.baseUrl);
const storageRoot = path.resolve(process.cwd(), ".sessions");

const mask = (value?: string) => (value ? "***" : "missing");
const present = (value?: string) => (value && value.trim().length > 0 ? "yes" : "no");

const logger = createLogger({ serviceName: "node-api-auth", format: "pretty" });
type LoggerInstance = ReturnType<typeof createLogger>;

type StorageState = { cookies?: Array<{ name?: string; value?: string }> };

type LoginForm = {
  action: string;
  hiddenFields: Record<string, string>;
  hasEmail: boolean;
  hasUsername: boolean;
  hasPassword: boolean;
};

type AuthCheckResponse = {
  status: () => number;
  url?: () => string;
  headers?: () => Record<string, string>;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
};

type AuthCheckResult = {
  isAuthenticated: boolean;
  status: number;
  contentType?: string;
  bodyPreview?: string;
};

type AuthCheckContext = {
  get: (url: string, options?: Record<string, unknown>) => Promise<AuthCheckResponse>;
};

type StorageValidationResult = "authenticated" | "unauthenticated" | "unavailable";

type StorageDeps = {
  env?: NodeJS.ProcessEnv;
  storageRoot?: string;
  createStorageState: (role: ApiUserRole) => Promise<string>;
  tryReadState: (storagePath: string) => Promise<StorageState | undefined>;
  unlink: (pathValue: string) => Promise<void>;
  validateStorageState?: (storagePath: string) => Promise<StorageValidationResult>;
  isStorageStateFresh?: (storagePath: string) => boolean;
  acquireLock?: (storagePath: string) => Promise<() => void>;
  reuseExistingStorage?: boolean;
};

type CreateStorageDeps = {
  env?: NodeJS.ProcessEnv;
  storageRoot?: string;
  mkdir?: typeof fs.mkdir;
  getCredentials?: typeof getCredentials;
  isUiSessionBootstrapEnabled?: typeof isUiSessionBootstrapEnabled;
  createStorageStateViaUi?: typeof createStorageStateViaUi;
  isTokenBootstrapEnabled?: typeof isTokenBootstrapEnabled;
  tryTokenBootstrap?: typeof tryTokenBootstrap;
  createStorageStateViaForm?: typeof createStorageStateViaForm;
};

type TokenBootstrapDeps = {
  env?: NodeJS.ProcessEnv;
  idamUtils?: { generateIdamToken: (opts: Record<string, unknown>) => Promise<string> };
  serviceAuthUtils?: { retrieveToken: (opts: Record<string, unknown>) => Promise<string> };
  requestFactory?: typeof request.newContext;
  logger?: LoggerInstance;
  readState?: typeof tryReadState;
  authCheckAttempts?: number;
  authCheckDelayMs?: number;
};

type FormLoginDeps = {
  requestFactory?: typeof request.newContext;
  extractCsrf?: typeof extractCsrf;
  authCheckAttempts?: number;
  authCheckDelayMs?: number;
};

const defaultStorageDeps: StorageDeps = {
  env: process.env,
  createStorageState,
  tryReadState,
  unlink: fs.unlink,
  validateStorageState,
  reuseExistingStorage: true
};

const validatedStorageStates = new Map<string, { mtimeMs: number; validUntil: number }>();
const STORAGE_VALIDATION_CACHE_MS = 15_000;
const DEFAULT_STORAGE_LOCK_TIMEOUT_MS = 120_000;

export async function ensureStorageState(role: ApiUserRole): Promise<string> {
  return ensureStorageStateWith(role);
}

async function ensureStorageStateWith(role: ApiUserRole, deps: StorageDeps = defaultStorageDeps): Promise<string> {
  const root = deps.storageRoot ?? storageRoot;
  const storagePath = getStorageStatePath(root, role, deps.env);
  await fs.mkdir(root, { recursive: true });
  const release = await (deps.acquireLock ?? acquireStorageStateLock)(storagePath);

  try {
    const state = await deps.tryReadState(storagePath);
    if (deps.reuseExistingStorage && state && (deps.isStorageStateFresh ?? isStorageStateFresh)(storagePath)) {
      const validation = await (deps.validateStorageState ?? validateStorageState)(storagePath);
      if (validation === "authenticated" || validation === "unavailable") {
        return storagePath;
      }
    }

    if (!state) {
      await deps.unlink(storagePath).catch(() => undefined);
    }
    const createdPath = await deps.createStorageState(role);
    if (!(await deps.tryReadState(createdPath))) {
      await deps.unlink(createdPath).catch(() => undefined);
      throw new Error(`Unable to read storage state for role "${role}" after creation.`);
    }
    return createdPath;
  } finally {
    release();
  }
}

export async function getStoredCookie(role: ApiUserRole, cookieName: string): Promise<string | undefined> {
  return getStoredCookieWith(role, cookieName);
}

async function getStoredCookieWith(
  role: ApiUserRole,
  cookieName: string,
  deps: StorageDeps = defaultStorageDeps
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

async function createStorageStateWith(role: ApiUserRole, deps: CreateStorageDeps = {}): Promise<string> {
  const env = deps.env ?? process.env;
  const root = deps.storageRoot ?? storageRoot;
  const mkdir = deps.mkdir ?? fs.mkdir;
  const getCreds = deps.getCredentials ?? getCredentials;
  const shouldUiBootstrap = (deps.isUiSessionBootstrapEnabled ?? isUiSessionBootstrapEnabled)();
  const loginViaUi = deps.createStorageStateViaUi ?? createStorageStateViaUi;
  const shouldTokenBootstrap = (deps.isTokenBootstrapEnabled ?? isTokenBootstrapEnabled)();
  const tryBootstrap = deps.tryTokenBootstrap ?? tryTokenBootstrap;
  const loginViaForm = deps.createStorageStateViaForm ?? createStorageStateViaForm;

  const storagePath = getStorageStatePath(root, role, env);
  await mkdir(path.dirname(storagePath), { recursive: true });

  const credentials = getCreds(role);
  logger.info(
    `auth:createStorageState role=${role} env=${config.testEnv} baseUrl=${baseUrl} user=${mask(credentials.username)} pass=${mask(
      credentials.password
    )}`
  );
  logger.info(
    `auth:token-env IDAM_WEB_URL=${present(process.env.IDAM_WEB_URL)} IDAM_TESTING_SUPPORT_URL=${present(
      process.env.IDAM_TESTING_SUPPORT_URL
    )} S2S_URL=${present(process.env.S2S_URL)} IDAM_SECRET=${present(process.env.IDAM_SECRET)} (mode=auto)`
  );

  if (shouldUiBootstrap) {
    await loginViaUi(role, storagePath);
    return storagePath;
  }

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
  deps: TokenBootstrapDeps = {}
): Promise<boolean> {
  const env = deps.env ?? process.env;
  const clientId = env.IDAM_CLIENT_ID ?? env.SERVICES_IDAM_CLIENT_ID ?? "xuiwebapp";
  const clientSecret = env.IDAM_SECRET;
  const scope = env.IDAM_OAUTH2_SCOPE ?? "openid profile roles manage-user search-user";
  const microservice = env.S2S_MICROSERVICE_NAME ?? env.MICROSERVICE ?? "xui_webapp";
  const idamWebUrl = env.IDAM_WEB_URL;
  const idamTestingSupportUrl = env.IDAM_TESTING_SUPPORT_URL;
  const s2sUrl = env.S2S_URL;

  if (!clientSecret || !idamWebUrl || !idamTestingSupportUrl || !s2sUrl) {
    return false;
  }

  const activeLogger = deps.logger ?? logger;
  const idamUtils = deps.idamUtils ?? new IdamUtils({ logger: activeLogger });
  const serviceAuthUtils = deps.serviceAuthUtils ?? new ServiceAuthUtils({ logger: activeLogger });
  const requestFactory = deps.requestFactory ?? ((options) => request.newContext(options));
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
      redirectUri: env.IDAM_RETURN_URL ?? `${baseUrl}/oauth2/callback`
    });
    const serviceToken = await serviceAuthUtils.retrieveToken({ microservice });

    context = await requestFactory({
      baseURL: baseUrl,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        Authorization: `Bearer ${accessToken}`,
        ServiceAuthorization: `Bearer ${serviceToken}`
      }
    });

    await context.get("auth/login", { failOnStatusCode: false });
    await context.get("/");
    const authStatus = await waitForAuthenticated(context, {
      attempts: deps.authCheckAttempts,
      delayMs: deps.authCheckDelayMs
    });

    await context.storageState({ path: storagePath });
    const state = await readState(storagePath);
    const hasCookies = Array.isArray(state?.cookies) && state.cookies.length > 0;

    if (authStatus.isAuthenticated && hasCookies) {
      return true;
    }
    activeLogger.warn(
      `Token bootstrap for role "${role}" returned isAuthenticated=${String(authStatus.isAuthenticated)}; falling back to form login`
    );
    return false;
  } catch (error) {
    activeLogger.warn(`Token bootstrap failed for role "${role}": ${formatUnknownError(error)}`);
    return false;
  } finally {
    await context?.dispose();
  }
}

async function createStorageStateViaForm(
  credentials: { username: string; password: string },
  storagePath: string,
  role: ApiUserRole,
  deps: FormLoginDeps = {}
): Promise<void> {
  const requestFactory = deps.requestFactory ?? ((options) => request.newContext(options));
  const context = await requestFactory({
    baseURL: baseUrl,
    ignoreHTTPSErrors: true,
    maxRedirects: 10
  });

  try {
    const loginPage = await context.get("auth/login");
    if (loginPage.status() >= 400) {
      throw new Error(`GET /auth/login responded with ${loginPage.status()}`);
    }

    const loginUrl = loginPage.url();
    const loginForm = parseLoginForm(await loginPage.text(), loginUrl);
    const submit = (form: LoginForm) => {
      const formPayload: Record<string, string> = { ...form.hiddenFields };
      if (form.hasEmail) formPayload.email = credentials.username;
      if (form.hasUsername) formPayload.username = credentials.username;
      if (form.hasPassword) formPayload.password = credentials.password;
      formPayload.save = form.hasPassword ? "Sign in" : "Continue";
      return context.post(form.action, { form: formPayload });
    };

    const loginResponse = await submit(loginForm);
    if (loginResponse.status() >= 400) {
      throw new Error(`POST ${loginUrl} responded with ${loginResponse.status()}`);
    }

    if (loginForm.hasEmail && !loginForm.hasPassword) {
      const passwordPageUrl = loginResponse.url?.() ?? loginUrl;
      const passwordHtml = await loginResponse.text?.();
      if (!passwordHtml) {
        throw new Error("Progressive IDAM password page was empty");
      }
      const passwordForm = parseLoginForm(passwordHtml, passwordPageUrl);
      if (!passwordForm.hasPassword) {
        throw new Error("Progressive IDAM password form was not found");
      }
      await submit(passwordForm);
    }

    await context.get("/");
    const authStatus = await waitForAuthenticated(context, {
      attempts: deps.authCheckAttempts,
      delayMs: deps.authCheckDelayMs
    });
    if (!authStatus.isAuthenticated) {
      throw new Error(
        `Login failed for role "${role}" (auth/isAuthenticated returned ${authStatus.status}; body=${authStatus.bodyPreview ?? "<empty>"})`
      );
    }
    await context.storageState({ path: storagePath });
  } catch (error) {
    throw new Error(`Failed to login as ${role}: ${formatUnknownError(error)}`, { cause: error });
  } finally {
    await context.dispose();
  }
}

const apiRoleToUiUserIdentifier = (role: ApiUserRole): string => {
  const map: Partial<Record<ApiUserRole, string>> = {
    caseOfficer_r1: "CASEWORKER_R1",
    caseOfficer_r2: "CASEWORKER_R2",
    // The generic API solicitor role uses the AAT divorce solicitor account.
    // The generic SOLICITOR vault account is a separate service persona.
    solicitor: "DIVORCE_SOLICITOR"
  };
  return map[role] ?? role.toUpperCase();
};

async function createStorageStateViaUi(role: ApiUserRole, storagePath: string): Promise<void> {
  const userIdentifier = apiRoleToUiUserIdentifier(role);
  await ensureUiStorageStateForUser(userIdentifier, { strict: true, baseUrl });

  const uiStoragePath = resolveUiStoragePathForUser(userIdentifier);
  const sourceState = await tryReadState(uiStoragePath);
  const hasExuiAuthCookies = hasCookie(sourceState, "__auth__") && hasCookie(sourceState, "xui-webapp");
  const hasLocalAuthCookies =
    (process.env.TEST_ENV ?? config.testEnv).toLowerCase() === "local" &&
    hasCookie(sourceState, "Idam.Session") &&
    hasCookie(sourceState, "xui-webapp");
  if (!hasExuiAuthCookies && !hasLocalAuthCookies) {
    throw new Error(`UI session bootstrap for ${role} did not create EXUI auth cookies.`);
  }

  if (path.resolve(uiStoragePath) !== path.resolve(storagePath)) {
    await fs.copyFile(uiStoragePath, storagePath);
  }
}

function getCredentials(role: ApiUserRole): { username: string; password: string } {
  const envUsers = config.users[config.testEnv as keyof typeof config.users];
  const userConfig = envUsers?.[role];
  if (!userConfig) {
    throw new Error(`No credentials configured for role "${role}" in environment "${config.testEnv}"`);
  }

  const username = userConfig.e?.trim();
  const password = userConfig.sec?.trim();
  if (!username || !password) {
    throw new Error(
      `Required credentials for role "${role}" are not configured. Set SOLICITOR_USERNAME, DIVORCE_SOLICITOR_USERNAME, or WA_SOLICITOR_USERNAME with the matching password variable.`
    );
  }

  return { username, password };
}

function extractCsrf(html: string): string | undefined {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/i);
  return match?.[1];
}

function parseLoginForm(html: string, pageUrl: string): LoginForm {
  const formMatch = /<form\b([^>]*)>/i.exec(html);
  const formAttributes = formMatch?.[1] ?? "";
  const actionMatch = /\baction=["']([^"']*)["']/i.exec(formAttributes);
  const action = new URL(actionMatch?.[1] || pageUrl, pageUrl).toString();
  const formEnd = formMatch ? html.indexOf("</form>", formMatch.index) : -1;
  const formHtml = formMatch && formEnd >= 0 ? html.slice(formMatch.index, formEnd) : html;
  const hiddenFields: Record<string, string> = {};
  for (const input of formHtml.match(/<input\b[^>]*type=["']hidden["'][^>]*>/gi) ?? []) {
    const name = /\bname=["']([^"']+)["']/i.exec(input)?.[1];
    const value = /\bvalue=["']([^"']*)["']/i.exec(input)?.[1];
    if (name && value !== undefined) hiddenFields[name] = value;
  }
  return {
    action,
    hiddenFields,
    hasEmail: /<input\b[^>]*(?:name|id)=["'](?:email|emailAddress)["'][^>]*>/i.test(formHtml),
    hasUsername: /<input\b[^>]*(?:name|id)=["']username["'][^>]*>/i.test(formHtml),
    hasPassword: /<input\b[^>]*type=["']password["'][^>]*>/i.test(formHtml)
  };
}

async function readAuthCheck(response: AuthCheckResponse): Promise<AuthCheckResult> {
  const status = response.status();
  const headers = typeof response.headers === "function" ? response.headers() : {};
  const contentType = headers["content-type"] ?? headers["Content-Type"];
  const body = await readResponseBody(response);
  const bodyPreview = body?.replace(/\s+/g, " ").trim().slice(0, 200);

  if (status !== 200) {
    return { isAuthenticated: false, status, contentType, bodyPreview };
  }

  return { isAuthenticated: parseAuthValue(body), status, contentType, bodyPreview };
}

async function waitForAuthenticated(
  context: AuthCheckContext,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<AuthCheckResult> {
  const attempts = readPositiveInteger(options.attempts, process.env.API_AUTH_CHECK_ATTEMPTS, 5);
  const delayMs = readPositiveInteger(options.delayMs, process.env.API_AUTH_CHECK_DELAY_MS, 1000, true);
  let lastResult: AuthCheckResult | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const authCheck = await context.get("auth/isAuthenticated", { failOnStatusCode: false });
    lastResult = await readAuthCheck(authCheck);
    if (lastResult.isAuthenticated || lastResult.status !== 200 || attempt === attempts) {
      return lastResult;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return lastResult ?? { isAuthenticated: false, status: 0 };
}

function readPositiveInteger(override: number | undefined, envValue: string | undefined, fallback: number, allowZero = false): number {
  const value = override ?? (envValue ? Number.parseInt(envValue, 10) : fallback);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(allowZero ? 0 : 1, value);
}

async function readResponseBody(response: AuthCheckResponse): Promise<string | undefined> {
  if (typeof response.text === "function") {
    return response.text().catch(() => undefined);
  }
  if (typeof response.json === "function") {
    return response.json().then((value) => JSON.stringify(value)).catch(() => undefined);
  }
  return undefined;
}

function parseAuthValue(body: string | undefined): boolean {
  if (!body) {
    return false;
  }
  const trimmed = body.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "boolean"
      ? parsed
      : Boolean(parsed && typeof parsed === "object" && parsed.isAuthenticated === true);
  } catch {
    return false;
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function getStorageStatePath(root: string, role: ApiUserRole, env: NodeJS.ProcessEnv = process.env): string {
  void env;
  return path.join(root, `api-${getCacheKey(role)}.storage.json`);
}

function getWorkerStorageId(env: NodeJS.ProcessEnv = process.env): string {
  const rawWorkerId = env.API_AUTH_STORAGE_SCOPE ?? env.TEST_WORKER_INDEX ?? env.TEST_PARALLEL_INDEX ?? env.PW_TEST_WORKER_INDEX;
  const workerId = rawWorkerId?.trim();
  if (workerId) {
    return `worker-${workerId.replace(/[^A-Za-z0-9._-]/g, "-")}`;
  }
  return `pid-${process.pid}`;
}

function getCacheKey(role: ApiUserRole, env: NodeJS.ProcessEnv = process.env): string {
  void env;
  return getCacheKeyForIdentity(config.testEnv, role, getCredentials(role).username);
}

function getCacheKeyForIdentity(testEnvironment: string, role: ApiUserRole, username: string): string {
  const identityHash = createHash("sha256")
    .update(username.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return `${testEnvironment}-${role}-${identityHash}`;
}

function isStorageStateFresh(storagePath: string, ttlMs = 15 * 60_000): boolean {
  try {
    return Date.now() - fsSync.statSync(storagePath).mtimeMs <= ttlMs;
  } catch {
    return false;
  }
}

function resolveStorageLockTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.PW_UI_STORAGE_LOCK_TIMEOUT_MS);
  const loginTimeoutMs = Number(env.PW_UI_LOGIN_TIMEOUT_MS) || 60_000;
  const captureAttempts = Number(env.PW_UI_SESSION_CAPTURE_ATTEMPTS) || 2;
  return Math.max(
    DEFAULT_STORAGE_LOCK_TIMEOUT_MS,
    loginTimeoutMs * captureAttempts + 60_000,
    Number.isFinite(configured) && configured > 0 ? configured : 0
  );
}

async function acquireStorageStateLock(
  storagePath: string,
  timeoutMs = resolveStorageLockTimeoutMs()
): Promise<() => void> {
  const lockPath = `${storagePath}.lock`;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      fsSync.mkdirSync(lockPath);
      return () => {
        fsSync.rmSync(lockPath, { recursive: true, force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }

      try {
        if (Date.now() - fsSync.statSync(lockPath).mtimeMs > timeoutMs) {
          fsSync.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // The lock may have been released between the existence and stat checks.
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for API auth storage lock ${path.basename(lockPath)}.`, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function validateStorageState(storagePath: string): Promise<StorageValidationResult> {
  let mtimeMs: number;
  try {
    mtimeMs = fsSync.statSync(storagePath).mtimeMs;
  } catch {
    return "unauthenticated";
  }

  const cached = validatedStorageStates.get(storagePath);
  if (cached?.mtimeMs === mtimeMs && cached.validUntil > Date.now()) {
    return "authenticated";
  }

  let context: (AuthCheckContext & { dispose?: () => Promise<void> }) | undefined;
  try {
    context = await request.newContext({
      baseURL: baseUrl,
      ignoreHTTPSErrors: true,
      storageState: storagePath
    });
    const result = await waitForAuthenticated(context, { attempts: 1, delayMs: 0 });
    if (!result.isAuthenticated) {
      return "unauthenticated";
    }
    validatedStorageStates.set(storagePath, { mtimeMs, validUntil: Date.now() + STORAGE_VALIDATION_CACHE_MS });
    return "authenticated";
  } catch (error) {
    logger.warn(`Unable to validate cached API storage state: ${formatUnknownError(error)}`);
    return "unavailable";
  } finally {
    await context?.dispose?.().catch(() => undefined);
  }
}

function hasCookie(state: StorageState | undefined, cookieName: string): boolean {
  return Array.isArray(state?.cookies) && state.cookies.some((cookie) => cookie.name === cookieName && Boolean(cookie.value));
}

async function tryReadState(storagePath: string): Promise<StorageState | undefined> {
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

function isUiSessionBootstrapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = env.API_AUTH_MODE ?? env.API_USE_TOKEN_LOGIN;
  return Boolean(mode && ["browser", "ui"].includes(mode.toLowerCase()));
}

function isTokenBootstrapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = env.API_AUTH_MODE ?? env.API_USE_TOKEN_LOGIN;
  if (mode && ["form", "off", "false", "0", "no"].includes(mode.toLowerCase())) {
    return false;
  }
  if (mode && ["token", "true", "1", "yes"].includes(mode.toLowerCase())) {
    return true;
  }
  if ((env.TEST_ENV ?? config.testEnv).toLowerCase() === "local") {
    return false;
  }
  const hasIdamEnv = !!env.IDAM_SECRET && !!env.IDAM_WEB_URL && !!env.IDAM_TESTING_SUPPORT_URL;
  const hasS2S = !!env.S2S_URL;
  return hasIdamEnv && hasS2S;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export const __test__ = {
  apiRoleToUiUserIdentifier,
  extractCsrf,
  stripTrailingSlash,
  getWorkerStorageId,
  getStorageStatePath,
  getCacheKey,
  getCacheKeyForIdentity,
  isStorageStateFresh,
  resolveStorageLockTimeoutMs,
  acquireStorageStateLock,
  validateStorageState,
  isUiSessionBootstrapEnabled,
  isTokenBootstrapEnabled,
  tryReadState,
  ensureStorageStateWith,
  getStoredCookieWith,
  createStorageStateWith,
  tryTokenBootstrap,
  createStorageStateViaForm,
  createStorageStateViaUi,
  getCredentials
};
