const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const resolveUrl = (value: string | undefined, fallback: string): string =>
  value && value.trim().length > 0 ? value : fallback;

const getEnvVar = (
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const value = env[name];
  if (!value) {
    throw new Error(`Error: ${name} environment variable is not set`);
  }
  return value;
};

export function resolveTestEnv(value?: string): string {
  return value !== undefined &&
    (value.includes("aat") || value.includes("demo"))
    ? value
    : "aat";
}

export function resolvePreviewConfig(
  previewConfigs: Array<{ previewUrl: string; demoUrl: string }>,
  testUrl?: string,
): { demoUrl: string } | undefined {
  if (!testUrl) {
    return undefined;
  }
  const matchingPreviewToDemo = previewConfigs.filter((conf) =>
    testUrl.includes(conf.previewUrl),
  );
  if (matchingPreviewToDemo.length === 1) {
    return { demoUrl: matchingPreviewToDemo[0].demoUrl };
  }
  return undefined;
}

export function applyPreviewConfig(
  previewConfig: { demoUrl: string } | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!previewConfig) {
    return false;
  }
  env.TEST_ENV = "demo";
  env.TEST_URL = previewConfig.demoUrl;
  return true;
}

export interface Urls {
  exuiDefaultUrl: string;
  manageCaseBaseUrl: string;
  idamWebUrl: string;
  idamTestingSupportUrl: string;
  serviceAuthUrl: string;
}

export interface Config {
  testEnv: string;
  urls: Urls;
}

const previewConfig = resolvePreviewConfig([], process.env.TEST_URL);
applyPreviewConfig(previewConfig);

const testEnv = resolveTestEnv(process.env.TEST_ENV);
const exuiDefaultUrl = trimTrailingSlash(
  resolveUrl(
    process.env.TEST_URL,
    "https://manage-case.aat.platform.hmcts.net",
  ),
);

const manageCaseBaseUrl = trimTrailingSlash(
  resolveUrl(
    process.env.MANAGE_CASES_BASE_URL,
    exuiDefaultUrl.endsWith("/cases")
      ? exuiDefaultUrl
      : `${exuiDefaultUrl}/cases`,
  ),
);

export const config: Config = {
  testEnv,
  urls: {
    exuiDefaultUrl,
    manageCaseBaseUrl,
    idamWebUrl: resolveUrl(
      process.env.IDAM_WEB_URL,
      "https://idam-web-public.aat.platform.hmcts.net",
    ),
    idamTestingSupportUrl: resolveUrl(
      process.env.IDAM_TESTING_SUPPORT_URL,
      "https://idam-testing-support-api.aat.platform.hmcts.net",
    ),
    serviceAuthUrl: resolveUrl(
      process.env.S2S_URL,
      "http://rpe-service-auth-provider-aat.service.core-compute-aat.internal/testing-support/lease",
    ),
  },
};

export default config;

export const __test__ = {
  resolveUrl,
  getEnvVar,
  resolveTestEnv,
  resolvePreviewConfig,
  applyPreviewConfig,
};
