import {
  IdamUtils,
  ServiceAuthUtils,
  createLogger,
} from "@hmcts/playwright-common";
import { FullConfig } from "@playwright/test";

const TRUTHY_FLAGS = new Set(["1", "true", "yes", "on", "all"]);
const DEFAULT_IDAM_CLIENT_ID = "xuiwebapp";
const DEFAULT_ASSIGNMENT_SCOPE = "openid profile roles";
type LoggerInstance = ReturnType<typeof createLogger>;

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return TRUTHY_FLAGS.has(value.trim().toLowerCase());
}

function isManageOrgPrimaryAssignmentEnabled(): boolean {
  const raw = firstNonEmpty(
    process.env.PROFESSIONAL_USER_ASSIGNMENT_USE_MANAGE_ORG_PRIMARY,
  );
  if (!raw) {
    return false;
  }
  return isTruthy(raw);
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

function shouldAllowFailure(flagName: string): boolean {
  const override = process.env[flagName];
  if (override) {
    return isTruthy(override);
  }
  return !isTruthy(process.env.CI);
}

function isApiOnlyRun(): boolean {
  const envProject = process.env.PLAYWRIGHT_PROJECT?.trim().toLowerCase();
  if (envProject === "api") {
    return true;
  }

  const argv = process.argv.slice(2).join(" ").toLowerCase().trim();
  if (!argv.includes("--project")) {
    return false;
  }

  const matches = [...argv.matchAll(/--project(?:=|\s+)([a-z0-9,_-]+)/g)].map(
    (match) => match[1],
  );

  if (matches.length === 0) {
    return false;
  }

  const selectedProjects = matches
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return (
    selectedProjects.length > 0 && selectedProjects.every((p) => p === "api")
  );
}

function getCliFlagValues(flagName: string): string[] {
  const argv = process.argv.slice(2);
  const values: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === flagName) {
      const next = argv[index + 1];
      if (next && !next.startsWith("-")) {
        values.push(next);
        index += 1;
      }
      continue;
    }
    if (value.startsWith(`${flagName}=`)) {
      values.push(value.slice(flagName.length + 1));
    }
  }

  return values;
}

function getCliPositionalArgs(): string[] {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  const flagsWithValues = new Set([
    "--config",
    "--grep",
    "--grep-invert",
    "--project",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("-")) {
      if (flagsWithValues.has(value)) {
        index += 1;
      }
      continue;
    }
    positional.push(value);
  }

  return positional;
}

function containsDynamicUserReference(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("dynamic-user") ||
    normalized.includes("professionaluserprovisioning.spec")
  );
}

function selectionExplicitlyExcludesDynamicUserTests(): boolean {
  const grepInvertValues = [
    ...getCliFlagValues("--grep-invert"),
    firstNonEmpty(process.env.PW_E2E_DEFAULT_GREP_INVERT),
  ].filter(Boolean);

  if (grepInvertValues.some((value) => containsDynamicUserReference(value))) {
    return true;
  }

  const grepValues = getCliFlagValues("--grep");
  if (
    grepValues.length > 0 &&
    grepValues.every((value) => !containsDynamicUserReference(value))
  ) {
    return true;
  }

  const positionalArgs = getCliPositionalArgs().map((value) =>
    value.toLowerCase(),
  );
  return (
    positionalArgs.length > 0 &&
    positionalArgs.every((value) => value.includes("src/tests/integration"))
  );
}

