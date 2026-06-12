import {
  EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY,
  EXUI_SERVICE_REF_DATA_MAPPING,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES
} from "./exui-central-assurance.js";

export type ReplayPackId =
  | "manage-case-data-integrity"
  | "ccd-search-workbasket-metadata"
  | "work-allocation-availability"
  | "protected-endpoint-auth"
  | "event-history-and-layout"
  | "dependency-auth-smoke"
  | "auth-journey-guardrails";

export type CaseFieldDisplayContext = "OPTIONAL" | "READONLY" | "HIDDEN";

export interface SyntheticCaseField {
  id: string;
  label: string;
  value: unknown;
  pageId: string;
  displayContext?: CaseFieldDisplayContext;
  showCondition?: string;
  showSummaryChangeOption?: boolean;
  complexChildren?: readonly SyntheticCaseField[];
}

export interface SyntheticWizardPage {
  id: string;
  showCondition?: string;
  fields: readonly SyntheticCaseField[];
}

export interface ManageCaseDataIntegrityReplay {
  serviceFamily: "PRIVATELAW";
  jurisdiction: "PRIVATELAW";
  caseType: "PRLAPPS";
  serviceCode: "ABA5";
  visitedPageIds: readonly string[];
  finalVisiblePageIds: readonly string[];
  pages: readonly SyntheticWizardPage[];
}

export interface CyaReplayRow {
  fieldId: string;
  label: string;
  value: unknown;
  changeLinkVisible: boolean;
  showCondition?: string;
  childRows?: readonly CyaReplayRow[];
}

export interface Exui4493NestedComplexCyaEvidence {
  projection: "source-replay";
  sourceShape: {
    serviceFamily: "PRIVATELAW";
    jurisdiction: "PRIVATELAW";
    caseType: "PRLAPPS";
    eventId: "serviceOfDocuments";
    collectionFieldId: "sodAdditionalRecipientsList";
    nestedComplexFieldId: "emailInformation";
    showCondition: "sodAdditionalRecipientsList.serveByPostOrEmail=\"email\"";
  };
  flattenedRows: readonly CyaReplayRow[];
  requiredFieldIds: readonly string[];
  missingFieldIds: readonly string[];
}

export interface RoleAssignmentFixture {
  id: string;
  userId: string;
  roleName: string;
  roleCategory?: string;
  attributes: {
    jurisdiction?: string | null;
    primaryLocation?: string;
  };
}

export interface WorkAllocationPersona {
  id: string;
  roles: readonly string[];
  expectedTabs: readonly string[];
  expectedLocationIds: readonly string[];
}

export interface WorkAllocationTaskFixture {
  id: string;
  caseId: string;
  eventId: string;
  state: "assigned" | "unassigned" | "completed";
}

export interface ProtectedEndpointFixture {
  method: "GET" | "POST";
  path: string;
  sensitiveFields: readonly string[];
}

export interface CcdMetadataField {
  caseTypeId: string;
  fieldId: string;
  label: string;
  source: "SearchInputFields" | "WorkBasketInputFields";
}

export interface CcdSearchWorkbasketMetadataReplay {
  serviceFamily: "PRIVATELAW";
  jurisdiction: "PRIVATELAW";
  caseType: "PRLAPPS";
  serviceCode: "ABA5";
  requiredSearchInputFields: readonly string[];
  searchInputFields: readonly CcdMetadataField[];
  workbasketInputFields: readonly CcdMetadataField[];
}

export interface EventHistoryPersona {
  id: "internal-caseworker" | "external-solicitor";
  roles: readonly string[];
  canOpenEventDetails: boolean;
}

export interface EventHistoryRow {
  eventName: string;
  href?: string;
}

export interface AuthSmokeReplay {
  callbackStatus: number;
  sessionCookiePresent: boolean;
  shellRouteStatus: number;
  logoutStatus: number;
  roles: readonly string[];
}

