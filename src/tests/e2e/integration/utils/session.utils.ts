import fs from "node:fs";
import path from "node:path";

import { SessionUtils } from "@hmcts/playwright-common";
import type { Cookie } from "@playwright/test";

import {
  resolveLegacyUiStoragePathForUser,
  resolveUiStoragePathForUser
} from "../../../../utils/ui/storage-state.utils.js";
import { UserUtils } from "../../../../utils/ui/user.utils.js";

export interface LoadedSession {
  email: string;
  cookies: Cookie[];
  storageFile: string;
}

function findStorageFileByMetadata(userIdentifier: string, storageDir: string): string | undefined {
  if (!fs.existsSync(storageDir)) {
    return undefined;
  }

  const normalisedUserIdentifier = userIdentifier.trim().toUpperCase();
  const candidates = fs.readdirSync(storageDir)
    .filter((fileName) => fileName.endsWith(".meta.json"))
    .map((fileName) => {
      const metadataFile = path.join(storageDir, fileName);
      const storageFile = metadataFile.replace(/\.meta\.json$/, ".json");
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8")) as {
          userIdentifier?: string;
          updatedAt?: string;
        };
        return {
          storageFile,
          updatedAt: metadata.updatedAt ?? "",
          userIdentifier: metadata.userIdentifier?.trim().toUpperCase() ?? "",
        };
      } catch {
        return undefined;
      }
    })
    .filter((candidate): candidate is { storageFile: string; updatedAt: string; userIdentifier: string } =>
      Boolean(candidate && candidate.userIdentifier === normalisedUserIdentifier && fs.existsSync(candidate.storageFile))
    )
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));

  return candidates[0]?.storageFile;
}

function resolveSessionStorageFile(userIdentifier: string, preferredStorageFile: string, legacyStorageFile: string): string {
  if (process.env.PW_UI_STORAGE_PATH?.trim()) {
    return preferredStorageFile;
  }
  if (fs.existsSync(preferredStorageFile)) {
    return preferredStorageFile;
  }
  if (fs.existsSync(legacyStorageFile)) {
    return legacyStorageFile;
  }
  return findStorageFileByMetadata(userIdentifier, path.dirname(preferredStorageFile)) ?? legacyStorageFile;
}

export function loadSessionCookies(userIdentifier: string): LoadedSession {
  const userUtils = new UserUtils();
  const creds = userUtils.getUserCredentials(userIdentifier);
  const preferredStorageFile = resolveUiStoragePathForUser(userIdentifier);
  const legacyStorageFile = resolveLegacyUiStoragePathForUser(userIdentifier);
  const storageFile = resolveSessionStorageFile(userIdentifier, preferredStorageFile, legacyStorageFile);
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

export const __test__ = {
  findStorageFileByMetadata,
  resolveSessionStorageFile,
};
