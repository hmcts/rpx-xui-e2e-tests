import fs from "node:fs";

import { SessionUtils } from "@hmcts/playwright-common";
import {
  request as playwrightRequest,
  type APIRequestContext,
  type Cookie,
  type Page,
} from "@playwright/test";

import { ensureUiStorageStateForUser } from "../ui/session-storage.utils.js";
import { resolveUiStoragePathForUser } from "../ui/storage-state.utils.js";
import { UserUtils } from "../ui/user.utils.js";

export interface LoadedSession {
  email: string;
  cookies: Cookie[];
  storageFile: string;
}

type UserDetailsPayload = {
  userInfo?: {
    uid?: string;
    roles?: unknown;
    [key: string]: unknown;
  };
};

type JurisdictionPayload = Array<{
  caseTypes?: Array<{ id?: unknown; name?: unknown }>;
}>;

export interface SessionCapabilityExpectations {
  requireOrganisationAccess?: boolean;
  requiredRolesAll?: string[];
  requiredRolesAny?: string[];
  requiredCreateCaseTypes?: string[];
}

export interface ResolvedCapabilitySession extends LoadedSession {
  userIdentifier: string;
  resolvedCaseType?: string;
}

type ApiRequestFactory = {
  newContext: (
    options?: Parameters<typeof playwrightRequest.newContext>[0],
  ) => Promise<APIRequestContext>;
};

const defaultBaseUrl =
  process.env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net";

const normalizeRoleSet = (value: unknown): Set<string> => {
  if (!Array.isArray(value)) {
    return new Set<string>();
  }
  return new Set(
    value
      .filter((role): role is string => typeof role === "string")
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean),
  );
};

const normalizeCaseTypeSet = (payload: unknown): Set<string> => {
  if (!Array.isArray(payload)) {
    return new Set<string>();
  }
  const values = new Set<string>();
  for (const jurisdiction of payload as JurisdictionPayload) {
    if (!Array.isArray(jurisdiction.caseTypes)) {
      continue;
    }
    for (const caseType of jurisdiction.caseTypes) {
      if (typeof caseType.id === "string" && caseType.id.trim()) {
        values.add(caseType.id.trim().toLowerCase());
      }
      if (typeof caseType.name === "string" && caseType.name.trim()) {
        values.add(caseType.name.trim().toLowerCase());
      }
    }
  }
  return values;
};

const formatResponseError = async (
  status: number,
  endpoint: string,
  responseText: string,
): Promise<never> => {
  const trimmedText = responseText.trim().slice(0, 300);
  throw new Error(
    `Session capability preflight failed: GET ${endpoint} returned ${status}${trimmedText ? ` body=${trimmedText}` : ""}`,
  );
};

const createCookieHeader = (cookies: Cookie[]): string =>
  cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

export function loadSessionCookies(userIdentifier: string): LoadedSession {
  const userUtils = new UserUtils();
  const creds = userUtils.getUserCredentials(userIdentifier);
  const storageFile = resolveUiStoragePathForUser(userIdentifier);
  let cookies: Cookie[] = [];

  if (fs.existsSync(storageFile)) {
    try {
      cookies = SessionUtils.getCookies(storageFile);
    } catch {
      // no-op: tests will proceed without session cookies
    }
  }

  return { email: creds.email, cookies, storageFile };
}

export async function ensureSessionCookies(
  userIdentifier: string,
  options?: { strict?: boolean },
): Promise<LoadedSession> {
  await ensureUiStorageStateForUser(userIdentifier, {
    strict: options?.strict ?? true,
  });
  return loadSessionCookies(userIdentifier);
}

export async function applyCookiesToPage(
  page: Page,
  cookies: Cookie[],
): Promise<void> {
  if (!cookies.length) {
    return;
  }
  await page.context().addCookies(cookies);
}