export type AuthJourneyEntrypoint = "exui-auth-login" | "direct-idam-authorize" | "oauth-callback";
export type AuthJourneyAuthenticationState = "not-authenticated" | "authenticated";
export type AuthJourneyOutcome = "redirect-sso" | "login-bookmark" | "access-denied" | "logout-root-loop" | "app-shell";
export type AuthJourneyOwnershipBucket =
  | "auth-entrypoint-owned"
  | "post-auth-authorisation-owned"
  | "service-visual-layout-owned";

export interface AuthJourneyReplayScenario {
  id: string;
  historicRefs: readonly string[];
  entrypoint: AuthJourneyEntrypoint;
  authenticationState: AuthJourneyAuthenticationState;
  stateManagedByExui: boolean;
  loginHint?: string;
  roles: readonly string[];
  requiredRolePattern?: string;
  expectedOutcome: AuthJourneyOutcome;
  legacyOutcome?: AuthJourneyOutcome;
  ownerBucket: AuthJourneyOwnershipBucket;
  baSummary: string;
  developerSignal: string;
}

export interface AuthJourneyGuardrailReplay {
  requiredRolePattern: string;
  scenarios: readonly AuthJourneyReplayScenario[];
}

const privateLawBase = {
  serviceFamily: "PRIVATELAW",
  jurisdiction: "PRIVATELAW",
  caseType: "PRLAPPS",
  serviceCode: "ABA5"
} as const;

export const MANAGE_CASE_DATA_INTEGRITY_REPLAY: ManageCaseDataIntegrityReplay = {
  ...privateLawBase,
  visitedPageIds: ["route-selection", "referral-details", "service-of-documents-additional-recipients", "review-details"],
  finalVisiblePageIds: [
    "route-selection",
    "safeguarding-details",
    "service-of-documents-additional-recipients",
    "hidden-complex-retention",
    "review-details"
  ],
  pages: [
    {
      id: "route-selection",
      fields: [
        {
          id: "route",
          label: "Application route",
          pageId: "route-selection",
          value: "safeguarding",
          showSummaryChangeOption: true
        }
      ]
    },
    {
      id: "referral-details",
      showCondition: "route=\"referral\"",
      fields: [
        {
          id: "staleReferralTaskId",
          label: "Referral task id",
          pageId: "referral-details",
          value: "task-stale-referral-001",
          showCondition: "route=\"referral\""
        }
      ]
    },
    {
      id: "safeguarding-details",
      showCondition: "route=\"safeguarding\"",
      fields: [
        {
          id: "safeguardingReason",
          label: "Safeguarding reason",
          pageId: "safeguarding-details",
          value: "Risk identified from application",
          showCondition: "route=\"safeguarding\"",
          showSummaryChangeOption: true
        },
        {
          id: "childCollection",
          label: "Children",
          pageId: "safeguarding-details",
          value: [{ firstName: "Alex", riskFlag: "Yes" }],
          showCondition: "childCollection[0].riskFlag=\"Yes\"",
          showSummaryChangeOption: true
        }
      ]
    },
    {
      id: "service-of-documents-additional-recipients",
      showCondition: "sodAdditionalRecipients=\"additionalRecipients\"",
      fields: [
        {
          id: "sodAdditionalRecipients",
          label: "Add additional recipients",
          pageId: "service-of-documents-additional-recipients",
          value: "additionalRecipients",
          showSummaryChangeOption: true
        },
        {
          id: "sodAdditionalRecipientsList",
          label: "Additional recipients",
          pageId: "service-of-documents-additional-recipients",
          value: [
            {
              serveByPostOrEmail: "email",
              emailInformation: {
                emailName: "Example organisation",
                emailAddress: "example.organisation@example.invalid"
              }
            }
          ],
          showCondition: "sodAdditionalRecipients=\"additionalRecipients\"",
          showSummaryChangeOption: true,
          complexChildren: [
            {
              id: "serveByPostOrEmail",
              label: "Served by",
              pageId: "service-of-documents-additional-recipients",
              value: "email"
            },
            {
              id: "emailInformation",
              label: "Email information",
              pageId: "service-of-documents-additional-recipients",
              value: {
                emailName: "Example organisation",
                emailAddress: "example.organisation@example.invalid"
              },
              showCondition: "sodAdditionalRecipientsList.serveByPostOrEmail=\"email\"",
              complexChildren: [
                {
                  id: "emailInformation.emailName",
                  label: "Name",
                  pageId: "service-of-documents-additional-recipients",
                  value: "Example organisation",
                  showCondition: "sodAdditionalRecipientsList.serveByPostOrEmail=\"email\""
                },
                {
                  id: "emailInformation.emailAddress",
                  label: "Email address",
                  pageId: "service-of-documents-additional-recipients",
                  value: "example.organisation@example.invalid",
                  showCondition: "sodAdditionalRecipientsList.serveByPostOrEmail=\"email\""
                }
              ]
            }
          ]
        }
      ]
    },
    {
      id: "hidden-complex-retention",
      fields: [
        {
          id: "confidentialDirections",
          label: "Confidential directions",
          pageId: "hidden-complex-retention",
          value: {
            directionId: "dir-001",
            sealedReason: "Judicial direction"
          },
          displayContext: "HIDDEN",
          complexChildren: [
            {
              id: "directionId",
              label: "Direction id",
              pageId: "hidden-complex-retention",
              value: "dir-001",
              displayContext: "HIDDEN"
            },
            {
              id: "sealedReason",
              label: "Sealed reason",
              pageId: "hidden-complex-retention",
              value: "Judicial direction",
              displayContext: "HIDDEN"
            }
          ]
        }
      ]
    },
    {
      id: "review-details",
      fields: [
        {
          id: "reviewOutcome",
          label: "Review outcome",
          pageId: "review-details",
          value: "Continue",
          showSummaryChangeOption: true
        }
      ]
    }
  ]
};

