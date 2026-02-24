export const resolveBaseUrl = (
  value = "https://manage-case.aat.platform.hmcts.net/",
): string => {
  return value.endsWith("/") ? value : `${value}/`;
};

export const resolveTestEnv = (value?: string): "aat" | "demo" => {
  if (value && ["aat", "demo"].includes(value)) {
    return value as "aat" | "demo";
  }
  return "aat";
};

const baseUrl = resolveBaseUrl(process.env.TEST_URL);
const testEnv = resolveTestEnv(process.env.TEST_ENV);

type EnvUser = { e?: string; sec?: string };

type EnvCredentialPair = { username?: string; password?: string };

const hasText = (value?: string): value is string =>
  Boolean(value && value.trim().length > 0);

const pickCredentials = (...pairs: EnvCredentialPair[]): EnvUser => {
  for (const pair of pairs) {
    if (hasText(pair.username) && hasText(pair.password)) {
      return { e: pair.username, sec: pair.password };
    }
  }

  // Keep partial values visible in logs when only one side is configured.
  const fallbackUsername = pairs.map((pair) => pair.username).find(hasText);
  const fallbackPassword = pairs.map((pair) => pair.password).find(hasText);

  return { e: fallbackUsername, sec: fallbackPassword };
};

const envUsers: Record<"aat" | "demo", Record<string, EnvUser>> = {
  aat: {
    solicitor: pickCredentials(
      {
        username: process.env.SOLICITOR_USERNAME,
        password: process.env.SOLICITOR_PASSWORD,
      },
      {
        username: process.env.PRL_SOLICITOR_USERNAME,
        password: process.env.PRL_SOLICITOR_PASSWORD,
      },
      {
        username: process.env.TEST_EMAIL,
        password: process.env.TEST_PASSWORD,
      },
      {
        username: process.env.SYSTEM_USER_NAME,
        password: process.env.SYSTEM_USER_PASSWORD,
      },
      {
        username: process.env.COURT_ADMIN_USERNAME,
        password: process.env.COURT_ADMIN_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R1_USERNAME,
        password: process.env.CASEWORKER_R1_PASSWORD,
      },
      {
        username: process.env.CASEOFFICER_R1_USERNAME,
        password: process.env.CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_GLOBALSEARCH_USERNAME,
        password: process.env.CASEWORKER_GLOBALSEARCH_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R1_USERNAME,
        password: process.env.IAC_CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R2_USERNAME,
        password: process.env.IAC_CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.STAFF_ADMIN_USERNAME,
        password: process.env.STAFF_ADMIN_PASSWORD,
      },
      {
        username: process.env.PROD_LIKE_USERNAME,
        password: process.env.PROD_LIKE_PASSWORD,
      },
    ),
    caseOfficer_r1: pickCredentials(
      {
        username: process.env.CASEOFFICER_R1_USERNAME,
        password: process.env.CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R1_USERNAME,
        password: process.env.CASEWORKER_R1_PASSWORD,
      },
      {
        username: process.env.CASEOFFICER_R2_USERNAME,
        password: process.env.CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R2_USERNAME,
        password: process.env.CASEWORKER_R2_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R1_USERNAME,
        password: process.env.IAC_CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R2_USERNAME,
        password: process.env.IAC_CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.SYSTEM_USER_NAME,
        password: process.env.SYSTEM_USER_PASSWORD,
      },
      {
        username: process.env.COURT_ADMIN_USERNAME,
        password: process.env.COURT_ADMIN_PASSWORD,
      },
    ),
    caseOfficer_r2: pickCredentials(
      {
        username: process.env.CASEOFFICER_R2_USERNAME,
        password: process.env.CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R2_USERNAME,
        password: process.env.CASEWORKER_R2_PASSWORD,
      },
      {
        username: process.env.CASEOFFICER_R1_USERNAME,
        password: process.env.CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R1_USERNAME,
        password: process.env.CASEWORKER_R1_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R2_USERNAME,
        password: process.env.IAC_CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R1_USERNAME,
        password: process.env.IAC_CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.SYSTEM_USER_NAME,
        password: process.env.SYSTEM_USER_PASSWORD,
      },
      {
        username: process.env.COURT_ADMIN_USERNAME,
        password: process.env.COURT_ADMIN_PASSWORD,
      },
    ),
  },
  demo: {
    solicitor: pickCredentials(
      {
        username: process.env.SOLICITOR_USERNAME,
        password: process.env.SOLICITOR_PASSWORD,
      },
      {
        username: process.env.PRL_SOLICITOR_USERNAME,
        password: process.env.PRL_SOLICITOR_PASSWORD,
      },
      {
        username: process.env.TEST_EMAIL,
        password: process.env.TEST_PASSWORD,
      },
      {
        username: process.env.SYSTEM_USER_NAME,
        password: process.env.SYSTEM_USER_PASSWORD,
      },
      {
        username: process.env.COURT_ADMIN_USERNAME,
        password: process.env.COURT_ADMIN_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R1_USERNAME,
        password: process.env.CASEWORKER_R1_PASSWORD,
      },
      {
        username: process.env.CASEOFFICER_R1_USERNAME,
        password: process.env.CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_GLOBALSEARCH_USERNAME,
        password: process.env.CASEWORKER_GLOBALSEARCH_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R1_USERNAME,
        password: process.env.IAC_CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R2_USERNAME,
        password: process.env.IAC_CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.STAFF_ADMIN_USERNAME,
        password: process.env.STAFF_ADMIN_PASSWORD,
      },
      {
        username: process.env.PROD_LIKE_USERNAME,
        password: process.env.PROD_LIKE_PASSWORD,
      },
    ),
    caseOfficer_r1: pickCredentials(
      {
        username: process.env.CASEOFFICER_R1_USERNAME,
        password: process.env.CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R1_USERNAME,
        password: process.env.CASEWORKER_R1_PASSWORD,
      },
      {
        username: process.env.CASEOFFICER_R2_USERNAME,
        password: process.env.CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R2_USERNAME,
        password: process.env.CASEWORKER_R2_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R1_USERNAME,
        password: process.env.IAC_CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R2_USERNAME,
        password: process.env.IAC_CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.SYSTEM_USER_NAME,
        password: process.env.SYSTEM_USER_PASSWORD,
      },
      {
        username: process.env.COURT_ADMIN_USERNAME,
        password: process.env.COURT_ADMIN_PASSWORD,
      },
    ),
    caseOfficer_r2: pickCredentials(
      {
        username: process.env.CASEOFFICER_R2_USERNAME,
        password: process.env.CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R2_USERNAME,
        password: process.env.CASEWORKER_R2_PASSWORD,
      },
      {
        username: process.env.CASEOFFICER_R1_USERNAME,
        password: process.env.CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.CASEWORKER_R1_USERNAME,
        password: process.env.CASEWORKER_R1_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R2_USERNAME,
        password: process.env.IAC_CASEOFFICER_R2_PASSWORD,
      },
      {
        username: process.env.IAC_CASEOFFICER_R1_USERNAME,
        password: process.env.IAC_CASEOFFICER_R1_PASSWORD,
      },
      {
        username: process.env.SYSTEM_USER_NAME,
        password: process.env.SYSTEM_USER_PASSWORD,
      },
      {
        username: process.env.COURT_ADMIN_USERNAME,
        password: process.env.COURT_ADMIN_PASSWORD,
      },
    ),
  },
};

