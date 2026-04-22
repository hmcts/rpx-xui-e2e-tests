import type { TestInfo } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { UserUtils } from "../../../utils/ui/user.utils.js";

export async function ensureUiSessionOrSkip(
  userIdentifier: string,
  testInfo: TestInfo
): Promise<void> {
  const userUtils = new UserUtils();
  if (!userUtils.hasUserCredentials(userIdentifier)) {
    testInfo.skip(true, `${userIdentifier} credentials not set`);
    return;
  }

  await ensureUiStorageStateForUser(userIdentifier, { strict: true });
}