export const WORK_ALLOCATION_REPLAY = {
  ...privateLawBase,
  userId: "exui-central-assurance-user",
  roleAssignments: [
    {
      id: "explicit-private-law",
      userId: "exui-central-assurance-user",
      roleName: "caseworker-privatelaw-courtadmin",
      roleCategory: "LEGAL_OPERATIONS",
      attributes: {
        jurisdiction: "PRIVATELAW",
        primaryLocation: "366559"
      }
    },
    {
      id: "null-service-all-services",
      userId: "exui-central-assurance-user",
      roleName: "case-allocator",
      roleCategory: "JUDICIAL",
      attributes: {
        jurisdiction: null,
        primaryLocation: "366559"
      }
    },
    {
      id: "no-category-fallback",
      userId: "exui-central-assurance-user",
      roleName: "hearing-manager",
      attributes: {
        jurisdiction: "PRIVATELAW",
        primaryLocation: "366559"
      }
    }
  ] satisfies readonly RoleAssignmentFixture[],
  personas: [
    {
      id: "judge",
      roles: ["caseworker-privatelaw-judge"],
      expectedTabs: ["My work", "Available tasks", "My cases"],
      expectedLocationIds: ["366559"]
    },
    {
      id: "deputy-judge",
      roles: ["caseworker-privatelaw-deputy-district-judge"],
      expectedTabs: ["My work", "Available tasks", "My cases"],
      expectedLocationIds: ["366559"]
    },
    {
      id: "caseworker",
      roles: ["caseworker-privatelaw-courtadmin"],
      expectedTabs: ["My work", "Available tasks", "All work", "My cases"],
      expectedLocationIds: ["366559"]
    },
    {
      id: "allocator",
      roles: ["case-allocator"],
      expectedTabs: ["My work", "Available tasks", "All work", "My cases", "My access"],
      expectedLocationIds: ["366559"]
    },
    {
      id: "hearing-manager",
      roles: ["hearing-manager"],
      expectedTabs: ["My work", "Available tasks", "All work"],
      expectedLocationIds: ["366559"]
    }
  ] satisfies readonly WorkAllocationPersona[],
  tasks: [
    {
      id: "task-review-referral",
      caseId: "1700000000000001",
      eventId: "reviewReferral",
      state: "assigned"
    },
    {
      id: "task-update-referral",
      caseId: "1700000000000001",
      eventId: "updateReferral",
      state: "assigned"
    }
  ] satisfies readonly WorkAllocationTaskFixture[]
} as const;

