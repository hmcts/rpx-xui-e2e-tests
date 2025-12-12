import { promises as fs } from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import { resolveConfig } from "./config.js";
import { UserUtils } from "./user.js";
import type { UserConfig } from "./config.js";

const storagePromises = new Map<string, Promise<string>>();

export function hasUiCreds(): boolean {
  return Boolean(
    process.env.TEST_USERS_JSON ||
      ((process.env.UI_USERNAME || process.env.API_USERNAME || process.env.IDAM_USERNAME) &&
        (process.env.UI_PASSWORD || process.env.API_PASSWORD || process.env.IDAM_PASSWORD))
  );
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function extractCsrf(html: string): string | undefined {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/i);
  return match?.[1];
}

function resolveCredentials(userIdentifier: string): UserConfig {
  const userUtils = new UserUtils();
  try {
    return userUtils.getUserCredentials(userIdentifier);
  } catch (error) {
    const username = process.env.UI_USERNAME ?? process.env.API_USERNAME ?? process.env.IDAM_USERNAME;
    const password = process.env.UI_PASSWORD ?? process.env.API_PASSWORD ?? process.env.IDAM_PASSWORD;
    if (username && password) {
      return { username, password, sessionFile: undefined, cookieName: "xui-webapp" };
    }
    throw new Error(
      `No credentials found for user "${userIdentifier}". Provide TEST_USERS_JSON or UI_USERNAME/UI_PASSWORD env vars. (${(error as Error).message})`
    );
  }
}

async function createStorageState(userIdentifier: string): Promise<string> {
  const cfg = resolveConfig();
  const baseUrl = stripTrailingSlash(cfg.baseUrl);
  const user = resolveCredentials(userIdentifier);
  const storagePath = path.join(cfg.sessionDir, cfg.environment, `${userIdentifier}.json`);
  await fs.mkdir(path.dirname(storagePath), { recursive: true });

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
      username: user.username,
      password: user.password,
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
    return storagePath;
  } catch (error) {
    throw new Error(`Failed to create storage state for "${userIdentifier}": ${(error as Error).message}`);
  } finally {
    await context.dispose();
  }
}

export async function ensureStorageState(userIdentifier: string): Promise<string> {
  if (!storagePromises.has(userIdentifier)) {
    storagePromises.set(userIdentifier, createStorageState(userIdentifier));
  }
  try {
    return await storagePromises.get(userIdentifier)!;
  } catch (error) {
    storagePromises.delete(userIdentifier);
    throw error;
  }
}
