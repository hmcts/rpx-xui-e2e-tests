import uiConfig from "../../utils/ui/config.utils.js";

export function resolveBaseUrl(value?: string): string {
  return value?.trim() ? value : `${uiConfig.urls.exuiDefaultUrl}/`;
}

export function resolveTestEnv(value?: string): string {
  return value !== undefined && (value.includes("aat") || value.includes("demo")) ? value : "aat";
}

export const config = {
  baseUrl: resolveBaseUrl(process.env.TEST_URL),
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
    aat: { docId: process.env.EM_DOC_ID ?? "" },
    demo: { docId: process.env.EM_DOC_ID ?? "" }
  },
  testEnv: resolveTestEnv(process.env.TEST_ENV),
  users: {
    aat: {
      solicitor: { e: process.env.SOLICITOR_USERNAME ?? "", sec: process.env.SOLICITOR_PASSWORD ?? "" },
      caseOfficer_r1: { e: process.env.CASEOFFICER_R1_USERNAME ?? "", sec: process.env.CASEOFFICER_R1_PASSWORD ?? "" },
      caseOfficer_r2: { e: process.env.CASEOFFICER_R2_USERNAME ?? "", sec: process.env.CASEOFFICER_R2_PASSWORD ?? "" }
    },
    demo: {
      solicitor: { e: process.env.SOLICITOR_USERNAME ?? "", sec: process.env.SOLICITOR_PASSWORD ?? "" },
      caseOfficer_r1: { e: process.env.CASEOFFICER_R1_USERNAME ?? "", sec: process.env.CASEOFFICER_R1_PASSWORD ?? "" },
      caseOfficer_r2: { e: process.env.CASEOFFICER_R2_USERNAME ?? "", sec: process.env.CASEOFFICER_R2_PASSWORD ?? "" }
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
    ]
  },
  workallocation: {
    aat: {
      locationId: process.env.WA_LOCATION_ID ?? "698118",
      judgeUser: {
        email: process.env.JUDGE_USERNAME ?? "",
        id: process.env.JUDGE_IDAM_ID ?? "",
        name: process.env.JUDGE_DISPLAY_NAME ?? ""
      },
      legalOpsUser: {
        email: process.env.CASEWORKER_R1_USERNAME ?? "",
        id: process.env.CASEWORKER_R1_IDAM_ID ?? "",
        name: process.env.CASEWORKER_R1_DISPLAY_NAME ?? ""
      },
      iaCaseIds: process.env.WA_IA_CASE_IDS?.split(",").filter(Boolean) ?? []
    },
    demo: {
      locationId: process.env.WA_LOCATION_ID ?? "765324",
      judgeUser: {
        email: process.env.JUDGE_USERNAME ?? "",
        id: process.env.JUDGE_IDAM_ID ?? "",
        name: process.env.JUDGE_DISPLAY_NAME ?? ""
      },
      iaCaseIds: process.env.WA_IA_CASE_IDS?.split(",").filter(Boolean) ?? []
    }
  }
};

export const __test__ = {
  resolveBaseUrl,
  resolveTestEnv
};
