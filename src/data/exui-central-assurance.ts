import defectIntakeRules from "./exui-defect-intake-rules.json" with { type: "json" };
import releaseAssuranceEvidence from "./exui-release-assurance-evidence.json" with { type: "json" };

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
  "PROBATE",
  "HRS"
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

export const EXUI_CANARY_SERVICE_FAMILIES = ["CMC"] as const;

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
  HRS: ["HRS"],
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
  },
  {
    sliceId: "prl-service-of-documents-nested-cya",
    service: "PRL",
    jurisdiction: "PRIVATELAW",
    caseTypeId: "PRLAPPS",
    sourceRepo: "prl-ccd-definitions",
    lanes: [
      {
        id: "prl-service-of-documents-additional-recipients-cya",
        priority: "release-blocking-representative",
        events: ["serviceOfDocuments"],
        roles: ["caseworker-privatelaw-courtadmin"],
        conditions: [
          "Page 2 sodAdditionalRecipientsList complex",
          "nested emailInformation complex",
          "FieldShowCondition on emailInformation child rows",
          "ShowSummaryChangeOption=Y"
        ]
      }
    ],
    evidenceRefs: [
      "definitions/private-law/json/CaseEvent/ServiceOfDocuments/CaseEvent-nonprod.json",
      "definitions/private-law/json/CaseEventToFields/ServiceOfDocuments/Page2/CaseEventToFields.json",
      "definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json",
      "definitions/private-law/json/AuthorisationCaseEvent/ServiceOfDocuments/AuthorisationCaseEvent.json"
    ]
  }
] as const;

export type AssuranceScenarioLane =
  | "configuration"
  | "global-search"
  | "work-allocation"
  | "staff-ref-data"
  | "hearings"
  | "manage-case"
  | "auth"
  | "canary";

export type AssuranceScenarioPriority = "must-run" | "grouped" | "canary";
export type AssuranceScenarioExecutionMode = "api" | "ui" | "hybrid" | "planned";
export type AssuranceCoverageDisposition = "release-blocking" | "grouped" | "canary";
export type AssuranceSourceRepository =
  | "rpx-xui-webapp"
  | "rpx-xui-node-lib"
  | "rpx-xui-e2e-tests"
  | "prl-ccd-definitions"
  | "hmcts/probate-back-office"
  | "hmcts/sptribs-case-api";
export type AssuranceSourceKind =
  | "config"
  | "api"
  | "playwright"
  | "backend-mock"
  | "ccd-definition"
  | "style"
  | "node-lib"
  | "docs";
export type ExuiConfiguredServiceFamily = (typeof EXUI_ALL_CONFIGURED_SERVICE_FAMILIES)[number];
export type ExuiDefinitionProfileLevel = "ccd-backed" | "config-backed" | "source-unidentified" | "source-unavailable";
export type HistoricFailureCoverageStatus =
  | "covered-now"
  | "would-catch-with-replay-pack"
  | "learning-case"
  | "partial"
  | "out-of-scope";
export type HistoricFailureReplayPack =
  | "manage-case-data-integrity"
  | "work-allocation-availability"
  | "protected-endpoint-auth"
  | "event-history-and-layout"
  | "dependency-auth-smoke"
  | "auth-journey-guardrails"
  | "service-overview-layout"
  | "media-viewer-specialist";

export type HistoricFailureHumanFixConfidence = "confirmed" | "candidate" | "indirect" | "not-found";
export type ExuiDefectIntakeRoute =
  | "historic-replay-pack"
  | "service-family-pack"
  | "targeted-mutation-proof"
  | "owner-confirmed-follow-up"
  | "specialist-suite-follow-up";
export type ExuiReleaseAssuranceStatus = "pass" | "warn" | "fail";
export type ExuiReleaseAssuranceMutationStatus = "passed" | "pending";

export interface ExuiReleaseAssuranceMutationEvidence {
  status: ExuiReleaseAssuranceMutationStatus;
  requiredCommands: readonly string[];
}

export interface ExuiReleaseAssuranceVerdict {
  overallStatus: ExuiReleaseAssuranceStatus;
  releaseBlockingCoverage: readonly string[];
  failReasons: readonly string[];
  warnReasons: readonly string[];
  knownGaps: readonly string[];
  evidenceSummary: string;
  mutationEvidence: ExuiReleaseAssuranceMutationEvidence;
  historicFailureCoverage: Record<HistoricFailureCoverageStatus, readonly string[]>;
}

export interface BuildReleaseAssuranceVerdictOptions {
  configuredFamilies?: readonly string[];
  decisions?: readonly ExuiServiceFamilyCoverageDecision[];
  profiles?: readonly ExuiServiceDefinitionProfile[];
  failures?: readonly ExuiHistoricFailureCoverage[];
  mutationEvidenceStatus?: ExuiReleaseAssuranceMutationStatus;
  mutationCommands?: readonly string[];
}

export const EXUI_RELEASE_ASSURANCE_MUTATION_COMMANDS =
  releaseAssuranceEvidence.mutationEvidence.requiredCommands;
export const EXUI_RELEASE_ASSURANCE_MUTATION_STATUS =
  releaseAssuranceEvidence.mutationEvidence.status as ExuiReleaseAssuranceMutationStatus;

export interface ExuiSuperserviceSourceRef {
  repository: AssuranceSourceRepository;
  path: string;
  kind: AssuranceSourceKind;
  reason: string;
}

export interface ExuiServiceDefinitionRepoEvidence {
  fullName: string;
  url: string;
  visibility: "public" | "private";
  updatedAt: string;
  defaultBranch: string;
  definitionRoot: string;
  jsonFiles: number;
  caseEventToFields: number;
  caseEventToComplexTypes: number;
  authorisationCaseField: number;
  caseField: number;
  complexTypes: number;
  notes?: string;
  evidenceRefs?: readonly string[];
}

