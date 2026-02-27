import appTestConfig, { type User } from "./appTestConfig.js";

export interface UserCredentials {
  email: string;
  password: string;
}

export const USER_ENV_MAP: Record<
  string,
  { username: string; password: string }
> = {
  PRL_SOLICITOR: {
    username: "PRL_SOLICITOR_USERNAME",
    password: "PRL_SOLICITOR_PASSWORD",
  },
  SOLICITOR: {
    username: "SOLICITOR_USERNAME",
    password: "SOLICITOR_PASSWORD",
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
    if (
      envMapping &&
      process.env[envMapping.username] &&
      process.env[envMapping.password]
    ) {
      return true;
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
      return {
        email: getEnvOrThrow(mapping.username),
        password: getEnvOrThrow(mapping.password),
      };
    }

    const configuredUser = findConfiguredUser(key);
    if (configuredUser?.email && configuredUser.key) {
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