export const CCD_SEARCH_WORKBASKET_METADATA_REPLAY: CcdSearchWorkbasketMetadataReplay = {
  ...privateLawBase,
  requiredSearchInputFields: ["[CASE_REFERENCE]"],
  searchInputFields: [
    {
      caseTypeId: "PRLAPPS",
      fieldId: "[CASE_REFERENCE]",
      label: "Case reference",
      source: "SearchInputFields"
    }
  ],
  workbasketInputFields: [
    {
      caseTypeId: "PRLAPPS",
      fieldId: "caseNameHmctsInternal",
      label: "Case name",
      source: "WorkBasketInputFields"
    }
  ]
};

export const PROTECTED_ENDPOINT_REPLAY: readonly ProtectedEndpointFixture[] = [
  {
    method: "GET",
    path: "/workallocation/caseworker/getUsersByServiceName",
    sensitiveFields: ["email", "firstName", "lastName", "idamId", "roleCategory", "service"]
  },
  {
    method: "POST",
    path: "/workallocation/caseworker/getUsersByServiceName",
    sensitiveFields: ["email", "firstName", "lastName", "idamId", "roleCategory", "service"]
  },
  {
    method: "GET",
    path: "/api/role-access/roles/getJudicialUsers",
    sensitiveFields: ["email", "fullName", "sidamId"]
  }
];

export const EVENT_HISTORY_REPLAY = {
  ...privateLawBase,
  personas: [
    {
      id: "internal-caseworker",
      roles: ["pui-case-manager", "caseworker-privatelaw-courtadmin"],
      canOpenEventDetails: true
    },
    {
      id: "external-solicitor",
      roles: ["caseworker-privatelaw-solicitor"],
      canOpenEventDetails: false
    }
  ] satisfies readonly EventHistoryPersona[],
  eventRows: [
    {
      eventName: "Upload draft orders",
      href: "/cases/case-details/PRIVATELAW/PRLAPPS/1700000000000001/event/123"
    },
    {
      eventName: "Review referral",
      href: "/cases/case-details/PRIVATELAW/PRLAPPS/1700000000000001/event/124"
    }
  ] satisfies readonly EventHistoryRow[],
  minimumEmbeddedComponentWidthPx: 960,
  viewportWidthPx: 1280
} as const;

export const EVENT_START_SPINNER_REPLAY = {
  callbackLatencyMs: 2_500,
  spinnerAppearWithinMs: 500,
  spinnerClearWithinMs: 5_000,
  callbackOutcome: "success"
} as const;

export const IDAM_PASSPORT_SESSION_REPLAY: AuthSmokeReplay = {
  callbackStatus: 302,
  sessionCookiePresent: true,
  shellRouteStatus: 200,
  logoutStatus: 302,
  roles: ["caseworker-privatelaw", "caseworker-privatelaw-courtadmin"]
};

