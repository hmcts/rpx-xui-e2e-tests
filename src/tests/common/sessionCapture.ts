import fs from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";
import type { Cookie } from "playwright-core";

import config from "../e2e/utils/config.utils.js";
import { CookieUtils } from "../e2e/utils/cookie.utils.js";
import { ensureUiStorageStateForUser } from "../e2e/utils/session-storage.utils.js";
import { resolveUiStoragePathForUser } from "../e2e/utils/storage-state.utils.js";
import { UserUtils } from "../e2e/utils/user.utils.js";

import {
  resolveSessionIdentity,
  resolveSessionStorageKey,
  type SessionIdentityInput
} from "./sessionIdentity.js";

type ConfirmAuthenticatedLoginDeps = {
  acceptCookies: (page: Page) => Promise<void>;
  waitForShell: (page: Page, targetUrl: string, attempt: number) => Promise<unknown>;
  waitForAuthCookies: (page: Page, targetUrl: string, attempt: number) => Promise<boolean>;
  info: (message: string, meta: Record<string, unknown>) => void;
};

type SessionCaptureFs = Pick<
  typeof fs,
  "existsSync" | "mkdirSync" | "readFileSync" | "rmSync" | "statSync" | "writeFileSync"
>;

type SessionCaptureWithDeps = {
  chromiumLauncher?: {
    launch: () => Promise<{
      newContext: () => Promise<{
        newPage: () => Promise<Page>;
        cookies: () => Promise<Cookie[]>;
        addCookies?: (cookies: Cookie[]) => Promise<void>;
        storageState?: () => Promise<unknown>;
      }>;
      close?: () => Promise<void>;
    }>;
  };
  config?: { urls?: { exuiDefaultUrl?: string } };
  cookieUtils?: Pick<CookieUtils, "writeManageCasesSession">;
  env?: NodeJS.ProcessEnv;
  fs?: Partial<SessionCaptureFs>;
  idamPageFactory?: (page: Page) => unknown;
  isSessionFresh?: typeof isSessionFresh;
  lockfile?: {
    lock: (target: string, options?: Record<string, unknown>) => Promise<() => Promise<void> | void>;
  };
  persistSession?: typeof persistSession;
  userUtils?: Pick<UserUtils, "getUserCredentials">;
};

type IdamPageLike = {
    login?: (credentials: { email: string; password: string; username: string }) => Promise<void>;
    usernameInput?: {
      first?: () => unknown;
      waitFor?: (options?: { state?: "attached" | "detached" | "visible" | "hidden"; timeout?: number }) => Promise<void>;
      fill?: (value: string) => Promise<void>;
    };
    passwordInput?: {
      first?: () => unknown;
      fill?: (value: string) => Promise<void>;
      press?: (key: string) => Promise<void>;
    };
    submitBtn?: {
      first?: () => unknown;
      isVisible?: () => Promise<boolean>;
      click?: () => Promise<void>;
    };
};

type SessionLockDeps = {
  fsApi?: Partial<SessionCaptureFs>;
  lockfileApi?: SessionCaptureWithDeps["lockfile"];
  lockFilePath: string;
  userIdentifier: string;
  isSessionReusable: () => boolean;
  force?: boolean;
};

const DEFAULT_SESSION_MAX_AGE_MS = 60 * 60 * 1000;

const getFs = (fsApi?: Partial<SessionCaptureFs>): SessionCaptureFs => ({
  existsSync: fsApi?.existsSync ?? fs.existsSync,
  mkdirSync: fsApi?.mkdirSync ?? fs.mkdirSync,
  readFileSync: fsApi?.readFileSync ?? fs.readFileSync,
  rmSync: fsApi?.rmSync ?? fs.rmSync,
  statSync: fsApi?.statSync ?? fs.statSync,
  writeFileSync: fsApi?.writeFileSync ?? fs.writeFileSync
});

const getStorageFile = (input: SessionIdentityInput, userUtils?: Pick<UserUtils, "getUserCredentials">): string => {
  const storageKey = resolveSessionStorageKey(input, userUtils ? { userUtils: userUtils as UserUtils } : {});
  return path.join(process.cwd(), ".sessions", `${storageKey}.storage.json`);
};

