import fs from "node:fs";
import path from "node:path";

import { IdamPage, createLogger } from "@hmcts/playwright-common";
import {
  chromium,
  request,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { acquireFileLock } from "../file-lock.utils.js";

import config from "./config.utils.js";
import { decodeJwtPayload } from "./jwt.utils.js";
import { resolveUiStoragePathForUser } from "./storage-state.utils.js";
import { UserUtils } from "./user.utils.js";

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
  serviceName: "ui-session-storage",
  format: resolveLoggerFormat(),
});

const redactSensitiveForLogs = (value: string): string =>
  value
    .replace(
      /([?&](?:code|token|state|password|secret)=)[^&#]+/gi,
      "$1[REDACTED]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b\d{12,}\b/g, "[REDACTED_ID]");

const sanitizeUrlForLogs = (urlValue: string): string => {
  try {
    const parsed = new URL(urlValue);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return urlValue.replace(/[?#].*$/, "");
  }
};

const sanitizeTextForLogs = (value: string): string =>
  redactSensitiveForLogs(value).replace(/\s+/g, " ").trim();

const sanitizeUserIdentifierForLogs = (value: string): string =>
  sanitizeTextForLogs(value);

const sanitizeStoragePathForLogs = (value: string): string =>
  sanitizeTextForLogs(value);

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

const resolveManualUserIdentifiers = (): Set<string> => {
  const raw =
    process.env.PW_UI_MANUAL_USERS ?? process.env.PW_UI_MANUAL_USER ?? "";
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
    const authCookie = cookies.find(
      (cookie: { name?: string; value?: string }) =>
        cookie?.name === "__auth__",
    );
    if (!authCookie?.value) return undefined;
    const payload = decodeJwtPayload(authCookie.value);
    const subject = payload?.email ?? payload?.subname ?? payload?.sub;
    return typeof subject === "string" && subject.trim() ? subject : undefined;
  } catch {
    return undefined;
  }
};

const normalizeUserValue = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
};

const isEmailLike = (value: string | undefined): boolean =>
  Boolean(value && value.includes("@"));

const storageStateMatchesUser = (
  storagePath: string,
  expectedEmail: string,
): boolean => {
  const expected = normalizeUserValue(expectedEmail);
  if (!expected) return true;
  const actual = normalizeUserValue(readStorageStateSubject(storagePath));
  if (!actual) return false;
  if (!isEmailLike(actual)) {
    return false;
  }
  return actual === expected;
};

const waitForIdamLogin = async (page: Page) => {
  const idamHost = resolveIdamHost();
  if (idamHost) {
    await page
      .waitForURL((url) => url.hostname === idamHost, {
        timeout: resolveLoginTimeoutMs(),
      })
      .catch(() => {
        // Continue to selector wait even if hostname check times out.
      });
  }

  const usernameInput = page.locator(
    'input#username, input[name="username"], input[type="email"], input#email, input[name="email"], input[name="emailAddress"], input[autocomplete="email"]',
  );
  const passwordInput = page.locator(
    'input#password, input[name="password"], input[type="password"]',
  );
  const submitButton = page.locator('[name="save"], button[type="submit"]');
  const appReady = page.locator("exui-header, exui-case-home");
  const timeoutMs = resolveLoginTimeoutMs();

  const outcome = await Promise.race([
    usernameInput
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs })
      .then(() => "login"),
    appReady
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs })
      .then(() => "app"),
  ]).catch(() => null);

  if (outcome === "app") {
    return null;
  }

  if (outcome !== "login") {
    const failure = await describeLoginFailure(page);
    const details = failure ? ` ${failure}` : "";
    throw new Error(
      `Login page did not render.${details} URL=${sanitizeUrlForLogs(page.url())}`,
    );
  }

  return { usernameInput, passwordInput, submitButton };
};

const describeLoginFailure = async (
  page: Page,
): Promise<string | undefined> => {
  const errorSelectors = [
    ".govuk-error-summary",
    ".error-summary",
    ".govuk-error-message",
    ".error-message",
    "[role='alert']",
  ];
  for (const selector of errorSelectors) {
    const locator = page.locator(selector);
    if (
      await locator
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      const text = (
        await locator
          .first()
          .innerText()
          .catch(() => "")
      )?.trim();
      if (text) {
        return `Login page error: ${sanitizeTextForLogs(text).slice(0, 300)}`;
      }
    }
  }
  return undefined;
};