function selectionRequiresCreateUserToken(): boolean {
  if (
    getCliPositionalArgs().some((value) =>
      containsDynamicUserReference(value),
    ) ||
    getCliFlagValues("--grep").some((value) =>
      containsDynamicUserReference(value),
    )
  ) {
    return true;
  }

  if (selectionExplicitlyExcludesDynamicUserTests()) {
    return false;
  }

  const positionalArgs = getCliPositionalArgs().map((value) =>
    value.toLowerCase(),
  );
  if (positionalArgs.length === 0) {
    return true;
  }

  return positionalArgs.some((value) => value.includes("src/tests/e2e"));
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
  if (!selectionRequiresCreateUserToken()) {
    logger.info(
      "CREATE_USER_BEARER_TOKEN not required for selected test scope; skipping hydration guard.",
    );
    return;
  }
  const allowFailure = shouldAllowFailure("ALLOW_CREATE_USER_TOKEN_FAILURE");
  const errorMessage =
    "CREATE_USER_BEARER_TOKEN is required. Global setup no longer calls IDAM token endpoints by policy (IDAM create-user only).";
  if (allowFailure) {
    logger.warn(errorMessage);
    return;
  }
  throw new Error(errorMessage);
}

type ClientCandidate = {
  clientId: string;
  clientSecret: string;
  source: string;
};

function resolveAssignmentClientCandidates(): ClientCandidate[] {
  const candidates: ClientCandidate[] = [];

  const explicitClientId = firstNonEmpty(
    process.env.ORG_USER_ASSIGNMENT_CLIENT_ID,
  );
  const explicitClientSecret = firstNonEmpty(
    process.env.ORG_USER_ASSIGNMENT_CLIENT_SECRET,
  );
  if (explicitClientId && explicitClientSecret) {
    candidates.push({
      clientId: explicitClientId,
      clientSecret: explicitClientSecret,
      source: "ORG_USER_ASSIGNMENT_CLIENT_*",
    });
  }

  const fallbackClientId =
    firstNonEmpty(
      process.env.IDAM_CLIENT_ID,
      process.env.SERVICES_IDAM_CLIENT_ID,
      process.env.CLIENT_ID,
    ) ?? DEFAULT_IDAM_CLIENT_ID;
  const fallbackClientSecret = firstNonEmpty(process.env.IDAM_SECRET);
  if (fallbackClientSecret) {
    const exists = candidates.some(
      (candidate) =>
        candidate.clientId === fallbackClientId &&
        candidate.clientSecret === fallbackClientSecret,
    );
    if (!exists) {
      candidates.push({
        clientId: fallbackClientId,
        clientSecret: fallbackClientSecret,
        source: "IDAM_CLIENT_ID/IDAM_SECRET",
      });
    }
  }

  return candidates;
}

function isInvalidScopeError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("invalid_scope") || lower.includes("unknown/invalid scope")
  );
}

function isInvalidClientError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("invalid_client") ||
    lower.includes("client authentication failed")
  );
}

function uniqueScopes(values: Array<string | undefined>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || result.includes(normalized)) {
      continue;
    }
    result.push(normalized);
  }
  return result;
}