export interface ExuiServiceDefinitionProfile {
  serviceFamily: ExuiConfiguredServiceFamily;
  priority: AssuranceCoverageDisposition;
  proofLevel: ExuiDefinitionProfileLevel;
  lanes: readonly AssuranceScenarioLane[];
  representativeCaseTypes: readonly string[];
  serviceCodes: readonly string[];
  repos: readonly ExuiServiceDefinitionRepoEvidence[];
  rationale: string;
  nextAction: string;
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
  webappAuthRoutes: {
    repository: "rpx-xui-webapp",
    path: "api/auth/**",
    kind: "api",
    reason: "EXUI-owned authentication entrypoints that create state and pass login hints before IDAM hand-off"
  },
  nodeLibAuthStrategy: {
    repository: "rpx-xui-node-lib",
    path: "auth/**",
    kind: "node-lib",
    reason: "Shared authentication strategy that validates callback state, roles, session, and access-denied outcomes"
  },
  playwrightConfigUtilities: {
    repository: "rpx-xui-webapp",
    path: "playwright_tests_new/**",
    kind: "playwright",
    reason: "Existing EXUI Playwright bootstrap and configuration coverage patterns"
  },
  webappLayoutStyles: {
    repository: "rpx-xui-webapp",
    path: "src/style/**, src/styles.scss, src/app/**/**/*.scss",
    kind: "style",
    reason: "EXUI-owned GOV.UK/HMCTS styling and layout surfaces that can change shared page rendering"
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
  sptribsCaseApi: {
    repository: "hmcts/sptribs-case-api",
    path: "src/main/java/uk/gov/hmcts/sptribs/common/ccd/CcdServiceCode.java",
    kind: "ccd-definition",
    reason: "Special Tribunals CCD service-code and CriminalInjuriesCompensation case-type contract"
  },
  probateBackOffice: {
    repository: "hmcts/probate-back-office",
    path: "src/main/java/uk/gov/hmcts/probate/model/ccd/CcdCaseType.java",
    kind: "ccd-definition",
    reason: "Probate CCD GrantOfRepresentation case-type and ABA6 service-code contract"
  },
  localHarnessDocs: {
    repository: "rpx-xui-e2e-tests",
    path: "docs/srt-poc/**",
    kind: "docs",
    reason: "Local assurance harness POC assumptions, execution matrix, and skipped-seam record"
  }
} as const satisfies Record<string, ExuiSuperserviceSourceRef>;

export const EXUI_SERVICE_DEFINITION_PROFILES = [
  {
    serviceFamily: "CIVIL",
    priority: "release-blocking",
    proofLevel: "ccd-backed",
    lanes: ["global-search", "work-allocation", "staff-ref-data", "hearings"],
    representativeCaseTypes: ["CIVIL", "GENERALAPPLICATION"],
    serviceCodes: ["AAA6", "AAA7"],
    repos: [
      {
        fullName: "hmcts/civil-ccd-definition",
        url: "https://github.com/hmcts/civil-ccd-definition",
        visibility: "public",
        updatedAt: "2026-05-12T13:40:51Z",
        defaultBranch: "master",
        definitionRoot: "ccd-definition",
        jsonFiles: 1533,
        caseEventToFields: 170,
        caseEventToComplexTypes: 150,
        authorisationCaseField: 110,
        caseField: 179,
        complexTypes: 594
      },
      {
        fullName: "hmcts/civil-general-apps-ccd-definition",
        url: "https://github.com/hmcts/civil-general-apps-ccd-definition",
        visibility: "public",
        updatedAt: "2026-03-16T17:35:07Z",
        defaultBranch: "master",
        definitionRoot: "ga-ccd-definition",
        jsonFiles: 280,
        caseEventToFields: 43,
        caseEventToComplexTypes: 25,
        authorisationCaseField: 11,
        caseField: 18,
        complexTypes: 100
      }
    ],
    rationale:
      "Civil is in every central EXUI family set and has the largest discovered CCD definition surface, so it is a release-blocking representative for broad case-event and complex-type permutations.",
    nextAction: "Add Civil normalized slices for event data integrity and Work Allocation filters after owner review of representative case events."
  },
  {
    serviceFamily: "PRIVATELAW",
    priority: "release-blocking",
    proofLevel: "ccd-backed",
    lanes: ["global-search", "work-allocation", "staff-ref-data", "hearings", "manage-case"],
    representativeCaseTypes: ["PRLAPPS"],
    serviceCodes: ["ABA5"],
    repos: [
      {
        fullName: "hmcts/prl-ccd-definitions",
        url: "https://github.com/hmcts/prl-ccd-definitions",
        visibility: "public",
        updatedAt: "2026-05-11T08:32:41Z",
        defaultBranch: "master",
        definitionRoot: "definitions/private-law/json",
        jsonFiles: 1492,
        caseEventToFields: 377,
        caseEventToComplexTypes: 232,
        authorisationCaseField: 185,
        caseField: 359,
        complexTypes: 419
      }
    ],
    rationale:
      "Private Law is already the executable normalized slice in the POC and covers EXUI config, WA, hearings, role, service-code, and nested CYA/complex-field seams.",
    nextAction:
      "Keep PRL as the first executable service-slice source and promote additional event-page permutations only when they introduce a distinct EXUI interpretation shape."
  },
  {
    serviceFamily: "IA",
    priority: "release-blocking",
    proofLevel: "ccd-backed",
    lanes: ["global-search", "work-allocation", "staff-ref-data", "hearings"],
    representativeCaseTypes: ["Asylum", "Bail"],
    serviceCodes: ["BFA1"],
    repos: [
      {
        fullName: "hmcts/ia-ccd-definitions",
        url: "https://github.com/hmcts/ia-ccd-definitions",
        visibility: "public",
        updatedAt: "2026-05-12T08:58:16Z",
        defaultBranch: "master",
        definitionRoot: "definitions",
        jsonFiles: 69,
        caseEventToFields: 2,
        caseEventToComplexTypes: 2,
        authorisationCaseField: 2,
        caseField: 4,
        complexTypes: 4
      }
    ],
    rationale: "IA is in every central EXUI family set and is hearings-enabled with two configured case types.",
    nextAction: "Add IA hearing case-type permutation slices for Asylum and Bail once the owning team confirms the representative event paths."
  },
  {
    serviceFamily: "PUBLICLAW",
    priority: "release-blocking",
    proofLevel: "ccd-backed",
    lanes: ["global-search", "work-allocation", "staff-ref-data"],
    representativeCaseTypes: ["CARE_SUPERVISION_EPO"],
    serviceCodes: ["ABA3"],
    repos: [
      {
        fullName: "hmcts/fpla-ccd-definitions",
        url: "https://github.com/hmcts/fpla-ccd-definitions",
        visibility: "public",
        updatedAt: "2023-01-28T15:28:47Z",
        defaultBranch: "master",
        definitionRoot: "ccd-definition",
        jsonFiles: 15,
        caseEventToFields: 0,
        caseEventToComplexTypes: 0,
        authorisationCaseField: 1,
        caseField: 2,
        complexTypes: 0,
        notes:
          "Public FPLA source is much smaller than PRL/Civil and should be checked with the owning team before selecting a representative event slice."
      }
    ],
    rationale:
      "Public Law is in the central global search, WA, and staff-supported sets; the public CCD source has been identified but needs owner confirmation before executable slice generation.",
    nextAction: "Confirm whether fpla-ccd-definitions is still the authoritative Public Law source and identify a representative event-definition slice."
  },
  {
    serviceFamily: "EMPLOYMENT",
    priority: "release-blocking",
    proofLevel: "ccd-backed",
    lanes: ["global-search", "work-allocation", "staff-ref-data"],
    representativeCaseTypes: ["ET_EnglandWales", "ET_Scotland"],
    serviceCodes: ["BHA1"],
    repos: [
      {
        fullName: "hmcts/et-ccd-definitions-englandwales",
        url: "https://github.com/hmcts/et-ccd-definitions-englandwales",
        visibility: "public",
        updatedAt: "2026-03-11T11:06:28Z",
        defaultBranch: "master",
        definitionRoot: "definitions",
        jsonFiles: 177,
        caseEventToFields: 15,
        caseEventToComplexTypes: 0,
        authorisationCaseField: 18,
        caseField: 33,
        complexTypes: 23
      },
      {
        fullName: "hmcts/et-ccd-definitions-scotland",
        url: "https://github.com/hmcts/et-ccd-definitions-scotland",
        visibility: "public",
        updatedAt: "2026-03-11T11:06:43Z",
        defaultBranch: "master",
        definitionRoot: "definitions",
        jsonFiles: 178,
        caseEventToFields: 15,
        caseEventToComplexTypes: 0,
        authorisationCaseField: 18,
        caseField: 33,
        complexTypes: 23
      }
    ],
    rationale:
      "Employment is in the central global search, WA, and staff-supported sets and has separate England/Wales and Scotland CCD definition surfaces.",
    nextAction: "Model one England/Wales and one Scotland representative slice if owner review shows EXUI-visible behaviour differs."
  },
  {
    serviceFamily: "SSCS",
    priority: "grouped",
    proofLevel: "ccd-backed",
    lanes: ["staff-ref-data", "hearings"],
    representativeCaseTypes: ["Benefit"],
    serviceCodes: ["BBA3"],
    repos: [
      {
        fullName: "hmcts/sscs-ccd-definitions",
        url: "https://github.com/hmcts/sscs-ccd-definitions",
        visibility: "public",
        updatedAt: "2024-10-08T20:44:23Z",
        defaultBranch: "master",
        definitionRoot: "src",
        jsonFiles: 144,
        caseEventToFields: 6,
        caseEventToComplexTypes: 1,
        authorisationCaseField: 4,
        caseField: 9,
        complexTypes: 6
      }
    ],
    rationale:
      "SSCS is staff-supported and hearings-enabled, so it is grouped with the hearings config proof until a distinct EXUI-owned risk is selected.",
    nextAction: "Add one SSCS hearings slice if the next scope includes HMC/list-assist validation beyond config."
  },
  {
    serviceFamily: "DIVORCE",
    priority: "grouped",
    proofLevel: "ccd-backed",
    lanes: ["staff-ref-data", "hearings"],
    representativeCaseTypes: ["DIVORCE", "NFD"],
    serviceCodes: ["ABA1"],
    repos: [
      {
        fullName: "hmcts/div-ccd-definitions",
        url: "https://github.com/hmcts/div-ccd-definitions",
        visibility: "public",
        updatedAt: "2026-03-23T15:32:04Z",
        defaultBranch: "master",
        definitionRoot: "definitions",
        jsonFiles: 52,
        caseEventToFields: 4,
        caseEventToComplexTypes: 2,
        authorisationCaseField: 4,
        caseField: 7,
        complexTypes: 4
      },
      {
        fullName: "hmcts/nfdiv-ccd-definitions",
        url: "https://github.com/hmcts/nfdiv-ccd-definitions",
        visibility: "public",
        updatedAt: "2023-01-28T10:13:47Z",
        defaultBranch: "master",
        definitionRoot: "definitions",
        jsonFiles: 128,
        caseEventToFields: 15,
        caseEventToComplexTypes: 5,
        authorisationCaseField: 13,
        caseField: 25,
        complexTypes: 10
      }
    ],
    rationale: "Divorce is staff-supported and is the explicit unsupported-hearings/hidden-surface family in the current UI proof.",
    nextAction: "Keep Divorce as the negative hearings family and add event-definition slices only if divorce-specific EXUI behaviour is selected."
  },
  {
    serviceFamily: "FR",
    priority: "grouped",
    proofLevel: "ccd-backed",
    lanes: ["staff-ref-data"],
    representativeCaseTypes: ["FinancialRemedyMVP2"],
    serviceCodes: ["ABA2"],
    repos: [
      {
        fullName: "hmcts/finrem-ccd-definitions",
        url: "https://github.com/hmcts/finrem-ccd-definitions",
        visibility: "public",
        updatedAt: "2026-05-12T07:08:56Z",
        defaultBranch: "master",
        definitionRoot: "definitions",
        jsonFiles: 136,
        caseEventToFields: 8,
        caseEventToComplexTypes: 6,
        authorisationCaseField: 7,
        caseField: 14,
        complexTypes: 12
      }
    ],
    rationale:
      "Financial Remedy is staff-supported and has an identified CCD source, but no separate EXUI-visible central lane has been promoted yet.",
    nextAction: "Group through staff-supported assertions until a Financial Remedy-specific EXUI permutation is identified."
  },
  {
    serviceFamily: "PROBATE",
    priority: "grouped",
    proofLevel: "ccd-backed",
    lanes: ["staff-ref-data"],
    representativeCaseTypes: ["GrantOfRepresentation"],
    serviceCodes: ["ABA6"],
    repos: [
      {
        fullName: "hmcts/probate-back-office",
        url: "https://github.com/hmcts/probate-back-office",
        visibility: "public",
        updatedAt: "2026-06-25T15:46:40Z",
        defaultBranch: "master",
        definitionRoot: "src/main/resources/dmn",
        jsonFiles: 0,
        caseEventToFields: 0,
        caseEventToComplexTypes: 0,
        authorisationCaseField: 0,
        caseField: 0,
        complexTypes: 0,
        notes:
          "Probate source is service-backed rather than a classic JSON definition repo; WA DMNs and runtime references identify PROBATE/GrantOfRepresentation.",
        evidenceRefs: [
          "src/main/java/uk/gov/hmcts/probate/model/ccd/CcdCaseType.java",
          "src/cftlib/java/uk/gov/hmcts/probate/CftLibConfig.java",
          "src/main/resources/dmn/wa-task-types-probate-grantofrepresentation.dmn"
        ]
      }
    ],
    rationale:
      "Probate is staff-supported in EXUI config and current source evidence points to hmcts/probate-back-office for the GrantOfRepresentation case type.",
    nextAction:
      "Keep Probate grouped through staff-supported assertions until a Probate-specific EXUI-visible behaviour justifies a normalized slice."
  },
  {
    serviceFamily: "ST_CIC",
    priority: "release-blocking",
    proofLevel: "ccd-backed",
    lanes: ["global-search", "work-allocation", "staff-ref-data"],
    representativeCaseTypes: ["CriminalInjuriesCompensation"],
    serviceCodes: ["BBA2"],
    repos: [
      {
        fullName: "hmcts/sptribs-case-api",
        url: "https://github.com/hmcts/sptribs-case-api",
        visibility: "public",
        updatedAt: "2026-06-29T13:32:45Z",
        defaultBranch: "master",
        definitionRoot: "src/main/java/uk/gov/hmcts/sptribs",
        jsonFiles: 0,
        caseEventToFields: 0,
        caseEventToComplexTypes: 0,
        authorisationCaseField: 0,
        caseField: 0,
        complexTypes: 0,
        notes:
          "Special Tribunals source is CCD SDK/decentralised service-backed; CcdServiceCode maps ST_CIC to BBA2 and CriminalInjuriesCompensation.",
        evidenceRefs: [
          "src/main/java/uk/gov/hmcts/sptribs/common/ccd/CcdServiceCode.java",
          "src/main/java/uk/gov/hmcts/sptribs/common/ccd/CcdJurisdiction.java",
          "src/main/resources/application.yaml",
          "src/main/resources/dmn/wa-task-types-st_cic-criminalinjuriescompensation.dmn"
        ]
      }
    ],
    rationale:
      "ST_CIC is release-blocking in EXUI config and hmcts/sptribs-case-api declares the ST_CIC/BBA2 CriminalInjuriesCompensation CCD service contract.",
    nextAction:
      "Add a normalized ST_CIC slice only if the next assurance phase needs Special Tribunals-specific case-event or WA behaviour beyond the central family contracts."
  },
  {
    serviceFamily: "CMC",
    priority: "canary",
    proofLevel: "ccd-backed",
    lanes: ["canary"],
    representativeCaseTypes: ["MoneyClaimCase"],
    serviceCodes: [],
    repos: [
      {
        fullName: "hmcts/cmc-ccd-domain",
        url: "https://github.com/hmcts/cmc-ccd-domain",
        visibility: "public",
        updatedAt: "2026-02-26T18:01:05Z",
        defaultBranch: "master",
        definitionRoot: "src",
        jsonFiles: 25,
        caseEventToFields: 1,
        caseEventToComplexTypes: 1,
        authorisationCaseField: 1,
        caseField: 2,
        complexTypes: 2
      }
    ],
    rationale:
      "CMC has an identified CCD source but remains an explicit canary because it is outside the central release-blocking global search, WA, and staff-supported family sets.",
    nextAction: "Keep CMC canary-only unless the owner promotes it into a release-blocking central lane."
  },
  {
    serviceFamily: "HRS",
    priority: "grouped",
    proofLevel: "config-backed",
    lanes: ["staff-ref-data"],
    representativeCaseTypes: [],
    serviceCodes: ["HRS"],
    repos: [],
    rationale:
      "HRS is now staff-supported in EXUI config and is covered by the staff-supported config/API contract, but remains outside global search, WA, and hearings must-run lanes.",
    nextAction:
      "Keep HRS in staff-ref-data coverage; promote only if EXUI owners add it to global search, WA, hearings, or another release-blocking lane."
  }
] as const satisfies readonly ExuiServiceDefinitionProfile[];

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
  agenticExpectedBoundary?: string;
  humanFixEvidence?: readonly string[];
  humanFixConfidence?: HistoricFailureHumanFixConfidence;
  comparisonLearning?: string;
  executableProofGap?: string;
}

