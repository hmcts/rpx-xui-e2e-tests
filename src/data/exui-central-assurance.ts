export const EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES = [
  "IA",
  "CIVIL",
  "PRIVATELAW",
  "PUBLICLAW",
  "EMPLOYMENT",
  "ST_CIC",
] as const;

export const EXUI_WA_SUPPORTED_SERVICE_FAMILIES = [
  "IA",
  "CIVIL",
  "PRIVATELAW",
  "PUBLICLAW",
  "EMPLOYMENT",
  "ST_CIC",
] as const;

export const EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES = [
  "ST_CIC",
  "CIVIL",
  "EMPLOYMENT",
  "PRIVATELAW",
  "PUBLICLAW",
  "IA",
  "SSCS",
  "DIVORCE",
  "FR",
  "PROBATE",
] as const;

export const EXUI_CANARY_SERVICE_FAMILIES = ["CMC", "HRS"] as const;

export const EXUI_SERVICE_LABELS: Record<string, string> = {
  CIVIL: "Civil",
  CMC: "Civil Money Claims",
  DIVORCE: "Divorce",
  EMPLOYMENT: "Employment",
  FR: "Financial Remedy",
  HRS: "Hearing Recording Storage",
  IA: "Immigration and Asylum",
  PRIVATELAW: "Private Law",
  PROBATE: "Probate",
  PUBLICLAW: "Public Law",
  SSCS: "Social Security and Child Support",
  ST_CIC: "Special Tribunals",
};

export type AssuranceScenarioLane =
  | "global-search"
  | "work-allocation"
  | "hearings"
  | "canary";

export type AssuranceScenarioPriority = "must-run" | "grouped" | "canary";
export type AssuranceScenarioExecutionStatus = "implemented" | "planned";

export interface ExuiCentralAssuranceScenario {
  id: string;
  lane: AssuranceScenarioLane;
  priority: AssuranceScenarioPriority;
  executionStatus: AssuranceScenarioExecutionStatus;
  serviceFamily: string;
  caseType?: string;
  roleCluster?: string;
  assertion: string;
}

export const EXUI_CENTRAL_ASSURANCE_MVP_SCENARIOS: readonly ExuiCentralAssuranceScenario[] =
  [
    {
      id: "wa-supported-service-families",
      lane: "work-allocation",
      priority: "must-run",
      executionStatus: "implemented",
      serviceFamily: "WA_SHARED",
      roleCluster: "court-admin",
      assertion: "available tasks exposes the central WA-supported family list",
    },
    {
      id: "global-search-supported-service-families",
      lane: "global-search",
      priority: "must-run",
      executionStatus: "implemented",
      serviceFamily: "GLOBAL_SEARCH_SHARED",
      roleCluster: "solicitor",
      assertion: "global search exposes the central service-family list",
    },
    {
      id: "hearings-privatelaw-prlapps-manager",
      lane: "hearings",
      priority: "must-run",
      executionStatus: "planned",
      serviceFamily: "PRIVATELAW",
      caseType: "PRLAPPS",
      roleCluster: "hearing-manager",
      assertion: "hearings tab renders manager actions for a supported family",
    },
    {
      id: "hearings-disabled-divorce",
      lane: "hearings",
      priority: "grouped",
      executionStatus: "planned",
      serviceFamily: "DIVORCE",
      caseType: "DIVORCE",
      roleCluster: "hearing-manager",
      assertion: "hearings tab is hidden for an unsupported family",
    },
    {
      id: "canary-cmc-hrs",
      lane: "canary",
      priority: "canary",
      executionStatus: "implemented",
      serviceFamily: "CMC,HRS",
      assertion: "weak-evidence families stay outside the central must-run set",
    },
  ];

export function normalizeServiceFamily(value: string): string {
  return value.trim().toUpperCase();
}

export function sortServiceFamilies(
  values: readonly string[],
): readonly string[] {
  return [...values]
    .map(normalizeServiceFamily)
    .sort((left, right) => left.localeCompare(right));
}

export function buildGlobalSearchServicesCatalog(
  families: readonly string[] = EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
): Array<{ serviceId: string; serviceName: string }> {
  return families.map((family) => {
    const serviceId = normalizeServiceFamily(family);
    return {
    serviceId,
    serviceName: EXUI_SERVICE_LABELS[serviceId] ?? serviceId,
    };
  });
}
