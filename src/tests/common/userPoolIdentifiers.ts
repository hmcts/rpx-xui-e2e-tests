import { getRuntimeUserCredentialEnvMapping } from "../e2e/utils/runtimeUserCredentials.js";
import { UserUtils } from "../e2e/utils/user.utils.js";

import type { SessionIdentity } from "./sessionIdentity.js";

export const STAFF_ADMIN_USER = "STAFF_ADMIN" as const;
export const STAFF_ADMIN_POOLED_USER_IDENTIFIERS = ["STAFF_ADMIN-1", "STAFF_ADMIN-2", "STAFF_ADMIN-3", "STAFF_ADMIN-4"] as const;

export const BOOKING_UI_LEGACY_USER_IDENTIFIER = "BOOKING_UI-FT-ON" as const;
export const BOOKING_UI_POOLED_USER_IDENTIFIERS = [
  "BOOKING_UI-FT-ON-1",
  "BOOKING_UI-FT-ON-2",
  "BOOKING_UI-FT-ON-3",
  "BOOKING_UI-FT-ON-4"
] as const;

export const HEARING_MANAGER_CR84_ON_USER = "HEARING_MANAGER_CR84_ON" as const;
export const HEARING_MANAGER_CR84_OFF_USER = "HEARING_MANAGER_CR84_OFF" as const;
export const HEARING_MANAGER_CR84_ON_POOLED_USER_IDENTIFIERS = [
  "HEARING_MANAGER_CR84_ON-1",
  "HEARING_MANAGER_CR84_ON-2",
  "HEARING_MANAGER_CR84_ON-3",
  "HEARING_MANAGER_CR84_ON-4"
] as const;
export const HEARING_MANAGER_CR84_OFF_POOLED_USER_IDENTIFIERS = [
  "HEARING_MANAGER_CR84_OFF-1",
  "HEARING_MANAGER_CR84_OFF-2",
  "HEARING_MANAGER_CR84_OFF-3",
  "HEARING_MANAGER_CR84_OFF-4"
] as const;

export type StaffAdminUserIdentifier = typeof STAFF_ADMIN_USER | (typeof STAFF_ADMIN_POOLED_USER_IDENTIFIERS)[number];
export type BookingUiUserIdentifier =
  | typeof BOOKING_UI_LEGACY_USER_IDENTIFIER
  | (typeof BOOKING_UI_POOLED_USER_IDENTIFIERS)[number];
export type HearingManagerUserIdentifier =
  | typeof HEARING_MANAGER_CR84_ON_USER
  | typeof HEARING_MANAGER_CR84_OFF_USER
  | (typeof HEARING_MANAGER_CR84_ON_POOLED_USER_IDENTIFIERS)[number]
  | (typeof HEARING_MANAGER_CR84_OFF_POOLED_USER_IDENTIFIERS)[number];

type ParallelIndexSource = {
  parallelIndex?: number;
};

type EnvMap = Record<string, string | undefined>;

function hasConfiguredCredentials(userIdentifier: string, env: EnvMap): boolean {
  const mapping = getRuntimeUserCredentialEnvMapping(userIdentifier);
  if (!mapping) {
    return false;
  }

  return Boolean(env[mapping.username]?.trim() && env[mapping.password]);
}

function resolveParallelIndex(source?: ParallelIndexSource, env: EnvMap = process.env): number {
  if (Number.isInteger(source?.parallelIndex) && Number(source?.parallelIndex) > 0) {
    return Number(source?.parallelIndex);
  }

  const envParallelIndex = env.TEST_PARALLEL_INDEX ?? env.TEST_WORKER_INDEX;
  const parsedParallelIndex = Number(envParallelIndex);
  return Number.isInteger(parsedParallelIndex) && parsedParallelIndex > 0 ? parsedParallelIndex : 0;
}

export function getConfiguredStaffAdminUserIdentifiers(env: EnvMap = process.env): StaffAdminUserIdentifier[] {
  if (env.STAFF_ADMIN_POOL_ENABLED !== "true") {
    return [];
  }

  return STAFF_ADMIN_POOLED_USER_IDENTIFIERS.filter((userIdentifier) => hasConfiguredCredentials(userIdentifier, env));
}