export interface ExuiDefectIntakeRule {
  id: string;
  route: ExuiDefectIntakeRoute;
  signalTerms: readonly string[];
  target: string;
  requiredEvidence: readonly string[];
  rationale: string;
}

export interface ExuiServiceFamilyCoverageDecision {
  serviceFamily: string;
  disposition: AssuranceCoverageDisposition;
  lanes: readonly AssuranceScenarioLane[];
  representativeScenarioIds: readonly string[];
  rationale: string;
}

export interface ExuiOwnerSliceCatalogueEntry {
  serviceFamily: string;
  label: string;
  disposition: AssuranceCoverageDisposition;
  lanes: readonly AssuranceScenarioLane[];
  representativeScenarioIds: readonly string[];
  proofLevel: ExuiDefinitionProfileLevel | "unprofiled";
  representativeCaseTypes: readonly string[];
  serviceCodes: readonly string[];
  sourceRepositories: readonly string[];
  ownerAction: string;
  rationale: string;
}

export interface ExuiDefectIntakeDecision {
  route: ExuiDefectIntakeRoute;
  ruleId: string;
  target: string;
  requiredEvidence: readonly string[];
  rationale: string;
}

export interface ExuiHarnessProofLane {
  lane: "api" | "ui" | "integration" | "accessibility";
  project: string;
  requiredFor: "local" | "local-and-ci";
  ciPolicy?: string;
  proof: string;
  testFiles?: readonly string[];
  testTitles?: readonly string[];
}

