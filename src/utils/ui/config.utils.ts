const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

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

const testEnv = process.env.TEST_ENV ?? "aat";
const exuiDefaultUrl = trimTrailingSlash(
  process.env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net"
);

const manageCaseBaseUrl = trimTrailingSlash(
  process.env.MANAGE_CASES_BASE_URL ??
    (exuiDefaultUrl.endsWith("/cases") ? exuiDefaultUrl : `${exuiDefaultUrl}/cases`)
);

export const config: Config = {
  testEnv,
  urls: {
    exuiDefaultUrl,
    manageCaseBaseUrl,
    idamWebUrl: process.env.IDAM_WEB_URL ?? "https://idam-web-public.aat.platform.hmcts.net",
    idamTestingSupportUrl:
      process.env.IDAM_TESTING_SUPPORT_URL ??
      "https://idam-testing-support-api.aat.platform.hmcts.net",
    serviceAuthUrl:
      process.env.S2S_URL ??
      "http://rpe-service-auth-provider-aat.service.core-compute-aat.internal/testing-support/lease"
  }
};

export default config;