const isCompatibleCookieDomain = (cookieDomain: string | undefined, targetHost: string): boolean => {
  if (!cookieDomain) {
    return false;
  }
  const normalizedDomain = cookieDomain.replace(/^\./, "").toLowerCase();
  const normalizedHost = targetHost.toLowerCase();
  return normalizedDomain === normalizedHost || normalizedHost.endsWith(`.${normalizedDomain}`);
};

export function resolveSessionMaxAgeMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number.parseInt(env.PW_SESSION_MAX_AGE_MS ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SESSION_MAX_AGE_MS;
}

export function isSessionFresh(
  storageFile: string,
  maxAgeMs = resolveSessionMaxAgeMs(),
  options: { fs?: Partial<SessionCaptureFs>; now?: () => number; targetUrl?: string } = {}
): boolean {
  const fsApi = getFs(options.fs);
  try {
    if (!fsApi.existsSync(storageFile)) {
      return false;
    }
    const ageMs = (options.now ?? Date.now)() - fsApi.statSync(storageFile).mtimeMs;
    if (ageMs > maxAgeMs) {
      return false;
    }
    if (!options.targetUrl) {
      return true;
    }
    const parsed = JSON.parse(fsApi.readFileSync(storageFile, "utf8").toString()) as { cookies?: Cookie[] };
    const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
    const authCookies = cookies.filter((cookie) => ["Idam.Session", "__auth__"].includes(cookie.name));
    if (authCookies.length === 0) {
      return false;
    }
    const targetHost = new URL(options.targetUrl).hostname;
    return authCookies.some((cookie) => isCompatibleCookieDomain(cookie.domain, targetHost));
  } catch {
    return false;
  }
}