export interface ExuiReleaseEvidenceSummary {
  verdict: ExuiReleaseAssuranceVerdict;
  ownerSliceCatalogue: readonly ExuiOwnerSliceCatalogueEntry[];
  defectIntakeRoutes: readonly ExuiDefectIntakeDecision[];
  harnessProofLanes: readonly ExuiHarnessProofLane[];
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
      "hearings-supported-family-config-contract",
      "ia-hearings-asylum-bail-routing-contract"
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
      "hearings-supported-family-config-contract",
      "civil-hearings-civil-case-type-contract"
    ],
    rationale: "Central global search/WA/staff family and a hearings-enabled jurisdiction."
  },
  {
    serviceFamily: "PRIVATELAW",
    disposition: "release-blocking",
    lanes: [...commonCentralLanes, "hearings", "manage-case"],
    representativeScenarioIds: [
      "global-search-supported-service-families",
      "wa-supported-service-families",
      "staff-supported-service-families",
      "hearings-privatelaw-prlapps-manager",
      "prl-service-of-documents-nested-complex-cya"
    ],
    rationale:
      "Representative PRL family covers service-code, role, hearing-manager, and nested CYA/complex-field permutations sourced from PRL CCD definitions."
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
      "staff-supported-service-families",
      "employment-service-code-ref-data-contract"
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
      "staff-supported-service-families",
      "st-cic-wa-family-config-contract"
    ],
    rationale:
      "Central global search/WA/staff family with a Special Tribunals WA/service-code contract sourced from sptribs-case-api."
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
    representativeScenarioIds: [
      "staff-supported-service-families",
      "probate-staff-ref-data-contract"
    ],
    rationale:
      "Staff-supported only in this first slice; grouped with a Probate-specific staff/ref-data contract until a distinct EXUI-facing behaviour is identified."
  },
  {
    serviceFamily: "CMC",
    disposition: "canary",
    lanes: ["canary"],
    representativeScenarioIds: ["canary-cmc"],
    rationale: "Present in configured jurisdictions but intentionally outside the central release-blocking family sets."
  },
  {
    serviceFamily: "HRS",
    disposition: "grouped",
    lanes: ["staff-ref-data"],
    representativeScenarioIds: ["staff-supported-service-families"],
    rationale: "Staff-supported config-backed family; grouped until a distinct EXUI-facing behaviour is identified."
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
    id: "employment-service-code-ref-data-contract",
    lane: "staff-ref-data",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "EMPLOYMENT",
    caseType: "ET_EnglandWales,ET_Scotland",
    roleCluster: "caseworker-employment",
    assertion:
      "Employment remains in global search, Work Allocation, and staff-supported ref-data with BHA1 service-code mapping",
    source: "rpx-xui-webapp supported service-family config and Employment CCD definition metadata",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.apiConfiguration,
      EXUI_SOURCE_OF_TRUTH_REFS.serviceCcdDefinitions,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "st-cic-wa-family-config-contract",
    lane: "work-allocation",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "ST_CIC",
    caseType: "CriminalInjuriesCompensation",
    roleCluster: "caseworker-st_cic",
    assertion:
      "ST_CIC remains in global search, Work Allocation, and staff-supported config with BBA2 service-code mapping",
    source: "rpx-xui-webapp supported service-family config and sptribs-case-api CCD service metadata",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.apiConfiguration,
      EXUI_SOURCE_OF_TRUTH_REFS.sptribsCaseApi,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "probate-staff-ref-data-contract",
    lane: "staff-ref-data",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "PROBATE",
    caseType: "GrantOfRepresentation",
    roleCluster: "caseworker-probate",
    assertion:
      "PROBATE remains staff-supported but outside global search and Work Allocation release-blocking sets, with ABA6 service-code mapping",
    source: "rpx-xui-webapp staff-supported config and probate-back-office CCD service metadata",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.apiConfiguration,
      EXUI_SOURCE_OF_TRUTH_REFS.probateBackOffice,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "auth-login-hint-entrypoint-state-contract",
    lane: "auth",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "EXUI",
    roleCluster: "sso-user",
    assertion: "EXUI /auth/login accepts a login_hint and owns state creation before IDAM hand-off",
    source: "rpx-xui-webapp auth route and rpx-xui-node-lib strategy state validation",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.webappAuthRoutes,
      EXUI_SOURCE_OF_TRUTH_REFS.nodeLibAuthStrategy,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "auth-role-mismatch-access-denied-contract",
    lane: "auth",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "EXUI",
    roleCluster: "authenticated-without-caseworker",
    assertion:
      "a user authenticated by IDAM but missing the service role matcher is shown service-owned access denied, not sent into a login loop",
    source: "rpx-xui-webapp loginRoleMatcher configuration and rpx-xui-node-lib post-auth role verification",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.webappAuthRoutes,
      EXUI_SOURCE_OF_TRUTH_REFS.nodeLibAuthStrategy,
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
    id: "civil-hearings-civil-case-type-contract",
    lane: "hearings",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "CIVIL",
    caseType: "CIVIL",
    roleCluster: "hearing-manager",
    assertion:
      "Civil hearings config keeps the CIVIL case type enabled and tied to AAA6/AAA7 service-code mapping",
    source: "rpx-xui-webapp services.hearings.civil.caseTypes and serviceRefDataMapping",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.apiConfiguration,
      EXUI_SOURCE_OF_TRUTH_REFS.serviceCcdDefinitions,
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
    id: "prl-service-of-documents-nested-complex-cya",
    lane: "manage-case",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "PRIVATELAW",
    caseType: "PRLAPPS",
    roleCluster: "caseworker-privatelaw-courtadmin",
    assertion:
      "CYA projection retains nested complex child values when CaseEventToComplexTypes child rows have FieldShowCondition",
    source: "prl-ccd-definitions Service of Documents additional recipients definition",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.playwrightConfigUtilities,
      EXUI_SOURCE_OF_TRUTH_REFS.serviceCcdDefinitions,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
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
    id: "ia-hearings-asylum-bail-routing-contract",
    lane: "hearings",
    priority: "must-run",
    executionMode: "api",
    serviceFamily: "IA",
    caseType: "Asylum,Bail",
    roleCluster: "caseworker, admin, home-office, judge",
    assertion: "IA hearings routing keeps Asylum and Bail case types enabled with BFA1 service-code mapping",
    source: "rpx-xui-webapp services.hearings.ia.caseTypes and serviceRefDataMapping",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.apiConfiguration,
      EXUI_SOURCE_OF_TRUTH_REFS.serviceCcdDefinitions,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "overview-page-layout-baseline-contract",
    lane: "manage-case",
    priority: "grouped",
    executionMode: "planned",
    serviceFamily: "IA",
    roleCluster: "caseworker, admin, home-office, judge",
    assertion:
      "overview page keeps agreed headings, landmark structure, responsive layout, and accessibility baseline across representative role states",
    source: "EXUI overview route, GOV.UK/HMCTS styling, and representative service role personas",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.webappLayoutStyles,
      EXUI_SOURCE_OF_TRUTH_REFS.playwrightConfigUtilities,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  },
  {
    id: "canary-cmc",
    lane: "canary",
    priority: "canary",
    executionMode: "api",
    serviceFamily: "CMC",
    assertion: "weak-evidence family stays outside the central release-blocking family sets",
    source: "rpx-xui-webapp jurisdictions",
    sourceRefs: [
      EXUI_SOURCE_OF_TRUTH_REFS.defaultConfig,
      EXUI_SOURCE_OF_TRUTH_REFS.backendCcdMocks,
      EXUI_SOURCE_OF_TRUTH_REFS.localHarnessDocs
    ]
  }
] as const;

