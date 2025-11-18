// DEPRECATED: This module is a compatibility shim. Prefer importing from `@config`.
// It adapts the new centralized config (`config/index.ts`) to the legacy shape expected
// by older page objects and utilities. Once all imports migrate, this file can be removed.
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { environment, prlConfig } from "../config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.resolve(__dirname, "../../.sessions/");

export interface UserCredentials {
  username: string;
  password: string;
  sessionFile: string;
  cookieName?: string;
}

interface Urls {
  exuiDefaultUrl: string;
  manageCaseBaseUrl: string;
  citizenUrl: string;
  idamWebUrl: string;
  idamTestingSupportUrl: string;
  serviceAuthUrl: string;
}

export interface Config {
  users: {
    caseManager: UserCredentials;
    judge: UserCredentials;
    solicitor?: { username?: string; password?: string };
  };
  urls: Urls;
  prl: typeof prlConfig;
  environment: typeof environment;
}

export const config: Config = {
  users: {
    caseManager: {
      username: environment.caseManager.username,
      password: environment.caseManager.password,
      sessionFile: path.join(sessionPath, `${environment.caseManager.username}.json`),
      cookieName: "xui-webapp",
    },
    judge: {
      username: environment.judge.username,
      password: environment.judge.password,
      sessionFile: path.join(sessionPath, `${environment.judge.username}.json`),
      cookieName: "xui-webapp",
    },
    solicitor: {
      username: prlConfig.solicitor.username,
      password: prlConfig.solicitor.password,
    },
  },
  urls: {
    exuiDefaultUrl: environment.appBaseUrl,
    manageCaseBaseUrl: `${environment.appBaseUrl}/cases`,
    citizenUrl: process.env.CITIZEN_FRONTEND_BASE_URL ?? "https://privatelaw.aat.platform.hmcts.net/",
    idamWebUrl: environment.idamWebUrl,
    idamTestingSupportUrl: environment.idamTestingSupportUrl,
    serviceAuthUrl: environment.s2sUrl,
  },
  prl: prlConfig,
  environment,
};
export default config;
