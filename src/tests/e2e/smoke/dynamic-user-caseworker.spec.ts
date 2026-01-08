import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { IdamPage, IdamUtils, ServiceAuthUtils } from "@hmcts/playwright-common";
import { request as playwrightRequest, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

import {
  PRL_TEST_SUPPORT_CASE_DATA,
  PRL_TEST_SUPPORT_CASE_TYPE_ID,
  PRL_TEST_SUPPORT_EVENT_ID
} from "../../../data/ccd/prl-case-create";
import { test, expect } from "../../../fixtures/ui";
import { createCase } from "../../../utils/api/case-creation";

const truthy = new Set(["1", "true", "yes", "on"]);
const IDAM_CREATE_RETRY_ATTEMPTS = 3;
const IDAM_CREATE_RETRY_DELAY_MS = 2000;

const resolveEnv = (names: string[], fallback?: string): string | undefined => {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const shouldRetryIdamCreate = (status: number): boolean =>
  status === 429 || status >= 500;

const asBearer = (token: string): string =>
  token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;

const normaliseCaseReference = (value: string): string => value.replace(/\D/g, "");

const resolveRoleDumpPath = (): string => {
  const customPath = resolveEnv(["RAS_ROLE_DUMP_PATH"], undefined);
  if (customPath) {
    return customPath;
  }
  return path.join(process.cwd(), "test-results", "ras-roles.json");
};

const resolveOAuthClientId = (): string | undefined =>
  resolveEnv(
    [
      "CREATE_USER_CLIENT_ID",
      "CCD_DATA_STORE_CLIENT_ID",
      "CLIENT_ID",
      "IDAM_OAUTH2_CLIENT_ID",
      "IDAM_CLIENT_ID",
      "SERVICES_IDAM_CLIENT_ID",
    ],
    undefined
  );

const resolveOAuthClientSecret = (): string | undefined =>
  resolveEnv(
    [
      "CREATE_USER_CLIENT_SECRET",
      "CCD_DATA_STORE_SECRET",
      "IDAM_SECRET",
      "IDAM_OAUTH2_CLIENT_SECRET",
    ],
    undefined
  );

const resolveOAuthScope = (): string =>
  resolveEnv(
    ["CREATE_USER_SCOPE", "IDAM_OAUTH2_SCOPE"],
    "roles manage-user create-user search-user"
  ) as string;

const resolveRoleAssignmentBaseUrl = (testEnv: string): string =>
  resolveEnv(
    ["ROLE_ASSIGNMENT_BASE_URL"],
    `http://am-role-assignment-service-${testEnv}.service.core-compute-${testEnv}.internal`
  ) as string;

const resolveS2SMicroservice = (): string =>
  resolveEnv(
    ["S2S_MICROSERVICE_NAME", "MICROSERVICE"],
    "xui_webapp"
  ) as string;

const resolveRoleAssignmentConfig = () => {
  const roleType = (process.env.RAS_ROLE_TYPE ?? "ORGANISATION").toUpperCase();
  const roleName = process.env.RAS_ROLE_NAME ?? "caseworker";
  const roleCategory = (process.env.RAS_ROLE_CATEGORY ?? "LEGAL_OPERATIONS").toUpperCase();
  const grantType = (process.env.RAS_GRANT_TYPE ?? (roleType === "CASE" ? "SPECIFIC" : "STANDARD")).toUpperCase();
  const classification = (process.env.RAS_CLASSIFICATION ?? "PUBLIC").toUpperCase();
  const processName = process.env.RAS_PROCESS ?? "poc-playwright";
  return {
    roleType,
    roleName,
    roleCategory,
    grantType,
    classification,
    processName,
  };
};

const resolveRoleAssignmentAttributes = (roleType: string): Record<string, string> => {
  const rawJson = process.env.RAS_ATTRIBUTES_JSON?.trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson) as Record<string, string>;
    } catch (error) {
      throw new Error(
        `RAS_ATTRIBUTES_JSON is not valid JSON: ${(error as Error).message}`
      );
    }
  }

  const attributes: Record<string, string> = {};
  const assignIfPresent = (key: string, envName: string) => {
    const value = process.env[envName];
    if (value && value.trim().length > 0) {
      attributes[key] = value.trim();
    }
  };

  assignIfPresent("jurisdiction", "RAS_JURISDICTION");
  assignIfPresent("caseType", "RAS_CASE_TYPE");
  assignIfPresent("region", "RAS_REGION");
  assignIfPresent("baseLocation", "RAS_BASE_LOCATION");
  assignIfPresent("primaryLocation", "RAS_PRIMARY_LOCATION");
  assignIfPresent("caseId", "RAS_CASE_ID");

  if (roleType === "CASE" && !attributes.caseId) {
    throw new Error("RAS_ROLE_TYPE=CASE requires RAS_CASE_ID (or RAS_ATTRIBUTES_JSON).");
  }

  return attributes;
};

const resolveCaseIdForAssignment = (): string | undefined => {
  const caseId = resolveEnv(
    ["COURT_ADMIN_CASE_ID", "ROLE_ACCESS_CASE_ID"],
    undefined
  );
  if (!caseId) {
    return undefined;
  }
  const trimmed = caseId.trim();
  if (!trimmed || trimmed === "1234567890123456") {
    return undefined;
  }
  return trimmed;
};

type CaseCreationConfig = {
  caseTypeId: string;
  eventId: string;
  data: Record<string, unknown>;
};

const resolveCaseCreatorCredentials = ():
  | { username: string; password: string }
  | undefined => {
  const username = resolveEnv(
    ["CASE_CREATE_USERNAME", "PRL_SOLICITOR_USERNAME", "SOLICITOR_USERNAME"],
    undefined
  );
  const password = resolveEnv(
    ["CASE_CREATE_PASSWORD", "PRL_SOLICITOR_PASSWORD", "SOLICITOR_PASSWORD"],
    undefined
  );
  if (!username || !password) {
    return undefined;
  }
  return { username, password };
};

const resolveCaseCreationConfig = (): CaseCreationConfig => {
  const caseTypeId = resolveEnv(
    ["CASE_CREATE_CASE_TYPE_ID", "PRL_CASE_TYPE_ID"],
    PRL_TEST_SUPPORT_CASE_TYPE_ID
  ) as string;
  const eventId = resolveEnv(
    ["CASE_CREATE_EVENT_ID", "PRL_CASE_EVENT_ID"],
    PRL_TEST_SUPPORT_EVENT_ID
  ) as string;
  const caseTypeOfApplication = resolveEnv(
    ["CASE_CREATE_APPLICATION_TYPE", "PRL_CASE_TYPE_OF_APPLICATION"],
    PRL_TEST_SUPPORT_CASE_DATA.caseTypeOfApplication
  ) as string;
  const baseCaseName = resolveEnv(
    ["CASE_CREATE_CASE_NAME"],
    PRL_TEST_SUPPORT_CASE_DATA.applicantCaseName
  ) as string;
  const nameSuffix = randomUUID().split("-")[0];

  return {
    caseTypeId,
    eventId,
    data: {
      ...PRL_TEST_SUPPORT_CASE_DATA,
      caseTypeOfApplication,
      applicantCaseName: `${baseCaseName} ${nameSuffix}`,
    },
  };
};