export const AUTH_JOURNEY_GUARDRAIL_REPLAY: AuthJourneyGuardrailReplay = {
  requiredRolePattern: "caseworker",
  scenarios: [
    {
      id: "exui-4744-direct-idam-no-state-bookmark",
      historicRefs: ["EXUI-4744", "EXUI-4184"],
      entrypoint: "direct-idam-authorize",
      authenticationState: "not-authenticated",
      stateManagedByExui: false,
      loginHint: "ejudiciary-aad",
      roles: [],
      expectedOutcome: "login-bookmark",
      ownerBucket: "auth-entrypoint-owned",
      baSummary:
        "The user starts from a tile URL that skips EXUI, so EXUI never creates the auth state it later validates.",
      developerSignal: "Direct IDAM authorize URL with login_hint but without EXUI-managed state reproduces the bookmark failure."
    },
    {
      id: "exui-4744-exui-auth-login-hint",
      historicRefs: ["EXUI-4744"],
      entrypoint: "exui-auth-login",
      authenticationState: "not-authenticated",
      stateManagedByExui: true,
      loginHint: "ejudiciary-aad",
      roles: [],
      expectedOutcome: "redirect-sso",
      legacyOutcome: "login-bookmark",
      ownerBucket: "auth-entrypoint-owned",
      baSummary:
        "The user starts from an EXUI-owned auth URL, EXUI creates state, carries the SSO hint, and sends the user to the right login route.",
      developerSignal: "/auth/login?login_hint=ejudiciary-aad must be the tile-facing route, not a raw IDAM authorize URL."
    },
    {
      id: "exui-4697-authenticated-user-missing-caseworker-role",
      historicRefs: ["EXUI-4697", "INC-0156379", "INC-0161878"],
      entrypoint: "oauth-callback",
      authenticationState: "authenticated",
      stateManagedByExui: true,
      roles: ["citizen"],
      requiredRolePattern: "caseworker",
      expectedOutcome: "access-denied",
      legacyOutcome: "logout-root-loop",
      ownerBucket: "post-auth-authorisation-owned",
      baSummary:
        "IDAM authentication succeeded, but the account is not authorised for Manage Case, so the service should explain that rather than looping back to login.",
      developerSignal:
        "Post-auth role mismatch must branch to access denied before normal logout/root redirect code is used."
    },
    {
      id: "exui-4697-authenticated-user-with-caseworker-role",
      historicRefs: ["EXUI-4697"],
      entrypoint: "oauth-callback",
      authenticationState: "authenticated",
      stateManagedByExui: true,
      roles: ["caseworker", "caseworker-privatelaw"],
      requiredRolePattern: "caseworker",
      expectedOutcome: "app-shell",
      ownerBucket: "post-auth-authorisation-owned",
      baSummary:
        "A correctly onboarded user still reaches Manage Case normally, so the guardrail does not block valid users.",
      developerSignal: "The access-denied branch must be limited to missing-role outcomes."
    }
  ]
};

export function buildManageCaseSubmitPayload(replay: ManageCaseDataIntegrityReplay): Record<string, unknown> {
  const finalVisiblePageIds = new Set(replay.finalVisiblePageIds);
  return Object.fromEntries(
    replay.pages
      .flatMap((page) => page.fields)
      .filter((field) => finalVisiblePageIds.has(field.pageId) || field.displayContext === "HIDDEN")
      .filter((field) => field.value !== undefined && field.value !== null)
      .map((field) => [field.id, field.value])
  );
}

export function buildCyaRows(replay: ManageCaseDataIntegrityReplay): readonly CyaReplayRow[] {
  const finalVisiblePageIds = new Set(replay.finalVisiblePageIds);
  return replay.pages
    .flatMap((page) => page.fields)
    .filter((field) => finalVisiblePageIds.has(field.pageId))
    .filter((field) => field.displayContext !== "HIDDEN")
    .map((field) => buildCyaRow(field, finalVisiblePageIds));
}

function buildCyaRow(field: SyntheticCaseField, finalVisiblePageIds: ReadonlySet<string>): CyaReplayRow {
  return {
    fieldId: field.id,
    label: field.label,
    value: field.value,
    changeLinkVisible: field.showSummaryChangeOption === true,
    showCondition: field.showCondition,
    childRows: field.complexChildren
      ?.filter((childField) => finalVisiblePageIds.has(childField.pageId))
      .filter((childField) => childField.displayContext !== "HIDDEN")
      .map((childField) => buildCyaRow(childField, finalVisiblePageIds))
  };
}

export function flattenCyaRows(rows: readonly CyaReplayRow[]): readonly CyaReplayRow[] {
  return rows.flatMap((row) => [row, ...flattenCyaRows(row.childRows ?? [])]);
}

