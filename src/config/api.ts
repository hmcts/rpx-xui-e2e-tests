export const resolveBaseUrl = (value?: string): string => {
  const raw = value ?? "https://manage-case.aat.platform.hmcts.net/";
  return raw.endsWith("/") ? raw : `${raw}/`;
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

const pick = (...vars: Array<string | undefined>) =>
  vars.find((v) => v && v.trim().length > 0);

const envUsers: Record<"aat" | "demo", Record<string, EnvUser>> = {
  aat: {
    solicitor: {
      e: pick(
        process.env.SOLICITOR_USERNAME,
        process.env.PRL_SOLICITOR_USERNAME,
      ),
      sec: pick(
        process.env.SOLICITOR_PASSWORD,
        process.env.PRL_SOLICITOR_PASSWORD,
      ),
    },
    caseOfficer_r1: {
      e: pick(
        process.env.CASEOFFICER_R1_USERNAME,
        process.env.CASEWORKER_R1_USERNAME,
      ),
      sec: pick(
        process.env.CASEOFFICER_R1_PASSWORD,
        process.env.CASEWORKER_R1_PASSWORD,
      ),
    },
    caseOfficer_r2: {
      e: pick(
        process.env.CASEOFFICER_R2_USERNAME,
        process.env.CASEWORKER_R2_USERNAME,
      ),
      sec: pick(
        process.env.CASEOFFICER_R2_PASSWORD,
        process.env.CASEWORKER_R2_PASSWORD,
      ),
    },
  },
  demo: {
    solicitor: {
      e: pick(
        process.env.SOLICITOR_USERNAME,
        process.env.PRL_SOLICITOR_USERNAME,
      ),
      sec: pick(
        process.env.SOLICITOR_PASSWORD,
        process.env.PRL_SOLICITOR_PASSWORD,
      ),
    },
    caseOfficer_r1: {
      e: pick(
        process.env.CASEOFFICER_R1_USERNAME,
        process.env.CASEWORKER_R1_USERNAME,
      ),
      sec: pick(
        process.env.CASEOFFICER_R1_PASSWORD,
        process.env.CASEWORKER_R1_PASSWORD,
      ),
    },
    caseOfficer_r2: {
      e: pick(
        process.env.CASEOFFICER_R2_USERNAME,
        process.env.CASEWORKER_R2_USERNAME,
      ),
      sec: pick(
        process.env.CASEOFFICER_R2_PASSWORD,
        process.env.CASEWORKER_R2_PASSWORD,
      ),
    },
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
};
