import path from "node:path";

import { USER_ENV_MAP } from "./user.utils.js";

const baseStorageDir = path.join(process.cwd(), "test-results", "storage-states", "ui");
const defaultStoragePath = path.join(baseStorageDir, "solicitor.json");
export const defaultUiUserIdentifiers = ["SOLICITOR", "STAFF_ADMIN", "JUDGE", "COURT_ADMIN"];
const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);

const toStorageName = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  const normalised = value.trim().toLowerCase();
  if (truthy.has(normalised)) return true;
  if (falsy.has(normalised)) return false;
  return defaultValue;
};

const discoverUsersFromEnv = (): string[] => {
  const configured = Object.keys(USER_ENV_MAP);
  return configured.filter((key) => {
    const mapping = USER_ENV_MAP[key];
    return Boolean(process.env[mapping.username] && process.env[mapping.password]);
  });
};

export const resolveUiUserIdentifiers = (): { identifiers: string[]; strict: boolean } => {
  const usersEnv = process.env.PW_UI_USERS ?? process.env.PW_UI_USER;
  const discovered = discoverUsersFromEnv();
  const orderedDiscovered = [
    ...defaultUiUserIdentifiers.filter((id) => discovered.includes(id)),
    ...discovered.filter((id) => !defaultUiUserIdentifiers.includes(id))
  ];
  const resolved = usersEnv?.trim()
    ? usersEnv
    : orderedDiscovered.join(",");
  const identifiers = resolved
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const fallbackIdentifiers =
    identifiers.length > 0 ? identifiers : defaultUiUserIdentifiers;
  const strict = Boolean(usersEnv?.trim()) || discovered.length > 0;
  return { identifiers: fallbackIdentifiers, strict };
};

const resolveDefaultUserIdentifier = (): string | undefined => {
  const { identifiers } = resolveUiUserIdentifiers();
  return identifiers[0];
};

export const resolveUiStoragePath = (): string | undefined => {
  const override = process.env.PW_UI_STORAGE_PATH;
  if (override?.trim()) return override;
  const usersEnv = process.env.PW_UI_USERS ?? process.env.PW_UI_USER;
  const discovered = discoverUsersFromEnv();
  if (!usersEnv?.trim() && discovered.length === 0) {
    return undefined;
  }
  const defaultUser = resolveDefaultUserIdentifier();
  return resolveUiStoragePathForUser(defaultUser);
};

export const resolveUiStoragePathForUser = (userIdentifier?: string): string => {
  const override = process.env.PW_UI_STORAGE_PATH;
  if (override?.trim()) {
    return override;
  }
  if (!userIdentifier) {
    return defaultStoragePath;
  }
  return path.join(baseStorageDir, `${toStorageName(userIdentifier)}.json`);
};

export const shouldUseUiStorage = (): boolean =>
  parseBoolean(process.env.PW_UI_STORAGE, true);