const resolveCourtAdminCredentials = (): { username: string; password: string } | undefined => {
  const username = resolveEnv(["COURT_ADMIN_USERNAME"], undefined);
  const password = resolveEnv(["COURT_ADMIN_PASSWORD"], undefined);
  if (!username || !password) {
    return undefined;
  }
  return { username, password };
};

const resolveCaseManagerCredentials = ():
  | { username: string; password: string }
  | undefined => {
  const username = resolveEnv(["CASEMANAGER_USERNAME"], undefined);
  const password = resolveEnv(["CASEMANAGER_PASSWORD"], undefined);
  if (!username || !password) {
    return undefined;
  }
  return { username, password };
};

const resolveCourtAdminAssignmentConfig = () => {
  const jurisdiction = resolveEnv(
    ["COURT_ADMIN_JURISDICTION", "RAS_JURISDICTION"],
    "PRIVATELAW"
  ) as string;
  const roleId = resolveEnv(["COURT_ADMIN_ROLE_ID"], "case-manager") as string;
  const roleName = resolveEnv(["COURT_ADMIN_ROLE_NAME"], "Case manager") as string;
  const roleCategory = resolveEnv(
    ["COURT_ADMIN_ROLE_CATEGORY"],
    "LEGAL_OPERATIONS"
  ) as string;
  const durationOfRole = resolveEnv(
    ["COURT_ADMIN_ROLE_DURATION"],
    "Indefinite"
  ) as string;
  const stateRaw = resolveEnv(["COURT_ADMIN_STATE"], "4") as string;
  const state = Number.parseInt(stateRaw, 10);
  return {
    jurisdiction,
    roleId,
    roleName,
    roleCategory,
    durationOfRole,
    state: Number.isNaN(state) ? 4 : state,
  };
};

type CaseMeta = {
  jurisdiction?: string;
  jurisdictionId?: string;
  caseType?: string;
  caseTypeId?: string;
};

const resolveCaseSearchFilters = (fallback: CaseMeta): CaseMeta => {
  const jurisdiction = resolveEnv(
    ["COURT_ADMIN_JURISDICTION_LABEL", "COURT_ADMIN_JURISDICTION", "RAS_JURISDICTION"],
    undefined
  );
  const caseType = resolveEnv(
    ["COURT_ADMIN_CASE_TYPE_LABEL", "COURT_ADMIN_CASE_TYPE"],
    undefined
  );
  return {
    jurisdiction: jurisdiction ?? fallback.jurisdiction,
    caseType: caseType ?? fallback.caseType,
  };
};

const fetchCaseMeta = async (
  request: APIRequestContext,
  caseId: string
): Promise<CaseMeta | undefined> => {
  const response = await request.get(`data/internal/cases/${caseId}`, {
    failOnStatusCode: false,
  });
  if (!response.ok()) {
    return undefined;
  }
  const data = await response.json().catch(() => undefined);
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const caseType = (data as {
    case_type?: {
      id?: string;
      name?: string;
      jurisdiction?: { id?: string; name?: string };
    };
  }).case_type;
  return {
    jurisdiction: caseType?.jurisdiction?.name,
    jurisdictionId: caseType?.jurisdiction?.id,
    caseType: caseType?.name,
    caseTypeId: caseType?.id,
  };
};

type ValidRole = {
  roleId?: string;
  roleName?: string;
  roleCategory?: string;
};

type RolesByService = {
  service?: string;
  roles?: ValidRole[];
};

const normaliseRoleCategory = (value?: string): string | undefined =>
  value ? value.toUpperCase() : undefined;

const normaliseRoleValue = (value?: string): string | undefined =>
  value ? value.trim().toLowerCase() : undefined;

const roleValueMatches = (left?: string, right?: string): boolean => {
  const leftValue = normaliseRoleValue(left);
  const rightValue = normaliseRoleValue(right);
  return !!leftValue && leftValue === rightValue;
};

const resolvePersonDomain = (roleCategory?: string): string => {
  switch (normaliseRoleCategory(roleCategory)) {
    case "JUDICIAL":
      return "Judicial";
    case "ADMIN":
      return "Admin";
    case "CTSC":
      return "CTSC";
    case "LEGAL_OPERATIONS":
    default:
      return "Legal Ops";
  }
};

const fetchValidRoles = async (
  request: APIRequestContext,
  jurisdictionId: string
): Promise<ValidRole[]> => {
  const response = await request.post(
    "api/role-access/allocate-role/valid-roles",
    {
      data: { serviceIds: [jurisdictionId] },
      failOnStatusCode: false,
    }
  );
  if (!response.ok()) {
    return [];
  }
  const body = await response.json().catch(() => []);
  if (!Array.isArray(body)) {
    return [];
  }
  const entry = body.find(
    (item: RolesByService) =>
      typeof item?.service === "string" &&
      item.service.toLowerCase() === jurisdictionId.toLowerCase()
  );
  return Array.isArray(entry?.roles) ? entry!.roles : [];
};

const buildRoleCandidates = (
  validRoles: ValidRole[],
  assignmentConfig: ReturnType<typeof resolveCourtAdminAssignmentConfig>
) => {
  const fallbackCategory =
    normaliseRoleCategory(assignmentConfig.roleCategory) ?? "LEGAL_OPERATIONS";
  const preferredRoleId = assignmentConfig.roleId;
  const preferredRoleName = assignmentConfig.roleName;
  const candidates: ValidRole[] = [];

  const pool = validRoles.filter((role) => {
    const category = normaliseRoleCategory(role.roleCategory);
    return !category || category === fallbackCategory;
  });
  const rolesToUse = pool.length > 0 ? pool : validRoles;

  const addCandidate = (role?: ValidRole) => {
    if (!role) {
      return;
    }
    const exists = candidates.some(
      (existing) =>
        roleValueMatches(existing.roleId, role.roleId) &&
        roleValueMatches(existing.roleName, role.roleName)
    );
    if (!exists) {
      candidates.push(role);
    }
  };

  addCandidate(
    rolesToUse.find((role) => roleValueMatches(role.roleId, preferredRoleId))
  );
  addCandidate(
    rolesToUse.find((role) => roleValueMatches(role.roleName, preferredRoleName))
  );
  for (const role of rolesToUse) {
    addCandidate(role);
  }
  addCandidate({
    roleId: preferredRoleId,
    roleName: preferredRoleName,
    roleCategory: fallbackCategory,
  });

  if (candidates.length === 0) {
    candidates.push({
      roleId: preferredRoleId,
      roleName: preferredRoleName,
      roleCategory: fallbackCategory,
    });
  }

  return {
    candidates,
    roleCategory: fallbackCategory,
  };
};

