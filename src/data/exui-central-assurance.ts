export const EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES = [
  "IA",
  "CIVIL",
  "PRIVATELAW",
  "PUBLICLAW",
  "EMPLOYMENT",
  "ST_CIC"
] as const;

export const EXUI_WA_SUPPORTED_SERVICE_FAMILIES = [
  "IA",
  "CIVIL",
  "PRIVATELAW",
  "PUBLICLAW",
  "EMPLOYMENT",
  "ST_CIC"
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
  "PROBATE"
] as const;

export const EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES = [
  "SSCS",
  "PRIVATELAW",
  "CIVIL",
  "IA"
] as const;

export const EXUI_ALL_CONFIGURED_SERVICE_FAMILIES = [
  "DIVORCE",
  "PROBATE",
  "FR",
  "PUBLICLAW",
  "IA",
  "SSCS",
  "EMPLOYMENT",
  "HRS",
  "CIVIL",
  "CMC",
  "PRIVATELAW",
  "ST_CIC"
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
  ST_CIC: "Special Tribunals"
};

export const EXUI_SERVICE_REF_DATA_MAPPING: Record<string, readonly string[]> = {
  CIVIL: ["AAA6", "AAA7"],
  DIVORCE: ["ABA1"],
  EMPLOYMENT: ["BHA1"],
  FR: ["ABA2"],
  IA: ["BFA1"],
  PRIVATELAW: ["ABA5"],
  PROBATE: ["ABA6"],
  PUBLICLAW: ["ABA3"],
  SSCS: ["BBA3"],
  ST_CIC: ["BBA2"]
};

export const EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY: Record<string, readonly string[]> = {
  CIVIL: ["CIVIL"],
  IA: ["Asylum", "Bail"],
  PRIVATELAW: ["PRLAPPS"],
  SSCS: ["Benefit"]
};

export type AssuranceScenarioLane =
  | "configuration"
  | "global-search"
  | "work-allocation"
  | "staff-ref-data"
  | "hearings"
  | "canary";

export type AssuranceScenarioPriority = "must-run" | "grouped" | "canary";
export type AssuranceScenarioExecutionMode = "api" | "ui" | "hybrid" | "planned";
export type AssuranceCoverageDisposition = "release-blocking" | "grouped" | "canary";
export type AssuranceSourceRepository = "rpx-xui-webapp" | "rpx-xui-e2e-tests" | "prl-ccd-definitions";
export type AssuranceSourceKind = "config" | "api" | "playwright" | "backend-mock" | "ccd-definition" | "docs";

export interface ExuiSuperserviceSourceRef {
  repository: AssuranceSourceRepository;
  path: string;
  kind: AssuranceSourceKind;
  reason: string;
}

export const EXUI_SOURCE_OF_TRUTH_REFS = {
  defaultConfig: {
    repository: "rpx-xui-webapp",
    path: "config/default.json",
    kind: "config",
    reason: "Central EXUI service-family, header, WA, staff, and hearings defaults"
  },
  customEnvironmentVariables: {
    repository: "rpx-xui-webapp",
    path: "config/custom-environment-variables.json",
    kind: "config",
    reason: "Environment override names that can change runtime service-family behaviour"
  },
  apiConfiguration: {
    repository: "rpx-xui-webapp",
    path: "api/configuration/**",
    kind: "api",
    reason: "Node API endpoints that expose EXUI configuration to tests and the Angular shell"
  },
  playwrightConfigUtilities: {
    repository: "rpx-xui-webapp",
    path: "playwright_tests_new/**",
    kind: "playwright",
    reason: "Existing EXUI Playwright bootstrap and configuration coverage patterns"
  },
  backendCcdMocks: {
    repository: "rpx-xui-webapp",
    path: "test_codecept/backendMock/services/ccd/**",
    kind: "backend-mock",
    reason: "Legacy CCD/EXUI mock contracts that document downstream response shape"
  },
  serviceCcdDefinitions: {
    repository: "prl-ccd-definitions",
    path: "definitions/**",
    kind: "ccd-definition",
    reason: "Representative consuming-service CCD setup for role, jurisdiction, and case-type permutations"
  },
  localHarnessDocs: {
    repository: "rpx-xui-e2e-tests",
    path: "docs/srt-poc/**",
    kind: "docs",
    reason: "Local superservice POC assumptions, execution matrix, and skipped-seam record"
  }
} as const satisfies Record<string, ExuiSuperserviceSourceRef>;

export interface ExuiSuperserviceScenario {
  id: string;
  lane: AssuranceScenarioLane;
  priority: AssuranceScenarioPriority;
  executionMode: AssuranceScenarioExecutionMode;
  serviceFamily: string;
  caseType?: string;
  roleCluster?: string;
  assertion: string;
  source: string;
  sourceRefs: readonly ExuiSuperserviceSourceRef[];
}

export interface ExuiServiceFamilyCoverageDecision {
  serviceFamily: string;
  disposition: AssuranceCoverageDisposition;
  lanes: readonly AssuranceScenarioLane[];
  representativeScenarioIds: readonly string[];
  rationale: string;
}