async function hydrateOrgAssignmentBearerToken(
  logger: LoggerInstance,
): Promise<void> {
  if (isManageOrgPrimaryAssignmentEnabled()) {
    logger.info(
      "Skipping ORG_USER_ASSIGNMENT_BEARER_TOKEN hydration because manage-org primary assignment is enabled.",
    );
    return;
  }
  if (firstNonEmpty(process.env.ORG_USER_ASSIGNMENT_BEARER_TOKEN)) {
    logger.info(
      "ORG_USER_ASSIGNMENT_BEARER_TOKEN already set; skipping hydration.",
    );
    return;
  }
  const createUserBearer = firstNonEmpty(process.env.CREATE_USER_BEARER_TOKEN);
  if (createUserBearer) {
    process.env.ORG_USER_ASSIGNMENT_BEARER_TOKEN = createUserBearer;
    logger.warn(
      "Using CREATE_USER_BEARER_TOKEN as ORG_USER_ASSIGNMENT_BEARER_TOKEN in global setup.",
    );
    return;
  }
  if (isTruthy(process.env.SKIP_ORG_ASSIGNMENT_TOKEN_SETUP)) {
    logger.info(
      "Skipping ORG_USER_ASSIGNMENT_BEARER_TOKEN hydration via SKIP_ORG_ASSIGNMENT_TOKEN_SETUP.",
    );
    return;
  }

  const username = firstNonEmpty(process.env.ORG_USER_ASSIGNMENT_USERNAME);
  const password = firstNonEmpty(process.env.ORG_USER_ASSIGNMENT_PASSWORD);
  const clients = resolveAssignmentClientCandidates();
  const scopesToTry = uniqueScopes([
    firstNonEmpty(process.env.ORG_USER_ASSIGNMENT_OAUTH2_SCOPE),
    firstNonEmpty(process.env.IDAM_OAUTH2_SCOPE),
    DEFAULT_ASSIGNMENT_SCOPE,
  ]);
  const redirectUri = firstNonEmpty(
    process.env.ORG_USER_ASSIGNMENT_REDIRECT_URI,
    process.env.IDAM_RETURN_URL,
  );
  const allowFailure = shouldAllowFailure("ALLOW_ORG_ASSIGNMENT_TOKEN_FAILURE");

  if (
    !username ||
    !password ||
    clients.length === 0 ||
    scopesToTry.length === 0
  ) {
    const missing = [
      !username ? "ORG_USER_ASSIGNMENT_USERNAME" : undefined,
      !password ? "ORG_USER_ASSIGNMENT_PASSWORD" : undefined,
      clients.length === 0
        ? "ORG_USER_ASSIGNMENT_CLIENT_* or IDAM_CLIENT_ID/IDAM_SECRET"
        : undefined,
      scopesToTry.length === 0
        ? "ORG_USER_ASSIGNMENT_OAUTH2_SCOPE or IDAM_OAUTH2_SCOPE"
        : undefined,
    ].filter(Boolean);
    const message =
      "Cannot hydrate ORG_USER_ASSIGNMENT_BEARER_TOKEN; prerequisites missing.";
    if (allowFailure) {
      logger.warn(message, { missing });
      return;
    }
    throw new Error(`${message} Missing: ${missing.join(", ")}`);
  }

  const idamUtils = new IdamUtils({ logger });
  let lastError: unknown;
  try {
    for (const client of clients) {
      for (const scope of scopesToTry) {
        try {
          const token = await idamUtils.generateIdamToken({
            grantType: "password",
            clientId: client.clientId,
            clientSecret: client.clientSecret,
            scope,
            username,
            password,
            redirectUri,
          });
          process.env.ORG_USER_ASSIGNMENT_BEARER_TOKEN = token;
          logger.info(
            "Hydrated ORG_USER_ASSIGNMENT_BEARER_TOKEN in global setup.",
            {
              username,
              clientId: client.clientId,
              scope,
              clientSource: client.source,
            },
          );
          return;
        } catch (error) {
          const message = formatUnknownError(error);
          if (isInvalidScopeError(message)) {
            logger.warn(
              "Org-assignment scope rejected; trying next scope candidate.",
              { clientId: client.clientId, scope, clientSource: client.source },
            );
            continue;
          }
          if (isInvalidClientError(message)) {
            logger.warn(
              "Org-assignment client rejected; trying next client candidate.",
              { clientId: client.clientId, scope, clientSource: client.source },
            );
            break;
          }
          lastError = error;
          break;
        }
      }
    }

    const message =
      "Failed to hydrate ORG_USER_ASSIGNMENT_BEARER_TOKEN from configured credentials.";
    if (allowFailure) {
      logger.warn(message, {
        error: lastError ? formatUnknownError(lastError) : undefined,
        username,
        attemptedClients: clients.map(({ clientId, source }) => ({
          clientId,
          source,
        })),
        attemptedScopes: scopesToTry,
      });
      return;
    }
    const details = lastError ? formatUnknownError(lastError) : "unknown error";
    throw new Error(`${message} Last error: ${details}`);
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
  if (isApiOnlyRun()) {
    return;
  }

  const logger = createLogger({
    serviceName: "ui-global-setup",
    format: "pretty",
    level:
      process.env.LOG_LEVEL ?? (isTruthy(process.env.CI) ? "warn" : "info"),
  });
  await hydrateCreateUserToken(logger);
  await hydrateOrgAssignmentBearerToken(logger);
  await hydrateS2SToken(logger);
}

export default globalSetup;
