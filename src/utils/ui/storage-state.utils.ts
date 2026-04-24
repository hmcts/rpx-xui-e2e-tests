import fs from "node:fs";
import path from "node:path";

import { USER_ENV_MAP, UserUtils } from "./user.utils.js";

const baseStorageDir = path.join(process.cwd(), "test-results", "storage-states", "ui");
const defaultStoragePath = path.join(baseStorageDir, "solicitor.json");
export const defaultUiUserIdentifiers = ["SOLICITOR", "STAFF_ADMIN", "JUDGE", "COURT_ADMIN"];
const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);

export type UiStorageStateMetadata = {
  userIdentifier: string;
  email: string;
  updatedAt: string;
};

type ResolveUiStoragePathOptions = {
  email?: string;
  userUtils?: UserUtils;
};

export const toUiStorageName = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const resolveUserEmail = (
  userIdentifier: string,
  options: ResolveUiStoragePathOptions = {}
): string => {
  const configuredEmail = options.email?.trim();
  if (configuredEmail) {
    return normalizeEmail(configuredEmail);
  }
  const userUtils = options.userUtils ?? new UserUtils();
  return normalizeEmail(userUtils.getUserCredentials(userIdentifier).email);
};

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
    const usernames = Array.isArray(mapping.username) ? mapping.username : [mapping.username];
    const passwords = Array.isArray(mapping.password) ? mapping.password : [mapping.password];
    return Boolean(
      usernames.some((candidate) => Boolean(process.env[candidate])) &&
      passwords.some((candidate) => Boolean(process.env[candidate]))
    );
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

export const resolveUiStoragePathForUser = (
  userIdentifier?: string,
  options: ResolveUiStoragePathOptions = {}
): string => {
  const override = process.env.PW_UI_STORAGE_PATH;
  if (override?.trim()) {
    return override;
  }
  if (!userIdentifier) {
    return defaultStoragePath;
  }
  const email = resolveUserEmail(userIdentifier, options);
  return path.join(baseStorageDir, `${toUiStorageName(`${userIdentifier}-${email}`)}.json`);
};

export const resolveLegacyUiStoragePathForUser = (userIdentifier: string): string =>
  path.join(baseStorageDir, `${toUiStorageName(userIdentifier)}.json`);

export const resolveUiStorageMetadataPath = (storagePath: string): string =>
  storagePath.replace(/\.json$/, ".meta.json");

export function readUiStorageMetadata(storagePath: string): UiStorageStateMetadata | undefined {
  const metadataPath = resolveUiStorageMetadataPath(storagePath);
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Partial<UiStorageStateMetadata>;
    const userIdentifier =
      typeof parsed.userIdentifier === "string" ? parsed.userIdentifier.trim() : "";
    const email = typeof parsed.email === "string" ? normalizeEmail(parsed.email) : "";
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt.trim() : "";
    if (!userIdentifier || !email || !updatedAt) {
      return undefined;
    }
    return { userIdentifier, email, updatedAt };
  } catch {
    return undefined;
  }
}

export function writeUiStorageMetadata(
  storagePath: string,
  metadata: { userIdentifier: string; email: string }
): void {
  const metadataPath = resolveUiStorageMetadataPath(storagePath);
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        userIdentifier: metadata.userIdentifier.trim(),
        email: normalizeEmail(metadata.email),
        updatedAt: new Date().toISOString()
      } satisfies UiStorageStateMetadata,
      null,
      2
    )
  );
}

export const shouldUseUiStorage = (): boolean =>
  parseBoolean(process.env.PW_UI_STORAGE, true);
