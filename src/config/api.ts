export const resolveBaseUrl = (value?: string): string => {
  const raw = value ?? "https://manage-case.aat.platform.hmcts.net/";
  return raw.endsWith("/") ? raw : `${raw}/`;
};

export const resolveTestEnv = (value?: string): "aat" | "demo" | "local" => {
  if (value && ["aat", "demo", "local"].includes(value)) {
    return value as "aat" | "demo" | "local";
  }
  return "aat";
};

const baseUrl = resolveBaseUrl(process.env.TEST_URL);
const testEnv = resolveTestEnv(process.env.TEST_ENV);

const pick = (...vars: Array<string | undefined>) => vars.find((v) => v && v.trim().length > 0);

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
    ],
    local: [
      { id: "DIVORCE", caseTypeIds: ["xuiTestCaseType"] },
      { id: "IA", caseTypeIds: [] },
      { id: "PROBATE", caseTypeIds: [] }
    ]
  },
  jurisdictionNames: {
    aat: ["Family Divorce", "Public Law", "Immigration & Asylum", "Manage probate application"],
    demo: ["Family Divorce - v104-26.1", "Public Law", "Immigration & Asylum"],
    local: ["Family Divorce", "Public Law", "Immigration & Asylum", "Manage probate application"]
  },
  em: {
    aat: { docId: process.env.EM_DOC_ID ?? "249cfa9e-622c-4877-a588-e9daa3fe10d8" },
    demo: { docId: process.env.EM_DOC_ID ?? "005ed16f-be03-4620-a8ee-9bc90635f6f2" },
    local: { docId: process.env.EM_DOC_ID ?? "" }
  },
  users: {
    aat: {
      solicitor: { e: "xui_auto_test_user_solicitor@mailinator.com", sec: "Monday01" },
      caseOfficer_r1: {
        e: pick(process.env.CASEOFFICER_R1_USERNAME, process.env.CASEWORKER_R1_USERNAME) ?? "xui_auto_co_r1@justice.gov.uk",
        sec: pick(process.env.CASEOFFICER_R1_PASSWORD, process.env.CASEWORKER_R1_PASSWORD) ?? "Welcome01"
      },
      caseOfficer_r2: {
        e: pick(process.env.CASEOFFICER_R2_USERNAME, process.env.CASEWORKER_R2_USERNAME) ?? "xui_auto_co_r2@justice.gov.uk",
        sec: pick(process.env.CASEOFFICER_R2_PASSWORD, process.env.CASEWORKER_R2_PASSWORD) ?? "Welcome01"
      }
    },
    demo: {
      solicitor: { e: "peterxuisuperuser@mailnesia.com", sec: "Monday01" },
      caseOfficer_r1: {
        e: pick(process.env.CASEOFFICER_R1_USERNAME, process.env.CASEWORKER_R1_USERNAME) ?? "xui_caseofficer@justice.gov.uk",
        sec: pick(process.env.CASEOFFICER_R1_PASSWORD, process.env.CASEWORKER_R1_PASSWORD) ?? "Welcome01"
      },
      caseOfficer_r2: {
        e: pick(process.env.CASEOFFICER_R2_USERNAME, process.env.CASEWORKER_R2_USERNAME) ?? "CRD_func_test_demo_user@justice.gov.uk",
        sec: pick(process.env.CASEOFFICER_R2_PASSWORD, process.env.CASEWORKER_R2_PASSWORD) ?? "AldgateT0wer"
      }
    },
    local: {
      solicitor: {
        e: process.env.SOLICITOR_USERNAME ?? "exui.local.srt@hmcts.net",
        sec: process.env.SOLICITOR_PASSWORD ?? "Pa55word11"
      },
      caseOfficer_r1: {
        e: pick(process.env.CASEOFFICER_R1_USERNAME, process.env.CASEWORKER_R1_USERNAME) ?? "exui.local.srt@hmcts.net",
        sec: pick(process.env.CASEOFFICER_R1_PASSWORD, process.env.CASEWORKER_R1_PASSWORD) ?? "Pa55word11"
      },
      caseOfficer_r2: {
        e: pick(process.env.CASEOFFICER_R2_USERNAME, process.env.CASEWORKER_R2_USERNAME) ?? "exui.local.srt@hmcts.net",
        sec: pick(process.env.CASEOFFICER_R2_PASSWORD, process.env.CASEWORKER_R2_PASSWORD) ?? "Pa55word11"
      }
    }
  },
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
    ],
    local: [
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
    },
    local: {
      locationId: process.env.WA_LOCATION_ID ?? "698118",
      judgeUser: {
        email: process.env.JUDGE_USERNAME ?? "exui.local.srt@hmcts.net",
        id: process.env.JUDGE_IDAM_ID ?? "",
        name: process.env.JUDGE_DISPLAY_NAME ?? "Local CCD User"
      },
      legalOpsUser: {
        email: process.env.CASEWORKER_R1_USERNAME ?? "exui.local.srt@hmcts.net",
        id: process.env.CASEWORKER_R1_IDAM_ID ?? "",
        name: process.env.CASEWORKER_R1_DISPLAY_NAME ?? "Local CCD User"
      },
      iaCaseIds: process.env.WA_IA_CASE_IDS?.split(",").filter(Boolean) ?? []
    }
  }
};

export type ApiTestConfig = typeof config;

export const __test__ = {
  resolveBaseUrl,
  resolveTestEnv
};
