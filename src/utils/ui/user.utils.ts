export interface UserCredentials {
  email: string;
  password: string;
}

export const USER_ENV_MAP: Record<string, { username: string; password: string }> = {
  PRL_SOLICITOR: {
    username: "PRL_SOLICITOR_USERNAME",
    password: "PRL_SOLICITOR_PASSWORD"
  },
  SOLICITOR: {
    username: "SOLICITOR_USERNAME",
    password: "SOLICITOR_PASSWORD"
  },
  CIVIL_SOLICITOR: {
    username: "CIVIL_SOLICITOR_USERNAME",
    password: "CIVIL_SOLICITOR_PASSWORD"
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
  CIVIL_HMCTS_STAFF: {
    username: "CIVIL_HMCTS_STAFF_USERNAME",
    password: "CIVIL_HMCTS_STAFF_PASSWORD"
  }
};

const getEnvOrThrow = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export class UserUtils {
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
