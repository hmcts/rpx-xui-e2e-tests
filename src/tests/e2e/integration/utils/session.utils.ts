import fs from "node:fs";

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
      const state = JSON.parse(fs.readFileSync(storageFile, "utf8"));
      if (Array.isArray(state.cookies)) {
        cookies = state.cookies.filter(
          (cookie: Partial<Cookie>): cookie is Cookie =>
            typeof cookie?.name === "string" && typeof cookie?.value === "string"
        );
      }
    } catch {
      // no-op: tests will proceed without session cookies
    }
  }

  return { email: creds.email, cookies, storageFile };
}
