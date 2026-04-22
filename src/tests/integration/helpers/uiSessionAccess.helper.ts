import type { TestInfo } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { UserUtils } from "../../../utils/ui/user.utils.js";

const truthy = new Set(["1", "true", "yes", "on"]);

export function resolveAllowMissingUiCredsSkip(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.CI) {
    return false;
  }
  const raw = env.PW_ALLOW_MISSING_UI_CREDS_SKIP?.trim().toLowerCase();
  return raw ? truthy.has(raw) : false;
}

export async function ensureUiSessionAccess(
  userIdentifier: string,
  testInfo: TestInfo,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const userUtils = new UserUtils();
  if (!userUtils.hasUserCredentials(userIdentifier)) {
    if (resolveAllowMissingUiCredsSkip(env)) {
      testInfo.skip(true, `${userIdentifier} credentials not set`);
      return;
    }
    throw new Error(`${userIdentifier} credentials not set`);
  }

  await ensureUiStorageStateForUser(userIdentifier, { strict: true });
}