const commonCentralLanes = ["global-search", "work-allocation", "staff-ref-data"] as const;

export const EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS: readonly ExuiServiceFamilyCoverageDecision[] = [
  {
    serviceFamily: "IA",
    disposition: "release-blocking",
    lanes: [...commonCentralLanes, "hearings"],
    representativeScenarioIds: [
      "global-search-supported-service-families",
      "wa-supported-service-families",
      "staff-supported-service-families",
      "hearings-supported-family-config-contract"
    ],
    rationale: "Central global search/WA/staff family and a hearings-enabled jurisdiction."
  },
  {
    serviceFamily: "CIVIL",
    disposition: "release-blocking",
    lanes: [...commonCentralLanes, "hearings"],
    representativeScenarioIds: [
      "global-search-supported-service-families",
      "wa-supported-service-families",
      "staff-supported-service-families",
      "hearings-supported-family-config-contract"
    ],
    rationale: "Central global search/WA/staff family and a hearings-enabled jurisdiction."
  },
  {
    serviceFamily: "PRIVATELAW",
    disposition: "release-blocking",
    lanes: [...commonCentralLanes, "hearings"],
    representativeScenarioIds: [
      "global-search-supported-service-families",
      "wa-supported-service-families",
      "staff-supported-service-families",
      "hearings-privatelaw-prlapps-manager"
    ],
    rationale: "Representative PRL family covers service-code, role, and hearing-manager permutations sourced from PRL CCD definitions."
  },
  {
    serviceFamily: "PUBLICLAW",
    disposition: "release-blocking",
    lanes: commonCentralLanes,
    representativeScenarioIds: [
      "global-search-supported-service-families",
      "wa-supported-service-families",
      "staff-supported-service-families"
    ],
    rationale: "Central global search/WA/staff family sharing the same EXUI config contracts."
  },
  {
    serviceFamily: "EMPLOYMENT",
    disposition: "release-blocking",
    lanes: commonCentralLanes,
    representativeScenarioIds: [
      "global-search-supported-service-families",
      "wa-supported-service-families",
      "staff-supported-service-families"
    ],
    rationale: "Central global search/WA/staff family sharing the same EXUI config contracts."
  },
  {
    serviceFamily: "ST_CIC",
    disposition: "release-blocking",
    lanes: commonCentralLanes,
    representativeScenarioIds: [
      "global-search-supported-service-families",
      "wa-supported-service-families",
      "staff-supported-service-families"
    ],
    rationale: "Central global search/WA/staff family sharing the same EXUI config contracts."
  },
  {
    serviceFamily: "SSCS",
    disposition: "grouped",
    lanes: ["staff-ref-data", "hearings"],
    representativeScenarioIds: [
      "staff-supported-service-families",
      "hearings-supported-family-config-contract"
    ],
    rationale: "Staff-supported and hearings-enabled, but not in the central global search/WA release-blocking set."
  },
  {
    serviceFamily: "DIVORCE",
    disposition: "grouped",
    lanes: ["staff-ref-data", "hearings"],
    representativeScenarioIds: [
      "staff-supported-service-families",
      "hearings-disabled-divorce"
    ],
    rationale: "Staff-supported family used as the explicit unsupported-hearings canary for hidden-surface behaviour."
  },
  {
    serviceFamily: "FR",
    disposition: "grouped",
    lanes: ["staff-ref-data"],
    representativeScenarioIds: ["staff-supported-service-families"],
    rationale: "Staff-supported only in this first slice; grouped until a distinct EXUI-facing behaviour is identified."
  },
  {
    serviceFamily: "PROBATE",
    disposition: "grouped",
    lanes: ["staff-ref-data"],
    representativeScenarioIds: ["staff-supported-service-families"],
    rationale: "Staff-supported only in this first slice; grouped until a distinct EXUI-facing behaviour is identified."
  },
  {
    serviceFamily: "CMC",
    disposition: "canary",
    lanes: ["canary"],
    representativeScenarioIds: ["canary-cmc-hrs"],
    rationale: "Present in configured jurisdictions but intentionally outside the central release-blocking family sets."
  },
  {
    serviceFamily: "HRS",
    disposition: "canary",
    lanes: ["canary"],
    representativeScenarioIds: ["canary-cmc-hrs"],
    rationale: "Present in configured jurisdictions but intentionally outside the central release-blocking family sets."
  }
] as const;

