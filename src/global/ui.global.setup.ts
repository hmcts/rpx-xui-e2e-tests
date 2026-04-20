import { type FullConfig } from "@playwright/test";

import { ensureUiStorageStateForUser } from "../utils/ui/session-storage.utils.js";
import { resolveUiUserIdentifiers, shouldUseUiStorage } from "../utils/ui/storage-state.utils.js";

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);

const resolveStrictOverride = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (truthy.has(normalised)) return true;
  if (falsy.has(normalised)) return false;
  return fallback;
};

async function globalSetup(config: FullConfig) {
  const hasUiProject = config.projects.some((project) => project.name === "ui");
  if (!hasUiProject) {
    return;
  }
  if (!shouldUseUiStorage()) {
    return;
  }

  const { identifiers: userIdentifiers, strict: strictFromConfig } = resolveUiUserIdentifiers();
  const hasExplicitUsers = Boolean((process.env.PW_UI_USERS ?? process.env.PW_UI_USER)?.trim());
  const targetUsers = hasExplicitUsers ? userIdentifiers : userIdentifiers.slice(0, 1);
  const strict = resolveStrictOverride(process.env.PW_UI_STORAGE_STRICT, strictFromConfig);

  for (const userIdentifier of targetUsers) {
    await ensureUiStorageStateForUser(userIdentifier, { strict });
  }
}

export default globalSetup;
