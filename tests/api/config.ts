import { activeConfigEnvironment, environment } from "../../config";

type SupportedEnv = string;

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const resolveEnvKey = (): SupportedEnv => {
  const raw = (process.env.TEST_ENV ?? activeConfigEnvironment ?? "aat").toLowerCase();
  if (raw.includes("demo")) return "demo";
  if (raw.includes("local")) return "local";
  return "aat";
};

const envKey = resolveEnvKey();

interface UserRecord {
  e: string;
  sec: string;
}
type UserMap = Partial<
  Record<"solicitor" | "caseOfficer_r1" | "caseManager" | "judge", UserRecord>
>;

const staticUserEnvMap: Record<string, { usernameKey: string; passwordKey: string }> = {
  solicitor: { usernameKey: "SOLICITOR_USERNAME", passwordKey: "SOLICITOR_PASSWORD" },
  caseOfficer_r1: {
    usernameKey: "USER_CASEOFFICER_R1_USERNAME",
    passwordKey: "USER_CASEOFFICER_R1_PASSWORD",
  },
  caseManager: { usernameKey: "CASEMANAGER_USERNAME", passwordKey: "CASEMANAGER_PASSWORD" },
  judge: { usernameKey: "JUDGE_USERNAME", passwordKey: "JUDGE_PASSWORD" },
};

const buildDynamicUserKeys = (role: string) => {
  const normalised = role.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return {
    usernameKey: `USER_${normalised}_USERNAME`,
    passwordKey: `USER_${normalised}_PASSWORD`,
  };
};

const resolveUserCredentials = (role: string): UserRecord | undefined => {
  const mapping =
    staticUserEnvMap[role] ?? staticUserEnvMap[role.toLowerCase()] ?? buildDynamicUserKeys(role);
  const username = process.env[mapping.usernameKey];
  const password = process.env[mapping.passwordKey];
  if (username && password) {
    return { e: username, sec: password };
  }
  return undefined;
};

const buildUsers = (): UserMap => {
  const entries: UserMap = {};
  (["solicitor", "caseOfficer_r1", "caseManager", "judge"] as const).forEach((role) => {
    const creds = resolveUserCredentials(role);
    if (creds) {
      entries[role] = creds;
    }
  });
  return entries;
};

export const config = {
  baseUrl: stripTrailingSlash(process.env.APP_API_BASE_URL ?? environment.apiBaseUrl),
  testEnv: envKey,
  jurisdictions: {
    aat: [
      {
        id: "DIVORCE",
        caseTypeIds: ["xuiTestCaseType"],
      },
      {
        id: "IA",
        caseTypeIds: [],
      },
      {
        id: "PROBATE",
        caseTypeIds: [],
      },
    ],
    demo: [
      {
        id: "DIVORCE",
        caseTypeIds: ["DIVORCE", "FinancialRemedyMVP2", "FinancialRemedyMVP2"],
      },
      {
        id: "IA",
        caseTypeIds: ["Asylum"],
      },
      {
        id: "PROBATE",
        caseTypeIds: ["GrantOfRepresentation"],
      },
    ],
  },
  jurisdcitionNames: {
    aat: ["Family Divorce", "Public Law", "Immigration & Asylum", "Manage probate application"],
    demo: ["Family Divorce - v104-26.1", "Public Law", "Immigration & Asylum"],
  },
  em: {
    aat: {
      docId: "249cfa9e-622c-4877-a588-e9daa3fe10d8",
    },
    demo: {
      docId: "005ed16f-be03-4620-a8ee-9bc90635f6f2",
    },
  },
  configuratioUi: {
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
  users: {
    [envKey]: buildUsers(),
  },
};

export type ApiConfig = typeof config;

export const hasUserCredentials = (role: string): boolean => !!resolveUserCredentials(role);
