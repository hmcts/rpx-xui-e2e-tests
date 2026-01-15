import fs from "node:fs";

import { SessionUtils } from "@hmcts/playwright-common";
import type { Cookie } from "@playwright/test";

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