export const config = {
  baseUrl,
  testEnv,
  jurisdictions: {
    aat: [
      { id: "DIVORCE", caseTypeIds: ["xuiTestCaseType"] },
      { id: "IA", caseTypeIds: [] },
      { id: "PROBATE", caseTypeIds: [] },
    ],
    demo: [
      {
        id: "DIVORCE",
        caseTypeIds: ["DIVORCE", "FinancialRemedyMVP2", "FinancialRemedyMVP2"],
      },
      { id: "IA", caseTypeIds: ["Asylum"] },
      { id: "PROBATE", caseTypeIds: ["GrantOfRepresentation"] },
    ],
  },
  jurisdictionNames: {
    aat: [
      "Family Divorce",
      "Public Law",
      "Immigration & Asylum",
      "Manage probate application",
    ],
    demo: ["Family Divorce - v104-26.1", "Public Law", "Immigration & Asylum"],
  },
  em: {
    aat: {
      docId: process.env.EM_DOC_ID ?? "249cfa9e-622c-4877-a588-e9daa3fe10d8",
    },
    demo: {
      docId: process.env.EM_DOC_ID ?? "005ed16f-be03-4620-a8ee-9bc90635f6f2",
    },
  },
  users: envUsers,
  configurationUi: {
    aat: [
      "clientId",
      "headerConfig",
      "hearingJurisdictionConfig",
      "idamWeb",
      "launchDarklyClientId",
      "oAuthCallback",
      "oidcEnabled",
      "paymentReturnUrl",
      "protocol",
      "ccdGatewayUrl",
      "substantiveEnabled",
      "accessManagementEnabled",
      "judicialBookingApi",
      "waWorkflowApi",
    ],
    demo: [
      "clientId",
      "headerConfig",
      "hearingJurisdictionConfig",
      "idamWeb",
      "launchDarklyClientId",
      "oAuthCallback",
      "oidcEnabled",
      "paymentReturnUrl",
      "protocol",
      "ccdGatewayUrl",
      "substantiveEnabled",
      "accessManagementEnabled",
      "judicialBookingApi",
      "waWorkflowApi",
    ],
  },
  workallocation: {
    aat: {
      locationId: "698118",
      judgeUser: {
        email: "330085EMP-@ejudiciary.net",
        id: "519e0c40-d30e-4f42-8a4c-2c79838f0e4e",
        name: "Tom Cruz",
      },
      legalOpsUser: {
        email: "330085EMP-@ejudiciary.net",
        id: "519e0c40-d30e-4f42-8a4c-2c79838f0e4e",
        name: "Tom Cruz",
      },
      iaCaseIds: ["1546883526751282"],
    },
    demo: {
      locationId: "765324",
      judgeUser: {
        email: "330085EMP-@ejudiciary.net",
        id: "519e0c40-d30e-4f42-8a4c-2c79838f0e4e",
        name: "Tom Cruz",
      },
      iaCaseIds: ["1547458486131483"],
    },
  },
};

export type ApiTestConfig = typeof config;

export const __test__ = {
  resolveBaseUrl,
  resolveTestEnv,
  pickCredentials,
};
