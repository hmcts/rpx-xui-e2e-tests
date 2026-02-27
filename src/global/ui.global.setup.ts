import {
  IdamUtils,
  ServiceAuthUtils,
  createLogger,
} from "@hmcts/playwright-common";
import { FullConfig } from "@playwright/test";

const TRUTHY_FLAGS = new Set(["1", "true", "yes", "on", "all"]);
const DEFAULT_IDAM_CLIENT_ID = "xuiwebapp";
const DEFAULT_IDAM_SCOPE = "profile roles";
const INVALID_CLIENT_CREDENTIALS_SCOPES = new Set(["openid"]);

type LoggerInstance = ReturnType<typeof createLogger>;

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return TRUTHY_FLAGS.has(value.trim().toLowerCase());
}

function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  for (const candidate of values) {
    const normalised = candidate?.trim();
    if (normalised) {
      return normalised;
    }
  }
  return undefined;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function sanitiseClientCredentialsScope(scopeValue: string): string {
  const scopes = scopeValue
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !INVALID_CLIENT_CREDENTIALS_SCOPES.has(value));
  if (scopes.length === 0) {
    return DEFAULT_IDAM_SCOPE;
  }
  return [...new Set(scopes)].join(" ");
}

function shouldAllowFailure(flagName: string): boolean {
  const override = process.env[flagName];
  if (override) {
    return isTruthy(override);
  }
  return !isTruthy(process.env.CI);
}

async function hydrateCreateUserToken(logger: LoggerInstance): Promise<void> {
  if (firstNonEmpty(process.env.CREATE_USER_BEARER_TOKEN)) {
    logger.info("CREATE_USER_BEARER_TOKEN already set; skipping hydration.");
    return;
  }
  if (isTruthy(process.env.SKIP_CREATE_USER_TOKEN_SETUP)) {
    logger.info(
      "Skipping CREATE_USER_BEARER_TOKEN hydration via SKIP_CREATE_USER_TOKEN_SETUP.",
    );
    return;
  }

  const idamWebUrl = firstNonEmpty(process.env.IDAM_WEB_URL);
  const idamTestingSupportUrl = firstNonEmpty(
    process.env.IDAM_TESTING_SUPPORT_URL,
  );
  const idamSecret = firstNonEmpty(process.env.IDAM_SECRET);
  const allowFailure = shouldAllowFailure("ALLOW_CREATE_USER_TOKEN_FAILURE");

  if (!idamWebUrl || !idamTestingSupportUrl || !idamSecret) {
    const missing = [
      !idamWebUrl ? "IDAM_WEB_URL" : undefined,
      !idamTestingSupportUrl ? "IDAM_TESTING_SUPPORT_URL" : undefined,
      !idamSecret ? "IDAM_SECRET" : undefined,
    ].filter(Boolean);
    logger.warn(
      "Cannot hydrate CREATE_USER_BEARER_TOKEN; prerequisites missing",
      {
        missing,
      },
    );
    return;
  }

  const clientId =
    firstNonEmpty(
      process.env.IDAM_CLIENT_ID,
      process.env.SERVICES_IDAM_CLIENT_ID,
      process.env.CLIENT_ID,
    ) ?? DEFAULT_IDAM_CLIENT_ID;
  const requestedScope =
    firstNonEmpty(process.env.IDAM_OAUTH2_SCOPE) ?? DEFAULT_IDAM_SCOPE;
  const scope = sanitiseClientCredentialsScope(requestedScope);

  const idamUtils = new IdamUtils({ logger });
  try {
    const token = await idamUtils.generateIdamToken({
      grantType: "client_credentials",
      clientId,
      clientSecret: idamSecret,
      scope,
    });
    process.env.CREATE_USER_BEARER_TOKEN = token;
    logger.info("Hydrated CREATE_USER_BEARER_TOKEN in global setup.", {
      clientId,
    });
  } catch (error) {
    if (allowFailure) {
      logger.warn("Failed to hydrate CREATE_USER_BEARER_TOKEN.", {
        error: formatUnknownError(error),
      });
      return;
    }
    throw error;
  } finally {
    await idamUtils.dispose();
  }
}

async function hydrateS2SToken(logger: LoggerInstance): Promise<void> {
  if (firstNonEmpty(process.env.S2S_TOKEN)) {
    logger.info("S2S_TOKEN already set; skipping hydration.");
    return;
  }
  if (isTruthy(process.env.SKIP_S2S_TOKEN_SETUP)) {
    logger.info("Skipping S2S token hydration via SKIP_S2S_TOKEN_SETUP.");
    return;
  }

  const s2sUrl = firstNonEmpty(process.env.S2S_URL);
  const microservice = firstNonEmpty(
    process.env.S2S_MICROSERVICE_NAME,
    process.env.MICROSERVICE,
  );
  const allowFailure = shouldAllowFailure("ALLOW_S2S_TOKEN_FAILURE");

  if (!s2sUrl || !microservice) {
    const missing = [
      !s2sUrl ? "S2S_URL" : undefined,
      !microservice ? "S2S_MICROSERVICE_NAME/MICROSERVICE" : undefined,
    ].filter(Boolean);
    logger.warn("Cannot hydrate S2S_TOKEN; prerequisites missing", {
      missing,
    });
    return;
  }

  const serviceAuthUtils = new ServiceAuthUtils({ logger });
  try {
    const token = await serviceAuthUtils.retrieveToken({ microservice });
    process.env.S2S_TOKEN = token;
    logger.info("Hydrated S2S_TOKEN in global setup.", { microservice });
  } catch (error) {
    if (allowFailure) {
      logger.warn("Failed to hydrate S2S_TOKEN.", {
        error: formatUnknownError(error),
      });
      return;
    }
    throw error;
  } finally {
    await serviceAuthUtils.dispose();
  }
}

async function globalSetup(_full: FullConfig): Promise<void> {
  const logger = createLogger({
    serviceName: "ui-global-setup",
    format: "pretty",
  });
  await hydrateCreateUserToken(logger);
  await hydrateS2SToken(logger);
}

export default globalSetup;
