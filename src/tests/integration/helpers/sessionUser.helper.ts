import type { Page } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { extractUserIdFromCookies } from "../../e2e/integration/utils/extractUserIdFromCookies.js";
import { loadSessionCookies } from "../../e2e/integration/utils/session.utils.js";

type SessionCookie = { name: string; value: string };
type AppliedSessionCookies = { cookies: SessionCookie[] };

type SessionUserOptions = {
  fallbackUserId?: string;
};

export async function applySessionCookies(
  page: Page,
  userIdentifier: string
): Promise<AppliedSessionCookies> {
  await ensureUiStorageStateForUser(userIdentifier, { strict: true });
  const loadedSession = loadSessionCookies(userIdentifier);
  await page.context().addCookies(loadedSession.cookies);
  return { cookies: loadedSession.cookies };
}

export async function resolveSessionUserId(
  page: Page,
  userIdentifier: string,
  applyCookies: (page: Page, userIdentifier: string) => Promise<AppliedSessionCookies>,
  options: SessionUserOptions = {}
): Promise<string> {
  const { cookies } = await applyCookies(page, userIdentifier);
  const userId = extractUserIdFromCookies(cookies);

  if (userId) {
    return userId;
  }

  if (options.fallbackUserId) {
    return options.fallbackUserId;
  }

  throw new Error(`Expected session for ${userIdentifier} to include __userid__ cookie.`);
}

export async function applySessionCookiesAndExtractUserId(
  page: Page,
  userIdentifier: string,
  options: SessionUserOptions = {}
): Promise<string> {
  return resolveSessionUserId(page, userIdentifier, applySessionCookies, options);
}