const extractRoleAssignmentLog = (body: unknown): string | undefined => {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const response = (body as { roleAssignmentResponse?: unknown })
    .roleAssignmentResponse;
  if (!response || typeof response !== "object") {
    return undefined;
  }
  const requestLog = (response as { roleRequest?: { log?: unknown } }).roleRequest
    ?.log;
  if (typeof requestLog === "string") {
    return requestLog;
  }
  const requestedLog = (response as { requestedRoles?: Array<{ log?: unknown }> })
    .requestedRoles?.[0]?.log;
  return typeof requestedLog === "string" ? requestedLog : undefined;
};

const shouldRetryRoleAssignment = (status: number, body: unknown): boolean => {
  if (status !== 422) {
    return false;
  }
  const log = extractRoleAssignmentLog(body)?.toLowerCase();
  if (!log) {
    return false;
  }
  return (
    log.includes("reject_unapproved_create_role_assignments") ||
    log.includes("validate_role_assignment_against_patterns") ||
    log.includes("create not approved") ||
    log.includes("rejected")
  );
};

type AssignmentAttempt = {
  assigned: boolean;
  status: number;
  responseBody?: unknown;
};

const attemptRoleAssignment = async (
  adminApi: APIRequestContext,
  assignmentConfig: ReturnType<typeof resolveCourtAdminAssignmentConfig>,
  assignmentJurisdiction: string,
  caseId: string,
  created: { id: string },
  user: { forename: string; surname: string; email: string }
): Promise<AssignmentAttempt> => {
  const validRoles = await fetchValidRoles(adminApi, assignmentJurisdiction);
  const { candidates, roleCategory } = buildRoleCandidates(
    validRoles,
    assignmentConfig
  );

  let lastStatus = 0;
  let lastResponseBody: unknown = undefined;

  for (const candidate of candidates) {
    if (!candidate.roleId || !candidate.roleName) {
      continue;
    }
    const resolvedRoleCategory =
      normaliseRoleCategory(candidate.roleCategory ?? roleCategory) ??
      "LEGAL_OPERATIONS";
    const personDomain = resolvePersonDomain(resolvedRoleCategory);

    const allocationPayload = {
      caseId,
      jurisdiction: assignmentJurisdiction,
      state: assignmentConfig.state,
      typeOfRole: {
        id: candidate.roleId,
        name: candidate.roleName,
      },
      allocateTo: "Allocate to another person",
      person: {
        id: created.id,
        name: `${user.forename} ${user.surname}`,
        email: user.email,
        domain: personDomain,
      },
      durationOfRole: assignmentConfig.durationOfRole,
      action: "allocate",
      period: {
        startDate: new Date().toISOString(),
        endDate: null,
      },
      lastError: null,
      roleCategory: resolvedRoleCategory,
    };

    const response = await adminApi.post(
      "api/role-access/allocate-role/confirm",
      {
        data: allocationPayload,
        failOnStatusCode: false,
      }
    );
    lastStatus = response.status();
    lastResponseBody = await response.json().catch(async () => {
      const text = await response.text().catch(() => "");
      return text ? { raw: text } : {};
    });
    if ([200, 201].includes(lastStatus)) {
      return { assigned: true, status: lastStatus, responseBody: lastResponseBody };
    }
    if (shouldRetryRoleAssignment(lastStatus, lastResponseBody)) {
      continue;
    }
    return { assigned: false, status: lastStatus, responseBody: lastResponseBody };
  }

  return {
    assigned: false,
    status: lastStatus || 422,
    responseBody: lastResponseBody,
  };
};

type RoleAttributeConstraint = {
  mandatory?: boolean;
  values?: string[];
};

type RolePattern = {
  roleType?: RoleAttributeConstraint;
  grantType?: RoleAttributeConstraint;
  classification?: RoleAttributeConstraint;
  attributes?: Record<string, RoleAttributeConstraint>;
};

type RoleDefinition = {
  name?: string;
  roleName?: string;
  category?: string;
  patterns?: RolePattern[];
};

const extractRoleDefinitions = (payload: unknown): RoleDefinition[] => {
  if (Array.isArray(payload)) {
    return payload as RoleDefinition[];
  }
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { roles?: unknown }).roles)
  ) {
    return (payload as { roles: RoleDefinition[] }).roles;
  }
  return [];
};

const summariseRoleDefinition = (role: RoleDefinition) => {
  const name = role.name ?? role.roleName ?? "unknown";
  const category = role.category ?? "unknown";
  const patterns = role.patterns ?? [];
  const patternSummaries = patterns.map((pattern) => {
    const attributes = pattern.attributes ?? {};
    const attributesSummary: Record<string, string[]> = {};
    for (const [key, constraint] of Object.entries(attributes)) {
      const values = constraint.values ?? [];
      attributesSummary[key] = values.length ? values : ["<mandatory>"];
    }
    return {
      roleType: pattern.roleType?.values ?? ["<any>"],
      grantType: pattern.grantType?.values ?? ["<any>"],
      classification: pattern.classification?.values ?? ["<any>"],
      attributes: attributesSummary,
    };
  });

  return { name, category, patterns: patternSummaries };
};

const fetchRoleDefinitions = async (
  request: APIRequestContext,
  roleAssignmentBaseUrl: string,
  userToken: string,
  serviceToken: string,
): Promise<RoleDefinition[] | undefined> => {
  const response = await request.get(
    `${roleAssignmentBaseUrl}/am/role-assignments/roles`,
    {
      headers: {
        Authorization: asBearer(userToken),
        ServiceAuthorization: asBearer(serviceToken),
        accept:
          "application/vnd.uk.gov.hmcts.role-assignment-service.get-roles+json;charset=UTF-8;version=1.0",
      },
    }
  );

  if (!response.ok()) {
    const bodyText = await response.text().catch(() => "");
    console.warn(
      `[dynamic-users] Failed to fetch RAS roles (${response.status()}): ${bodyText || "<empty>"}`
    );
    return undefined;
  }

  const data = await response.json().catch(async () => {
    const bodyText = await response.text().catch(() => "");
    console.warn(
      `[dynamic-users] Failed to parse RAS roles response: ${bodyText || "<empty>"}`
    );
    return undefined;
  });
  return extractRoleDefinitions(data);
};

const matchesPatternConstraint = (
  constraint: RoleAttributeConstraint | undefined,
  desired: string
): boolean => {
  if (!constraint?.values?.length) {
    return true;
  }
  return constraint.values.map((value) => value.toUpperCase()).includes(desired.toUpperCase());
};