export function resolveStaffAdminUserIdentifier(
  userIdentifier: string,
  source?: ParallelIndexSource,
  env: EnvMap = process.env
): string {
  if (userIdentifier !== STAFF_ADMIN_USER) {
    return userIdentifier;
  }

  const configuredUserIdentifiers = getConfiguredStaffAdminUserIdentifiers(env);
  if (configuredUserIdentifiers.length === 0) {
    return userIdentifier;
  }

  return configuredUserIdentifiers[resolveParallelIndex(source, env) % configuredUserIdentifiers.length];
}

export function getLegacyStaffAdminSessionIdentity(userUtils: UserUtils = new UserUtils()): SessionIdentity {
  const credentials = userUtils.getUserCredentials(STAFF_ADMIN_USER);
  return {
    userIdentifier: STAFF_ADMIN_USER,
    email: credentials.email,
    password: credentials.password
  };
}

export function getConfiguredBookingUiUserIdentifiers(env: EnvMap = process.env): BookingUiUserIdentifier[] {
  return BOOKING_UI_POOLED_USER_IDENTIFIERS.filter((userIdentifier) => hasConfiguredCredentials(userIdentifier, env));
}

export function resolveBookingUiUserIdentifier(
  source?: ParallelIndexSource,
  env: EnvMap = process.env
): BookingUiUserIdentifier {
  const configuredUserIdentifiers = getConfiguredBookingUiUserIdentifiers(env);
  if (configuredUserIdentifiers.length === 0) {
    return BOOKING_UI_LEGACY_USER_IDENTIFIER;
  }

  return configuredUserIdentifiers[resolveParallelIndex(source, env) % configuredUserIdentifiers.length];
}

export function getConfiguredHearingManagerUserIdentifiers(
  baseUserIdentifier: typeof HEARING_MANAGER_CR84_ON_USER | typeof HEARING_MANAGER_CR84_OFF_USER,
  env: EnvMap = process.env
): HearingManagerUserIdentifier[] {
  const pool =
    baseUserIdentifier === HEARING_MANAGER_CR84_ON_USER
      ? HEARING_MANAGER_CR84_ON_POOLED_USER_IDENTIFIERS
      : HEARING_MANAGER_CR84_OFF_POOLED_USER_IDENTIFIERS;

  return pool.filter((userIdentifier) => hasConfiguredCredentials(userIdentifier, env));
}

export function resolveHearingManagerUserIdentifier(
  userIdentifier: HearingManagerUserIdentifier,
  source?: ParallelIndexSource,
  env: EnvMap = process.env
): HearingManagerUserIdentifier {
  if (userIdentifier !== HEARING_MANAGER_CR84_ON_USER && userIdentifier !== HEARING_MANAGER_CR84_OFF_USER) {
    return userIdentifier;
  }

  const configuredUserIdentifiers = getConfiguredHearingManagerUserIdentifiers(userIdentifier, env);
  if (configuredUserIdentifiers.length === 0) {
    return userIdentifier;
  }

  return configuredUserIdentifiers[resolveParallelIndex(source, env) % configuredUserIdentifiers.length];
}

export function resolvePooledUserIdentifier(
  userIdentifier: string,
  source?: ParallelIndexSource,
  env: EnvMap = process.env
): string {
  const staffAdminUserIdentifier = resolveStaffAdminUserIdentifier(userIdentifier, source, env);
  if (staffAdminUserIdentifier !== userIdentifier) {
    return staffAdminUserIdentifier;
  }

  if (userIdentifier === BOOKING_UI_LEGACY_USER_IDENTIFIER) {
    return resolveBookingUiUserIdentifier(source, env);
  }

  if (userIdentifier === HEARING_MANAGER_CR84_ON_USER || userIdentifier === HEARING_MANAGER_CR84_OFF_USER) {
    return resolveHearingManagerUserIdentifier(userIdentifier, source, env);
  }

  return userIdentifier;
}
