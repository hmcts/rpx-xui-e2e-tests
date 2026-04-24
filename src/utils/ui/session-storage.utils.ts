import fs from "node:fs";
import path from "node:path";

import { IdamPage } from "@hmcts/playwright-common";
import { chromium, request, type BrowserContext, type Page } from "@playwright/test";

import config from "./config.utils.js";
import { decodeJwtPayload } from "./jwt.utils.js";
import {
  readUiStorageMetadata,
  resolveLegacyUiStoragePathForUser,
  resolveUiStoragePathForUser,
  writeUiStorageMetadata
} from "./storage-state.utils.js";
import { UserUtils } from "./user.utils.js";

type EnsureStorageOptions = {
  strict?: boolean;
  baseUrl?: string;
};

const resolveStorageTtlMs = (): number => {
  const raw = process.env.PW_UI_STORAGE_TTL_MIN;
  if (!raw) return 15 * 60_000;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 15 * 60_000;
  return Math.max(0, parsed) * 60_000;
};

const resolveLoginTimeoutMs = (): number => {
  const raw = process.env.PW_UI_LOGIN_TIMEOUT_MS;
  if (!raw) return 60_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? 60_000 : Math.max(5_000, parsed);
};

const resolveUiBootstrapRetryAttempts = (): number => {
  const raw = process.env.PW_UI_BOOTSTRAP_NAV_MAX_ATTEMPTS;
  if (!raw) return 2;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? 2 : Math.max(1, parsed);
};

const resolveManualUserIdentifiers = (): Set<string> => {
  const raw = process.env.PW_UI_MANUAL_USERS ?? process.env.PW_UI_MANUAL_USER ?? "";
  const values = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  return new Set(values);
};

const resolveIdamHost = (): string | undefined => {
  const idamUrl = process.env.IDAM_WEB_URL ?? config.urls.idamWebUrl;
  try {
    return new URL(idamUrl).hostname;
  } catch {
    return undefined;
  }
};

const readStorageStateSubject = (storagePath: string): string | undefined => {
  if (!fs.existsSync(storagePath)) return undefined;
  try {
    const state = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    const cookies = Array.isArray(state.cookies) ? state.cookies : [];
    const authCookie = cookies.find((cookie: { name?: string; value?: string }) => cookie?.name === "__auth__");
    if (!authCookie?.value) return undefined;
    const payload = decodeJwtPayload(authCookie.value);
    const subject = payload?.sub ?? payload?.subname ?? payload?.email;
    return typeof subject === "string" && subject.trim() ? subject : undefined;
  } catch {
    return undefined;
  }
};

const normalizeUserIdentifier = (value: string): string => value.trim();

const normalizeUserValue = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
};

const TRANSIENT_UI_BOOTSTRAP_PATTERNS: RegExp[] = [
  /page\.goto: Timeout \d+ms exceeded/i,
  /navigation timeout of \d+ms exceeded/i,
  /timeout \d+ms exceeded/i,
  /net::ERR_(TIMED_OUT|CONNECTION_ABORTED|CONNECTION_CLOSED|CONNECTION_RESET|CONNECTION_REFUSED|INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NETWORK_CHANGED)/i
];

const asErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const resolveIdamLoginUrl = (env: NodeJS.ProcessEnv = process.env): string | undefined => {
  const idamUrl = env.IDAM_WEB_URL ?? config.urls.idamWebUrl;
  try {
    return new URL("/login", idamUrl).toString();
  } catch {
    return undefined;
  }
};

const resolveUiLoginTargets = (baseUrl: string, env: NodeJS.ProcessEnv = process.env): string[] =>
  Array.from(new Set([baseUrl, resolveIdamLoginUrl(env)].filter((value): value is string => Boolean(value?.trim()))));

export const isTransientUiBootstrapFailure = (error: unknown): boolean => {
  const message = asErrorMessage(error);
  return TRANSIENT_UI_BOOTSTRAP_PATTERNS.some((pattern) => pattern.test(message));
};

export const navigateToBaseUrlWithRetry = async (
  page: Pick<Page, "goto">,
  baseUrl: string,
  options?: { maxAttempts?: number }
): Promise<void> => {
  const maxAttempts = options?.maxAttempts ?? resolveUiBootstrapRetryAttempts();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isTransientUiBootstrapFailure(error)) {
        throw error;
      }
      await delay(1_000 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Initial UI navigation failed.");
};

const isEmailLike = (value: string | undefined): boolean =>
  Boolean(value && value.includes("@"));

