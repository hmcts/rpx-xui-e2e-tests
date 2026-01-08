import { promises as fs } from "node:fs";
import path from "node:path";

import { IdamUtils, ServiceAuthUtils, createLogger } from "@hmcts/playwright-common";
import { request } from "@playwright/test";

import { config } from "../config/api";
type UsersConfig = typeof config.users[keyof typeof config.users];
export type ApiUserRole = (keyof UsersConfig) & string;

const baseUrl = stripTrailingSlash(config.baseUrl);
const storageRoot = path.resolve(process.cwd(), "test-results", "storage-states", "api");
const storagePromises = new Map<string, Promise<string>>();

const mask = (value?: string) => (value ? "***" : "missing");
const present = (value?: string) => (value && value.trim().length > 0 ? "yes" : "no");

const logger = createLogger({ serviceName: "node-api-auth", format: "pretty" });

export async function ensureStorageState(role: ApiUserRole): Promise<string> {
  const cacheKey = getCacheKey(role);
  if (!storagePromises.has(cacheKey)) {
    storagePromises.set(cacheKey, createStorageState(role));
  }
  const storagePath = await storagePromises.get(cacheKey)!;
  const state = await tryReadState(storagePath);
  if (!state) {
    try {
      await fs.unlink(storagePath);
    } catch {
      // ignore unlink errors
    }
    storagePromises.set(cacheKey, createStorageState(role));
    return storagePromises.get(cacheKey)!;
  }
  return storagePath;
}

export async function getStoredCookie(
  role: ApiUserRole,
  cookieName: string,
  url?: string
): Promise<string | undefined> {
  let storagePath = await ensureStorageState(role);
  let state = await tryReadState(storagePath);

  if (!state) {
    storagePromises.delete(getCacheKey(role));
    storagePath = await ensureStorageState(role);
    state = await tryReadState(storagePath);
  }

  if (!state) {
    throw new Error(`Unable to read storage state for role "${role}".`);
  }

  const hostname = url ? new URL(url).hostname : undefined;
  const cookie = Array.isArray(state.cookies)
    ? state.cookies.find((c: { name?: string; domain?: string }) => {
        if (c.name !== cookieName) return false;
        if (!hostname) return true;
        const domain = c.domain?.replace(/^\./, "");
        return domain ? hostname === domain || hostname.endsWith(`.${domain}`) : false;
      })
    : undefined;
  return cookie?.value;
}

async function createStorageState(role: ApiUserRole): Promise<string> {
  const storagePath = path.join(storageRoot, config.testEnv, `${role}.json`);
  await fs.mkdir(path.dirname(storagePath), { recursive: true });

  const credentials = getCredentials(role);
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

  if (isTokenBootstrapAvailable()) {
    const tokenLoginSucceeded = await tryTokenBootstrap(role, credentials, storagePath);
    if (tokenLoginSucceeded) {
      return storagePath;
    }
  }

  await createStorageStateViaForm(credentials, storagePath, role);
  return storagePath;
}