const hasRequiredAuthCookies = (cookies: { name: string }[]) => {
  const names = new Set(cookies.map((cookie) => cookie.name));
  return names.has("Idam.Session") && names.has("__auth__");
};

const hasExpiredAuthCookies = (
  cookies: { name: string; expires: number }[],
) => {
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
  options?: { ignoreTtl?: boolean },
): Promise<{ needsRefresh: boolean; reason: string }> => {
  if (!fs.existsSync(storagePath)) {
    return { needsRefresh: true, reason: "missing-storage" };
  }
  try {
    const state = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    const cookies = Array.isArray(state.cookies) ? state.cookies : [];
    if (!hasRequiredAuthCookies(cookies)) {
      return { needsRefresh: true, reason: "missing-required-auth-cookies" };
    }
    if (hasExpiredAuthCookies(cookies)) {
      return { needsRefresh: true, reason: "expired-auth-cookies" };
    }
  } catch {
    return { needsRefresh: true, reason: "corrupted-storage-state" };
  }

  if (options?.ignoreTtl) {
    const stillAuthenticated = await isStorageStateAuthenticated(
      storagePath,
      baseUrl,
    );
    return stillAuthenticated
      ? { needsRefresh: false, reason: "manual-session-authenticated" }
      : { needsRefresh: true, reason: "manual-session-invalid" };
  }

  const ttlMs = resolveStorageTtlMs();
  if (ttlMs <= 0) {
    return { needsRefresh: true, reason: "ttl-disabled" };
  }
  const ageMs = (() => {
    try {
      return Date.now() - fs.statSync(storagePath).mtimeMs;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  })();
  if (ageMs <= ttlMs) {
    return { needsRefresh: false, reason: "ttl-fresh" };
  }

  const stillAuthenticated = await isStorageStateAuthenticated(
    storagePath,
    baseUrl,
  );
  return stillAuthenticated
    ? { needsRefresh: false, reason: "stale-but-authenticated" }
    : { needsRefresh: true, reason: "stale-and-unauthenticated" };
};

const waitForAuthCookies = async (
  context: BrowserContext,
  page: Page,
  timeoutMs = resolveLoginTimeoutMs(),
): Promise<{ ok: boolean; reason?: string }> => {
  const deadline = Date.now() + timeoutMs;
  const loginInput = page.locator(
    'input#username, input[name="username"], input[type="email"]',
  );
  while (Date.now() < deadline) {
    const cookies = await context.cookies();
    if (hasRequiredAuthCookies(cookies)) {
      return { ok: true };
    }
    if (
      await loginInput
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      const failure = await describeLoginFailure(page);
      if (failure) {
        return { ok: false, reason: failure };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { ok: false, reason: "Timed out waiting for auth cookies." };
};

const addAnalyticsCookie = async (context: BrowserContext, baseUrl: string) => {
  const cookies = await context.cookies();
  const userId = cookies.find((cookie) => cookie.name === "__userid__")?.value;
  if (!userId) return;

  let domain: string;
  let secure = false;
  try {
    const parsed = new URL(baseUrl);
    domain = parsed.hostname;
    secure = parsed.protocol === "https:";
  } catch {
    logger.warn("ui:session:analytics-cookie-skipped", {
      reason: "invalid-base-url",
      baseUrl: sanitizeUrlForLogs(baseUrl),
    });
    return;
  }
  await context.addCookies([
    {
      name: `hmcts-exui-cookies-${userId}-mc-accepted`,
      value: "true",
      domain,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure,
      sameSite: "Lax",
    },
  ]);
};

const writeStorageStateAtomically = async (
  context: BrowserContext,
  storagePath: string,
): Promise<void> => {
  const tmpPath = `${storagePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await context.storageState({ path: tmpPath });
    fs.renameSync(tmpPath, storagePath);
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
  }
};

const resolveAuthBaseUrl = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl.replace(/\/cases.*$/, "");
  }
};

const isStorageStateAuthenticated = async (
  storagePath: string,
  baseUrl: string,
): Promise<boolean> => {
  if (!fs.existsSync(storagePath)) return false;
  const authBaseUrl = resolveAuthBaseUrl(baseUrl);
  try {
    const context = await request.newContext({
      baseURL: authBaseUrl.replace(/\/+$/, ""),
      ignoreHTTPSErrors: true,
      storageState: storagePath,
    });
    const res = await context.get("auth/isAuthenticated", {
      failOnStatusCode: false,
    });
    const ok = res.status() === 200;
    const data = ok ? await res.json().catch(() => null) : null;
    await context.dispose();
    return ok && data === true;
  } catch {
    return false;
  }
};

type RefreshDecision = { needsRefresh: boolean; reason: string };
type UserCredentials = { email: string; password: string };
type ExpectedCredentials = {
  expectedEmail?: string;
  expectedPassword?: string;
};

const removeStorageState = (storagePath: string): void => {
  if (fs.existsSync(storagePath)) {
    fs.unlinkSync(storagePath);
  }
};

const resolveExpectedCredentials = (
  userUtils: UserUtils,
  userIdentifier: string,
): ExpectedCredentials => {
  try {
    const { email, password } = userUtils.getUserCredentials(userIdentifier);
    return { expectedEmail: email, expectedPassword: password };
  } catch {
    return {};
  }
};

const resolveRefreshDecisionForUser = async (
  storagePath: string,
  baseUrl: string,
  ignoreTtl: boolean,
  expectedEmail: string | undefined,
): Promise<RefreshDecision> => {
  const refreshDecision = await shouldRefreshStorageState(
    storagePath,
    baseUrl,
    {
      ignoreTtl,
    },
  );
  if (expectedEmail && !storageStateMatchesUser(storagePath, expectedEmail)) {
    return {
      needsRefresh: true,
      reason: "storage-user-mismatch",
    };
  }
  return refreshDecision;
};

const resolveCredentialsForLogin = (
  userUtils: UserUtils,
  userIdentifier: string,
  expected: ExpectedCredentials,
  strict: boolean,
): UserCredentials | undefined => {
  const userForLog = sanitizeUserIdentifierForLogs(userIdentifier);
  if (expected.expectedEmail && expected.expectedPassword) {
    return {
      email: expected.expectedEmail,
      password: expected.expectedPassword,
    };
  }

  try {
    const { email, password } = userUtils.getUserCredentials(userIdentifier);
    if (!email || !password) {
      if (strict) {
        throw new Error(`Missing credentials for ${userForLog}.`);
      }
      logger.warn("ui:session:skip-missing-credentials", {
        user: userForLog,
      });
      return undefined;
    }
    return { email, password };
  } catch (error) {
    if (strict) {
      throw error;
    }
    const message =
      error instanceof Error
        ? sanitizeTextForLogs(error.message)
        : "missing credentials";
    logger.warn("ui:session:skip-login", {
      user: userForLog,
      reason: message,
    });
    return undefined;
  }
};

const createAndPersistSessionState = async (
  userIdentifier: string,
  storagePath: string,
  baseUrl: string,
  credentials: UserCredentials,
  strict: boolean,
): Promise<void> => {
  const userForLog = sanitizeUserIdentifierForLogs(userIdentifier);
  const browser = await chromium.launch();
  try {
    // Never inherit test-level storageState while generating a fresh user session.
    const context = await browser.newContext({ storageState: undefined });
    try {
      const page = await context.newPage();
      const idamPage = new IdamPage(page);

      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const loginFields = await waitForIdamLogin(page);

      if (loginFields) {
        if (await idamPage.usernameInput.isVisible().catch(() => false)) {
          await idamPage.login({
            username: credentials.email,
            password: credentials.password,
          });
        } else {
          await loginFields.usernameInput.fill(credentials.email);
          await loginFields.passwordInput.fill(credentials.password);
          await loginFields.submitButton.click();
        }
      }

      const loginOutcome = await waitForAuthCookies(context, page);
      if (!loginOutcome.ok) {
        removeStorageState(storagePath);
        const reason = sanitizeTextForLogs(
          loginOutcome.reason ?? "Login failure.",
        );
        const url = sanitizeUrlForLogs(page.url());
        const message = `Login did not establish session cookies for ${userForLog}. ${reason} URL=${url}`;
        if (strict) {
          throw new Error(message);
        }
        logger.warn("ui:session:login-failed", {
          user: userForLog,
          reason,
          url,
        });
        return;
      }

      await page
        .locator("exui-header")
        .first()
        .waitFor({ state: "visible", timeout: resolveLoginTimeoutMs() })
        .catch(() => {
          // Proceed even if header is slow to render; cookies are already present.
        });

      await addAnalyticsCookie(context, baseUrl);
      await writeStorageStateAtomically(context, storagePath);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
};

export const ensureUiStorageStateForUser = async (
  userIdentifier: string,
  options?: { strict?: boolean },
): Promise<void> => {
  const baseUrl = config.urls.manageCaseBaseUrl;
  const strict = options?.strict ?? false;
  const storagePath = resolveUiStoragePathForUser(userIdentifier);
  const userForLog = sanitizeUserIdentifierForLogs(userIdentifier);
  const storagePathForLog = sanitizeStoragePathForLogs(storagePath);
  const lockPath = `${storagePath}.lock`;
  const manualUsers = resolveManualUserIdentifiers();
  const normalisedUser = userIdentifier.trim().toUpperCase();
  const ignoreTtl = manualUsers.has(normalisedUser);
  const userUtils = new UserUtils();
  const expectedCredentials = resolveExpectedCredentials(
    userUtils,
    userIdentifier,
  );

  let refreshDecision = await resolveRefreshDecisionForUser(
    storagePath,
    baseUrl,
    ignoreTtl,
    expectedCredentials.expectedEmail,
  );

  if (!refreshDecision.needsRefresh) {
    logger.info("ui:session:reuse", {
      user: userForLog,
      storagePath: storagePathForLog,
      reason: refreshDecision.reason,
    });
    return;
  }

  logger.info("ui:session:refresh", {
    user: userForLog,
    storagePath: storagePathForLog,
    reason: refreshDecision.reason,
  });

  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  const releaseLock = await acquireFileLock(lockPath, {
    retries: 30,
    retryDelayMs: 1_000,
    maxRetryDelayMs: 5_000,
    staleMs: 10 * 60_000,
  });

  try {
    refreshDecision = await resolveRefreshDecisionForUser(
      storagePath,
      baseUrl,
      ignoreTtl,
      expectedCredentials.expectedEmail,
    );

    if (!refreshDecision.needsRefresh) {
      logger.info("ui:session:reuse-after-lock", {
        user: userForLog,
        storagePath: storagePathForLog,
        reason: refreshDecision.reason,
      });
      return;
    }

    if (manualUsers.has(normalisedUser)) {
      const message =
        "Manual session required. Run: PW_UI_USER=<user> yarn ui:session";
      if (strict) {
        throw new Error(message);
      }
      logger.warn("ui:session:manual-required", {
        user: userForLog,
        reason: "manual-session-configured",
      });
      return;
    }

    const credentials = resolveCredentialsForLogin(
      userUtils,
      userIdentifier,
      expectedCredentials,
      strict,
    );
    if (!credentials) {
      return;
    }

    if (
      expectedCredentials.expectedEmail &&
      !storageStateMatchesUser(storagePath, expectedCredentials.expectedEmail)
    ) {
      removeStorageState(storagePath);
    }

    await createAndPersistSessionState(
      userIdentifier,
      storagePath,
      baseUrl,
      credentials,
      strict,
    );
  } finally {
    await releaseLock().catch((error: unknown) => {
      logger.warn("ui:session:lock-release-failed", {
        user: userForLog,
        reason:
          error instanceof Error
            ? sanitizeTextForLogs(error.message)
            : sanitizeTextForLogs(String(error)),
      });
    });
  }
};

export const resolveUiStorageTtlMinutes = (): number =>
  Math.round(resolveStorageTtlMs() / 60_000);