export function buildExui4493NestedComplexCyaEvidence(): Exui4493NestedComplexCyaEvidence {
  const requiredFieldIds = ["emailInformation.emailName", "emailInformation.emailAddress"] as const;
  const flattenedRows = flattenCyaRows(buildCyaRows(MANAGE_CASE_DATA_INTEGRITY_REPLAY));
  const actualFieldIds = new Set(flattenedRows.map((row) => row.fieldId));

  return {
    projection: "source-replay",
    sourceShape: {
      serviceFamily: "PRIVATELAW",
      jurisdiction: "PRIVATELAW",
      caseType: "PRLAPPS",
      eventId: "serviceOfDocuments",
      collectionFieldId: "sodAdditionalRecipientsList",
      nestedComplexFieldId: "emailInformation",
      showCondition: "sodAdditionalRecipientsList.serveByPostOrEmail=\"email\""
    },
    flattenedRows,
    requiredFieldIds,
    missingFieldIds: requiredFieldIds.filter((fieldId) => !actualFieldIds.has(fieldId))
  };
}

export function assertExui4493NestedComplexCyaRowsPresent(evidence: Exui4493NestedComplexCyaEvidence): void {
  if (evidence.missingFieldIds.length > 0) {
    throw new Error(
      `EXUI-4493 nested complex CYA rows missing: ${evidence.missingFieldIds.join(
        ", "
      )}. Source shape: ${evidence.sourceShape.eventId} ${evidence.sourceShape.collectionFieldId} with ${evidence.sourceShape.showCondition}`
    );
  }
}

export function resolveCaseworkerJurisdictions(
  roleAssignments: readonly RoleAssignmentFixture[],
  serviceFamilies: readonly string[] = EXUI_WA_SUPPORTED_SERVICE_FAMILIES
): readonly string[] {
  const serviceSet = new Set<string>();
  for (const assignment of roleAssignments) {
    const jurisdiction = assignment.attributes.jurisdiction;
    if (jurisdiction === null || jurisdiction === undefined) {
      serviceFamilies.forEach((serviceFamily) => serviceSet.add(serviceFamily));
    } else {
      serviceSet.add(jurisdiction);
    }
  }

  return [...serviceSet].sort((left, right) => left.localeCompare(right));
}

export function resolveRoleCategory(roleAssignments: readonly RoleAssignmentFixture[]): string {
  return (
    roleAssignments.find((assignment) => assignment.roleCategory)?.roleCategory ??
    roleAssignments.find((assignment) => assignment.attributes.jurisdiction === null)?.roleCategory ??
    "UNKNOWN"
  );
}

export function findTaskToComplete(
  tasks: readonly WorkAllocationTaskFixture[],
  eventCompletion: { taskId: string; caseId: string; eventId: string }
): WorkAllocationTaskFixture | undefined {
  return tasks.find(
    (task) =>
      task.id === eventCompletion.taskId && task.caseId === eventCompletion.caseId && task.eventId === eventCompletion.eventId
  );
}

export function mutateCcdSearchMetadataForDemo(
  replay: CcdSearchWorkbasketMetadataReplay,
  mutation = process.env.EXUI_ASSURANCE_MUTATION?.trim()
): CcdSearchWorkbasketMetadataReplay {
  if (mutation !== "drop-ccd-case-reference-search-input") {
    return replay;
  }

  return {
    ...replay,
    searchInputFields: replay.searchInputFields.filter((field) => field.fieldId !== "[CASE_REFERENCE]")
  };
}

export function assertRequiredCcdSearchMetadataFieldsPresent(replay: CcdSearchWorkbasketMetadataReplay): void {
  const actualSearchInputFields = new Set(replay.searchInputFields.map((field) => field.fieldId));
  const missing = replay.requiredSearchInputFields.filter((fieldId) => !actualSearchInputFields.has(fieldId));

  if (missing.length > 0) {
    throw new Error(`CCD search metadata is missing required EXUI search input fields: ${missing.join(", ")}`);
  }
}

export function isAnonymousProtectedEndpointResponseSafe(
  status: number,
  responseBody: unknown,
  sensitiveFields: readonly string[]
): boolean {
  if ([301, 302, 303, 307, 308, 401, 403].includes(status)) {
    return true;
  }

  if (status !== 200) {
    return false;
  }

  const serializedBody = JSON.stringify(responseBody ?? {});
  return sensitiveFields.every((field) => !serializedBody.includes(`"${field}"`));
}

