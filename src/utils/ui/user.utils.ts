export interface UserCredentials {
  email: string;
  password: string;
}

export const USER_ENV_MAP: Record<
  string,
  { username: string; password: string }
> = {
  PROD_LIKE: {
    username: "PROD_LIKE_USERNAME",
    password: "PROD_LIKE_PASSWORD",
  },
  PRL_SOLICITOR: {
    username: "PRL_SOLICITOR_USERNAME",
    password: "PRL_SOLICITOR_PASSWORD",
  },
  SOLICITOR: {
    username: "SOLICITOR_USERNAME",
    password: "SOLICITOR_PASSWORD",
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
  FPL_GLOBAL_SEARCH: {
    username: "FPL_GLOBAL_SEARCH_USERNAME",
    password: "FPL_GLOBAL_SEARCH_PASSWORD",
  },
  CASEWORKER_GLOBALSEARCH: {
    username: "CASEWORKER_GLOBALSEARCH_USERNAME",
    password: "CASEWORKER_GLOBALSEARCH_PASSWORD",
  },
  WA2: {
    username: "WA2_USERNAME",
    password: "WA2_PASSWORD",
  },
  "WA2_GLOBAL-SEARCH": {
    username: "WA2_GLOBAL_SEARCH_USERNAME",
    password: "WA2_GLOBAL_SEARCH_PASSWORD",
  },
  IAC_CASEOFFICER_R1: {
    username: "IAC_CASEOFFICER_R1_USERNAME",
    password: "IAC_CASEOFFICER_R1_PASSWORD",
  },
  IAC_CASEOFFICER_R2: {
    username: "IAC_CASEOFFICER_R2_USERNAME",
    password: "IAC_CASEOFFICER_R2_PASSWORD",
  },
  IAC_ADMOFFICER_R1: {
    username: "IAC_ADMOFFICER_R1_USERNAME",
    password: "IAC_ADMOFFICER_R1_PASSWORD",
  },
  IAC_ADMOFFICER_R2: {
    username: "IAC_ADMOFFICER_R2_USERNAME",
    password: "IAC_ADMOFFICER_R2_PASSWORD",
  },
  IAC_JUDGE_WA_R1: {
    username: "IAC_JUDGE_WA_R1_USERNAME",
    password: "IAC_JUDGE_WA_R1_PASSWORD",
  },
  IAC_JUDGE_WA_R2: {
    username: "IAC_JUDGE_WA_R2_USERNAME",
    password: "IAC_JUDGE_WA_R2_PASSWORD",
  },
  IAC_JUDGE_WA_R2_CASEALLOCATOR: {
    username: "IAC_JUDGE_WA_R2_CASEALLOCATOR_USERNAME",
    password: "IAC_JUDGE_WA_R2_CASEALLOCATOR_PASSWORD",
  },
  IAC_CASEOFFICER_R1_WITHPAGINATION: {
    username: "IAC_CASEOFFICER_R1_WITHPAGINATION_USERNAME",
    password: "IAC_CASEOFFICER_R1_WITHPAGINATION_PASSWORD",
  },
  IAC_CASEOFFICER_R1_WITHOUTPAGINATION: {
    username: "IAC_CASEOFFICER_R1_WITHOUTPAGINATION_USERNAME",
    password: "IAC_CASEOFFICER_R1_WITHOUTPAGINATION_PASSWORD",
  },
  BOOKING_UI_FT_ON: {
    username: "BOOKING_UI_FT_ON_USERNAME",
    password: "BOOKING_UI_FT_ON_PASSWORD",
  },
  "BOOKING_UI-FT-ON": {
    username: "BOOKING_UI_FT_ON_USERNAME",
    password: "BOOKING_UI_FT_ON_PASSWORD",
  },
  RESTRICTED_CASE_ACCESS_ON: {
    username: "RESTRICTED_CASE_ACCESS_ON_USERNAME",
    password: "RESTRICTED_CASE_ACCESS_ON_PASSWORD",
  },
  RESTRICTED_CASE_ACCESS_OFF: {
    username: "RESTRICTED_CASE_ACCESS_OFF_USERNAME",
    password: "RESTRICTED_CASE_ACCESS_OFF_PASSWORD",
  },
  "RESTRICTED_CASE_FILE_VIEW_V1.1_ON": {
    username: "RESTRICTED_CASE_FILE_VIEW_V1_1_ON_USERNAME",
    password: "RESTRICTED_CASE_FILE_VIEW_V1_1_ON_PASSWORD",
  },
  "RESTRICTED_CASE_FILE_VIEW_V1.1_OFF": {
    username: "RESTRICTED_CASE_FILE_VIEW_V1_1_OFF_USERNAME",
    password: "RESTRICTED_CASE_FILE_VIEW_V1_1_OFF_PASSWORD",
  },
  HEARING_MANAGER_CR84_ON: {
    username: "HEARING_MANAGER_CR84_ON_USERNAME",
    password: "HEARING_MANAGER_CR84_ON_PASSWORD",
  },
  HEARING_MANAGER_CR84_OFF: {
    username: "HEARING_MANAGER_CR84_OFF_USERNAME",
    password: "HEARING_MANAGER_CR84_OFF_PASSWORD",
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
  PROBATE_CW: {
    username: "PROBATE_CW_USERNAME",
    password: "PROBATE_CW_PASSWORD",
  },
};

const getEnvOrThrow = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
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
    return Boolean(
      process.env[mapping.username] && process.env[mapping.password],
    );
  }

  public getUserCredentials(userIdentifier: string): UserCredentials {
    const key = userIdentifier.trim().toUpperCase();
    const mapping = USER_ENV_MAP[key];
    if (!mapping) {
      throw new Error(
        `User "${userIdentifier}" is not configured for UI tests.`,
      );
    }

    return {
      email: getEnvOrThrow(mapping.username),
      password: getEnvOrThrow(mapping.password),
    };
  }
}