export function loadSessionCookies(
  input: SessionIdentityInput,
  deps: { fs?: Partial<SessionCaptureFs>; userUtils?: Pick<UserUtils, "getUserCredentials"> } = {}
): { cookies: Cookie[]; storageFile: string } {
  const fsApi = getFs(deps.fs);
  const storageFile = getStorageFile(input, deps.userUtils);
  try {
    const parsed = JSON.parse(fsApi.readFileSync(storageFile, "utf8").toString()) as { cookies?: Cookie[] };
    return {
      cookies: Array.isArray(parsed.cookies) ? parsed.cookies : [],
      storageFile
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Storage file corrupted: ${storageFile}`);
    }
    throw new Error(`Failed parsing storage file: ${storageFile}`);
  }
}

export async function persistSession(
  sessionPath: string,
  cookies: Cookie[],
  context: { addCookies?: (cookies: Cookie[]) => Promise<void>; storageState?: () => Promise<unknown> },
  userIdentifier: string,
  deps: { cookieUtils?: Pick<CookieUtils, "writeManageCasesSession">; fs?: Partial<SessionCaptureFs> } = {}
): Promise<void> {
  void userIdentifier;
  const cookieUtils = deps.cookieUtils ?? new CookieUtils(getFs(deps.fs));
  await context.addCookies?.(cookies);
  await context.storageState?.();
  cookieUtils.writeManageCasesSession(sessionPath, cookies);
}

export async function acquireSessionLock({
  fsApi: fsApiInput,
  lockfileApi,
  lockFilePath,
  userIdentifier,
  isSessionReusable,
  force = false
}: SessionLockDeps): Promise<() => Promise<void> | void> {
  const lockApi = lockfileApi ?? { lock: async () => async () => undefined };
  const fsApi = getFs(fsApiInput);
  try {
    return await lockApi.lock(lockFilePath, { retries: 0 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "ELOCKED") {
      throw error;
    }
    if (!force && isSessionReusable()) {
      return async () => undefined;
    }
    try {
      if (fsApi.existsSync(lockFilePath)) {
        const ageMs = Date.now() - fsApi.statSync(lockFilePath).mtimeMs;
        if (ageMs > 60_000) {
          fsApi.rmSync(lockFilePath, { force: true });
        }
      }
    } catch {
      // Lock cleanup is best-effort; retrying the lock below gives the authoritative result.
    }
    try {
      return await lockApi.lock(lockFilePath, { retries: 0 });
    } catch (retryError) {
      throw new Error(`Could not acquire session lock for ${userIdentifier}: ${(retryError as Error).message}`);
    }
  }
}

export async function confirmAuthenticatedLogin(
  page: Page,
  userIdentifier: string,
  email: string,
  targetUrl: string,
  attempt: number,
  deps: ConfirmAuthenticatedLoginDeps
): Promise<void> {
  await deps.acceptCookies(page);
  const shellMarker = await deps.waitForShell(page, targetUrl, attempt);
  if (shellMarker) {
    deps.info("Authenticated app shell detected.", {
      userIdentifier,
      email,
      marker: "app-shell"
    });
    return;
  }

  if (await deps.waitForAuthCookies(page, targetUrl, attempt)) {
    deps.info("Authenticated cookies detected.", {
      userIdentifier,
      email,
      marker: "auth-cookies"
    });
    return;
  }

  throw new Error(`Login for ${userIdentifier} did not establish authenticated session at ${targetUrl}.`);
}

export async function ensureSessionCookies(
  input: SessionIdentityInput
): Promise<{ email: string; cookies: Array<{ name: string }>; storageFile: string }> {
  const identity = resolveSessionIdentity(input);
  await ensureUiStorageStateForUser(identity.userIdentifier, { strict: true });
  const storageFile = resolveUiStoragePathForUser(identity.userIdentifier, { email: identity.email });
  const storageState = JSON.parse(fs.readFileSync(storageFile, "utf8")) as {
    cookies?: Array<{ name: string }>;
  };
  return {
    email: identity.email,
    cookies: Array.isArray(storageState.cookies) ? storageState.cookies : [],
    storageFile
  };
}

export async function sessionCapture(
  users: SessionIdentityInput[],
  options?: { force?: boolean }
): Promise<void> {
  void options;
  for (const user of users) {
    await ensureSessionCookies(user);
  }
}

export async function sessionCaptureWith(
  users: SessionIdentityInput[],
  deps: SessionCaptureWithDeps = {}
): Promise<void> {
  const fsApi = getFs(deps.fs);
  const userUtils = deps.userUtils ?? new UserUtils();
  const targetUrl = deps.env?.TEST_URL ?? deps.config?.urls?.exuiDefaultUrl ?? config.urls.exuiDefaultUrl;

  fsApi.mkdirSync(path.join(process.cwd(), ".sessions"), { recursive: true });
  fsApi.mkdirSync(path.join(process.cwd(), "test-results"), { recursive: true });

  for (const user of users) {
    const identity = resolveSessionIdentity(user, { userUtils: userUtils as UserUtils });
    const storageFile = getStorageFile(identity, userUtils);
    const sessionFresh = deps.isSessionFresh ?? isSessionFresh;
    const maxAgeMs = resolveSessionMaxAgeMs(deps.env);
    const isReusable = () => sessionFresh(storageFile, maxAgeMs, { fs: fsApi, targetUrl });
    if (isReusable()) {
      continue;
    }

    const release = await acquireSessionLock({
      fsApi,
      lockfileApi: deps.lockfile,
      lockFilePath: `${storageFile}.lock`,
      userIdentifier: identity.userIdentifier,
      isSessionReusable: isReusable,
      force: false
    });

    if (isReusable()) {
      await release();
      continue;
    }

    const browser = await deps.chromiumLauncher?.launch();
    if (!browser) {
      await release();
      throw new Error("No chromium launcher configured for session capture");
    }

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(targetUrl);
      const idamPage = deps.idamPageFactory?.(page) as IdamPageLike | undefined;
      if (idamPage?.login) {
        await idamPage.login({ email: identity.email, password: identity.password, username: identity.email });
      } else {
        await idamPage?.usernameInput?.waitFor?.({ state: "visible", timeout: 15_000 });
        await idamPage?.usernameInput?.fill?.(identity.email);
        await idamPage?.passwordInput?.fill?.(identity.password);
        await idamPage?.passwordInput?.press?.("Enter");
      }
      const cookies = await context.cookies();
      if (cookies.length === 0) {
        throw new Error(`Login for ${identity.userIdentifier} did not establish session cookies.`);
      }
      const persist = deps.persistSession ?? persistSession;
      await persist(storageFile, cookies, context, identity.userIdentifier, {
        cookieUtils: deps.cookieUtils,
        fs: fsApi
      });
    } finally {
      await browser.close?.();
      await release();
    }
  }
}

export const __test__ = {
  acquireSessionLock,
  confirmAuthenticatedLogin,
  persistSession,
  resolveSessionMaxAgeMs,
  sessionCaptureWith
};