const storageStateMatchesUser = (storagePath: string, expectedEmail: string): boolean => {
  const expected = normalizeUserValue(expectedEmail);
  if (!expected) return true;
  const actual = normalizeUserValue(readStorageStateSubject(storagePath));
  if (!actual) return false;
  if (!isEmailLike(actual)) {
    return true;
  }
  return actual === expected;
};

const migrateLegacyUiStorageStateIfPresent = (
  userIdentifier: string,
  expectedEmail: string,
  targetStoragePath: string
): boolean => {
  if (fs.existsSync(targetStoragePath)) {
    return false;
  }

  const legacyStoragePath = resolveLegacyUiStoragePathForUser(userIdentifier);
  if (!fs.existsSync(legacyStoragePath) || !storageStateMatchesUser(legacyStoragePath, expectedEmail)) {
    return false;
  }

  fs.copyFileSync(legacyStoragePath, targetStoragePath);
  writeUiStorageMetadata(targetStoragePath, {
    userIdentifier,
    email: expectedEmail
  });
  return true;
};

const waitForIdamLogin = async (page: Page) => {
  const idamHost = resolveIdamHost();
  const appHost = (() => {
    try {
      return new URL(config.urls.manageCaseBaseUrl).hostname;
    } catch {
      return undefined;
    }
  })();
  if (idamHost) {
    await page
      .waitForURL((url) => url.hostname === idamHost, { timeout: resolveLoginTimeoutMs() })
      .catch(() => {
        // Continue to selector wait even if hostname check times out.
      });
  }

  const usernameInput = page.locator(
    'input#username, input[name="username"], input[type="email"], input#email, input[name="email"], input[name="emailAddress"], input[autocomplete="email"]'
  );
  const passwordInput = page.locator('input#password, input[name="password"], input[type="password"]');
  const submitButton = page.locator('[name="save"], button[type="submit"]');
  const appReady = page.locator("exui-header, exui-case-home");
  const timeoutMs = resolveLoginTimeoutMs();

  const outcome = await Promise.race([
    usernameInput.first().waitFor({ state: "visible", timeout: timeoutMs }).then(() => "login"),
    appReady.first().waitFor({ state: "visible", timeout: timeoutMs }).then(() => "app")
  ]).catch(() => null);

  if (outcome === "app") {
    return null;
  }

  if (outcome !== "login") {
    const currentHost = (() => {
      try {
        return new URL(page.url()).hostname;
      } catch {
        return undefined;
      }
    })();
    if (currentHost && currentHost !== idamHost && currentHost === appHost) {
      return null;
    }
    const failure = await describeLoginFailure(page);
    const details = failure ? ` ${failure}` : "";
    throw new Error(`Login page did not render.${details} URL=${page.url()}`);
  }

  return { usernameInput, passwordInput, submitButton };
};

const describeLoginFailure = async (page: Page): Promise<string | undefined> => {
  const errorSelectors = [
    ".govuk-error-summary",
    ".error-summary",
    ".govuk-error-message",
    ".error-message",
    "[role='alert']"
  ];
  for (const selector of errorSelectors) {
    const locator = page.locator(selector);
    if (await locator.first().isVisible().catch(() => false)) {
      const text = (await locator.first().innerText().catch(() => ""))?.trim();
      if (text) {
        return `Login page error: ${text.replace(/\\s+/g, " ").slice(0, 300)}`;
      }
    }
  }
  return undefined;
};

const hasRequiredAuthCookies = (cookies: { name: string }[]) => {
  const names = new Set(cookies.map((cookie) => cookie.name));
  return names.has("Idam.Session") && names.has("__auth__");
};

const hasExpiredAuthCookies = (cookies: { name: string; expires: number }[]) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return cookies.some((cookie) => {
    if (!["Idam.Session", "__auth__"].includes(cookie.name)) return false;
    if (cookie.expires <= 0) return false;
    return cookie.expires <= nowSeconds;
  });
};

