import fs from "node:fs";
import path from "node:path";

import { IdamPage } from "@hmcts/playwright-common";
import { chromium, request, type BrowserContext, type Page } from "@playwright/test";

import config from "./config.utils.js";
import { resolveUiStoragePathForUser } from "./storage-state.utils.js";
import { UserUtils } from "./user.utils.js";
import { decodeJwtPayload } from "./jwt.utils.js";

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
    const authCookie = cookies.find((cookie) => cookie?.name === "__auth__");
    if (!authCookie?.value) return undefined;
    const payload = decodeJwtPayload(authCookie.value);
    const subject = payload?.sub ?? payload?.subname ?? payload?.email;
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

const waitForIdamLogin = async (page: Page) => {
  const idamHost = resolveIdamHost();
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
  options?: { ignoreTtl?: boolean }
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

  if (options?.ignoreTtl) return false;
  const ttlMs = resolveStorageTtlMs();
  if (ttlMs <= 0) return true;
  const ageMs = Date.now() - fs.statSync(storagePath).mtimeMs;
  if (ageMs <= ttlMs) return false;

  const stillAuthenticated = await isStorageStateAuthenticated(storagePath, baseUrl);
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

const addAnalyticsCookie = async (context: BrowserContext, baseUrl: string) => {
  const cookies = await context.cookies();
  const userId = cookies.find((cookie) => cookie.name === "__userid__")?.value;
  if (!userId) return;

  const domain = new URL(baseUrl).hostname;
  const secure = baseUrl.startsWith("https://");
  await context.addCookies([
    {
      name: `hmcts-exui-cookies-${userId}-mc-accepted`,
      value: "true",
      domain,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure,
      sameSite: "Lax"
    }
  ]);
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
  options?: { strict?: boolean }
): Promise<void> => {
  const baseUrl = config.urls.manageCaseBaseUrl;
  const strict = options?.strict ?? false;
  const storagePath = resolveUiStoragePathForUser(userIdentifier);
  const manualUsers = resolveManualUserIdentifiers();
  const normalisedUser = userIdentifier.trim().toUpperCase();

  const ignoreTtl = manualUsers.has(normalisedUser);
  let expectedEmail: string | undefined;
  let expectedPassword: string | undefined;
  const userUtils = new UserUtils();
  try {
    ({ email: expectedEmail, password: expectedPassword } = userUtils.getUserCredentials(userIdentifier));
  } catch {
    // If creds are missing, we'll surface this later when we need to login.
  }

  let needsRefresh = await shouldRefreshStorageState(storagePath, baseUrl, {
    ignoreTtl
  });
  if (expectedEmail && !storageStateMatchesUser(storagePath, expectedEmail)) {
    needsRefresh = true;
  }

  if (!needsRefresh) {
    return;
  }

  if (expectedEmail && !storageStateMatchesUser(storagePath, expectedEmail)) {
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
  }

  if (manualUsers.has(normalisedUser)) {
    const message = `Manual session required for ${userIdentifier}. Run: PW_UI_USER=${userIdentifier} yarn ui:session`;
    if (strict) {
      throw new Error(message);
    }
    console.warn(`[ui.session] ${message}`);
    return;
  }

  let email = expectedEmail;
  let password = expectedPassword;
  if (!email || !password) {
    try {
      ({ email, password } = userUtils.getUserCredentials(userIdentifier));
    } catch (error) {
      if (strict) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "missing credentials";
      console.warn(`[ui.session] Skipping ${userIdentifier}: ${message}`);
      return;
    }
  }
  if (!email || !password) {
    if (strict) {
      throw new Error(`Missing credentials for ${userIdentifier}.`);
    }
    console.warn(`[ui.session] Skipping ${userIdentifier}: missing credentials.`);
    return;
  }

  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const idamPage = new IdamPage(page);

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
      const message = `Login did not establish session cookies for ${userIdentifier}. ${loginOutcome.reason ?? "Login failure."} URL=${page.url()}`;
      if (strict) {
        throw new Error(message);
      }
      console.warn(`[ui.session] ${message}`);
      await context.close();
      return;
    }

    await page.waitForSelector("exui-header", { timeout: resolveLoginTimeoutMs() }).catch(() => {
      // Proceed even if header is slow to render; cookies are already present.
    });

    await addAnalyticsCookie(context, baseUrl);
    await context.storageState({ path: storagePath });
    await context.close();
  } finally {
    await browser.close();
  }
};

export const resolveUiStorageTtlMinutes = (): number =>
  Math.round(resolveStorageTtlMs() / 60_000);
