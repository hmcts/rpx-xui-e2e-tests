export interface UserCredentials {
  email: string;
  password: string;
}

type EnvCandidate = string | string[];

type UserEnvMapping = {
  username: EnvCandidate;
  password: EnvCandidate;
};

const toCandidates = (value: EnvCandidate): string[] =>
  Array.isArray(value) ? value : [value];

const resolveEnvValue = (value: EnvCandidate): string | undefined => {
  for (const candidate of toCandidates(value)) {
    const resolved = process.env[candidate];
    if (resolved) {
      return resolved;
    }
  }
  return undefined;
};

const describeCandidates = (value: EnvCandidate): string =>
  toCandidates(value).join(" or ");

export const USER_ENV_MAP: Record<string, UserEnvMapping> = {
  PRL_SOLICITOR: {
    username: "PRL_SOLICITOR_USERNAME",
    password: "PRL_SOLICITOR_PASSWORD"
  },
  FPL_GLOBAL_SEARCH: {
    username: ["FPL_GLOBAL_SEARCH_USERNAME", "CASEWORKER_R1_USERNAME"],
    password: ["FPL_GLOBAL_SEARCH_PASSWORD", "CASEWORKER_R1_PASSWORD"]
  },
  SOLICITOR: {
    username: "SOLICITOR_USERNAME",
    password: "SOLICITOR_PASSWORD"
  },
  CASEWORKER_R1: {
    username: "CASEWORKER_R1_USERNAME",
    password: "CASEWORKER_R1_PASSWORD"
  },
  CASEWORKER_R2: {
    username: "CASEWORKER_R2_USERNAME",
    password: "CASEWORKER_R2_PASSWORD"
  },
  STAFF_ADMIN: {
    username: "STAFF_ADMIN_USERNAME",
    password: "STAFF_ADMIN_PASSWORD"
  },
  SEARCH_EMPLOYMENT_CASE: {
    username: "SEARCH_EMPLOYMENT_CASE_USERNAME",
    password: "SEARCH_EMPLOYMENT_CASE_PASSWORD"
  },
  JUDGE: {
    username: "JUDGE_USERNAME",
    password: "JUDGE_PASSWORD"
  },
  CASEMANAGER: {
    username: "CASEMANAGER_USERNAME",
    password: "CASEMANAGER_PASSWORD"
  },
  COURT_ADMIN: {
    username: "COURT_ADMIN_USERNAME",
    password: "COURT_ADMIN_PASSWORD"
  },
  USER_WITH_FLAGS: {
    username: "USER_WITH_FLAGS_USERNAME",
    password: "USER_WITH_FLAGS_PASSWORD"
  }
};

const getEnvOrThrow = (name: EnvCandidate): string => {
  const value = resolveEnvValue(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${describeCandidates(name)}`);
  }
  return value;
};

export class UserUtils {
  public hasUserCredentials(userIdentifier: string): boolean {
    const key = userIdentifier.trim().toUpperCase();
    const mapping = USER_ENV_MAP[key];
    if (!mapping) {
      return false;
    }
    return Boolean(resolveEnvValue(mapping.username) && resolveEnvValue(mapping.password));
  }

  public getUserCredentials(userIdentifier: string): UserCredentials {
    const key = userIdentifier.trim().toUpperCase();
    const mapping = USER_ENV_MAP[key];
    if (!mapping) {
      throw new Error(`User "${userIdentifier}" is not configured for UI tests.`);
    }

    return {
      email: getEnvOrThrow(mapping.username),
      password: getEnvOrThrow(mapping.password)
    };
  }
}
