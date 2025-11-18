const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

export const prlConfig = {
  manageCasesBaseUrl:
    process.env.APP_BASE_URL ?? "https://manage-case.aat.platform.hmcts.net",
  caseTabsCaseId: process.env.PRL_CASE_TABS_CASE_ID,
  solicitor: {
    username: process.env.SOLICITOR_USERNAME,
    password: process.env.SOLICITOR_PASSWORD,
  },
};

export const validatePrlConfig = (): void => {
  requireEnv("APP_BASE_URL");
  requireEnv("SOLICITOR_USERNAME");
  requireEnv("SOLICITOR_PASSWORD");
};