export async function assertSessionCapabilities(
  requestContext: APIRequestContext | ApiRequestFactory,
  session: LoadedSession,
  options: SessionCapabilityExpectations,
): Promise<void> {
  if (!session.cookies.length) {
    throw new Error(
      `Session capability preflight failed: no cookies found in storage state ${session.storageFile}`,
    );
  }

  const requestFactory =
    typeof (requestContext as ApiRequestFactory).newContext === "function"
      ? (requestContext as ApiRequestFactory)
      : playwrightRequest;

  const api = await requestFactory.newContext({
    baseURL: defaultBaseUrl,
    extraHTTPHeaders: {
      Cookie: createCookieHeader(session.cookies),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  try {
    const detailsResponse = await api.get("/api/user/details", {
      failOnStatusCode: false,
    });
    const detailsText = await detailsResponse.text();
    if (!detailsResponse.ok()) {
      await formatResponseError(
        detailsResponse.status(),
        "/api/user/details",
        detailsText,
      );
    }

    let userDetails: UserDetailsPayload;
    try {
      userDetails = JSON.parse(detailsText) as UserDetailsPayload;
    } catch (error) {
      throw new Error(
        `Session capability preflight failed: unable to parse /api/user/details response: ${(error as Error).message}`,
      );
    }

    const roles = normalizeRoleSet(userDetails.userInfo?.roles);
    const requiredRolesAll = (options.requiredRolesAll ?? []).map((role) =>
      role.trim().toLowerCase(),
    );
    const requiredRolesAny = (options.requiredRolesAny ?? []).map((role) =>
      role.trim().toLowerCase(),
    );
    const observedRoles = Array.from(roles).sort();

    const missingAll = requiredRolesAll.filter((role) => !roles.has(role));
    if (missingAll.length) {
      throw new Error(
        `Session capability preflight failed: missing required roles (all) [${missingAll.join(", ")}] for ${session.email}. observedRoles=[${observedRoles.join(", ")}]`,
      );
    }
    if (
      requiredRolesAny.length &&
      !requiredRolesAny.some((role) => roles.has(role))
    ) {
      throw new Error(
        `Session capability preflight failed: user ${session.email} does not have any required role from [${requiredRolesAny.join(", ")}]. observedRoles=[${observedRoles.join(", ")}]`,
      );
    }

    if (options.requireOrganisationAccess) {
      const organisationResponse = await api.get("/api/organisation", {
        failOnStatusCode: false,
      });
      const organisationText = await organisationResponse.text();
      if (!organisationResponse.ok()) {
        await formatResponseError(
          organisationResponse.status(),
          "/api/organisation",
          organisationText,
        );
      }
    }

    const requiredCaseTypes = (options.requiredCreateCaseTypes ?? []).map(
      (caseType) => caseType.trim().toLowerCase(),
    );
    if (requiredCaseTypes.length) {
      const uid = userDetails.userInfo?.uid;
      if (!uid || typeof uid !== "string") {
        throw new Error(
          "Session capability preflight failed: /api/user/details did not provide userInfo.uid required for jurisdictions create-access check.",
        );
      }
      const jurisdictionsResponse = await api.get(
        `/aggregated/caseworkers/${uid}/jurisdictions?access=create`,
        { failOnStatusCode: false },
      );
      const jurisdictionsText = await jurisdictionsResponse.text();
      if (!jurisdictionsResponse.ok()) {
        await formatResponseError(
          jurisdictionsResponse.status(),
          "/aggregated/caseworkers/:uid/jurisdictions?access=create",
          jurisdictionsText,
        );
      }
      const caseTypeSet = normalizeCaseTypeSet(
        JSON.parse(jurisdictionsText) as unknown,
      );
      const missingCaseTypes = requiredCaseTypes.filter(
        (caseType) => !caseTypeSet.has(caseType),
      );
      if (missingCaseTypes.length) {
        throw new Error(
          `Session capability preflight failed: missing create-access case types [${missingCaseTypes.join(", ")}] for ${session.email}`,
        );
      }
    }
  } finally {
    await api.dispose().catch(() => undefined);
  }
}

export async function selectSessionByCapabilities(
  requestContext: APIRequestContext | ApiRequestFactory,
  userIdentifiers: string[],
  options: SessionCapabilityExpectations & {
    requiredCreateCaseTypesAny?: string[];
    strict?: boolean;
  },
): Promise<ResolvedCapabilitySession> {
  const errors: string[] = [];
  const strict = options.strict ?? false;
  const requiredAnyCaseTypes = (options.requiredCreateCaseTypesAny ?? [])
    .map((value) => value.trim())
    .filter(Boolean);

  for (const userIdentifier of userIdentifiers) {
    let session: LoadedSession;
    try {
      session = await ensureSessionCookies(userIdentifier, { strict });
    } catch (error) {
      errors.push(
        `${userIdentifier}: session bootstrap failed (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }

    if (!session.cookies.length) {
      errors.push(`${userIdentifier}: no session cookies available`);
      continue;
    }

    const baseExpectations: SessionCapabilityExpectations = {
      requireOrganisationAccess: options.requireOrganisationAccess,
      requiredRolesAll: options.requiredRolesAll,
      requiredRolesAny: options.requiredRolesAny,
    };

    if (requiredAnyCaseTypes.length) {
      let matchedCaseType: string | undefined;
      let lastCaseTypeError = "";
      for (const caseType of requiredAnyCaseTypes) {
        try {
          await assertSessionCapabilities(requestContext, session, {
            ...baseExpectations,
            requiredCreateCaseTypes: [caseType],
          });
          matchedCaseType = caseType;
          break;
        } catch (error) {
          lastCaseTypeError =
            error instanceof Error ? error.message : String(error);
        }
      }
      if (!matchedCaseType) {
        errors.push(
          `${userIdentifier}: missing required create-access case types anyOf=[${requiredAnyCaseTypes.join(", ")}] (${lastCaseTypeError})`,
        );
        continue;
      }
      return { ...session, userIdentifier, resolvedCaseType: matchedCaseType };
    }

    try {
      await assertSessionCapabilities(requestContext, session, {
        ...baseExpectations,
        requiredCreateCaseTypes: options.requiredCreateCaseTypes,
      });
      return { ...session, userIdentifier };
    } catch (error) {
      errors.push(
        `${userIdentifier}: capability preflight failed (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  throw new Error(
    `No user candidate satisfies required session capabilities. Attempts: ${errors.join(" | ")}`,
  );
}
