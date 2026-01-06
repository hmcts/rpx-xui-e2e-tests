import { type FullConfig } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../utils/ui/session-storage.utils.js";
import { resolveUiUserIdentifiers, shouldUseUiStorage } from "../utils/ui/storage-state.utils.js";

async function globalSetup(config: FullConfig) {
  const hasUiProject = config.projects.some((project) => project.name === "ui");
  if (!hasUiProject) {
    return;
  }
  if (!shouldUseUiStorage()) {
    return;
  }

  const { identifiers: userIdentifiers } = resolveUiUserIdentifiers();
  const hasExplicitUsers = Boolean((process.env.PW_UI_USERS ?? process.env.PW_UI_USER)?.trim());
  const targetUsers = hasExplicitUsers ? userIdentifiers : userIdentifiers.slice(0, 1);
  const strict = hasExplicitUsers;

  for (const userIdentifier of targetUsers) {
    await ensureUiStorageStateForUser(userIdentifier, { strict });
  }
}

export default globalSetup;
