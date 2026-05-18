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

export const EXUI_PRL_NORMALIZED_SLICES = [
  {
    sliceId: "prl-manage-orders-hearings-auth",
    service: "PRL",
    jurisdiction: "PRIVATELAW",
    caseTypeId: "PRLAPPS",
    sourceRepo: "prl-ccd-definitions",
    lanes: [
      {
        id: "prl-manage-orders-standard",
        priority: "release-blocking-representative",
        events: ["manageOrders"],
        roles: ["caseworker-privatelaw-courtadmin", "caseworker-privatelaw-judge", "caseworker-privatelaw-la"],
        conditions: [
          "ShowSummary=Y",
          "PostConditionState conditional",
          "hidden orchestration fields",
          "ordersHearingDetails complex"
        ]
      },
      {
        id: "prl-wa-manage-orders",
        priority: "release-blocking-representative",
        events: ["waManageOrders"],
        roles: ["caseworker-privatelaw-courtadmin", "caseworker-privatelaw-judge", "caseworker-privatelaw-la"],
        conditions: ["populate-header-task", "displayConfirmedHearing", "dateConfirmedInHearingsTab"]
      },
      {
        id: "prl-hearing-date-permutations",
        priority: "focused-matrix",
        fields: [
          "hearingDateTimes",
          "confirmedHearingDates",
          "allPartiesAttendHearingSameWayYesOrNo",
          "cafcassCymruHearingChannel"
        ],
        permutations: [
          "dateReservedWithListAssist",
          "dateConfirmedInHearingsTab",
          "all same channel",
          "party-specific channels"
        ]
      },
      {
        id: "prl-access-and-flags",
        priority: "entitlement-sensitive",
        events: ["listWithoutNotice", "c100listWithoutNotice"],
        fields: ["flagLauncherExternal", "ordersHearingDetails", "markAsRestrictedReason"],
        roles: [
          "citizen",
          "[CREATOR]",
          "[C100APPLICANTSOLICITOR1]",
          "[C100RESPONDENTSOLICITOR1]",
          "[LASOLICITOR]"
        ]
      }
    ],
    evidenceRefs: [
      "definitions/private-law/json/CaseEvent/CaseEvent.json#rows-71-72-106-107-111",
      "definitions/private-law/json/CaseEventToFields/ManageOrders/Page 1 - Common/CaseEventToFields.json",
      "definitions/private-law/json/CaseEventToComplexTypes/ManageOrders/HearingData/CaseEventToComplexTypes.json",
      "definitions/private-law/json/CaseEventToComplexTypes/WaManageOrders/HearingData/CaseEventToComplexTypes.json",
      "definitions/private-law/json/AuthorisationCaseField/ManageOrders/HearingData/AuthorisationCaseField.json"
    ]
  }
] as const;

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
export type HistoricFailureCoverageStatus = "covered-now" | "would-catch-with-replay-pack" | "partial" | "out-of-scope";
export type HistoricFailureReplayPack =
  | "manage-case-data-integrity"
  | "work-allocation-availability"
  | "protected-endpoint-auth"
  | "event-history-and-layout"
  | "dependency-auth-smoke"
  | "media-viewer-specialist";

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