const shouldRefreshStorageState = async (
  storagePath: string,
  baseUrl: string,
  options?: {
    ignoreTtl?: boolean;
    validateAuthenticatedState?: (storagePath: string, baseUrl: string) => Promise<boolean>;
    expectedIdentity?: { userIdentifier: string; email: string };
  }
): Promise<boolean> => {
  if (!fs.existsSync(storagePath)) return true;
  try {
    const state = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    const cookies = Array.isArray(state.cookies) ? state.cookies : [];
    if (!hasRequiredAuthCookies(cookies)) return true;
    if (hasExpiredAuthCookies(cookies)) return true;
  } catch {
    return true;
  }

  const expectedIdentity = options?.expectedIdentity;
  if (expectedIdentity) {
    const metadata = readUiStorageMetadata(storagePath);
    const expectedUserIdentifier = normalizeUserIdentifier(expectedIdentity.userIdentifier);
    const expectedEmail = normalizeUserValue(expectedIdentity.email);
    if (metadata) {
      if (
        normalizeUserIdentifier(metadata.userIdentifier) !== expectedUserIdentifier ||
        normalizeUserValue(metadata.email) !== expectedEmail
      ) {
        return true;
      }
    } else if (expectedEmail && !storageStateMatchesUser(storagePath, expectedIdentity.email)) {
      return true;
    }
  }

  if (options?.ignoreTtl) {
    const stillAuthenticated = await (options.validateAuthenticatedState ?? isStorageStateAuthenticated)(
      storagePath,
      baseUrl
    );
    return !stillAuthenticated;
  }
  const ttlMs = resolveStorageTtlMs();
  if (ttlMs <= 0) return true;
  const ageMs = Date.now() - fs.statSync(storagePath).mtimeMs;
  if (ageMs <= ttlMs) return false;

  const stillAuthenticated = await (options?.validateAuthenticatedState ?? isStorageStateAuthenticated)(
    storagePath,
    baseUrl
  );
  return !stillAuthenticated;
};

const waitForAuthCookies = async (
  context: BrowserContext,
  page: Page,
  timeoutMs = resolveLoginTimeoutMs()
): Promise<{ ok: boolean; reason?: string }> => {
  const deadline = Date.now() + timeoutMs;
  const loginInput = page.locator('input#username, input[name="username"], input[type="email"]');
  while (Date.now() < deadline) {
    const cookies = await context.cookies();
    if (hasRequiredAuthCookies(cookies)) {
      return { ok: true };
    }
    if (await loginInput.first().isVisible().catch(() => false)) {
      const failure = await describeLoginFailure(page);
      if (failure) {
        return { ok: false, reason: failure };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { ok: false, reason: "Timed out waiting for auth cookies." };
};

const TRANSIENT_UI_SERVICE_UNAVAILABLE_PATTERNS: RegExp[] = [
  /\b504\b/i,
  /service unavailable/i,
  /gateway time-?out/i,
  /our services aren'?t available right now/i,
  /the service is unavailable/i
];

const addAnalyticsCookie = async (context: BrowserContext, baseUrl: string) => {
  const cookies = await context.cookies();
  const userId = cookies.find((cookie) => cookie.name === "__userid__")?.value;
  if (!userId) return;

  const domain = new URL(baseUrl).hostname;
  await context.addCookies([
    {
      name: `hmcts-exui-cookies-${userId}-mc-accepted`,
      value: "true",
      domain,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax"
    }
  ]);
};

const isUiServiceUnavailablePage = async (page: Pick<Page, "title" | "locator">): Promise<boolean> => {
  const title = (await page.title().catch(() => "")).trim();
  if (TRANSIENT_UI_SERVICE_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return true;
  }

  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  return TRANSIENT_UI_SERVICE_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(bodyText));
};

const captureUiStorageState = async (
  context: BrowserContext,
  page: Page,
  userIdentifier: string,
  email: string,
  password: string,
  baseUrl: string
): Promise<void> => {
  const idamPage = new IdamPage(page);
  const attemptErrors: string[] = [];

  for (const loginTarget of resolveUiLoginTargets(baseUrl)) {
    await context.clearCookies().catch(() => undefined);

    try {
      await navigateToBaseUrlWithRetry(page, loginTarget);
      if (await isUiServiceUnavailablePage(page)) {
        throw new Error(`UI bootstrap target returned a service-unavailable page (${loginTarget}).`);
      }

      const loginFields = await waitForIdamLogin(page);

      if (loginFields) {
        if (await idamPage.usernameInput.isVisible().catch(() => false)) {
          await idamPage.login({ username: email, password });
        } else {
          await loginFields.usernameInput.fill(email);
          await loginFields.passwordInput.fill(password);
          await loginFields.submitButton.click();
        }
      }

      const loginOutcome = await waitForAuthCookies(context, page);
      if (!loginOutcome.ok) {
        throw new Error(
          `Login did not establish session cookies for ${userIdentifier}. ${loginOutcome.reason ?? "Login failure."} URL=${page.url()}`
        );
      }

      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attemptErrors.push(`${loginTarget}: ${message}`);
    }
  }

  throw new Error(
    `Unable to capture UI session for ${userIdentifier}. Attempts: ${attemptErrors.join(" | ")}`
  );
};

const resolveAuthBaseUrl = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl.replace(/\/cases.*$/, "");
  }
};

const resolveStorageStateLockPath = (storagePath: string): string => `${storagePath}.lock`;