export const EXUI_DEFECT_INTAKE_RULES = defectIntakeRules as readonly ExuiDefectIntakeRule[];

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
    id: "nested-complex-fieldshowcondition-cya",
    historicRefs: ["EXUI-4493", "EXUI-4552", "EXUI-3481", "FPVTL-2543"],
    replayPack: "manage-case-data-integrity",
    failureClass:
      "Nested complex child values do not render on CYA when CaseEventToComplexTypes child rows have FieldShowCondition",
    harnessContract:
      "PRL Service of Documents additional-recipient replay models sodAdditionalRecipientsList, nested emailInformation, and child FieldShowCondition rows, then asserts CYA includes parent and child values.",
    coverageStatus: "covered-now",
    currentPocEvidence:
      "Executable replay pack asserts Service of Documents nested complex child CYA rows survive show-condition filtering.",
    wouldHaveCaught: true,
    nextScenarioId: "prl-service-of-documents-nested-complex-cya"
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
    id: "sso-login-hint-entrypoint-state",
    historicRefs: ["EXUI-4744", "EXUI-4184", "EXUI-3039"],
    replayPack: "auth-journey-guardrails",
    failureClass:
      "SSO users entering through a JCM tile can bypass EXUI state creation and hit the Login bookmark used screen",
    harnessContract:
      "Auth replay compares the direct IDAM-authorize/no-state shape with the EXUI-owned /auth/login?login_hint journey and asserts the managed entrypoint redirects to SSO without bookmark failure.",
    coverageStatus: "covered-now",
    currentPocEvidence:
      "Executable replay pack asserts the EXUI auth entrypoint owns state creation and preserves the SSO login_hint hand-off.",
    wouldHaveCaught: true,
    nextScenarioId: "auth-login-hint-entrypoint-state-contract"
  },
  {
    id: "post-auth-role-mismatch-access-denied",
    historicRefs: ["EXUI-4697", "INC-0156379", "INC-0161878"],
    replayPack: "auth-journey-guardrails",
    failureClass:
      "Users authenticated by IDAM but missing the Manage Case role matcher are sent through logout/root and back into login",
    harnessContract:
      "Auth replay checks a valid authenticated user reaches the shell while an authenticated user without the required role reaches service-owned access denied instead of logout/root/login loop.",
    coverageStatus: "covered-now",
    currentPocEvidence:
      "Executable replay pack asserts post-auth role mismatch resolves to access denied and valid role match resolves to the app shell.",
    wouldHaveCaught: true,
    nextScenarioId: "auth-role-mismatch-access-denied-contract"
  },
  {
    id: "overview-page-layout-regression-classification",
    historicRefs: ["EXUI-4756"],
    replayPack: "service-overview-layout",
    failureClass: "Service overview page layout changed unexpectedly for multiple roles in a specific environment",
    harnessContract:
      "Agentic triage must compare the reported visual drift with the actual human remediation evidence, then promote it into an overview-page DOM/visual/a11y baseline once the owning team agrees the stable contract.",
    coverageStatus: "learning-case",
    currentPocEvidence:
      "Ticket is deliberately retained as a learning case: the harness model captures the likely EXUI layout/style boundary, the missing direct fix link, and the proposed executable overview-layout baseline.",
    wouldHaveCaught: false,
    missReason:
      "No direct EXUI-4756 PR or commit has been found in the rendered Jira/GitHub evidence, so the current branch must not claim executable coverage yet.",
    nextScenarioId: "overview-page-layout-baseline-contract",
    agenticExpectedBoundary:
      "Likely shared EXUI layout/styling or dependency-driven rendering drift, because the same overview page format changed across several role states rather than one service data field.",
    humanFixEvidence: [
      "Jira evidence says the overview page issue was fixed and the ticket was no longer required.",
      "No direct EXUI-4756-linked PR or commit was found in rpx-xui-webapp or ccd-case-ui-toolkit search results.",
      "Nearby human remediation evidence includes rpx-xui-webapp GOV.UK/HMCTS style migration work and manage-case accessibility coverage, but that is indirect until a developer supplies the exact fix link."
    ],
    humanFixConfidence: "indirect",
    comparisonLearning:
      "Done status is irrelevant to coverage value: the ticket is useful because it lets the team compare agentic classification against real remediation evidence and decide whether shared overview layout drift deserves a central gate.",
    executableProofGap:
      "Need an agreed overview route fixture, representative role personas, and stable DOM/visual/a11y assertions before this can move from learning-case to covered-now."
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
    "learning-case": failures.filter((failure) => failure.coverageStatus === "learning-case").map((failure) => failure.id),
    partial: failures.filter((failure) => failure.coverageStatus === "partial").map((failure) => failure.id),
    "out-of-scope": failures.filter((failure) => failure.coverageStatus === "out-of-scope").map((failure) => failure.id)
  };
}

