function hasUserCredentials(): boolean {
  return Boolean(
    (process.env.API_USERNAME && process.env.API_PASSWORD) ||
      (process.env.IDAM_USERNAME && process.env.IDAM_PASSWORD)
  );
}

export function hasApiAuth(): boolean {
  if (process.env.API_BEARER_TOKEN) {
    return true;
  }
  return hasUserCredentials() && hasIdamEnv();
}

import { IdamUtils, ServiceAuthUtils, createLogger } from "@hmcts/playwright-common";

const logger = createLogger({ serviceName: "api-auth", format: "json" });

export interface UserCredentials {
  username: string;
  password: string;
}

function hasIdamEnv(): boolean {
  return Boolean(
    process.env.IDAM_WEB_URL &&
      process.env.IDAM_TESTING_SUPPORT_URL &&
      (process.env.IDAM_CLIENT_ID || process.env.CLIENT_ID) &&
      (process.env.IDAM_CLIENT_SECRET || process.env.IDAM_SECRET)
  );
}

function readUserCredentials(): UserCredentials | undefined {
  const username = process.env.API_USERNAME ?? process.env.IDAM_USERNAME;
  const password = process.env.API_PASSWORD ?? process.env.IDAM_PASSWORD;
  if (!username || !password) {
    logger.info("API_USERNAME/API_PASSWORD not set; proceeding without user-based auth.");
    return undefined;
  }
  return { username, password };
}

let idamUtils: IdamUtils | undefined;
let serviceAuthUtils: ServiceAuthUtils | undefined;

async function getIdamToken(credentials: UserCredentials): Promise<string | undefined> {
  if (!hasIdamEnv()) {
    logger.info("IDAM env vars missing; skipping IDAM token generation.");
    return undefined;
  }
  if (!idamUtils) {
    try {
      idamUtils = new IdamUtils({ logger });
    } catch (error) {
      logger.warn(`Failed to initialise IdamUtils: ${(error as Error).message}`);
      return undefined;
    }
  }

  try {
    return await idamUtils.generateIdamToken({
      grantType: "password",
      clientId: process.env.IDAM_CLIENT_ID ?? process.env.CLIENT_ID ?? "",
      clientSecret: process.env.IDAM_CLIENT_SECRET ?? process.env.IDAM_SECRET ?? "",
      scope: process.env.IDAM_OAUTH2_SCOPE ?? "openid profile roles manage-user search-user",
      username: credentials.username,
      password: credentials.password,
      redirectUri: process.env.IDAM_RETURN_URL
    });
  } catch (error) {
    logger.warn(`Failed to generate IDAM token: ${(error as Error).message}`);
    return undefined;
  }
}

async function getServiceToken(): Promise<string | undefined> {
  const microservice = process.env.S2S_MICROSERVICE_NAME ?? process.env.MICROSERVICE;
  if (!microservice) {
    logger.info("S2S_MICROSERVICE_NAME/MICROSERVICE not set; skipping S2S token generation.");
    return undefined;
  }

  if (!serviceAuthUtils) {
    try {
      serviceAuthUtils = new ServiceAuthUtils({ logger });
    } catch (error) {
      logger.warn(`Failed to initialise ServiceAuthUtils: ${(error as Error).message}`);
      return undefined;
    }
  }

  try {
    return await serviceAuthUtils.retrieveToken({
      microservice,
      secret: process.env.S2S_SECRET
    });
  } catch (error) {
    logger.warn(`Failed to generate S2S token: ${(error as Error).message}`);
    return undefined;
  }
}

export async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  const bearer = process.env.API_BEARER_TOKEN;
  if (bearer) {
    headers.Authorization = bearer.startsWith("Bearer ") ? bearer : `Bearer ${bearer}`;
  } else {
    const credentials = readUserCredentials();
    const idamToken = credentials ? await getIdamToken(credentials) : undefined;
    if (idamToken) {
      headers.Authorization = `Bearer ${idamToken}`;
    }
  }

  const serviceToken = await getServiceToken();
  if (serviceToken) {
    headers.ServiceAuthorization = serviceToken.startsWith("Bearer ")
      ? serviceToken
      : `Bearer ${serviceToken}`;
  }

  return headers;
}

export async function disposeAuthClients(): Promise<void> {
  await Promise.all([
    idamUtils?.dispose().catch((error) => logger.warn(`IdamUtils dispose failed: ${(error as Error).message}`)),
    serviceAuthUtils
      ?.dispose()
      .catch((error) => logger.warn(`ServiceAuthUtils dispose failed: ${(error as Error).message}`))
  ]);
}