export const EXUI_SUPERSERVICE_SCENARIOS: readonly ExuiSuperserviceScenario[] = [
  {
    id: "manifest-source-drift-check",
    lane: "configuration",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "EXUI",
    assertion: "source-truth snapshot stays aligned to current rpx-xui-webapp service-family configuration",
    source: "rpx-xui-webapp config/default.json and config/custom-environment-variables.json",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.customEnvironmentVariables,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "configuration-open-ui-contract",
    lane: "configuration",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "EXUI",
    assertion: "external config exposes the UI keys consumed by EXUI",
    source: "rpx-xui-webapp/api/configuration and config/default.json",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.customEnvironmentVariables,
      EXUI_SOURCE_OF_TRUTH_REFS.apiConfiguration
    ]
  },
  {
    id: "global-search-supported-service-families",
    lane: "global-search",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "GLOBAL_SEARCH_SHARED",
    roleCluster: "solicitor",
    assertion: "global search exposes every central must-run service family",
    source: "rpx-xui-webapp globalSearchServices",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.apiConfiguration,
      EXUI_SOURCE_OF_TRUTH_REFS.backendCcdMocks
    ]
  },
  {
    id: "wa-supported-service-families",
    lane: "work-allocation",
    priority: "must-run",
    executionMode: "hybrid",
    serviceFamily: "WA_SHARED",
    roleCluster: "court-admin",
    assertion: "available-tasks filters expose the central WA-supported family list",
    source: "rpx-xui-webapp waSupportedJurisdictions",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.playwrightConfigUtilities,
      EXUI_SOURCE_OF_TRUTH_REFS.serviceCcdDefinitions,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "staff-supported-service-families",
    lane: "staff-ref-data",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "STAFF_SHARED",
    roleCluster: "staff-admin",
    assertion: "staff-supported jurisdiction endpoint matches the configured central list",
    source: "rpx-xui-webapp staffSupportedJurisdictions",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.apiConfiguration,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "hearings-supported-family-config-contract",
    lane: "hearings",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "SSCS,PRIVATELAW,CIVIL,IA",
    roleCluster: "hearing-manager",
    assertion: "configured hearings-enabled families remain explicit and labelled",
    source: "rpx-xui-webapp services.hearings.hearingsJurisdictions",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.apiConfiguration,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "hearings-privatelaw-prlapps-manager",
    lane: "hearings",
    priority: "must-run",
    executionMode: "ui",
    serviceFamily: "PRIVATELAW",
    caseType: "PRLAPPS",
    roleCluster: "hearing-manager",
    assertion: "hearings tab renders manager actions for a supported family",
    source: "rpx-xui-webapp hearingJurisdictionConfig",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.playwrightConfigUtilities,
      EXUI_SOURCE_OF_TRUTH_REFS.serviceCcdDefinitions
    ]
  },
  {
    id: "hearings-disabled-divorce",
    lane: "hearings",
    priority: "grouped",
    executionMode: "ui",
    serviceFamily: "DIVORCE",
    caseType: "DIVORCE",
    roleCluster: "hearing-manager",
    assertion: "hearings tab is hidden for a grouped unsupported family",
    source: "rpx-xui-webapp hearingJurisdictionConfig",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.playwrightConfigUtilities,
      EXUI_SOURCE_OF_TRUTH_REFS.serviceCcdDefinitions
    ]
  },
  {
    id: "canary-cmc-hrs",
    lane: "canary",
    priority: "canary",
    executionMode: "api",
    serviceFamily: "CMC,HRS",
    assertion: "weak-evidence families stay outside the central release-blocking family sets",
    source: "rpx-xui-webapp jurisdictions",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.backendCcdMocks,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  }
] as const;

export function normalizeServiceFamily(value: string): string {
  return value.trim().toUpperCase();
}

export function sortServiceFamilies(values: readonly string[]): readonly string[] {
  return [...values]
    .map(normalizeServiceFamily)
    .sort((left, right) => left.localeCompare(right));
}

export function sortedUniqueServiceFamilies(values: readonly string[]): readonly string[] {
  return [...new Set(sortServiceFamilies(values))];
}

export function buildGlobalSearchServicesCatalog(
  families: readonly string[] = EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES
): Array<{ serviceId: string; serviceName: string }> {
  return families.map((family) => {
    const serviceId = normalizeServiceFamily(family);
    return {
      serviceId,
      serviceName: EXUI_SERVICE_LABELS[serviceId] ?? serviceId
    };
  });
}

export function buildSuperserviceKnowledgeIndex(
  scenarios: readonly ExuiSuperserviceScenario[] = EXUI_SUPERSERVICE_SCENARIOS
): Record<string, readonly ExuiSuperserviceSourceRef[]> {
  return Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario.sourceRefs]));
}

export function findUnclassifiedServiceFamilies(
  families: readonly string[] = EXUI_ALL_CONFIGURED_SERVICE_FAMILIES,
  decisions: readonly ExuiServiceFamilyCoverageDecision[] = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS
): readonly string[] {
  const classifiedFamilies = new Set(decisions.map((decision) => normalizeServiceFamily(decision.serviceFamily)));
  return sortServiceFamilies(families).filter((family) => !classifiedFamilies.has(family));
}

export function buildCoverageSummary(
  decisions: readonly ExuiServiceFamilyCoverageDecision[] = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS
): Record<AssuranceCoverageDisposition, readonly string[]> {
  return {
    "release-blocking": sortServiceFamilies(
      decisions.filter((decision) => decision.disposition === "release-blocking").map((decision) => decision.serviceFamily)
    ),
    grouped: sortServiceFamilies(
      decisions.filter((decision) => decision.disposition === "grouped").map((decision) => decision.serviceFamily)
    ),
    canary: sortServiceFamilies(
      decisions.filter((decision) => decision.disposition === "canary").map((decision) => decision.serviceFamily)
    )
  };
}