export function classifyExuiDefectIntake(
  title: string,
  description = "",
  rules: readonly ExuiDefectIntakeRule[] = EXUI_DEFECT_INTAKE_RULES
): ExuiDefectIntakeRule {
  const normalizedText = `${title} ${description}`.toLowerCase();
  return (
    rules.find((rule) => rule.signalTerms.some((term) => normalizedText.includes(term))) ??
    EXUI_DEFECT_INTAKE_RULES.find((rule) => rule.route === "owner-confirmed-follow-up")!
  );
}

export function buildDefectIntakeDecision(title: string, description = ""): ExuiDefectIntakeDecision {
  const rule = classifyExuiDefectIntake(title, description);
  return {
    route: rule.route,
    ruleId: rule.id,
    target: rule.target,
    requiredEvidence: rule.requiredEvidence,
    rationale: rule.rationale
  };
}

export function buildServiceDefinitionProfileSummary(
  profiles: readonly ExuiServiceDefinitionProfile[] = EXUI_SERVICE_DEFINITION_PROFILES
): Record<ExuiDefinitionProfileLevel, readonly string[]> {
  return {
    "ccd-backed": sortServiceFamilies(
      profiles.filter((profile) => profile.proofLevel === "ccd-backed").map((profile) => profile.serviceFamily)
    ),
    "config-backed": sortServiceFamilies(
      profiles.filter((profile) => profile.proofLevel === "config-backed").map((profile) => profile.serviceFamily)
    ),
    "source-unidentified": sortServiceFamilies(
      profiles.filter((profile) => profile.proofLevel === "source-unidentified").map((profile) => profile.serviceFamily)
    ),
    "source-unavailable": sortServiceFamilies(
      profiles.filter((profile) => profile.proofLevel === "source-unavailable").map((profile) => profile.serviceFamily)
    )
  };
}

