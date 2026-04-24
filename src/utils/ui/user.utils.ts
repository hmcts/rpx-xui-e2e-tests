import {
  resolveDefaultUserCredentials,
  shouldPreferDefaultUserCredentials
} from "./default-user-credentials.js";

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
  WA_SOLICITOR: {
    username: "WA_SOLICITOR_USERNAME",
    password: "WA_SOLICITOR_PASSWORD"
  },
  NOC_SOLICITOR: {
    username: "NOC_SOLICITOR_USERNAME",
    password: "NOC_SOLICITOR_PASSWORD"
  },
  RESTRICTED_CASE_FILE_VIEW_ON: {
    username: ["RESTRICTED_CASE_FILE_VIEW_ON_USERNAME", "RESTRICTED_CASE_FILE_VIEW_V1_1_ON_USERNAME"],
    password: ["RESTRICTED_CASE_FILE_VIEW_ON_PASSWORD", "RESTRICTED_CASE_FILE_VIEW_V1_1_ON_PASSWORD"]
  },
  RESTRICTED_CASE_FILE_VIEW_OFF: {
    username: ["RESTRICTED_CASE_FILE_VIEW_OFF_USERNAME", "RESTRICTED_CASE_FILE_VIEW_V1_1_OFF_USERNAME"],
    password: ["RESTRICTED_CASE_FILE_VIEW_OFF_PASSWORD", "RESTRICTED_CASE_FILE_VIEW_V1_1_OFF_PASSWORD"]
  },
  RESTRICTED_CASE_ACCESS_ON: {
    username: "RESTRICTED_CASE_ACCESS_ON_USERNAME",
    password: "RESTRICTED_CASE_ACCESS_ON_PASSWORD"
  },
  RESTRICTED_CASE_ACCESS_OFF: {
    username: "RESTRICTED_CASE_ACCESS_OFF_USERNAME",
    password: "RESTRICTED_CASE_ACCESS_OFF_PASSWORD"
  },
  ORG_USER_ASSIGNMENT: {
    username: "ORG_USER_ASSIGNMENT_USERNAME",
    password: "ORG_USER_ASSIGNMENT_PASSWORD"
  },
  "BOOKING_UI-FT-ON": {
    username: "BOOKING_UI_FT_ON_USERNAME",
    password: "BOOKING_UI_FT_ON_PASSWORD"
  },
  FPL_GLOBAL_SEARCH: {
    username: "FPL_GLOBAL_SEARCH_USERNAME",
    password: "FPL_GLOBAL_SEARCH_PASSWORD"
  },
  CASEWORKER_GLOBALSEARCH: {
    username: "CASEWORKER_GLOBALSEARCH_USERNAME",
    password: "CASEWORKER_GLOBALSEARCH_PASSWORD"
  },
  WA2_GLOBAL_SEARCH: {
    username: "WA2_GLOBAL_SEARCH_USERNAME",
    password: "WA2_GLOBAL_SEARCH_PASSWORD"
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
  IAC_CASEOFFICER_R1: {
    username: ["IAC_CASEOFFICER_R1_USERNAME", "CASEOFFICER_R1_USERNAME", "CASEWORKER_R1_USERNAME"],
    password: ["IAC_CASEOFFICER_R1_PASSWORD", "CASEOFFICER_R1_PASSWORD", "CASEWORKER_R1_PASSWORD"]
  },
  IAC_CASEOFFICER_R2: {
    username: ["IAC_CASEOFFICER_R2_USERNAME", "CASEOFFICER_R2_USERNAME", "CASEWORKER_R2_USERNAME"],
    password: ["IAC_CASEOFFICER_R2_PASSWORD", "CASEOFFICER_R2_PASSWORD", "CASEWORKER_R2_PASSWORD"]
  },
  IAC_ADMOFFICER_R1: {
    username: "IAC_ADMOFFICER_R1_USERNAME",
    password: "IAC_ADMOFFICER_R1_PASSWORD"
  },
  IAC_ADMOFFICER_R2: {
    username: "IAC_ADMOFFICER_R2_USERNAME",
    password: "IAC_ADMOFFICER_R2_PASSWORD"
  },
  IAC_JUDGE_WA_R1: {
    username: "IAC_JUDGE_WA_R1_USERNAME",
    password: "IAC_JUDGE_WA_R1_PASSWORD"
  },
  IAC_JUDGE_WA_R2: {
    username: "IAC_JUDGE_WA_R2_USERNAME",
    password: "IAC_JUDGE_WA_R2_PASSWORD"
  },
  IAC_JUDGE_WA_R2_CASEALLOCATOR: {
    username: "IAC_JUDGE_WA_R2_CASEALLOCATOR_USERNAME",
    password: "IAC_JUDGE_WA_R2_CASEALLOCATOR_PASSWORD"
  },
  IAC_CASEOFFICER_R1_WITHPAGINATION: {
    username: "IAC_CASEOFFICER_R1_WITHPAGINATION_USERNAME",
    password: "IAC_CASEOFFICER_R1_WITHPAGINATION_PASSWORD"
  },
  IAC_CASEOFFICER_R1_WITHOUTPAGINATION: {
    username: "IAC_CASEOFFICER_R1_WITHOUTPAGINATION_USERNAME",
    password: "IAC_CASEOFFICER_R1_WITHOUTPAGINATION_PASSWORD"
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
  },
  HEARING_MANAGER_CR84_ON: {
    username: "HEARING_MANAGER_CR84_ON_USERNAME",
    password: "HEARING_MANAGER_CR84_ON_PASSWORD"
  },
  HEARING_MANAGER_CR84_OFF: {
    username: "HEARING_MANAGER_CR84_OFF_USERNAME",
    password: "HEARING_MANAGER_CR84_OFF_PASSWORD"
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
      return Boolean(resolveDefaultUserCredentials(key));
    }
    return Boolean(
      (resolveEnvValue(mapping.username) && resolveEnvValue(mapping.password)) ||
        resolveDefaultUserCredentials(key)
    );
  }

  public getUserCredentials(userIdentifier: string): UserCredentials {
    const key = userIdentifier.trim().toUpperCase();
    const mapping = USER_ENV_MAP[key];
    if (!mapping) {
      const defaultCredentials = resolveDefaultUserCredentials(key);
      if (defaultCredentials) {
        return defaultCredentials;
      }
      throw new Error(`User "${userIdentifier}" is not configured for UI tests.`);
    }

    const defaultCredentials = resolveDefaultUserCredentials(key);
    if (defaultCredentials && shouldPreferDefaultUserCredentials(key)) {
      return defaultCredentials;
    }

    const resolvedEmail = resolveEnvValue(mapping.username);
    const resolvedPassword = resolveEnvValue(mapping.password);
    if (resolvedEmail && resolvedPassword) {
      return {
        email: resolvedEmail,
        password: resolvedPassword
      };
    }

    if (defaultCredentials) {
      return defaultCredentials;
    }

    return {
      email: getEnvOrThrow(mapping.username),
      password: getEnvOrThrow(mapping.password)
    };
  }
}