export function buildEventHistoryRowsForPersona(
  persona: EventHistoryPersona,
  rows: readonly EventHistoryRow[]
): readonly EventHistoryRow[] {
  if (persona.canOpenEventDetails) {
    return rows;
  }

  return rows.map(({ eventName }) => ({ eventName }));
}

export function canFetchEventDetails(persona: EventHistoryPersona): boolean {
  return persona.canOpenEventDetails;
}

export function isEventHistoryLayoutUsable(viewportWidthPx: number, componentWidthPx: number): boolean {
  return componentWidthPx >= Math.min(960, viewportWidthPx * 0.75);
}

export function isSpinnerContractSatisfied(replay: typeof EVENT_START_SPINNER_REPLAY): boolean {
  return replay.callbackLatencyMs > replay.spinnerAppearWithinMs && replay.spinnerClearWithinMs > replay.callbackLatencyMs;
}

export function isAuthSmokeSessionValid(replay: AuthSmokeReplay): boolean {
  return (
    replay.callbackStatus >= 300 &&
    replay.callbackStatus < 400 &&
    replay.sessionCookiePresent &&
    replay.shellRouteStatus === 200 &&
    replay.logoutStatus >= 300 &&
    replay.logoutStatus < 400 &&
    replay.roles.includes("caseworker-privatelaw")
  );
}

export function resolveAuthJourneyOutcome(scenario: AuthJourneyReplayScenario): AuthJourneyOutcome {
  if (scenario.entrypoint === "direct-idam-authorize" && !scenario.stateManagedByExui) {
    return "login-bookmark";
  }

  if (scenario.entrypoint === "exui-auth-login" && scenario.stateManagedByExui && scenario.loginHint) {
    return "redirect-sso";
  }

  if (scenario.authenticationState === "authenticated" && scenario.requiredRolePattern) {
    const roleMatcher = new RegExp(scenario.requiredRolePattern);
    return scenario.roles.some((role) => roleMatcher.test(role)) ? "app-shell" : "access-denied";
  }

  return scenario.expectedOutcome;
}

export function resolveLegacyAuthJourneyOutcome(scenario: AuthJourneyReplayScenario): AuthJourneyOutcome {
  return scenario.legacyOutcome ?? resolveAuthJourneyOutcome(scenario);
}

export function assertAuthJourneyGuardrailScenarios(replay: AuthJourneyGuardrailReplay): void {
  for (const scenario of replay.scenarios) {
    const actualOutcome = resolveAuthJourneyOutcome(scenario);

    if (actualOutcome !== scenario.expectedOutcome) {
      throw new Error(
        `${scenario.id} resolved to ${actualOutcome}; expected ${scenario.expectedOutcome}. ${scenario.developerSignal}`
      );
    }
  }
}

export function buildAuthJourneyClassificationSummary(
  replay: AuthJourneyGuardrailReplay
): Record<AuthJourneyOwnershipBucket, readonly string[]> {
  return replay.scenarios.reduce<Record<AuthJourneyOwnershipBucket, string[]>>(
    (summary, scenario) => {
      summary[scenario.ownerBucket].push(scenario.id);
      return summary;
    },
    {
      "auth-entrypoint-owned": [],
      "post-auth-authorisation-owned": [],
      "service-visual-layout-owned": []
    }
  );
}

export function assertPrivateLawConfigAnchors(): void {
  if (!EXUI_SERVICE_REF_DATA_MAPPING.PRIVATELAW?.includes(privateLawBase.serviceCode)) {
    throw new Error(`Private Law service code ${privateLawBase.serviceCode} is not in EXUI service ref-data mapping`);
  }

  if (!EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.PRIVATELAW?.includes(privateLawBase.caseType)) {
    throw new Error(`Private Law case type ${privateLawBase.caseType} is not in EXUI hearings case-type mapping`);
  }
}
