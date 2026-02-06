import fs from "node:fs";

import { SessionUtils } from "@hmcts/playwright-common";
import type { Cookie, Page } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../../../../utils/ui/session-storage.utils.js";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";
import { UserUtils } from "../../../../utils/ui/user.utils.js";

export interface LoadedSession {
  email: string;
  cookies: Cookie[];
  storageFile: string;
}

export function loadSessionCookies(userIdentifier: string): LoadedSession {
  const userUtils = new UserUtils();
  const creds = userUtils.getUserCredentials(userIdentifier);
  const storageFile = resolveUiStoragePathForUser(userIdentifier);
  let cookies: Cookie[] = [];

  if (fs.existsSync(storageFile)) {
    try {
      cookies = SessionUtils.getCookies(storageFile);
    } catch {
      // no-op: tests will proceed without session cookies
    }
  }

  return { email: creds.email, cookies, storageFile };
}

export async function ensureSessionCookies(
  userIdentifier: string,
  options?: { strict?: boolean },
): Promise<LoadedSession> {
  await ensureUiStorageStateForUser(userIdentifier, {
    strict: options?.strict ?? true,
  });
  return loadSessionCookies(userIdentifier);
}

export async function applyCookiesToPage(
  page: Page,
  cookies: Cookie[],
): Promise<void> {
  if (!cookies.length) {
    return;
  }
  await page.context().addCookies(cookies);
}
