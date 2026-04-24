import { type FullConfig } from "@playwright/test";

import { resolveIntegrationSessionWarmupUsers } from "../tests/integration/helpers/searchCaseSession.helper.js";
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

const resolveRequestedProjectsFromArgv = (): string[] => {
  const requested: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--project") {
      const next = process.argv[index + 1];
      if (next?.trim()) {
        requested.push(...next.split(",").map((value) => value.trim()).filter(Boolean));
      }
      continue;
    }
    if (arg.startsWith("--project=")) {
      requested.push(...arg.replace("--project=", "").split(",").map((value) => value.trim()).filter(Boolean));
    }
  }
  return requested;
};

const shouldBootstrapUiStorageForCurrentRun = (config: FullConfig): boolean => {
  const requestedProjects = resolveRequestedProjectsFromArgv();
  const hasSupportedProject = config.projects.some((project) =>
    ["ui", "integration", "integration-nightly"].includes(project.name)
  );
  if (!hasSupportedProject) {
    return false;
  }

  if (requestedProjects.length === 0) {
    return true;
  }

  return requestedProjects.some((projectName) =>
    ["ui", "integration", "integration-nightly"].includes(projectName)
  );
};

async function globalSetup(config: FullConfig) {
  if (!shouldUseUiStorage() || !shouldBootstrapUiStorageForCurrentRun(config)) {
    return;
  }

  const requestedProjects = resolveRequestedProjectsFromArgv();
  const shouldWarmIntegrationUsers =
    requestedProjects.length === 0 ||
    requestedProjects.includes("integration") ||
    requestedProjects.includes("integration-nightly");
  const shouldWarmUiUsers =
    requestedProjects.length === 0 || requestedProjects.includes("ui");

  const targetUsers = new Set<string>();
  const { identifiers: userIdentifiers, strict: strictFromConfig } = resolveUiUserIdentifiers();
  const hasExplicitUsers = Boolean((process.env.PW_UI_USERS ?? process.env.PW_UI_USER)?.trim());
  const uiUsers = hasExplicitUsers ? userIdentifiers : userIdentifiers.slice(0, 1);
  if (shouldWarmUiUsers) {
    for (const userIdentifier of uiUsers) {
      targetUsers.add(userIdentifier);
    }
  }
  if (shouldWarmIntegrationUsers) {
    for (const userIdentifier of resolveIntegrationSessionWarmupUsers()) {
      targetUsers.add(userIdentifier);
    }
  }

  const strict = resolveStrictOverride(process.env.PW_UI_STORAGE_STRICT, strictFromConfig || shouldWarmIntegrationUsers);

  for (const userIdentifier of targetUsers) {
    await ensureUiStorageStateForUser(userIdentifier, { strict });
  }
}

export default globalSetup;