const selectRolePattern = (
  roleDefinition: RoleDefinition,
  roleType: string,
  grantType: string,
  classification: string
): RolePattern | undefined => {
  const patterns = roleDefinition.patterns ?? [];
  if (!patterns.length) {
    return undefined;
  }
  return (
    patterns.find(
      (pattern) =>
        matchesPatternConstraint(pattern.roleType, roleType) &&
        matchesPatternConstraint(pattern.grantType, grantType) &&
        matchesPatternConstraint(pattern.classification, classification)
    ) ?? patterns[0]
  );
};

const mergeAttributesFromPattern = (
  attributes: Record<string, string>,
  pattern: RolePattern | undefined
): Record<string, string> => {
  if (!pattern?.attributes) {
    return attributes;
  }
  const merged = { ...attributes };
  for (const [key, constraint] of Object.entries(pattern.attributes)) {
    if (merged[key]) {
      continue;
    }
    if (constraint?.values?.length) {
      merged[key] = String(constraint.values[0]);
      continue;
    }
    if (constraint?.mandatory) {
      throw new Error(
        `Missing required RAS attribute "${key}". Set RAS_ATTRIBUTES_JSON or explicit RAS_* env vars.`
      );
    }
  }
  return merged;
};

const canSatisfyPattern = (pattern: RolePattern, desiredRoleType: string): boolean => {
  if (
    pattern.roleType?.values?.length &&
    !pattern.roleType.values
      .map((value) => value.toUpperCase())
      .includes(desiredRoleType.toUpperCase())
  ) {
    return false;
  }
  const attributeEntries = Object.entries(pattern.attributes ?? {});
  for (const [, constraint] of attributeEntries) {
    if (constraint?.mandatory && !(constraint.values && constraint.values.length > 0)) {
      return false;
    }
  }
  return true;
};

const findAssignableRole = (
  roleDefinitions: RoleDefinition[],
  desiredRoleType: string
): { role: RoleDefinition; pattern?: RolePattern } | undefined => {
  for (const role of roleDefinitions) {
    const patterns = role.patterns ?? [];
    if (!patterns.length) {
      if (desiredRoleType.toUpperCase() === "ORGANISATION") {
        return { role };
      }
      continue;
    }
    for (const pattern of patterns) {
      if (canSatisfyPattern(pattern, desiredRoleType)) {
        return { role, pattern };
      }
    }
  }
  return undefined;
};

const normaliseIdamApiUrl = (value: string): string => {
  const trimmed = value.replace(/\/+$/, "");
  if (trimmed.endsWith("/o/token")) {
    return trimmed.slice(0, -"/o/token".length);
  }
  if (trimmed.endsWith("/oauth2/token")) {
    return trimmed.slice(0, -"/oauth2/token".length);
  }
  return trimmed;
};

const resolveIdamApiUrl = (): string => {
  const raw = resolveEnv(
    ["IDAM_API_URL", "SERVICES_IDAM_API_URL"],
    "https://idam-api.aat.platform.hmcts.net"
  ) as string;
  return normaliseIdamApiUrl(raw);
};

type IdamCreateEndpoint = {
  url: string;
  mode: "users" | "accounts";
};

const resolveIdamCreateEndpoint = (): IdamCreateEndpoint => {
  const usersUrl = resolveEnv(["IDAM_TESTING_SUPPORT_USERS_URL"], undefined);
  if (usersUrl) {
    return { url: usersUrl.replace(/\/+$/, ""), mode: "users" };
  }

  const testingSupportUrl = resolveEnv(["IDAM_TESTING_SUPPORT_URL"], undefined);
  if (testingSupportUrl) {
    return {
      url: `${testingSupportUrl.replace(/\/+$/, "")}/test/idam/users`,
      mode: "users",
    };
  }

  const idamApiUrl = resolveIdamApiUrl();
  return {
    url: `${idamApiUrl.replace(/\/+$/, "")}/testing-support/accounts`,
    mode: "accounts",
  };
};

const sanitiseScopeForClientCredentials = (scope: string): string => {
  const entries = scope
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const filtered = entries.filter((entry) => !["openid", "profile"].includes(entry));
  return filtered.length > 0 ? filtered.join(" ") : scope;
};

const resolveBearerToken = async (idamUtils: IdamUtils): Promise<string> => {
  const existing = process.env.CREATE_USER_BEARER_TOKEN?.trim();
  if (existing) {
    return existing;
  }

  const clientId = resolveOAuthClientId();
  const clientSecret = resolveOAuthClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing IDAM client credentials. Set CREATE_USER_CLIENT_ID/CREATE_USER_CLIENT_SECRET or CCD_DATA_STORE_CLIENT_ID/CCD_DATA_STORE_SECRET."
    );
  }

  const rawScope = resolveOAuthScope();
  const scope = sanitiseScopeForClientCredentials(rawScope);

  return idamUtils.generateIdamToken({
    grantType: "client_credentials",
    clientId,
    clientSecret,
    scope,
  });
};

const DEFAULT_ROLE_NAMES = [
  "caseworker",
  "caseworker-privatelaw",
  "caseworker-privatelaw-courtadmin",
  "caseworker-privatelaw-la",
  "cwd-user",
  "hmcts-ctsc",
  "hearing-manager",
  "hearing-viewer",
  "hmcts-admin",
  "case-allocator",
  "task-supervisor",
  "hearing-centre-team-leader",
  "ctsc-team-leader",
  "specific-access-approver-ctsc",
  "ctsc",
  "hearing-centre-admin",
  "specific-access-approver-admin",
  "privatelaw-hearing-centre-team-leader",
  "privatelaw-ctsc-team-leader",
  "privatelaw-ctsc",
  "privatelaw-hearing-centre-admin",
];

const DEFAULT_FALLBACK_ROLE_NAMES = [
  "caseworker",
  "caseworker-privatelaw",
  "caseworker-privatelaw-courtadmin",
  "cwd-user",
];

const resolveRoleNames = (): string[] => {
  const raw = process.env.IDAM_ROLE_NAMES;
  const roles = raw
    ? raw.split(",").map((role) => role.trim())
    : DEFAULT_ROLE_NAMES;
  return Array.from(new Set(roles.filter(Boolean)));
};

const resolveFallbackRoleNames = (): string[] => {
  const raw = process.env.IDAM_ROLE_NAMES_FALLBACK;
  const roles = raw
    ? raw.split(",").map((role) => role.trim())
    : DEFAULT_FALLBACK_ROLE_NAMES;
  return Array.from(new Set(roles.filter(Boolean)));
};

const sameRoleSet = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  const leftSet = new Set(left);
  return right.every((role) => leftSet.has(role));
};

