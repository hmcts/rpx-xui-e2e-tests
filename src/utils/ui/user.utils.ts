import appTestConfig, { type User } from "./appTestConfig.js";

export interface UserCredentials {
  email: string;
  password: string;
}

type UserEnvMapping = {
  username: string;
  password: string;
  requireEnv?: boolean;
};

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

const DYNAMIC_SOLICITOR_GUARD_USERS_BY_ALIAS: Record<string, Set<string>> = {
  SOLICITOR: new Set([
    "prl_aat_solicitor@mailinator.com",
    "xui_auto_test_user_solicitor@mailinator.com",
  ]),
  PROD_LIKE: new Set([
    "prl_aat_solicitor@mailinator.com",
    "xui_auto_test_user_solicitor@mailinator.com",
  ]),
  SEARCH_EMPLOYMENT_CASE: new Set(["employment_service@mailinator.com"]),
  USER_WITH_FLAGS: new Set(["henry_fr_harper@yahoo.com"]),
};

function isTruthy(value: string | undefined): boolean {
  return TRUTHY_VALUES.has((value ?? "").trim().toLowerCase());
}

function shouldEnforceDynamicSolicitorGuard(): boolean {
  return isTruthy(process.env.PW_UI_REQUIRE_DYNAMIC_SOLICITOR);
}

function isBlockedStaticSolicitor(
  userIdentifier: string,
  email: string | undefined,
): boolean {
  const key = userIdentifier.trim().toUpperCase();
  const blockedEmails = DYNAMIC_SOLICITOR_GUARD_USERS_BY_ALIAS[key];
  if (!blockedEmails) {
    return false;
  }
  if (!email) {
    return false;
  }
  return blockedEmails.has(email.trim().toLowerCase());
}

function assertDynamicSolicitorGuard(
  userIdentifier: string,
  email: string | undefined,
): void {
  if (!shouldEnforceDynamicSolicitorGuard()) {
    return;
  }
  if (!isBlockedStaticSolicitor(userIdentifier, email)) {
    return;
  }
  throw new Error(
    `Blocked static ${userIdentifier} account in UI E2E run (${email}). Provision a dynamic solicitor user before authentication.`,
  );
}

export const USER_ENV_MAP: Record<string, UserEnvMapping> = {
  PRL_SOLICITOR: {
    username: "PRL_SOLICITOR_USERNAME",
    password: "PRL_SOLICITOR_PASSWORD",
  },
  SOLICITOR: {
    username: "SOLICITOR_USERNAME",
    password: "SOLICITOR_PASSWORD",
    requireEnv: true,
  },
  PROD_LIKE: {
    username: "PROD_LIKE_USERNAME",
    password: "PROD_LIKE_PASSWORD",
    requireEnv: true,
  },
  FPL_GLOBAL_SEARCH: {
    username: "FPL_GLOBAL_SEARCH_USERNAME",
    password: "FPL_GLOBAL_SEARCH_PASSWORD",
  },
  CASEWORKER_R1: {
    username: "CASEWORKER_R1_USERNAME",
    password: "CASEWORKER_R1_PASSWORD",
  },
  CASEWORKER_R2: {
    username: "CASEWORKER_R2_USERNAME",
    password: "CASEWORKER_R2_PASSWORD",
  },
  STAFF_ADMIN: {
    username: "STAFF_ADMIN_USERNAME",
    password: "STAFF_ADMIN_PASSWORD",
  },
  SEARCH_EMPLOYMENT_CASE: {
    username: "SEARCH_EMPLOYMENT_CASE_USERNAME",
    password: "SEARCH_EMPLOYMENT_CASE_PASSWORD",
  },
  JUDGE: {
    username: "JUDGE_USERNAME",
    password: "JUDGE_PASSWORD",
  },
  CASEMANAGER: {
    username: "CASEMANAGER_USERNAME",
    password: "CASEMANAGER_PASSWORD",
  },
  COURT_ADMIN: {
    username: "COURT_ADMIN_USERNAME",
    password: "COURT_ADMIN_PASSWORD",
  },
  USER_WITH_FLAGS: {
    username: "USER_WITH_FLAGS_USERNAME",
    password: "USER_WITH_FLAGS_PASSWORD",
  },
  ORG_USER_ASSIGNMENT: {
    username: "ORG_USER_ASSIGNMENT_USERNAME",
    password: "ORG_USER_ASSIGNMENT_PASSWORD",
    requireEnv: true,
  },
};

const getEnvOrThrow = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const normalizeKey = (userIdentifier: string): string =>
  userIdentifier.trim().toUpperCase();

const getConfiguredUsers = (): User[] =>
  appTestConfig.users[appTestConfig.testEnv] ?? [];

const findConfiguredUser = (normalizedKey: string): User | undefined =>
  getConfiguredUsers().find(
    (user) => normalizeKey(user.userIdentifier) === normalizedKey,
  );

export class UserUtils {
  public hasUserCredentials(userIdentifier: string): boolean {
    const key = normalizeKey(userIdentifier);
    const envMapping = USER_ENV_MAP[key];
    const envUsername = envMapping
      ? process.env[envMapping.username]
      : undefined;
    const envPassword = envMapping
      ? process.env[envMapping.password]
      : undefined;
    if (envMapping && envUsername && envPassword) {
      if (shouldEnforceDynamicSolicitorGuard()) {
        return !isBlockedStaticSolicitor(userIdentifier, envUsername);
      }
      return true;
    }
    if (envMapping?.requireEnv) {
      return false;
    }
    const configuredUser = findConfiguredUser(key);
    return Boolean(configuredUser?.email && configuredUser.key);
  }

  public getUserCredentials(userIdentifier: string): UserCredentials {
    const key = normalizeKey(userIdentifier);
    const mapping = USER_ENV_MAP[key];

    if (
      mapping &&
      process.env[mapping.username] &&
      process.env[mapping.password]
    ) {
      assertDynamicSolicitorGuard(
        userIdentifier,
        process.env[mapping.username],
      );
      return {
        email: getEnvOrThrow(mapping.username),
        password: getEnvOrThrow(mapping.password),
      };
    }

    if (mapping?.requireEnv) {
      if (!process.env[mapping.username]) {
        throw new Error(
          `Missing required environment variable: ${mapping.username}`,
        );
      }
      throw new Error(
        `Missing required environment variable: ${mapping.password}`,
      );
    }

    const configuredUser = findConfiguredUser(key);
    if (configuredUser?.email && configuredUser.key) {
      assertDynamicSolicitorGuard(userIdentifier, configuredUser.email);
      return {
        email: configuredUser.email,
        password: configuredUser.key,
      };
    }

    if (mapping) {
      if (!process.env[mapping.username]) {
        throw new Error(
          `Missing required environment variable: ${mapping.username}`,
        );
      }
      throw new Error(
        `Missing required environment variable: ${mapping.password}`,
      );
    }

    throw new Error(`User "${userIdentifier}" not found`);
  }
}