const acquireStorageStateLock = async (
  storagePath: string,
  timeoutMs = resolveLoginTimeoutMs()
): Promise<() => void> => {
  const lockPath = resolveStorageStateLockPath(storagePath);
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      fs.mkdirSync(lockPath, { recursive: false });
      return () => {
        try {
          fs.rmSync(lockPath, { recursive: true, force: true });
        } catch {
          // Ignore lock cleanup failures.
        }
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "EEXIST") {
        throw error;
      }

      try {
        const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (ageMs > timeoutMs) {
          fs.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Another worker may have released the lock between checks.
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for UI session lock ${path.basename(lockPath)}.`);
      }
      await delay(250);
    }
  }
};

const isStorageStateAuthenticated = async (
  storagePath: string,
  baseUrl: string
): Promise<boolean> => {
  if (!fs.existsSync(storagePath)) return false;
  const authBaseUrl = resolveAuthBaseUrl(baseUrl);
  try {
    const context = await request.newContext({
      baseURL: authBaseUrl.replace(/\/+$/, ""),
      ignoreHTTPSErrors: true,
      storageState: storagePath
    });
    const res = await context.get("auth/isAuthenticated", { failOnStatusCode: false });
    const ok = res.status() === 200;
    const data = ok ? await res.json().catch(() => null) : null;
    await context.dispose();
    return ok && data === true;
  } catch {
    return false;
  }
};

export const ensureUiStorageStateForUser = async (
  userIdentifier: string,
  options?: EnsureStorageOptions
): Promise<void> => {
  const baseUrl = options?.baseUrl ?? config.urls.manageCaseBaseUrl;
  const strict = options?.strict ?? false;
  const manualUsers = resolveManualUserIdentifiers();
  const normalisedUser = userIdentifier.trim().toUpperCase();
  const ignoreTtl = manualUsers.has(normalisedUser);
  const userUtils = new UserUtils();

  let expectedEmail: string | undefined;
  let expectedPassword: string | undefined;
  try {
    ({ email: expectedEmail, password: expectedPassword } = userUtils.getUserCredentials(userIdentifier));
  } catch {
    // If creds are missing, we'll surface this later when we need to login.
  }

  const email = expectedEmail;
  const password = expectedPassword;
  if (!email || !password) {
    const message = manualUsers.has(normalisedUser)
      ? `Manual session required for ${userIdentifier}. Run: PW_UI_USER=${userIdentifier} yarn ui:session`
      : `Missing credentials for ${userIdentifier}.`;
    if (strict) {
      throw new Error(message);
    }
    console.warn(`[ui.session] ${message}`);
    return;
  }

  const storagePath = resolveUiStoragePathForUser(userIdentifier, { email });
  const expectedIdentity = { userIdentifier, email };
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  migrateLegacyUiStorageStateIfPresent(userIdentifier, email, storagePath);
  let needsRefresh = await shouldRefreshStorageState(storagePath, baseUrl, {
    ignoreTtl: strict || ignoreTtl,
    validateAuthenticatedState: isStorageStateAuthenticated,
    expectedIdentity
  });
  if (!needsRefresh) {
    return;
  }

  if (manualUsers.has(normalisedUser)) {
    const message = `Manual session required for ${userIdentifier}. Run: PW_UI_USER=${userIdentifier} yarn ui:session`;
    if (strict) {
      throw new Error(message);
    }
    console.warn(`[ui.session] ${message}`);
    return;
  }
  const releaseLock = await acquireStorageStateLock(storagePath);

  try {
    needsRefresh = await shouldRefreshStorageState(storagePath, baseUrl, {
      ignoreTtl: strict || ignoreTtl,
      validateAuthenticatedState: isStorageStateAuthenticated,
      expectedIdentity
    });
    if (!needsRefresh) {
      return;
    }

    const browser = await chromium.launch();

    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await captureUiStorageState(context, page, userIdentifier, email, password, baseUrl);

      await page
        .locator("exui-header")
        .first()
        .waitFor({ state: "visible", timeout: resolveLoginTimeoutMs() })
        .catch(() => {
          // Proceed even if header is slow to render; cookies are already present.
        });

      await addAnalyticsCookie(context, baseUrl);
      await context.storageState({ path: storagePath });
      writeUiStorageMetadata(storagePath, { userIdentifier, email });
      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    releaseLock();
  }
};

export const resolveUiStorageTtlMinutes = (): number =>
  Math.round(resolveStorageTtlMs() / 60_000);

export const __test__ = {
  migrateLegacyUiStorageStateIfPresent,
  isUiServiceUnavailablePage,
  resolveLegacyUiStoragePathForUser,
  resolveUiLoginTargets,
  shouldRefreshStorageState
};
