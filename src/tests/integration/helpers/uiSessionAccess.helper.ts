import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { UserUtils } from "../../../utils/ui/user.utils.js";

export async function ensureUiSessionAccess(
  userIdentifier: string,
  _testInfo: unknown,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  void env;
  const userUtils = new UserUtils();
  if (!userUtils.hasUserCredentials(userIdentifier)) {
    throw new Error(`${userIdentifier} credentials not set`);
  }

  await ensureUiStorageStateForUser(userIdentifier, { strict: true });
}