async function tryTokenBootstrap(
  role: ApiUserRole,
  credentials: { username: string; password: string },
  storagePath: string
): Promise<boolean> {
  const clientId = process.env.IDAM_CLIENT_ID ?? process.env.SERVICES_IDAM_CLIENT_ID ?? "xuiwebapp";
  const clientSecret = process.env.IDAM_SECRET;
  const scope = process.env.IDAM_OAUTH2_SCOPE ?? "openid profile roles manage-user search-user";
  const microservice = process.env.S2S_MICROSERVICE_NAME ?? process.env.MICROSERVICE ?? "xui_webapp";
  const idamWebUrl = process.env.IDAM_WEB_URL;
  const idamTestingSupportUrl = process.env.IDAM_TESTING_SUPPORT_URL;
  const s2sUrl = process.env.S2S_URL;

  if (!clientSecret || !idamWebUrl || !idamTestingSupportUrl || !s2sUrl) {
    logger.warn(
      `token bootstrap skipped: missing envs (IDAM_SECRET=${present(clientSecret)}, IDAM_WEB_URL=${present(
        idamWebUrl
      )}, IDAM_TESTING_SUPPORT_URL=${present(idamTestingSupportUrl)}, S2S_URL=${present(s2sUrl)})`
    );
    return false;
  }

  const idamUtils = new IdamUtils({ logger });
  const serviceAuthUtils = new ServiceAuthUtils({ logger });

  let context;
  try {
    const accessToken = await idamUtils.generateIdamToken({
      grantType: "password",
      clientId,
      clientSecret,
      scope,
      username: credentials.username,
      password: credentials.password,
      redirectUri: process.env.IDAM_RETURN_URL ?? `${baseUrl}/oauth2/callback`
    });
    const serviceToken = await serviceAuthUtils.retrieveToken({ microservice });

    context = await request.newContext({
      baseURL: baseUrl,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        Authorization: `Bearer ${accessToken}`,
        ServiceAuthorization: `Bearer ${serviceToken}`
      }
    });

    await context.get("auth/login", { failOnStatusCode: false });
    const authCheck = await context.get("auth/isAuthenticated", { failOnStatusCode: false });
    const isAuth = authCheck.status() === 200 ? await authCheck.json().catch(() => false) : false;

    await context.storageState({ path: storagePath });
    const state = await tryReadState(storagePath);
    const hasCookies = Array.isArray(state?.cookies) && state.cookies.length > 0;

    if (isAuth && hasCookies) {
      return true;
    }
    logger.warn(
      `Token bootstrap for role "${role}" returned isAuthenticated=${String(isAuth)}; falling back to form login`
    );
    return false;
  } catch (error) {
    logger.warn(`Token bootstrap failed for role "${role}": ${(error as Error).message}`);
    return false;
  } finally {
    await context?.dispose();
  }
}

async function createStorageStateViaForm(
  credentials: { username: string; password: string },
  storagePath: string,
  role: ApiUserRole
): Promise<void> {
  const context = await request.newContext({
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
    const csrfToken = extractCsrf(await loginPage.text());
    const formPayload: Record<string, string> = {
      username: credentials.username,
      password: credentials.password,
      save: "Sign in"
    };
    if (csrfToken) {
      formPayload._csrf = csrfToken;
    }

    const loginResponse = await context.post(loginUrl, { form: formPayload });
    if (loginResponse.status() >= 400) {
      throw new Error(`POST ${loginUrl} responded with ${loginResponse.status()}`);
    }

    await context.get("/");
    await context.storageState({ path: storagePath });
  } catch (error) {
    throw new Error(`Failed to login as ${role}: ${(error as Error).message}`);
  } finally {
    await context.dispose();
  }
}

function getCredentials(role: ApiUserRole): { username: string; password: string } {
  const envUsers = config.users[config.testEnv as keyof typeof config.users];
  const userConfig = envUsers?.[role];
  if (!userConfig) {
    throw new Error(`No credentials configured for role "${role}" in environment "${config.testEnv}"`);
  }

  return {
    username: userConfig.e ?? "",
    password: userConfig.sec ?? ""
  };
}

function extractCsrf(html: string): string | undefined {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/i);
  return match?.[1];
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function getCacheKey(role: ApiUserRole): string {
  return `${config.testEnv}-${role}`;
}

type StoredCookie = { name?: string; value?: string };

async function tryReadState(storagePath: string): Promise<{ cookies?: Array<StoredCookie> } | undefined> {
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

function isTokenBootstrapAvailable(): boolean {
  const hasIdamEnv = !!process.env.IDAM_SECRET && !!process.env.IDAM_WEB_URL && !!process.env.IDAM_TESTING_SUPPORT_URL;
  const hasS2S = !!process.env.S2S_URL;
  return hasIdamEnv && hasS2S;
}
