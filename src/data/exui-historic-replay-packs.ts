import {
  EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY,
  EXUI_SERVICE_REF_DATA_MAPPING,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES
} from "./exui-central-assurance.js";

export type ReplayPackId =
  | "manage-case-data-integrity"
  | "work-allocation-availability"
  | "protected-endpoint-auth"
  | "event-history-and-layout"
  | "dependency-auth-smoke";

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

const privateLawBase = {
  serviceFamily: "PRIVATELAW",
  jurisdiction: "PRIVATELAW",
  caseType: "PRLAPPS",
  serviceCode: "ABA5"
} as const;

export const MANAGE_CASE_DATA_INTEGRITY_REPLAY: ManageCaseDataIntegrityReplay = {
  ...privateLawBase,
  visitedPageIds: ["route-selection", "referral-details", "review-details"],
  finalVisiblePageIds: ["route-selection", "safeguarding-details", "hidden-complex-retention", "review-details"],
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
    .map((field) => ({
      fieldId: field.id,
      label: field.label,
      value: field.value,
      changeLinkVisible: field.showSummaryChangeOption === true
    }));
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

export function assertPrivateLawConfigAnchors(): void {
  if (!EXUI_SERVICE_REF_DATA_MAPPING.PRIVATELAW?.includes(privateLawBase.serviceCode)) {
    throw new Error(`Private Law service code ${privateLawBase.serviceCode} is not in EXUI service ref-data mapping`);
  }

  if (!EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.PRIVATELAW?.includes(privateLawBase.caseType)) {
    throw new Error(`Private Law case type ${privateLawBase.caseType} is not in EXUI hearings case-type mapping`);
  }
}
