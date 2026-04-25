import { USER_ENV_MAP, UserUtils } from "../e2e/utils/user.utils.js";

export interface User {
  idamId: string;
  email: string;
  release: string;
  userIdentifier: string;
  key?: string;
}

export interface AppTestConfig {
  getTestEnvFromEnviornment: () => string;
  testEnv: string;
  users: {
    aat: User[];
    demo: User[];
  };
}

const releaseByUserIdentifier: Record<string, string> = {
  SOLICITOR: "general",
  PROD_LIKE: "general",
  IAC_CASEOFFICER_R1: "wa_release_1",
  IAC_CASEOFFICER_R2: "wa_release_2",
  IAC_ADMOFFICER_R1: "wa_release_1",
  IAC_ADMOFFICER_R2: "wa_release_2",
  IAC_JUDGE_WA_R1: "wa_release_1",
  IAC_JUDGE_WA_R2: "wa_release_2",
  IAC_JUDGE_WA_R2_CASEALLOCATOR: "wa_release_2",
  CASEWORKER_GLOBALSEARCH: "general",
  WA2_GLOBAL_SEARCH: "general",
  "BOOKING_UI-FT-ON": "bookingui-WA3",
  STAFF_ADMIN: "general",
  RESTRICTED_CASE_ACCESS_ON: "restricted-case-access-on",
  RESTRICTED_CASE_ACCESS_OFF: "restricted-case-access-off",
  RESTRICTED_CASE_FILE_VIEW_ON: "restricted-case-file-view-v1.1-on",
  RESTRICTED_CASE_FILE_VIEW_OFF: "restricted-case-file-view-v1.1-off",
  SEARCH_EMPLOYMENT_CASE: "restricted-case-file-view-v1.1-on",
  HEARING_MANAGER_CR84_ON: "hearing_CR84",
  HEARING_MANAGER_CR84_OFF: "hearing_CR84",
  USER_WITH_FLAGS: "flagsTest",
  FPL_GLOBAL_SEARCH: "fpl_global_search"
};

const prToTestInDemo: Array<{ previewUrl: string; demoUrl: string }> = [];

export function resolvePreviewConfig(
  previewConfigs: Array<{ previewUrl: string; demoUrl: string }>,
  testUrl?: string
): { demoUrl: string } | undefined {
  if (!testUrl) {
    return undefined;
  }
  const matchingPreviewToDemo = previewConfigs.filter((conf) => testUrl.includes(conf.previewUrl));
  if (matchingPreviewToDemo.length === 1) {
    return { demoUrl: matchingPreviewToDemo[0].demoUrl };
  }
  return undefined;
}

export function applyPreviewConfig(
  previewConfig: { demoUrl: string } | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!previewConfig) {
    return false;
  }
  env.TEST_ENV = "demo";
  env.TEST_URL = previewConfig.demoUrl;
  return true;
}

const previewConfig = resolvePreviewConfig(prToTestInDemo, process.env.TEST_URL);
applyPreviewConfig(previewConfig);

export function resolveTestEnv(value?: string): string {
  return value !== undefined && (value.includes("aat") || value.includes("demo")) ? value : "aat";
}

function resolveConfiguredUsers(): User[] {
  const userUtils = new UserUtils();
  return Object.keys(USER_ENV_MAP).flatMap((userIdentifier) => {
    if (!userUtils.hasUserCredentials(userIdentifier)) {
      return [];
    }

    const credentials = userUtils.getUserCredentials(userIdentifier);
    return [
      {
        idamId: process.env[`${userIdentifier.replaceAll("-", "_")}_IDAM_ID`] ?? "",
        email: credentials.email,
        release: releaseByUserIdentifier[userIdentifier] ?? "general",
        userIdentifier,
        key: credentials.password
      }
    ];
  });
}

const configuredUsers = resolveConfiguredUsers();

const data: AppTestConfig = {
  getTestEnvFromEnviornment: () => resolveTestEnv(process.env.TEST_ENV),
  testEnv: resolveTestEnv(process.env.TEST_ENV),
  users: {
    aat: configuredUsers,
    demo: configuredUsers
  }
};

export default data;

export const __test__ = {
  resolvePreviewConfig,
  applyPreviewConfig,
  resolveTestEnv
};