const resolvePassword = (): string => {
  const password = resolveEnv(
    [
      "IDAM_CASEWORKER_USER_PASSWORD",
      "IDAM_USER_PASSWORD",
      "CASEWORKER_R1_PASSWORD",
      "CASEWORKER_R2_PASSWORD",
      "CASEWORKER_PASSWORD",
    ],
    undefined
  );
  if (!password) {
    throw new Error(
      "Missing caseworker password. Set IDAM_CASEWORKER_USER_PASSWORD or CASEWORKER_R1_PASSWORD."
    );
  }
  return password;
};

const createUserPayload = (roleNames: string[], password: string) => {
  const uniqueId = randomUUID();
  const [firstPart, secondPart] = uniqueId.split("-");
  const emailPrefix = process.env.IDAM_USER_EMAIL_PREFIX ?? "caseworker-poc";
  const emailDomain = process.env.IDAM_USER_EMAIL_DOMAIN ?? "test.local";

  return {
    email: `TEST_XUI_USER_${emailPrefix}.${uniqueId}@${emailDomain}`,
    forename: `caseworker_fn_${firstPart}`,
    surname: `caseworker_sn_${secondPart}`,
    password,
    roleNames,
  };
};

const createTestAccount = async (
  request: APIRequestContext,
  idamEndpoint: IdamCreateEndpoint,
  bearerToken: string | undefined,
  user: ReturnType<typeof createUserPayload>
) => {
  const buildPayload = (roleNames: string[]) => {
    if (idamEndpoint.mode === "users") {
      return {
        password: user.password,
        user: {
          email: user.email,
          forename: user.forename,
          surname: user.surname,
          roleNames,
        },
      };
    }
    return {
      email: user.email,
      forename: user.forename,
      surname: user.surname,
      password: user.password,
      roles: roleNames.map((code) => ({ code })),
      userGroup: { code: "test" },
    };
  };

  const postAccount = async (
    headers: Record<string, string>,
    roleNames: string[]
  ) =>
    request.post(idamEndpoint.url, {
      headers,
      data: buildPayload(roleNames),
    });

  let lastError: Error | undefined;
  let currentRoleNames = user.roleNames;
  const fallbackRoleNames = resolveFallbackRoleNames();
  let triedFallback = false;
  for (let attempt = 1; attempt <= IDAM_CREATE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      let response = await postAccount(
        { "content-type": "application/json" },
        currentRoleNames
      );
      if ([401, 403].includes(response.status()) && bearerToken) {
        response = await postAccount(
          {
            "content-type": "application/json",
            Authorization: `Bearer ${bearerToken}`,
          },
          currentRoleNames
        );
      }

      const status = response.status();
      if ([201, 409].includes(status)) {
        const data = await response.json().catch(() => ({}));
        return {
          id: data.id ?? "",
          email: data.email ?? user.email,
          forename: data.forename ?? user.forename,
          surname: data.surname ?? user.surname,
          roleNames: Array.isArray(data.roleNames)
            ? data.roleNames.filter(Boolean)
            : Array.isArray(data.roles)
              ? data.roles.map((role: { code?: string }) => role.code).filter(Boolean)
              : currentRoleNames,
        };
      }

      if (
        status === 400 &&
        !triedFallback &&
        fallbackRoleNames.length > 0 &&
        !sameRoleSet(currentRoleNames, fallbackRoleNames)
      ) {
        triedFallback = true;
        currentRoleNames = fallbackRoleNames;
        console.warn(
          "[dynamic-users] IDAM create returned 400; retrying with fallback role list."
        );
        continue;
      }

      if (shouldRetryIdamCreate(status) && attempt < IDAM_CREATE_RETRY_ATTEMPTS) {
        console.warn(
          `[dynamic-users] IDAM testing-support create account returned ${status}; retrying (${attempt}/${IDAM_CREATE_RETRY_ATTEMPTS}).`
        );
        await wait(IDAM_CREATE_RETRY_DELAY_MS);
        continue;
      }

      const body = await response.text().catch(() => "");
      throw new Error(
        `IDAM testing-support create account failed (${status}): ${body || "<empty>"}`
      );
    } catch (error) {
      lastError = error as Error;
      if (attempt < IDAM_CREATE_RETRY_ATTEMPTS) {
        console.warn(
          `[dynamic-users] IDAM testing-support create account error: ${lastError.message}; retrying (${attempt}/${IDAM_CREATE_RETRY_ATTEMPTS}).`
        );
        await wait(IDAM_CREATE_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("IDAM testing-support create account failed.");
};

type DynamicUserCredentials = {
  email: string;
  password: string;
  roleNames: string[];
  idamId?: string;
  caseId?: string;
};

const attachDynamicUserCredentials = async (
  testInfo: TestInfo,
  payload: DynamicUserCredentials
): Promise<void> => {
  const shouldAttach = truthy.has(
    (process.env.PW_DYNAMIC_USER_CREDS_IN_REPORT ?? "").trim().toLowerCase()
  );
  if (!shouldAttach) {
    return;
  }
  await testInfo.attach("dynamic-user-credentials.json", {
    body: JSON.stringify(payload, null, 2),
    contentType: "application/json",
  });
};

const waitForAuthCookie = async (page: Page, timeoutMs = 15_000): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cookies = await page.context().cookies();
    const authCookie = cookies.find((cookie) => cookie.name === "__auth__");
    if (authCookie?.value) {
      return authCookie.value;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("Missing __auth__ cookie after login.");
};

const getCookieValue = async (
  page: Page,
  name: string,
  url?: string
): Promise<string | undefined> => {
  const cookies = url
    ? await page.context().cookies(url)
    : await page.context().cookies();
  const match = cookies.find((cookie) => cookie.name === name);
  return match?.value;
};

const createExuiApiContext = async (
  page: Page,
  baseUrl: string
): Promise<APIRequestContext> => {
  const xsrfToken = await getCookieValue(page, "XSRF-TOKEN", baseUrl);
  if (!xsrfToken) {
    throw new Error("Missing XSRF-TOKEN cookie after login.");
  }
  const authToken = await getCookieValue(page, "__auth__", baseUrl);
  if (!authToken) {
    throw new Error("Missing __auth__ cookie after login.");
  }

  const storageState = await page.context().storageState();
  return playwrightRequest.newContext({
    baseURL: baseUrl,
    storageState,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": xsrfToken,
      Authorization: `Bearer ${authToken}`,
      experimental: "true",
    },
  });
};

const loginAsUser = async (
  page: Page,
  idamPage: IdamPage,
  manageCaseBaseUrl: string,
  credentials: { username: string; password: string }
): Promise<void> => {
  await page.context().clearCookies();
  try {
    await page.goto(manageCaseBaseUrl, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("net::ERR_ABORTED")
    ) {
      throw error;
    }
  }
  await idamPage.heading.waitFor();
  await idamPage.login({
    username: credentials.username,
    password: credentials.password,
  });
};

const loginAndGetUserToken = async (
  page: Page,
  idamPage: IdamPage,
  manageCaseBaseUrl: string,
  user: { email: string; password: string }
): Promise<string> => {
  await loginAsUser(page, idamPage, manageCaseBaseUrl, {
    username: user.email,
    password: user.password,
  });
  return waitForAuthCookie(page);
};

const createRoleAssignment = async (
  request: APIRequestContext,
  roleAssignmentBaseUrl: string,
  userToken: string,
  serviceToken: string,
  actorId: string,
  attributes: Record<string, string>
) => {
  const config = resolveRoleAssignmentConfig();
  const { processName } = config;
  let { roleType, roleName, roleCategory, grantType, classification } = config;
  let resolvedAttributes = attributes;

  let roleDefinition: RoleDefinition | undefined;
  let selectedPattern: RolePattern | undefined;
  const roleDefinitions = await fetchRoleDefinitions(
    request,
    roleAssignmentBaseUrl,
    userToken,
    serviceToken
  );
  if ((!roleDefinitions || roleDefinitions.length === 0) && !process.env.RAS_ROLE_NAME) {
    throw new Error(
      "Unable to load RAS role definitions. Set RAS_ROLE_NAME (and any required RAS_* attributes) or check ROLE_ASSIGNMENT_BASE_URL connectivity."
    );
  }
  if (roleDefinitions?.length) {
    roleDefinition = roleDefinitions.find(
      (role) =>
        (role.name ?? role.roleName ?? "").toLowerCase() ===
        roleName.toLowerCase()
    );
    let fallbackUsed = false;
    if (!roleDefinition && !process.env.RAS_ROLE_NAME) {
      const fallback = findAssignableRole(roleDefinitions, roleType);
      if (fallback) {
        roleDefinition = fallback.role;
        selectedPattern = fallback.pattern;
        roleName = (roleDefinition.name ?? roleDefinition.roleName ?? roleName).toString();
        fallbackUsed = true;
        console.info(
          `[dynamic-users] Using fallback RAS role "${roleName}" based on /roles lookup.`
        );
      }
    }
    if (!roleDefinition) {
      const examples = roleDefinitions
        .map((role) => role.name ?? role.roleName ?? "")
        .filter(Boolean)
        .slice(0, 15)
        .join(", ");
      throw new Error(
        `RAS role "${roleName}" not found${fallbackUsed ? "" : " or does not meet default constraints"}. ` +
          `Set RAS_ROLE_NAME (and any required RAS_* attributes). Examples: ${examples || "none"}`
      );
    }
  }

  if (roleDefinition) {
    if (!process.env.RAS_ROLE_CATEGORY && roleDefinition.category) {
      roleCategory = roleDefinition.category.toUpperCase();
    }
    const pattern =
      selectedPattern ??
      selectRolePattern(roleDefinition, roleType, grantType, classification);

    if (!process.env.RAS_ROLE_TYPE && pattern?.roleType?.values?.length) {
      roleType = pattern.roleType.values[0].toUpperCase();
    }
    if (!process.env.RAS_GRANT_TYPE && pattern?.grantType?.values?.length) {
      grantType = pattern.grantType.values[0].toUpperCase();
    }
    if (!process.env.RAS_CLASSIFICATION && pattern?.classification?.values?.length) {
      classification = pattern.classification.values[0].toUpperCase();
    }

    resolvedAttributes = mergeAttributesFromPattern(resolvedAttributes, pattern);
  }
  const assignerId = process.env.RAS_ASSIGNER_ID ?? actorId;
  const reference = process.env.RAS_REFERENCE ?? `${processName}-${actorId}-${roleName}`;

  const payload = {
    roleRequest: {
      assignerId,
      process: processName,
      reference,
      replaceExisting: true,
    },
    requestedRoles: [
      {
        actorIdType: "IDAM",
        actorId,
        roleType,
        roleName,
        classification,
        grantType,
        roleCategory,
        attributes: resolvedAttributes,
      },
    ],
  };

  const response = await request.post(`${roleAssignmentBaseUrl}/am/role-assignments`, {
    headers: {
      Authorization: asBearer(userToken),
      ServiceAuthorization: asBearer(serviceToken),
      accept:
        "application/vnd.uk.gov.hmcts.role-assignment-service.create-assignments+json;charset=UTF-8;version=1.0",
      "content-type": "application/json",
    },
    data: payload,
  });

  const body = await response.json().catch(async () => {
    const text = await response.text().catch(() => "");
    return text ? { raw: text } : {};
  });
  if (response.status() !== 201) {
    throw new Error(
      `RAS role assignment failed (${response.status()}): ${JSON.stringify(body)} payload=${JSON.stringify(payload)}`
    );
  }

  const requestedRoles = body?.roleAssignmentResponse?.requestedRoles;
  const assignmentIds = Array.isArray(requestedRoles)
    ? requestedRoles
        .map((entry: { id?: string }) => entry.id)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  return { assignmentIds, responseBody: body };
};

const deleteRoleAssignments = async (
  request: APIRequestContext,
  roleAssignmentBaseUrl: string,
  userToken: string,
  serviceToken: string,
  assignmentIds: string[]
) => {
  if (assignmentIds.length === 0) {
    return;
  }

  for (const assignmentId of assignmentIds) {
    await request.delete(
      `${roleAssignmentBaseUrl}/am/role-assignments/${assignmentId}`,
      {
        headers: {
          Authorization: asBearer(userToken),
          ServiceAuthorization: asBearer(serviceToken),
        },
      }
    );
  }
};

const shouldRun = truthy.has(
  (process.env.PW_DYNAMIC_USER_POC ?? "").trim().toLowerCase()
);
const shouldDebugRoles = truthy.has(
  (process.env.PW_DEBUG_RAS_ROLES ?? "").trim().toLowerCase()
);

test.describe("@poc @dynamic-user", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });

  test("caseworker can be created via IDAM testing-support and sign in", async ({
    page,
    idamPage,
    config,
    request,
  }, testInfo) => {
    if (!shouldRun) {
      testInfo.skip(true, "Set PW_DYNAMIC_USER_POC=true to run this POC test.");
      return;
    }
    if (process.env.IDAM_OAUTH2_GRANT_TYPE?.trim() === "password") {
      throw new Error("Password grants are not allowed for this POC test.");
    }

    process.env.IDAM_WEB_URL =
      process.env.IDAM_WEB_URL ?? "https://idam-web-public.aat.platform.hmcts.net";
    process.env.IDAM_TESTING_SUPPORT_URL =
      process.env.IDAM_TESTING_SUPPORT_URL ??
      "https://idam-testing-support-api.aat.platform.hmcts.net";

    const idamUtils = new IdamUtils();
    try {
      const bearerToken = await resolveBearerToken(idamUtils);
      let roleNames = resolveRoleNames();
      const password = resolvePassword();
      const user = createUserPayload(roleNames, password);
      const idamEndpoint = resolveIdamCreateEndpoint();

      const created = await createTestAccount(
        request,
        idamEndpoint,
        bearerToken,
        user
      );
      roleNames = created.roleNames;
      user.roleNames = roleNames;

      await page.goto(config.urls.manageCaseBaseUrl, { waitUntil: "domcontentloaded" });
      await idamPage.heading.waitFor();
      await idamPage.login({ username: user.email, password: user.password });

      await waitForAuthCookie(page);
      const authCheck = await page.request.get(
        `${config.urls.exuiDefaultUrl}/auth/isAuthenticated`,
        { failOnStatusCode: false }
      );
      expect(authCheck.status()).toBe(200);
      const isAuthenticated = await authCheck.json().catch(() => false);
      expect(isAuthenticated).toBe(true);
    } finally {
      await idamUtils.dispose();
    }
  });

  test("caseworker can be created and assigned a RAS role", async ({
    config,
    request,
    page,
    idamPage,
  }, testInfo) => {
    if (!shouldRun) {
      testInfo.skip(true, "Set PW_DYNAMIC_USER_POC=true to run this POC test.");
      return;
    }
    if (!process.env.S2S_URL?.trim()) {
      testInfo.skip(true, "S2S_URL not configured; skipping RAS POC.");
      return;
    }
    if (process.env.IDAM_OAUTH2_GRANT_TYPE?.trim() === "password") {
      throw new Error("Password grants are not allowed for this POC test.");
    }

    process.env.IDAM_WEB_URL =
      process.env.IDAM_WEB_URL ?? "https://idam-web-public.aat.platform.hmcts.net";
    process.env.IDAM_TESTING_SUPPORT_URL =
      process.env.IDAM_TESTING_SUPPORT_URL ??
      "https://idam-testing-support-api.aat.platform.hmcts.net";

    const idamUtils = new IdamUtils();
    const serviceAuthUtils = new ServiceAuthUtils();
    try {
      const bearerToken = await resolveBearerToken(idamUtils);
      let roleNames = resolveRoleNames();
      const password = resolvePassword();
      const user = createUserPayload(roleNames, password);
      const idamEndpoint = resolveIdamCreateEndpoint();

      const created = await createTestAccount(
        request,
        idamEndpoint,
        bearerToken,
        user
      );
      roleNames = created.roleNames;
      user.roleNames = roleNames;

      if (!created.id) {
        throw new Error("IDAM testing-support did not return a user id.");
      }

      const userToken = await loginAndGetUserToken(
        page,
        idamPage,
        config.urls.manageCaseBaseUrl,
        user
      );

      const attributes = resolveRoleAssignmentAttributes(
        resolveRoleAssignmentConfig().roleType
      );
      const roleAssignmentBaseUrl = resolveRoleAssignmentBaseUrl(config.testEnv);
      const microservice = resolveS2SMicroservice();
      const serviceToken = await serviceAuthUtils.retrieveToken({ microservice });

      const { assignmentIds } = await createRoleAssignment(
        request,
        roleAssignmentBaseUrl,
        userToken,
        serviceToken,
        created.id,
        attributes
      );

      const skipDelete = truthy.has(
        (process.env.RAS_SKIP_DELETE ?? "").trim().toLowerCase()
      );
      if (!skipDelete && assignmentIds.length > 0) {
        await deleteRoleAssignments(
          request,
          roleAssignmentBaseUrl,
          userToken,
          serviceToken,
          assignmentIds
        );
      }

      expect(assignmentIds.length).toBeGreaterThan(0);
    } finally {
      await idamUtils.dispose();
      await serviceAuthUtils.dispose();
    }
  });

  test("caseworker can be created and assigned a case via court admin", async ({
    config,
    request,
    page,
    idamPage,
    caseSearchPage,
    caseDetailsPage,
  }, testInfo) => {
    if (!shouldRun) {
      testInfo.skip(true, "Set PW_DYNAMIC_USER_POC=true to run this POC test.");
      return;
    }
    const courtAdminCredentials = resolveCourtAdminCredentials();
    const caseManagerCredentials = resolveCaseManagerCredentials();
    if (!courtAdminCredentials) {
      testInfo.skip(true, "COURT_ADMIN credentials not set.");
      return;
    }
    let caseId = resolveCaseIdForAssignment();
    const caseCreatorCredentials = caseId ? undefined : resolveCaseCreatorCredentials();
    if (!caseId && !caseCreatorCredentials) {
      testInfo.skip(
        true,
        "Set COURT_ADMIN_CASE_ID/ROLE_ACCESS_CASE_ID or CASE_CREATE_USERNAME/PASSWORD."
      );
      return;
    }
    if (process.env.IDAM_OAUTH2_GRANT_TYPE?.trim() === "password") {
      throw new Error("Password grants are not allowed for this POC test.");
    }

    process.env.IDAM_WEB_URL =
      process.env.IDAM_WEB_URL ?? "https://idam-web-public.aat.platform.hmcts.net";
    process.env.IDAM_TESTING_SUPPORT_URL =
      process.env.IDAM_TESTING_SUPPORT_URL ??
      "https://idam-testing-support-api.aat.platform.hmcts.net";

    const idamUtils = new IdamUtils();
    try {
      const bearerToken = await resolveBearerToken(idamUtils);
      let roleNames = resolveRoleNames();
      const password = resolvePassword();
      const user = createUserPayload(roleNames, password);
      const idamEndpoint = resolveIdamCreateEndpoint();

      const created = await createTestAccount(
        request,
        idamEndpoint,
        bearerToken,
        user
      );
      roleNames = created.roleNames;
      user.roleNames = roleNames;

      if (!created.id) {
        throw new Error("IDAM testing-support did not return a user id.");
      }

      if (!caseId && caseCreatorCredentials) {
        const caseCreationConfig = resolveCaseCreationConfig();
        await loginAsUser(
          page,
          idamPage,
          config.urls.manageCaseBaseUrl,
          caseCreatorCredentials
        );
        const caseApi = await createExuiApiContext(
          page,
          config.urls.exuiDefaultUrl
        );
        try {
          const createdCase = await createCase({
            apiContext: caseApi,
            caseTypeId: caseCreationConfig.caseTypeId,
            eventId: caseCreationConfig.eventId,
            data: caseCreationConfig.data,
            summary: "Create case",
            description: "Created via Playwright helper",
          });
          caseId = createdCase.caseId;
        } finally {
          await caseApi.dispose();
        }
      }

      if (!caseId) {
        throw new Error("No case id available for court admin assignment.");
      }

      await attachDynamicUserCredentials(testInfo, {
        email: user.email,
        password: user.password,
        roleNames,
        idamId: created.id,
        caseId,
      });

      const assignmentConfig = resolveCourtAdminAssignmentConfig();
      let caseMeta: CaseMeta = {
        jurisdiction: assignmentConfig.jurisdiction,
      };

      const assignerCandidates = [
        { label: "court admin", credentials: courtAdminCredentials },
      ];
      if (caseManagerCredentials) {
        const sameUser =
          caseManagerCredentials.username === courtAdminCredentials.username;
        if (!sameUser) {
          assignerCandidates.push({
            label: "case manager",
            credentials: caseManagerCredentials,
          });
        }
      }

      let assignmentStatus = 0;
      let assignmentBody: unknown = undefined;
      let assigned = false;

      for (const assigner of assignerCandidates) {
        await loginAsUser(
          page,
          idamPage,
          config.urls.manageCaseBaseUrl,
          assigner.credentials
        );
        const adminApi = await createExuiApiContext(
          page,
          config.urls.exuiDefaultUrl
        );
        try {
          const meta = await fetchCaseMeta(adminApi, caseId);
          if (meta) {
            caseMeta = { ...caseMeta, ...meta };
          }
          const assignmentJurisdiction =
            meta?.jurisdictionId ?? assignmentConfig.jurisdiction;
          const attempt = await attemptRoleAssignment(
            adminApi,
            assignmentConfig,
            assignmentJurisdiction,
            caseId,
            { id: created.id },
            user
          );
          assignmentStatus = attempt.status;
          assignmentBody = attempt.responseBody;
          if (attempt.assigned) {
            assigned = true;
            break;
          }
          if (!shouldRetryRoleAssignment(attempt.status, attempt.responseBody)) {
            break;
          }
        } finally {
          await adminApi.dispose();
        }
      }

      if (!assigned) {
        const detail = shouldDebugRoles
          ? `: ${JSON.stringify(assignmentBody)}`
          : "";
        throw new Error(
          `Court admin assignment failed (${assignmentStatus || 422})${detail}`
        );
      }

      await loginAsUser(
        page,
        idamPage,
        config.urls.manageCaseBaseUrl,
        { username: user.email, password: user.password }
      );

      const caseDetailsUrl = `${config.urls.exuiDefaultUrl}/cases/case-details/${caseId}`;
      const searchFilters = resolveCaseSearchFilters(caseMeta);
      if (searchFilters.jurisdiction && searchFilters.caseType) {
        await caseSearchPage.goto();
        await caseSearchPage.waitForReady();
        await caseSearchPage.ensureFiltersVisible();
        await caseSearchPage.selectJurisdiction(searchFilters.jurisdiction);
        await caseSearchPage.selectCaseType(searchFilters.caseType);
        await caseSearchPage.waitForDynamicFilters();
        await caseSearchPage.fillCcdNumber(caseId);
        await caseSearchPage.applyFilters();

        const expectedRef = normaliseCaseReference(caseId);
        await expect
          .poll(async () => {
            const links = await caseSearchPage.resultLinks.allTextContents();
            return links.some(
              (text) => normaliseCaseReference(text) === expectedRef
            );
          })
          .toBeTruthy();

        await caseSearchPage.openFirstResult();
      } else {
        await page.goto(caseDetailsUrl, { waitUntil: "domcontentloaded" });
      }

      await caseDetailsPage.waitForReady(60_000);
      await expect(caseDetailsPage.exuiCaseDetailsComponent.caseHeader).toBeVisible();
      const caseNumber = await caseDetailsPage.exuiCaseDetailsComponent.caseHeader
        .textContent()
        .catch(() => "");
      if (caseNumber) {
        expect(normaliseCaseReference(caseNumber)).toContain(
          normaliseCaseReference(caseId)
        );
      }
    } finally {
      await idamUtils.dispose();
    }
  });

  test("debug: list RAS role definitions", async ({
    config,
    request,
    page,
    idamPage,
  }, testInfo) => {
    if (!shouldRun) {
      testInfo.skip(true, "Set PW_DYNAMIC_USER_POC=true to run this POC test.");
      return;
    }
    if (!shouldDebugRoles) {
      testInfo.skip(true, "Set PW_DEBUG_RAS_ROLES=true to print RAS roles.");
      return;
    }
    if (!process.env.S2S_URL?.trim()) {
      testInfo.skip(true, "S2S_URL not configured; skipping RAS debug.");
      return;
    }

    process.env.IDAM_WEB_URL =
      process.env.IDAM_WEB_URL ?? "https://idam-web-public.aat.platform.hmcts.net";
    process.env.IDAM_TESTING_SUPPORT_URL =
      process.env.IDAM_TESTING_SUPPORT_URL ??
      "https://idam-testing-support-api.aat.platform.hmcts.net";

    const idamUtils = new IdamUtils();
    const serviceAuthUtils = new ServiceAuthUtils();
    try {
      const bearerToken = await resolveBearerToken(idamUtils);
      const password = resolvePassword();
      let roleNames = resolveRoleNames();
      const user = createUserPayload(roleNames, password);
      const idamEndpoint = resolveIdamCreateEndpoint();

      const created = await createTestAccount(
        request,
        idamEndpoint,
        bearerToken,
        user
      );
      roleNames = created.roleNames;
      user.roleNames = roleNames;
      const userToken = await loginAndGetUserToken(
        page,
        idamPage,
        config.urls.manageCaseBaseUrl,
        user
      );

      const roleAssignmentBaseUrl = resolveRoleAssignmentBaseUrl(config.testEnv);
      const microservice = resolveS2SMicroservice();
      const serviceToken = await serviceAuthUtils.retrieveToken({ microservice });

      const roles = await fetchRoleDefinitions(
        request,
        roleAssignmentBaseUrl,
        userToken,
        serviceToken
      );

      if (!roles || roles.length === 0) {
        throw new Error("No RAS role definitions returned.");
      }

      const filter = process.env.RAS_ROLE_FILTER?.trim().toLowerCase();
      const filteredRoles = filter
        ? roles.filter((role) =>
            (role.name ?? role.roleName ?? "")
              .toLowerCase()
              .includes(filter)
          )
        : roles;

      const dumpPath = resolveRoleDumpPath();
      await fs.mkdir(path.dirname(dumpPath), { recursive: true });
      await fs.writeFile(
        dumpPath,
        JSON.stringify(
          {
            fetchedAt: new Date().toISOString(),
            baseUrl: roleAssignmentBaseUrl,
            count: roles.length,
            roles,
            ...(filter
              ? {
                  filtered: {
                    filter,
                    count: filteredRoles.length,
                    roles: filteredRoles,
                  },
                }
              : {}),
          },
          null,
          2
        ),
        "utf8"
      );
      console.info(`[dynamic-users] Wrote RAS roles to ${dumpPath}`);

      const summary = filteredRoles.map(summariseRoleDefinition);
      console.info(
        `[dynamic-users] RAS roles (${summary.length}) from ${roleAssignmentBaseUrl}:`
      );
      for (const entry of summary) {
        console.info(JSON.stringify(entry, null, 2));
      }
    } finally {
      await idamUtils.dispose();
      await serviceAuthUtils.dispose();
    }
  });
});
