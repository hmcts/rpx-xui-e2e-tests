const rawBaseUrl = process.env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net/";
const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl : `${rawBaseUrl}/`;

const testEnvRaw = process.env.TEST_ENV ?? "aat";
const testEnv = ["aat", "demo"].includes(testEnvRaw) ? testEnvRaw : "aat";

type EnvUser = { e?: string; sec?: string };

const envUsers: Record<"aat" | "demo", Record<string, EnvUser>> = {
  aat: {
    solicitor: {
      e: process.env.SOLICITOR_USERNAME,
      sec: process.env.SOLICITOR_PASSWORD
    },
    caseOfficer_r1: {
      e: process.env.CASEOFFICER_R1_USERNAME,
      sec: process.env.CASEOFFICER_R1_PASSWORD
    },
    caseOfficer_r2: {
      e: process.env.CASEOFFICER_R2_USERNAME,
      sec: process.env.CASEOFFICER_R2_PASSWORD
    }
  },
  demo: {
    solicitor: {
      e: process.env.SOLICITOR_USERNAME,
      sec: process.env.SOLICITOR_PASSWORD
    },
    caseOfficer_r1: {
      e: process.env.CASEOFFICER_R1_USERNAME,
      sec: process.env.CASEOFFICER_R1_PASSWORD
    },
    caseOfficer_r2: {
      e: process.env.CASEOFFICER_R2_USERNAME,
      sec: process.env.CASEOFFICER_R2_PASSWORD
    }
  }
};

export const config = {
  baseUrl,
  testEnv,
  jurisdictions: {
    aat: [
      { id: "DIVORCE", caseTypeIds: ["xuiTestCaseType"] },
      { id: "IA", caseTypeIds: [] },
      { id: "PROBATE", caseTypeIds: [] }
    ],
    demo: [
      { id: "DIVORCE", caseTypeIds: ["DIVORCE", "FinancialRemedyMVP2", "FinancialRemedyMVP2"] },
      { id: "IA", caseTypeIds: ["Asylum"] },
      { id: "PROBATE", caseTypeIds: ["GrantOfRepresentation"] }
    ]
  },
  jurisdictionNames: {
    aat: ["Family Divorce", "Public Law", "Immigration & Asylum", "Manage probate application"],
    demo: ["Family Divorce - v104-26.1", "Public Law", "Immigration & Asylum"]
  },
  em: {
    aat: { docId: process.env.EM_DOC_ID ?? "249cfa9e-622c-4877-a588-e9daa3fe10d8" },
    demo: { docId: process.env.EM_DOC_ID ?? "005ed16f-be03-4620-a8ee-9bc90635f6f2" }
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
      "waWorkflowApi"
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
      "waWorkflowApi"
    ]
  },
  workallocation: {
    aat: {
      locationId: "698118",
      judgeUser: {
        email: "330085EMP-@ejudiciary.net",
        id: "519e0c40-d30e-4f42-8a4c-2c79838f0e4e",
        name: "Tom Cruz"
      },
      legalOpsUser: {
        email: "330085EMP-@ejudiciary.net",
        id: "519e0c40-d30e-4f42-8a4c-2c79838f0e4e",
        name: "Tom Cruz"
      },
      iaCaseIds: ["1546883526751282"]
    },
    demo: {
      locationId: "765324",
      judgeUser: {
        email: "330085EMP-@ejudiciary.net",
        id: "519e0c40-d30e-4f42-8a4c-2c79838f0e4e",
        name: "Tom Cruz"
      },
      iaCaseIds: ["1547458486131483"]
    }
  }
};

export type ApiTestConfig = typeof config;