export interface ExuiHistoricFailureCoverage {
  id: string;
  historicRefs: readonly string[];
  replayPack: HistoricFailureReplayPack;
  failureClass: string;
  harnessContract: string;
  coverageStatus: HistoricFailureCoverageStatus;
  currentPocEvidence: string;
  wouldHaveCaught: boolean;
  missReason?: string;
  nextScenarioId: string;
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

export const EXUI_HISTORIC_FAILURE_COVERAGE: readonly ExuiHistoricFailureCoverage[] = [
  {
    id: "manage-case-previous-navigation-data-loss",
    historicRefs: ["EXUI-837", "EXUI-911"],
    replayPack: "manage-case-data-integrity",
    failureClass: "Previous/Continue navigation with page show conditions can submit stale hidden page data as null",
    harnessContract:
      "Synthetic CCD event journey drives Continue, Previous, changed page visibility, CYA, Submit, then asserts submitted payload and retained case data.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts stale hidden-page data is excluded while retained hidden complex data is submitted.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-manage-case-previous-hidden-page-retention"
  },
  {
    id: "cya-complex-show-condition-summary",
    historicRefs: ["EXUI-848", "EXUI-811", "EXUI-433", "EXUI-702"],
    replayPack: "manage-case-data-integrity",
    failureClass: "CYA fields or change links are missing when show conditions use complex, collection, tabular, or read-only data",
    harnessContract:
      "Synthetic CCD definitions cover complex collection show conditions, read-only tabular fields, and ShowSummaryChangeOption change links.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts complex/collection CYA rows and change-link contracts are represented.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-cya-complex-summary-visibility"
  },
  {
    id: "hidden-complex-retention",
    historicRefs: ["EXUI-942", "EXUI-960"],
    replayPack: "manage-case-data-integrity",
    failureClass: "Hidden complex values are removed or submitted as null, causing case data loss",
    harnessContract:
      "Synthetic event contains complex fields whose children are all HIDDEN; submit must retain the parent complex payload correctly.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts a hidden complex parent with hidden children survives submit payload pruning.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-hidden-complex-submit-retention"
  },
  {
    id: "wa-task-lifecycle-correlation",
    historicRefs: ["EXUI-2668", "EXUI-2743"],
    replayPack: "work-allocation-availability",
    failureClass: "Work Allocation task autocompletion closes the wrong task or fails to close the right task",
    harnessContract:
      "Route-mocked task lifecycle replay correlates event completion with task id/event id and rejects stale completion data.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts task completion correlates by task id, case id, and event id and rejects stale events.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-wa-task-autocomplete-correlation"
  },
  {
    id: "wa-tab-location-availability",
    historicRefs: ["INC5502435", "INC5493460", "INC5494665", "INC5500227", "INC5502207", "INC5502963"],
    replayPack: "work-allocation-availability",
    failureClass: "Users cannot see My Tasks, Available Tasks, All Work, My Cases, My Access, case search, or location filters",
    harnessContract:
      "Persona matrix for judge, deputy judge, caseworker, allocator, and hearing manager asserts tabs, case search, task list, and location filters.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts judge, deputy judge, caseworker, allocator, and hearing-manager tab/location expectations.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-wa-role-location-tab-availability"
  },
  {
    id: "role-assignment-null-service",
    historicRefs: ["EXUI-2352"],
    replayPack: "work-allocation-availability",
    failureClass: "Role assignments with null jurisdiction/service are ignored by caseworker lookup",
    harnessContract:
      "Caseworker lookup fixture includes explicit-service role, null-service role, and no-category fallback role assignments.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts null-service role assignments expand to the central WA service-family set.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-role-assignment-null-service-caseworker-lookup"
  },
  {
    id: "protected-endpoint-auth-negative",
    historicRefs: ["EXUI-2508", "EXUI-2510"],
    replayPack: "protected-endpoint-auth",
    failureClass: "Unauthenticated access to protected EXUI staff-data endpoint returns personal data",
    harnessContract:
      "Unauthenticated negative matrix probes protected EXUI proxy/API endpoints and asserts 401/redirect/no staff data.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts high-risk staff-data endpoints are safe under anonymous guarded responses.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-protected-endpoint-auth-negative"
  },
  {
    id: "event-history-external-role-gate",
    historicRefs: ["EXUI-2104"],
    replayPack: "event-history-and-layout",
    failureClass: "External users can click event history links and retrieve case event details",
    harnessContract:
      "Internal and external role personas assert event history summary visibility, hyperlink removal, and blocked event-detail fetch.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts external personas see event summaries without event-detail links or fetch access.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-event-history-external-role-gate"
  },
  {
    id: "event-history-layout-width",
    historicRefs: ["EXUI-2551"],
    replayPack: "event-history-and-layout",
    failureClass: "Event history details layout is too narrow for Case File View and other components",
    harnessContract:
      "Visual/layout proof opens event details and asserts component width/viewport usability for representative embedded components.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts representative event-history embedded component width remains usable.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-event-history-layout-width"
  },
  {
    id: "event-start-spinner-latency",
    historicRefs: ["EXUI-2595"],
    replayPack: "event-history-and-layout",
    failureClass: "Slow event start gives no feedback or spinner is not removed",
    harnessContract:
      "Delayed callback fixture asserts spinner appears during latency and clears on success/failure.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts delayed event-start spinner appears before callback completion and clears after.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-event-start-spinner-latency"
  },
  {
    id: "idam-passport-session-smoke",
    historicRefs: ["EXUI-2572", "EXUI-2079", "EXUI-2318"],
    replayPack: "dependency-auth-smoke",
    failureClass: "Passport, IDAM, or dependency updates break login, logout, session, or role-sensitive shell behaviour",
    harnessContract:
      "Auth smoke lane verifies login callback, session continuity, role-sensitive shell route, and logout.",
    coverageStatus: "covered-now",
    currentPocEvidence: "Executable replay pack asserts IDAM callback redirect, session cookie, role-sensitive shell route, and logout contract.",
    wouldHaveCaught: true,
    nextScenarioId: "historic-idam-passport-session-smoke"
  },
  {
    id: "media-viewer-redaction-coordinate",
    historicRefs: ["INC5680323", "EXUI-2869", "EXUI-2924", "EM-6575", "EM-6588"],
    replayPack: "media-viewer-specialist",
    failureClass: "Media Viewer redaction boxes shift with zoom, scaling, malformed fonts, or document rendering edge cases",
    harnessContract:
      "Specialist Media Viewer visual/coordinate suite would need real document fixtures and pixel/coordinate assertions.",
    coverageStatus: "out-of-scope",
    currentPocEvidence: "Current Harness can cover EXUI shell/auth route to Media Viewer, but not document-coordinate correctness.",
    wouldHaveCaught: false,
    missReason: "Requires Evidence Management/Media Viewer specialist fixtures outside the first EXUI central-assurance boundary.",
    nextScenarioId: "media-viewer-specialist-redaction-coordinate-suite"
  }
] as const;

export function buildHistoricFailureCoverageSummary(
  failures: readonly ExuiHistoricFailureCoverage[] = EXUI_HISTORIC_FAILURE_COVERAGE
): Record<HistoricFailureCoverageStatus, readonly string[]> {
  return {
    "covered-now": failures.filter((failure) => failure.coverageStatus === "covered-now").map((failure) => failure.id),
    "would-catch-with-replay-pack": failures
      .filter((failure) => failure.coverageStatus === "would-catch-with-replay-pack")
      .map((failure) => failure.id),
    partial: failures.filter((failure) => failure.coverageStatus === "partial").map((failure) => failure.id),
    "out-of-scope": failures.filter((failure) => failure.coverageStatus === "out-of-scope").map((failure) => failure.id)
  };
}

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