export function findUnprofiledServiceFamilies(
  families: readonly string[] = EXUI_ALL_CONFIGURED_SERVICE_FAMILIES,
  profiles: readonly ExuiServiceDefinitionProfile[] = EXUI_SERVICE_DEFINITION_PROFILES
): readonly string[] {
  const profiledFamilies = new Set(profiles.map((profile) => normalizeServiceFamily(profile.serviceFamily)));
  return sortServiceFamilies(families).filter((family) => !profiledFamilies.has(family));
}

export function findReleaseBlockingFamiliesWithoutCcdBackedProfile(
  decisions: readonly ExuiServiceFamilyCoverageDecision[] = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS,
  profiles: readonly ExuiServiceDefinitionProfile[] = EXUI_SERVICE_DEFINITION_PROFILES
): readonly string[] {
  const ccdBackedFamilies = new Set(
    profiles
      .filter((profile) => profile.proofLevel === "ccd-backed")
      .map((profile) => normalizeServiceFamily(profile.serviceFamily))
  );
  return sortServiceFamilies(
    decisions
      .filter((decision) => decision.disposition === "release-blocking")
      .map((decision) => decision.serviceFamily)
      .filter((family) => !ccdBackedFamilies.has(normalizeServiceFamily(family)))
  );
}

export function buildDefinitionRepoCoverageTotals(
  profiles: readonly ExuiServiceDefinitionProfile[] = EXUI_SERVICE_DEFINITION_PROFILES
): {
  jsonFiles: number;
  caseEventToFields: number;
  caseEventToComplexTypes: number;
  authorisationCaseField: number;
  caseField: number;
  complexTypes: number;
} {
  return profiles.flatMap((profile) => profile.repos).reduce(
    (totals, repo) => ({
      jsonFiles: totals.jsonFiles + repo.jsonFiles,
      caseEventToFields: totals.caseEventToFields + repo.caseEventToFields,
      caseEventToComplexTypes: totals.caseEventToComplexTypes + repo.caseEventToComplexTypes,
      authorisationCaseField: totals.authorisationCaseField + repo.authorisationCaseField,
      caseField: totals.caseField + repo.caseField,
      complexTypes: totals.complexTypes + repo.complexTypes
    }),
    {
      jsonFiles: 0,
      caseEventToFields: 0,
      caseEventToComplexTypes: 0,
      authorisationCaseField: 0,
      caseField: 0,
      complexTypes: 0
    }
  );
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

export function buildOwnerSliceCatalogue(
  decisions: readonly ExuiServiceFamilyCoverageDecision[] = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS,
  profiles: readonly ExuiServiceDefinitionProfile[] = EXUI_SERVICE_DEFINITION_PROFILES
): readonly ExuiOwnerSliceCatalogueEntry[] {
  return [...decisions]
    .map((decision) => {
      const serviceFamily = normalizeServiceFamily(decision.serviceFamily);
      const profile = profiles.find((candidate) => normalizeServiceFamily(candidate.serviceFamily) === serviceFamily);
      const proofLevel: ExuiDefinitionProfileLevel | "unprofiled" = profile?.proofLevel ?? "unprofiled";
      return {
        serviceFamily,
        label: EXUI_SERVICE_LABELS[serviceFamily] ?? serviceFamily,
        disposition: decision.disposition,
        lanes: decision.lanes,
        representativeScenarioIds: decision.representativeScenarioIds,
        proofLevel,
        representativeCaseTypes: profile?.representativeCaseTypes ?? [],
        serviceCodes: profile?.serviceCodes ?? [],
        sourceRepositories: profile?.repos.map((repo) => repo.fullName) ?? [],
        ownerAction: profile?.nextAction ?? "Supply a service definition profile before promotion into the release gate.",
        rationale: decision.rationale
      };
    })
    .sort((left, right) => left.serviceFamily.localeCompare(right.serviceFamily));
}

export function buildReleaseEvidenceSummary(): ExuiReleaseEvidenceSummary {
  return {
    verdict: buildReleaseAssuranceVerdict(),
    ownerSliceCatalogue: buildOwnerSliceCatalogue(),
    defectIntakeRoutes: EXUI_DEFECT_INTAKE_RULES.map((rule) => ({
      route: rule.route,
      ruleId: rule.id,
      target: rule.target,
      requiredEvidence: rule.requiredEvidence,
      rationale: rule.rationale
    })),
    harnessProofLanes: releaseAssuranceEvidence.harnessProofLanes as readonly ExuiHarnessProofLane[]
  };
}

export function buildReleaseAssuranceVerdict(
  options: BuildReleaseAssuranceVerdictOptions = {}
): ExuiReleaseAssuranceVerdict {
  const configuredFamilies = options.configuredFamilies ?? EXUI_ALL_CONFIGURED_SERVICE_FAMILIES;
  const decisions = options.decisions ?? EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS;
  const profiles = options.profiles ?? EXUI_SERVICE_DEFINITION_PROFILES;
  const failures = options.failures ?? EXUI_HISTORIC_FAILURE_COVERAGE;
  const mutationCommands = options.mutationCommands ?? EXUI_RELEASE_ASSURANCE_MUTATION_COMMANDS;
  const mutationEvidenceStatus = options.mutationEvidenceStatus ?? EXUI_RELEASE_ASSURANCE_MUTATION_STATUS;
  const coverageSummary = buildCoverageSummary(decisions);
  const historicFailureCoverage = buildHistoricFailureCoverageSummary(failures);
  const releaseBlockingSourceGaps = findReleaseBlockingFamiliesWithoutCcdBackedProfile(decisions, profiles);
  const unclassifiedFamilies = findUnclassifiedServiceFamilies(configuredFamilies, decisions);
  const unprofiledFamilies = findUnprofiledServiceFamilies(configuredFamilies, profiles);
  const warnReasons = [
    ...releaseBlockingSourceGaps.map((family) => `release-blocking family without CCD-backed profile: ${family}`),
    ...historicFailureCoverage["would-catch-with-replay-pack"].map((id) => `historic replay pack not executable yet: ${id}`),
    ...historicFailureCoverage["learning-case"].map((id) => `historic learning case not executable yet: ${id}`),
    ...historicFailureCoverage.partial.map((id) => `historic partial coverage: ${id}`),
    ...historicFailureCoverage["out-of-scope"].map((id) => `historic out-of-scope class: ${id}`),
    ...(mutationEvidenceStatus === "pending" ? [`mutation evidence pending: ${mutationCommands.join(", ")}`] : [])
  ];
  const failReasons = [
    ...unclassifiedFamilies.map((family) => `unclassified configured family: ${family}`),
    ...unprofiledFamilies.map((family) => `unprofiled configured family: ${family}`)
  ];
  const overallStatus = failReasons.length > 0 ? "fail" : warnReasons.length > 0 ? "warn" : "pass";

  return {
    overallStatus,
    releaseBlockingCoverage: coverageSummary["release-blocking"].filter(
      (family) => !releaseBlockingSourceGaps.includes(family)
    ),
    failReasons,
    warnReasons,
    knownGaps: [...failReasons, ...warnReasons],
    evidenceSummary: `${overallStatus}: ${coverageSummary["release-blocking"].length} release-blocking families, ${failReasons.length} fail reason(s), ${warnReasons.length} warning(s), mutation evidence ${mutationEvidenceStatus}`,
    mutationEvidence: {
      status: mutationEvidenceStatus,
      requiredCommands: mutationCommands
    },
    historicFailureCoverage
  };
}
