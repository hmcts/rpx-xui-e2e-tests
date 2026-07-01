import { readFileSync } from 'node:fs';

import type { APIRequestContext, TestInfo } from '@playwright/test';

import {
  buildDefinitionRepoCoverageTotals,
  buildCoverageSummary,
  buildDefectIntakeDecision,
  classifyExuiDefectIntake,
  buildGlobalSearchServicesCatalog,
  buildOwnerSliceCatalogue,
  buildReleaseAssuranceVerdict,
  buildReleaseEvidenceSummary,
  buildServiceDefinitionProfileSummary,
  buildSuperserviceKnowledgeIndex,
  EXUI_ALL_CONFIGURED_SERVICE_FAMILIES,
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_DEFECT_INTAKE_RULES,
  EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
  EXUI_HISTORIC_FAILURE_COVERAGE,
  EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY,
  EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES,
  EXUI_PRL_NORMALIZED_SLICES,
  EXUI_RELEASE_ASSURANCE_MUTATION_COMMANDS,
  EXUI_RELEASE_ASSURANCE_MUTATION_STATUS,
  EXUI_SERVICE_DEFINITION_PROFILES,
  EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS,
  EXUI_SERVICE_LABELS,
  EXUI_SERVICE_REF_DATA_MAPPING,
  EXUI_SOURCE_OF_TRUTH_REFS,
  EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
  EXUI_SUPERSERVICE_SCENARIOS,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  buildHistoricFailureCoverageSummary,
  findReleaseBlockingFamiliesWithoutCcdBackedProfile,
  findUnclassifiedServiceFamilies,
  findUnprofiledServiceFamilies,
  normalizeServiceFamily,
  sortServiceFamilies,
  sortedUniqueServiceFamilies,
} from '../../data/exui-central-assurance.js';
import { isUiHostUnavailableStatus, probeUiRouteAvailability } from '../../utils/ui/uiHostAvailability.js';
import {
  aggregatedCaseworkerJurisdictionsRoutePattern,
  buildSupportedJurisdictionDetails,
  healthCheckRoutePattern,
  setupTaskListBootstrapRoutes,
  waSupportedJurisdictionsDetailRoutePattern,
  waSupportedJurisdictionsGetRoutePattern,
  workAllocationCaseworkerByServiceNameRoutePattern,
  workAllocationFullLocationRoutePattern,
  workAllocationRegionLocationRoutePattern,
  workAllocationTypesOfWorkRoutePattern,
} from '../integration/helpers/taskListMockRoutes.helper.js';
import { buildHearingsEnvironmentConfigMock } from '../integration/mocks/hearings.mock.js';

import { test, expect } from './fixtures';

type GlobalSearchService = { serviceId: string; serviceName: string };
type SourceTruth = {
  rpxXuiWebapp: {
    'config/default.json': {
      globalSearchServices: string[];
      waSupportedJurisdictions: string[];
      staffSupportedJurisdictions: string[];
      jurisdictions: string[];
      hearings: {
        hearingsJurisdictions: string[];
        caseTypesByJurisdiction: Record<string, string[]>;
      };
      serviceRefDataMapping: Array<{ service: string; serviceCodes: string[] }>;
    };
  };
  prlCcdDefinitions: {
    normalizedSlices: unknown[];
  };
  serviceDefinitionProfiles: {
    source: string;
    profiles: unknown[];
  };
};
type ReleaseEvidence = {
  releaseGate?: {
    warnReasons?: string[];
    acceptedWarnings?: Array<{
      reason: string;
      classification: string;
      ownerAction: string;
      closureCriteria: string;
    }>;
  };
  harnessProofLanes?: Array<{
    lane: string;
    project: string;
    testFiles?: string[];
    testTitles?: string[];
  }>;
};
type RoutePattern = string | RegExp;
type FulfillOptions = { status?: number; contentType?: string; body?: string };
type RouteHandler = (route: { fulfill: (options: FulfillOptions) => Promise<void> }) => Promise<void>;

const CONFIGURATION_UI_KEYS = [
  'clientId',
  'headerConfig',
  'idamWeb',
  'oAuthCallback',
  'protocol',
  'ccdGatewayUrl',
  'accessManagementEnabled',
  'waWorkflowApi',
] as const;

const EXPLICIT_SKIP_CALLS = ['test', 'testInfo', 'describe'].map((owner) => `${owner}.${'sk' + 'ip'}(`);

const ASSURANCE_MUTATIONS = {
  'drop-prl-wa-family': {
    endpoint: 'api/wa-supported-jurisdiction/get',
    description:
      'Demo fault: simulate EXUI no longer exposing Private Law as a Work Allocation-supported service family.',
    removedFamily: 'PRIVATELAW',
  },
  'drop-st-cic-wa-family': {
    endpoint: 'api/wa-supported-jurisdiction/get',
    description:
      'Demo fault: simulate EXUI no longer exposing Special Tribunals as a Work Allocation-supported service family.',
    removedFamily: 'ST_CIC',
  },
  'drop-probate-staff-family': {
    endpoint: 'api/staff-supported-jurisdiction/get',
    description:
      'Demo fault: simulate EXUI no longer exposing Probate as a staff-supported service family.',
    removedFamily: 'PROBATE',
  },
  'drop-civil-hearings-case-type': {
    endpoint: 'services.hearings.civil.caseTypes',
    description: 'Demo fault: simulate EXUI no longer exposing Civil as a hearings-enabled case type.',
    removedFamily: 'CIVIL',
  },
  'drop-employment-service-code': {
    endpoint: 'service-ref-data.employment.serviceCodes',
    description: 'Demo fault: simulate EXUI no longer mapping Employment to the BHA1 service code.',
    removedFamily: 'BHA1',
  },
  'drop-ia-hearings-bail-case-type': {
    endpoint: 'services.hearings.ia.caseTypes',
    description: 'Demo fault: simulate EXUI no longer exposing Bail as an IA hearings-enabled case type.',
    removedFamily: 'BAIL',
  },
} as const;
type AssuranceMutation = keyof typeof ASSURANCE_MUTATIONS;

const ASSURANCE_MUTATION = process.env.EXUI_ASSURANCE_MUTATION?.trim();

function isAssuranceMutation(value: string): value is AssuranceMutation {
  return value in ASSURANCE_MUTATIONS;
}

function expectExactFamilySet(actual: readonly string[], expected: readonly string[]): void {
  expect(sortedUniqueServiceFamilies(actual)).toEqual(sortServiceFamilies(expected));
}

function expectCanaryFamiliesExcluded(actual: readonly string[]): void {
  const normalizedActual = sortedUniqueServiceFamilies(actual);
  for (const canaryFamily of EXUI_CANARY_SERVICE_FAMILIES) {
    expect(normalizedActual).not.toContain(normalizeServiceFamily(canaryFamily));
  }
}

function expectCentralMustRunFamiliesPresent(
  actual: readonly string[],
  expected: readonly string[],
  endpoint: string
): void {
  const actualFamilies = sortedUniqueServiceFamilies(actual);
  const expectedFamilies = sortServiceFamilies(expected);
  const missingFamilies = expectedFamilies.filter((family) => !actualFamilies.includes(family));

  expect(
    missingFamilies,
    `${endpoint} is missing central must-run service families: ${missingFamilies.join(', ') || 'none'}`
  ).toEqual([]);
  expectCanaryFamiliesExcluded(actualFamilies);
}

function mutateStringArrayForDemo(actual: readonly string[], endpoint: string): string[] {
  if (!ASSURANCE_MUTATION) {
    return [...actual];
  }

  if (!isAssuranceMutation(ASSURANCE_MUTATION)) {
    throw new Error(
      `Unsupported EXUI_ASSURANCE_MUTATION=${ASSURANCE_MUTATION}. Supported values: ${Object.keys(ASSURANCE_MUTATIONS).join(', ')}`
    );
  }

  const mutation = ASSURANCE_MUTATIONS[ASSURANCE_MUTATION];
  if (mutation.endpoint !== endpoint) {
    return [...actual];
  }

  return actual.filter((family) => normalizeServiceFamily(family) !== mutation.removedFamily);
}

function mutationLabel(): string | undefined {
  if (!ASSURANCE_MUTATION) {
    return undefined;
  }

  if (!isAssuranceMutation(ASSURANCE_MUTATION)) {
    return `unknown mutation ${ASSURANCE_MUTATION}`;
  }

  const mutation = ASSURANCE_MUTATIONS[ASSURANCE_MUTATION];
  return `${ASSURANCE_MUTATION}: ${mutation.description}`;
}

async function attachMutationEvidence(testInfo: TestInfo): Promise<void> {
  const mutation = mutationLabel();
  if (!mutation) {
    return;
  }

  testInfo.annotations.push({ type: 'EXUI assurance mutation', description: mutation });
  await testInfo.attach('exui-assurance-mutation.txt', {
    body: mutation,
    contentType: 'text/plain',
  });
}

function expectStringArrayOnSuccess(response: { status: number; data: unknown }, endpoint: string): string[] {
  expect(Array.isArray(response.data), `${endpoint} should return a JSON array when status is 200`).toBe(true);
  expect(
    (response.data as unknown[]).every((entry) => typeof entry === 'string'),
    `${endpoint} should return only string family identifiers when status is 200`
  ).toBe(true);

  return response.data as string[];
}

function expectGlobalSearchServicesOnSuccess(response: { status: number; data: unknown }): GlobalSearchService[] {
  expect(Array.isArray(response.data), 'api/globalSearch/services should return a JSON array when status is 200').toBe(true);
  expect(
    (response.data as unknown[]).every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { serviceId?: unknown }).serviceId === 'string' &&
        typeof (entry as { serviceName?: unknown }).serviceName === 'string'
    ),
    'api/globalSearch/services should return serviceId/serviceName objects when status is 200'
  ).toBe(true);

  return response.data as GlobalSearchService[];
}

function loadSourceTruth(): SourceTruth {
  return JSON.parse(
    readFileSync(new URL('../../data/exui-central-assurance-source.json', import.meta.url), 'utf8')
  ) as SourceTruth;
}

function expectExactContractStatus(status: number, endpoint: string): void {
  expect(status, `${endpoint} should be reachable for the exact assurance harness proof`).toBe(200);
}

function findExplicitSkipCalls(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8');
  return EXPLICIT_SKIP_CALLS.filter((skipCall) => source.includes(skipCall)).map(
    (skipCall) => `${filePath}: ${skipCall}`
  );
}

test.describe('EXUI assurance harness central assurance POC', { tag: ['@svc-node-app', '@svc-ref-data'] }, () => {
  test('scenario manifest keeps must-run lanes, planned lanes, and canaries explicit', () => {
    expect(EXUI_SUPERSERVICE_SCENARIOS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          executionMode: 'api',
          id: 'configuration-open-ui-contract',
          lane: 'configuration',
          priority: 'must-run',
        }),
        expect.objectContaining({
          executionMode: 'hybrid',
          id: 'global-search-supported-service-families',
          lane: 'global-search',
          priority: 'must-run',
        }),
        expect.objectContaining({
          executionMode: 'hybrid',
          id: 'wa-supported-service-families',
          lane: 'work-allocation',
          priority: 'must-run',
        }),
        expect.objectContaining({
          executionMode: 'ui',
          id: 'hearings-privatelaw-prlapps-manager',
          lane: 'hearings',
        }),
        expect.objectContaining({
          executionMode: 'api',
          id: 'prl-service-of-documents-nested-complex-cya',
          lane: 'manage-case',
          priority: 'must-run',
        }),
        expect.objectContaining({
          executionMode: 'api',
          id: 'auth-login-hint-entrypoint-state-contract',
          lane: 'auth',
          priority: 'must-run',
        }),
        expect.objectContaining({
          executionMode: 'api',
          id: 'auth-role-mismatch-access-denied-contract',
          lane: 'auth',
          priority: 'must-run',
        }),
        expect.objectContaining({
          executionMode: 'ui',
          id: 'overview-page-layout-baseline-contract',
          lane: 'manage-case',
          priority: 'grouped',
        }),
        expect.objectContaining({
          id: 'canary-cmc',
          priority: 'canary',
        }),
      ])
    );

    expectCanaryFamiliesExcluded([
      ...EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
      ...EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
      ...EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
    ]);
    expect(sortServiceFamilies(['PUBLICLAW', 'IA', 'CIVIL'])).toEqual(['CIVIL', 'IA', 'PUBLICLAW']);
    expect(buildGlobalSearchServicesCatalog()).toEqual(
      EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES.map((serviceFamily) =>
        expect.objectContaining({
          serviceId: normalizeServiceFamily(serviceFamily),
        })
      )
    );
  });

  test('source-truth snapshot matches the executable assurance harness manifest constants', () => {
    const sourceTruth = loadSourceTruth();
    const expectedDefaults = sourceTruth.rpxXuiWebapp['config/default.json'];
    const expectedServiceRefDataMapping = Object.fromEntries(
      expectedDefaults.serviceRefDataMapping.map(({ service, serviceCodes }) => [service, serviceCodes])
    );

    expect([...EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES]).toEqual(expectedDefaults.globalSearchServices);
    expect([...EXUI_WA_SUPPORTED_SERVICE_FAMILIES]).toEqual(expectedDefaults.waSupportedJurisdictions);
    expect([...EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES]).toEqual(expectedDefaults.staffSupportedJurisdictions);
    expect([...EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES]).toEqual(expectedDefaults.hearings.hearingsJurisdictions);
    expect(EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY).toEqual(expectedDefaults.hearings.caseTypesByJurisdiction);
    expect(EXUI_SERVICE_REF_DATA_MAPPING).toEqual(expectedServiceRefDataMapping);
    expect(EXUI_PRL_NORMALIZED_SLICES).toEqual(sourceTruth.prlCcdDefinitions.normalizedSlices);
    expect(EXUI_SERVICE_DEFINITION_PROFILES).toEqual(sourceTruth.serviceDefinitionProfiles.profiles);
    expect(sortedUniqueServiceFamilies(EXUI_ALL_CONFIGURED_SERVICE_FAMILIES)).toEqual(
      sortedUniqueServiceFamilies([
        ...expectedDefaults.jurisdictions,
        ...expectedDefaults.globalSearchServices,
        ...expectedDefaults.waSupportedJurisdictions,
        ...expectedDefaults.staffSupportedJurisdictions,
        ...expectedDefaults.hearings.hearingsJurisdictions,
      ])
    );
  });

  test('service-definition profiles widen the proof beyond PRL and close known source gaps', () => {
    const profileFamilies = EXUI_SERVICE_DEFINITION_PROFILES.map((profile) => profile.serviceFamily);
    const profileSummary = buildServiceDefinitionProfileSummary();
    const repoTotals = buildDefinitionRepoCoverageTotals();

    expect(findUnprofiledServiceFamilies()).toEqual([]);
    expect(findUnprofiledServiceFamilies([...EXUI_ALL_CONFIGURED_SERVICE_FAMILIES, 'NEW_SERVICE'])).toEqual([
      'NEW_SERVICE',
    ]);
    expect(sortedUniqueServiceFamilies(profileFamilies)).toEqual(sortedUniqueServiceFamilies(EXUI_ALL_CONFIGURED_SERVICE_FAMILIES));
    expect(profileSummary['ccd-backed']).toEqual(
      expect.arrayContaining([
        'CIVIL',
        'CMC',
        'DIVORCE',
        'EMPLOYMENT',
        'FR',
        'IA',
        'PROBATE',
        'PRIVATELAW',
        'PUBLICLAW',
        'SSCS',
        'ST_CIC',
      ])
    );
    expect(profileSummary['source-unidentified'] ?? []).toEqual([]);
    expect(profileSummary['source-unavailable'] ?? []).toEqual([]);
    expect(profileSummary['config-backed']).toEqual(['HRS']);
    expect(findReleaseBlockingFamiliesWithoutCcdBackedProfile()).toEqual([]);
    const probateProfile = EXUI_SERVICE_DEFINITION_PROFILES.find((profile) => profile.serviceFamily === 'PROBATE');
    const stCicProfile = EXUI_SERVICE_DEFINITION_PROFILES.find((profile) => profile.serviceFamily === 'ST_CIC');
    expect(probateProfile).toBeDefined();
    expect(stCicProfile).toBeDefined();
    expect(probateProfile!.repos[0]).toEqual(
      expect.objectContaining({
        evidenceRefs: expect.arrayContaining([
          'src/main/java/uk/gov/hmcts/probate/model/ccd/CcdCaseType.java',
          'src/cftlib/java/uk/gov/hmcts/probate/CftLibConfig.java',
        ]),
      })
    );
    expect(stCicProfile!.repos[0]).toEqual(
      expect.objectContaining({
        evidenceRefs: expect.arrayContaining([
          'src/main/java/uk/gov/hmcts/sptribs/common/ccd/CcdServiceCode.java',
          'src/main/resources/application.yaml',
        ]),
      })
    );
    expect(repoTotals.jsonFiles).toBeGreaterThan(4000);
    expect(repoTotals.caseEventToFields).toBeGreaterThan(600);
    expect(repoTotals.caseEventToComplexTypes).toBeGreaterThan(400);

    for (const profile of EXUI_SERVICE_DEFINITION_PROFILES) {
      expect(profile.rationale.trim().length, `${profile.serviceFamily} should explain why this profile exists`).toBeGreaterThan(0);
      expect(profile.nextAction.trim().length, `${profile.serviceFamily} should state the next scaling action`).toBeGreaterThan(0);
      expect(profile.priority).toBe(
        EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.find((decision) => decision.serviceFamily === profile.serviceFamily)?.disposition
      );
    }
    expect(
      EXUI_SERVICE_DEFINITION_PROFILES.filter(
        (profile) => profile.proofLevel === 'ccd-backed' && (profile.repos as readonly unknown[]).length === 0
      ).map((profile) => profile.serviceFamily)
    ).toEqual([]);
  });

  test('coverage decisions classify every configured family and fail for synthetic unknown service families', () => {
    const scenarioIds = new Set(EXUI_SUPERSERVICE_SCENARIOS.map((scenario) => scenario.id));
    const decisionFamilies = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.map((decision) => decision.serviceFamily);

    expect(findUnclassifiedServiceFamilies()).toEqual([]);
    expect(findUnclassifiedServiceFamilies([...EXUI_ALL_CONFIGURED_SERVICE_FAMILIES, 'NEW_SERVICE'])).toEqual([
      'NEW_SERVICE',
    ]);
    expect(sortedUniqueServiceFamilies(decisionFamilies)).toEqual(sortedUniqueServiceFamilies(EXUI_ALL_CONFIGURED_SERVICE_FAMILIES));

    for (const decision of EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS) {
      expect(decision.rationale.trim().length, `${decision.serviceFamily} should explain the grouping decision`).toBeGreaterThan(0);
      for (const scenarioId of decision.representativeScenarioIds) {
        expect(scenarioIds.has(scenarioId), `${decision.serviceFamily} references missing scenario ${scenarioId}`).toBe(true);
      }
    }

    expect(buildCoverageSummary()).toEqual(
      expect.objectContaining({
        'release-blocking': expect.arrayContaining(['CIVIL', 'EMPLOYMENT', 'IA', 'PRIVATELAW', 'PUBLICLAW', 'ST_CIC']),
        grouped: expect.arrayContaining(['HRS']),
        canary: ['CMC'],
      })
    );
  });

  test('historic SRT failure classes are classified as caught, planned, or explicitly missed', () => {
    const historicIds = EXUI_HISTORIC_FAILURE_COVERAGE.map((failure) => failure.id);
    const summary = buildHistoricFailureCoverageSummary();

    expect(new Set(historicIds).size).toBe(historicIds.length);
    expect(EXUI_HISTORIC_FAILURE_COVERAGE.length).toBeGreaterThanOrEqual(12);
    expect(summary['covered-now']).toEqual(
      expect.arrayContaining([
        'manage-case-previous-navigation-data-loss',
        'cya-complex-show-condition-summary',
        'nested-complex-fieldshowcondition-cya',
        'hidden-complex-retention',
        'wa-task-lifecycle-correlation',
        'wa-tab-location-availability',
        'role-assignment-null-service',
        'protected-endpoint-auth-negative',
        'event-history-external-role-gate',
        'event-history-layout-width',
        'event-start-spinner-latency',
        'idam-passport-session-smoke',
        'sso-login-hint-entrypoint-state',
        'post-auth-role-mismatch-access-denied',
        'overview-page-layout-regression-classification',
      ])
    );
    expect(summary['learning-case']).toEqual([]);
    expect(summary.partial).toEqual([]);
    expect(summary['would-catch-with-replay-pack']).toEqual([]);
    expect(summary['out-of-scope']).toEqual(['media-viewer-redaction-coordinate']);

    for (const failure of EXUI_HISTORIC_FAILURE_COVERAGE) {
      expect(failure.historicRefs.length, `${failure.id} should trace to supplied historic evidence`).toBeGreaterThan(0);
      expect(failure.failureClass.trim().length, `${failure.id} should describe the failure class`).toBeGreaterThan(0);
      expect(failure.harnessContract.trim().length, `${failure.id} should define the Harness contract`).toBeGreaterThan(
        0
      );
      expect(failure.currentPocEvidence.trim().length, `${failure.id} should state current POC evidence`).toBeGreaterThan(0);
      expect(failure.nextScenarioId.trim().length, `${failure.id} should name the next scenario`).toBeGreaterThan(0);
    }

    const outOfScopeFailures = EXUI_HISTORIC_FAILURE_COVERAGE.filter((failure) => failure.coverageStatus === 'out-of-scope');
    const executableFailures = EXUI_HISTORIC_FAILURE_COVERAGE.filter((failure) => failure.coverageStatus === 'covered-now');
    const partialFailures = EXUI_HISTORIC_FAILURE_COVERAGE.filter((failure) => failure.coverageStatus === 'partial');
    const learningCases = EXUI_HISTORIC_FAILURE_COVERAGE.filter((failure) => failure.coverageStatus === 'learning-case');
    const overviewFailure = EXUI_HISTORIC_FAILURE_COVERAGE.find(
      (failure) => failure.id === 'overview-page-layout-regression-classification'
    );

    expect(executableFailures.every((failure) => failure.wouldHaveCaught)).toBe(true);
    expect(partialFailures).toEqual([]);
    expect(executableFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'overview-page-layout-regression-classification',
          harnessContract: expect.stringContaining('Mocked IA case-details journey'),
          currentPocEvidence: expect.stringContaining('screenshot plus axe evidence'),
          wouldHaveCaught: true,
        }),
      ])
    );
    expect(learningCases).toEqual([]);
    expect(overviewFailure).toEqual(
      expect.objectContaining({
        id: 'overview-page-layout-regression-classification',
        agenticExpectedBoundary: expect.stringContaining('EXUI layout/styling'),
        comparisonLearning: expect.stringContaining('central overview layout gate'),
        humanFixConfidence: 'indirect',
        humanFixEvidence: expect.arrayContaining([
          expect.stringContaining('No direct EXUI-4756-linked PR or commit'),
        ]),
        wouldHaveCaught: true,
      })
    );
    expect(outOfScopeFailures).toEqual([
      expect.objectContaining({
        id: 'media-viewer-redaction-coordinate',
        missReason: expect.any(String),
        wouldHaveCaught: false,
      }),
    ]);
    expect(outOfScopeFailures.every((failure) => (failure.missReason ?? '').trim().length > 0)).toBe(true);
  });

  test('defect intake rules route new EXUI findings to the right harness work type', () => {
    const ruleIds = EXUI_DEFECT_INTAKE_RULES.map((rule) => rule.id);

    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    expect(EXUI_DEFECT_INTAKE_RULES.map((rule) => rule.route)).toEqual([
      'targeted-mutation-proof',
      'historic-replay-pack',
      'service-family-pack',
      'owner-confirmed-follow-up',
      'specialist-suite-follow-up',
    ]);

    for (const rule of EXUI_DEFECT_INTAKE_RULES) {
      expect(rule.signalTerms.length, `${rule.id} should name its matching signals`).toBeGreaterThan(0);
      expect(rule.requiredEvidence.length, `${rule.id} should define evidence before promotion`).toBeGreaterThan(0);
      expect(rule.target.trim().length, `${rule.id} should name the next harness target`).toBeGreaterThan(0);
      expect(rule.rationale.trim().length, `${rule.id} should explain the route`).toBeGreaterThan(0);
    }

    expect(classifyExuiDefectIntake('Dropped service code BHA1 is no longer caught').route).toBe(
      'targeted-mutation-proof'
    );
    expect(classifyExuiDefectIntake('CYA loses complex field after Previous navigation').route).toBe(
      'historic-replay-pack'
    );
    expect(classifyExuiDefectIntake('Civil is missing from Work Allocation jurisdiction list').route).toBe(
      'service-family-pack'
    );
    expect(classifyExuiDefectIntake('Overview page changed but expected behaviour needs owner confirmation').route).toBe(
      'owner-confirmed-follow-up'
    );
    expect(classifyExuiDefectIntake('Media Viewer redaction pixel coordinate moves after zoom').route).toBe(
      'specialist-suite-follow-up'
    );
    expect(classifyExuiDefectIntake('Untriaged defect with no source evidence yet').route).toBe(
      'owner-confirmed-follow-up'
    );
    expect(buildDefectIntakeDecision('Dropped service code BHA1 is no longer caught')).toEqual(
      expect.objectContaining({
        route: 'targeted-mutation-proof',
        ruleId: 'known-contract-regression-red-proof',
      })
    );
  });

  test('release assurance verdict is deterministic and uses recorded mutation evidence', () => {
    const verdict = buildReleaseAssuranceVerdict();
    const evidence = JSON.parse(
      readFileSync('src/data/exui-release-assurance-evidence.json', 'utf8')
    ) as ReleaseEvidence;

    expect(verdict.overallStatus).toBe('warn');
    expect(verdict.failReasons).toEqual([]);
    expect(verdict.warnReasons).toEqual(evidence.releaseGate?.warnReasons);
    expect(evidence.releaseGate?.acceptedWarnings?.map((warning) => warning.reason)).toEqual(verdict.warnReasons);
    expect(evidence.releaseGate?.acceptedWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'historic out-of-scope class: media-viewer-redaction-coordinate',
          classification: 'specialist-suite-follow-up',
          ownerAction: expect.stringContaining('Media Viewer specialist suite'),
          closureCriteria: expect.stringContaining('Media Viewer owners'),
        }),
      ])
    );
    expect(verdict.releaseBlockingCoverage).toEqual(
      expect.arrayContaining(['CIVIL', 'EMPLOYMENT', 'IA', 'PRIVATELAW', 'PUBLICLAW', 'ST_CIC'])
    );
    expect(verdict.knownGaps).toEqual(
      expect.arrayContaining([
        'historic out-of-scope class: media-viewer-redaction-coordinate',
      ])
    );
    expect(verdict.knownGaps).not.toContain(
      'historic learning case not executable yet: overview-page-layout-regression-classification'
    );
    expect(verdict.knownGaps).not.toContain('release-blocking family without CCD-backed profile: ST_CIC');
    expect(EXUI_RELEASE_ASSURANCE_MUTATION_STATUS).toBe('passed');
    expect(verdict.knownGaps).not.toContain(
      'mutation evidence pending: yarn harness:mutation:wa, yarn harness:mutation:st-cic, yarn harness:mutation:probate, yarn harness:mutation:civil, yarn harness:mutation:ia, yarn harness:mutation:employment, yarn harness:mutation:ccd'
    );
    expect(verdict.mutationEvidence).toEqual({
      status: EXUI_RELEASE_ASSURANCE_MUTATION_STATUS,
      requiredCommands: EXUI_RELEASE_ASSURANCE_MUTATION_COMMANDS,
    });
    expect(verdict.evidenceSummary).toBe(
      'warn: 6 release-blocking families, 0 fail reason(s), 1 warning(s), mutation evidence passed'
    );
    expect(verdict.historicFailureCoverage['covered-now']).toEqual(
      expect.arrayContaining([
        'nested-complex-fieldshowcondition-cya',
        'overview-page-layout-regression-classification',
      ])
    );
  });

  test('owner slice catalogue exposes the service-family action list', () => {
    const catalogue = buildOwnerSliceCatalogue();
    const probate = catalogue.find((entry) => entry.serviceFamily === 'PROBATE');
    const stCic = catalogue.find((entry) => entry.serviceFamily === 'ST_CIC');

    expect(catalogue.map((entry) => entry.serviceFamily)).toEqual(sortServiceFamilies(EXUI_ALL_CONFIGURED_SERVICE_FAMILIES));
    expect(catalogue.every((entry) => entry.ownerAction.trim().length > 0)).toBe(true);
    expect(probate).toEqual(
      expect.objectContaining({
        disposition: 'grouped',
        proofLevel: 'ccd-backed',
        representativeCaseTypes: ['GrantOfRepresentation'],
        serviceCodes: ['ABA6'],
      })
    );
    expect(stCic).toEqual(
      expect.objectContaining({
        disposition: 'release-blocking',
        proofLevel: 'ccd-backed',
        representativeCaseTypes: ['CriminalInjuriesCompensation'],
        serviceCodes: ['BBA2'],
      })
    );
  });

  test('release evidence summary joins verdict, owner slices, and intake routes', () => {
    const summary = buildReleaseEvidenceSummary();
    const proofLanes = Object.fromEntries(summary.harnessProofLanes.map((lane) => [lane.lane, lane]));

    expect(summary.verdict.overallStatus).toBe('warn');
    expect(summary.acceptedWarnings.map((warning) => warning.reason)).toEqual(summary.verdict.warnReasons);
    expect(summary.ownerSliceCatalogue).toHaveLength(EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.length);
    expect(summary.defectIntakeRoutes.map((route) => route.route)).toEqual([
      'targeted-mutation-proof',
      'historic-replay-pack',
      'service-family-pack',
      'owner-confirmed-follow-up',
      'specialist-suite-follow-up',
    ]);
    expect(Object.keys(proofLanes)).toEqual(['api', 'ui', 'integration', 'accessibility']);
    const proofFileContents = Object.values(proofLanes)
      .flatMap((lane) => lane.testFiles ?? [])
      .map((filePath) => readFileSync(filePath, 'utf8'))
      .join('\n');

    expect(proofLanes.ui?.testFiles).toContain(
      'src/tests/e2e/integration/manageTasks/serviceFamilies.positive.spec.ts'
    );
    expect(proofLanes.integration?.testFiles).toEqual(
      expect.arrayContaining([
        'src/tests/integration/harness/exui4493CyaRendering.visual.spec.ts',
        'src/tests/integration/harness/overviewPageLayout.positive.spec.ts',
        'src/tests/integration/hearings/harnessServiceFamilies.positive.spec.ts',
        'src/tests/integration/searchCase/globalSearchServiceFamilies.positive.spec.ts',
      ])
    );
    expect(proofLanes.accessibility?.testTitles).toEqual(
      expect.arrayContaining([
        'accessibility baseline: available tasks service filter has no new axe violations',
        'accessibility baseline: IA overview case details has no new axe violations',
        'accessibility baseline: supported Private Law hearings action view has no new axe violations',
        'accessibility baseline: unsupported Divorce case details state has no new axe violations',
      ])
    );
    proofLanes.accessibility?.testTitles?.forEach((title) => {
      expect(proofFileContents).toContain(title);
    });
  });

  test('release evidence proof lanes do not allow explicit skip calls', () => {
    const proofFiles = [
      ...new Set(buildReleaseEvidenceSummary().harnessProofLanes.flatMap((lane) => lane.testFiles ?? [])),
    ];
    const skipOffenders = proofFiles.flatMap((filePath) => findExplicitSkipCalls(filePath));

    expect(proofFiles.length).toBeGreaterThan(0);
    expect(skipOffenders).toEqual([]);
  });

  test('release assurance verdict fails when a configured family is not classified or profiled', () => {
    const verdict = buildReleaseAssuranceVerdict({
      configuredFamilies: [...EXUI_ALL_CONFIGURED_SERVICE_FAMILIES, 'NEW_SERVICE'],
    });

    expect(verdict.overallStatus).toBe('fail');
    expect(verdict.failReasons).toEqual(
      expect.arrayContaining([
        'unclassified configured family: NEW_SERVICE',
        'unprofiled configured family: NEW_SERVICE',
      ])
    );
    expect(verdict.knownGaps).toEqual(
      expect.arrayContaining([
        'unclassified configured family: NEW_SERVICE',
        'unprofiled configured family: NEW_SERVICE',
      ])
    );
  });

  test('release assurance verdict passes when coverage is complete and mutation evidence has passed', () => {
    const verdict = buildReleaseAssuranceVerdict({
      configuredFamilies: ['CIVIL'],
      decisions: [
        {
          serviceFamily: 'CIVIL',
          disposition: 'release-blocking',
          lanes: ['global-search'],
          representativeScenarioIds: ['global-search-supported-service-families'],
          rationale: 'Synthetic complete coverage for pass-branch proof.',
        },
      ],
      profiles: [
        {
          serviceFamily: 'CIVIL',
          priority: 'release-blocking',
          proofLevel: 'ccd-backed',
          lanes: ['global-search'],
          representativeCaseTypes: ['CIVIL'],
          serviceCodes: ['AAA6'],
          repos: [
            {
              fullName: 'hmcts/civil-ccd-definition',
              url: 'https://github.com/hmcts/civil-ccd-definition',
              visibility: 'public',
              updatedAt: '2026-05-12T13:40:51Z',
              defaultBranch: 'master',
              definitionRoot: 'ccd-definition',
              jsonFiles: 1,
              caseEventToFields: 1,
              caseEventToComplexTypes: 1,
              authorisationCaseField: 1,
              caseField: 1,
              complexTypes: 1,
            },
          ],
          rationale: 'Synthetic complete profile for pass-branch proof.',
          nextAction: 'None for pass-branch proof.',
        },
      ],
      failures: [],
      mutationEvidenceStatus: 'passed',
    });

    expect(verdict).toEqual({
      overallStatus: 'pass',
      releaseBlockingCoverage: ['CIVIL'],
      failReasons: [],
      warnReasons: [],
      knownGaps: [],
      evidenceSummary: 'pass: 1 release-blocking families, 0 fail reason(s), 0 warning(s), mutation evidence passed',
      mutationEvidence: {
        status: 'passed',
        requiredCommands: [
          'yarn harness:mutation:wa',
          'yarn harness:mutation:st-cic',
          'yarn harness:mutation:probate',
          'yarn harness:mutation:civil',
          'yarn harness:mutation:ia',
          'yarn harness:mutation:employment',
          'yarn harness:mutation:ccd',
        ],
      },
      historicFailureCoverage: {
        'covered-now': [],
        'would-catch-with-replay-pack': [],
        'learning-case': [],
        partial: [],
        'out-of-scope': [],
      },
    });
  });

  test('hearings seam has executable supported and unsupported family contracts', () => {
    const enabledConfig = buildHearingsEnvironmentConfigMock({
      enabledCaseVariations: [{ jurisdiction: 'PRIVATELAW', caseType: 'PRLAPPS' }],
      amendmentCaseVariations: [{ jurisdiction: 'PRIVATELAW', caseType: 'PRLAPPS' }],
    });
    const disabledConfig = buildHearingsEnvironmentConfigMock({
      enabledCaseVariations: [{ jurisdiction: 'CIVIL', caseType: 'CIVIL' }],
      amendmentCaseVariations: [{ jurisdiction: 'CIVIL', caseType: 'CIVIL' }],
    });

    expect(enabledConfig.hearingJurisdictionConfig.hearingJurisdictions['.*']).toEqual([
      { jurisdiction: 'PRIVATELAW', includeCaseTypes: ['PRLAPPS'] },
    ]);
    expect(enabledConfig.hearingJurisdictionConfig.hearingAmendment['.*']).toEqual([
      { jurisdiction: 'PRIVATELAW', includeCaseTypes: ['PRLAPPS'] },
    ]);
    expect(disabledConfig.hearingJurisdictionConfig.hearingJurisdictions['.*']).not.toContainEqual(
      expect.objectContaining({ jurisdiction: 'DIVORCE' })
    );
  });

  test('employment service pack has executable service-code and ref-data contracts', () => {
    const employmentScenario = EXUI_SUPERSERVICE_SCENARIOS.find(
      (scenario) => scenario.id === 'employment-service-code-ref-data-contract'
    );
    const employmentDecision = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.find(
      (decision) => decision.serviceFamily === 'EMPLOYMENT'
    );
    const employmentProfile = EXUI_SERVICE_DEFINITION_PROFILES.find(
      (profile) => profile.serviceFamily === 'EMPLOYMENT'
    );

    expect(employmentScenario).toEqual(
      expect.objectContaining({
        caseType: 'ET_EnglandWales,ET_Scotland',
        executionMode: 'api',
        lane: 'staff-ref-data',
        priority: 'must-run',
        serviceFamily: 'EMPLOYMENT',
      })
    );
    expect(employmentDecision?.representativeScenarioIds).toContain('employment-service-code-ref-data-contract');
    expect(employmentProfile).toEqual(
      expect.objectContaining({
        representativeCaseTypes: ['ET_EnglandWales', 'ET_Scotland'],
        serviceCodes: ['BHA1'],
      })
    );
    expect(EXUI_SERVICE_REF_DATA_MAPPING.EMPLOYMENT).toEqual(['BHA1']);
    expect(EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES).toContain('EMPLOYMENT');
    expect(EXUI_WA_SUPPORTED_SERVICE_FAMILIES).toContain('EMPLOYMENT');
    expect(EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES).toContain('EMPLOYMENT');
  });

  test('ia hearings routing pack has executable Asylum and Bail contracts', () => {
    const iaScenario = EXUI_SUPERSERVICE_SCENARIOS.find(
      (scenario) => scenario.id === 'ia-hearings-asylum-bail-routing-contract'
    );
    const iaDecision = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.find((decision) => decision.serviceFamily === 'IA');
    const iaConfig = buildHearingsEnvironmentConfigMock({
      enabledCaseVariations: [
        { jurisdiction: 'IA', caseType: 'Asylum' },
        { jurisdiction: 'IA', caseType: 'Bail' },
      ],
      amendmentCaseVariations: [
        { jurisdiction: 'IA', caseType: 'Asylum' },
        { jurisdiction: 'IA', caseType: 'Bail' },
      ],
    });

    expect(iaScenario).toEqual(
      expect.objectContaining({
        caseType: 'Asylum,Bail',
        executionMode: 'api',
        lane: 'hearings',
        priority: 'must-run',
        serviceFamily: 'IA',
      })
    );
    expect(iaDecision?.representativeScenarioIds).toContain('ia-hearings-asylum-bail-routing-contract');
    expect(EXUI_SERVICE_REF_DATA_MAPPING.IA).toEqual(['BFA1']);
    expect(EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.IA).toEqual(['Asylum', 'Bail']);
    expect(iaConfig.hearingJurisdictionConfig.hearingJurisdictions['.*']).toEqual([
      { jurisdiction: 'IA', includeCaseTypes: ['Asylum'] },
      { jurisdiction: 'IA', includeCaseTypes: ['Bail'] },
    ]);
    expect(iaConfig.hearingJurisdictionConfig.hearingAmendment['.*']).toEqual([
      { jurisdiction: 'IA', includeCaseTypes: ['Asylum'] },
      { jurisdiction: 'IA', includeCaseTypes: ['Bail'] },
    ]);
  });

  test('civil release service pack has executable hearings and service-code contracts', () => {
    const civilScenario = EXUI_SUPERSERVICE_SCENARIOS.find(
      (scenario) => scenario.id === 'civil-hearings-civil-case-type-contract'
    );
    const civilDecision = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.find(
      (decision) => decision.serviceFamily === 'CIVIL'
    );
    const civilConfig = buildHearingsEnvironmentConfigMock({
      enabledCaseVariations: [{ jurisdiction: 'CIVIL', caseType: 'CIVIL' }],
      amendmentCaseVariations: [{ jurisdiction: 'CIVIL', caseType: 'CIVIL' }],
    });

    expect(civilScenario).toEqual(
      expect.objectContaining({
        caseType: 'CIVIL',
        executionMode: 'api',
        lane: 'hearings',
        priority: 'must-run',
        serviceFamily: 'CIVIL',
      })
    );
    expect(civilDecision?.representativeScenarioIds).toContain('civil-hearings-civil-case-type-contract');
    expect(EXUI_SERVICE_REF_DATA_MAPPING.CIVIL).toEqual(['AAA6', 'AAA7']);
    expect(EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.CIVIL).toEqual(['CIVIL']);
    expect(civilConfig.hearingJurisdictionConfig.hearingJurisdictions['.*']).toEqual([
      { jurisdiction: 'CIVIL', includeCaseTypes: ['CIVIL'] },
    ]);
    expect(civilConfig.hearingJurisdictionConfig.hearingAmendment['.*']).toEqual([
      { jurisdiction: 'CIVIL', includeCaseTypes: ['CIVIL'] },
    ]);
  });

  test('st cic release service pack has executable WA and service-code contracts', () => {
    const stCicScenario = EXUI_SUPERSERVICE_SCENARIOS.find(
      (scenario) => scenario.id === 'st-cic-wa-family-config-contract'
    );
    const stCicDecision = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.find(
      (decision) => decision.serviceFamily === 'ST_CIC'
    );
    const stCicProfile = EXUI_SERVICE_DEFINITION_PROFILES.find((profile) => profile.serviceFamily === 'ST_CIC');

    expect(stCicScenario).toEqual(
      expect.objectContaining({
        caseType: 'CriminalInjuriesCompensation',
        executionMode: 'api',
        lane: 'work-allocation',
        priority: 'must-run',
        serviceFamily: 'ST_CIC',
      })
    );
    expect(stCicDecision).toEqual(
      expect.objectContaining({
        disposition: 'release-blocking',
        lanes: expect.arrayContaining(['global-search', 'work-allocation', 'staff-ref-data']),
      })
    );
    expect(stCicDecision?.representativeScenarioIds).toContain('st-cic-wa-family-config-contract');
    expect(stCicProfile).toEqual(
      expect.objectContaining({
        proofLevel: 'ccd-backed',
        representativeCaseTypes: ['CriminalInjuriesCompensation'],
        serviceCodes: ['BBA2'],
      })
    );
    expect(EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES).toContain('ST_CIC');
    expect(EXUI_WA_SUPPORTED_SERVICE_FAMILIES).toContain('ST_CIC');
    expect(EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES).toContain('ST_CIC');
    expect(EXUI_SERVICE_REF_DATA_MAPPING.ST_CIC).toEqual(['BBA2']);
    expect(stCicScenario?.sourceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repository: 'hmcts/sptribs-case-api',
          path: 'src/main/java/uk/gov/hmcts/sptribs/common/ccd/CcdServiceCode.java',
        }),
      ])
    );
  });

  test('probate grouped service pack has executable staff and service-code contracts', () => {
    const probateScenario = EXUI_SUPERSERVICE_SCENARIOS.find(
      (scenario) => scenario.id === 'probate-staff-ref-data-contract'
    );
    const probateDecision = EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.find(
      (decision) => decision.serviceFamily === 'PROBATE'
    );
    const probateProfile = EXUI_SERVICE_DEFINITION_PROFILES.find((profile) => profile.serviceFamily === 'PROBATE');

    expect(probateScenario).toEqual(
      expect.objectContaining({
        caseType: 'GrantOfRepresentation',
        executionMode: 'api',
        lane: 'staff-ref-data',
        priority: 'must-run',
        serviceFamily: 'PROBATE',
      })
    );
    expect(probateDecision).toEqual(
      expect.objectContaining({
        disposition: 'grouped',
        lanes: ['staff-ref-data'],
      })
    );
    expect(probateDecision?.representativeScenarioIds).toContain('probate-staff-ref-data-contract');
    expect(probateProfile).toEqual(
      expect.objectContaining({
        proofLevel: 'ccd-backed',
        representativeCaseTypes: ['GrantOfRepresentation'],
        serviceCodes: ['ABA6'],
      })
    );
    expect(EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES).not.toContain('PROBATE');
    expect(EXUI_WA_SUPPORTED_SERVICE_FAMILIES).not.toContain('PROBATE');
    expect(EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES).toContain('PROBATE');
    expect(EXUI_SERVICE_REF_DATA_MAPPING.PROBATE).toEqual(['ABA6']);
    expect(probateScenario?.sourceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repository: 'hmcts/probate-back-office',
          path: 'src/main/java/uk/gov/hmcts/probate/model/ccd/CcdCaseType.java',
        }),
      ])
    );
  });

  test('scenario manifest is wiki-ready and traceable to source repositories', () => {
    const scenarioIds = EXUI_SUPERSERVICE_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);

    const allSourceRefs = Object.values(EXUI_SOURCE_OF_TRUTH_REFS);
    expect(allSourceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repository: 'rpx-xui-webapp',
          path: 'config/default.json',
          kind: 'config',
        }),
        expect.objectContaining({
          repository: 'prl-ccd-definitions',
          kind: 'ccd-definition',
        }),
      ])
    );

    for (const scenario of EXUI_SUPERSERVICE_SCENARIOS) {
      expect(scenario.sourceRefs.length, `${scenario.id} should explain its source-of-truth inputs`).toBeGreaterThan(0);
      expect(scenario.sourceRefs.map((sourceRef) => sourceRef.repository)).toContain('rpx-xui-webapp');
      expect(scenario.sourceRefs.every((sourceRef) => sourceRef.path.trim().length > 0)).toBe(true);
      expect(scenario.sourceRefs.every((sourceRef) => sourceRef.reason.trim().length > 0)).toBe(true);
    }

    expect(buildSuperserviceKnowledgeIndex()['wa-supported-service-families']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repository: 'rpx-xui-webapp',
          path: 'config/default.json',
        }),
        expect.objectContaining({
          repository: 'prl-ccd-definitions',
        }),
      ])
    );
  });

  test('service-family sets are normalised, labelled, and non-overlapping with canaries', () => {
    const centralFamilies = sortedUniqueServiceFamilies([
      ...EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
      ...EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
      ...EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
    ]);

    expect(centralFamilies.length).toBeGreaterThan(0);
    expectCanaryFamiliesExcluded(centralFamilies);
    for (const family of centralFamilies) {
      expect(EXUI_SERVICE_LABELS[family], `${family} should have a human-readable label`).toEqual(expect.any(String));
      expect(EXUI_SERVICE_LABELS[family].trim().length).toBeGreaterThan(0);
    }
  });

  test('shared UI route helpers register deterministic WA family bootstrap routes', async () => {
    const registeredRoutes: Array<{ pattern: RoutePattern; handler: RouteHandler }> = [];
    const fakePage = {
      route: async (pattern: RoutePattern, handler: RouteHandler) => {
        registeredRoutes.push({ pattern, handler });
      },
    };
    const supportedDetails = buildSupportedJurisdictionDetails(EXUI_WA_SUPPORTED_SERVICE_FAMILIES, EXUI_SERVICE_LABELS);

    await setupTaskListBootstrapRoutes(fakePage as never, EXUI_WA_SUPPORTED_SERVICE_FAMILIES, supportedDetails);

    expect(registeredRoutes.map(({ pattern }) => pattern)).toEqual(
      expect.arrayContaining([
        waSupportedJurisdictionsGetRoutePattern,
        waSupportedJurisdictionsDetailRoutePattern,
        aggregatedCaseworkerJurisdictionsRoutePattern,
        workAllocationTypesOfWorkRoutePattern,
        healthCheckRoutePattern,
        workAllocationRegionLocationRoutePattern,
        workAllocationFullLocationRoutePattern,
        workAllocationCaseworkerByServiceNameRoutePattern,
      ])
    );

    const waRoute = registeredRoutes.find(({ pattern }) => pattern === waSupportedJurisdictionsGetRoutePattern);
    const waDetailRoute = registeredRoutes.find(({ pattern }) => pattern === waSupportedJurisdictionsDetailRoutePattern);
    expect(waRoute).toBeDefined();
    expect(waDetailRoute).toBeDefined();

    let waFulfill: FulfillOptions | undefined;
    await waRoute?.handler({
      fulfill: async (options) => {
        waFulfill = options;
      },
    });
    expect(waFulfill).toEqual(expect.objectContaining({ contentType: 'application/json', status: 200 }));
    expect(JSON.parse(waFulfill?.body ?? '[]')).toEqual(EXUI_WA_SUPPORTED_SERVICE_FAMILIES);

    let waDetailFulfill: FulfillOptions | undefined;
    await waDetailRoute?.handler({
      fulfill: async (options) => {
        waDetailFulfill = options;
      },
    });
    expect(waDetailFulfill).toEqual(expect.objectContaining({ contentType: 'application/json', status: 200 }));
    expect(JSON.parse(waDetailFulfill?.body ?? '[]')).toEqual(supportedDetails);
  });

  test('UI availability probe identifies service-unavailable statuses without hiding 500s', async () => {
    const okRequest = {
      get: async () => ({ status: () => 200 }),
    } as unknown as APIRequestContext;
    const gatewayRequest = {
      get: async () => ({ status: () => 504 }),
    } as unknown as APIRequestContext;
    const timeoutRequest = {
      get: async () => {
        throw new Error('socket hang up');
      },
    } as unknown as APIRequestContext;

    expect(isUiHostUnavailableStatus(502)).toBe(true);
    expect(isUiHostUnavailableStatus(503)).toBe(true);
    expect(isUiHostUnavailableStatus(504)).toBe(true);
    expect(isUiHostUnavailableStatus(500)).toBe(false);
    await expect(probeUiRouteAvailability(okRequest, '/work/my-work/list')).resolves.toEqual(
      expect.objectContaining({ shouldSkip: false, status: 200 })
    );
    await expect(probeUiRouteAvailability(gatewayRequest, '/work/my-work/list')).resolves.toEqual(
      expect.objectContaining({ shouldSkip: true, status: 504 })
    );
    await expect(probeUiRouteAvailability(timeoutRequest, '/work/my-work/list')).resolves.toEqual(
      expect.objectContaining({ shouldSkip: true })
    );
  });

  test('external UI configuration exposes the expected EXUI keys', async ({ anonymousClient }) => {
    const response = await anonymousClient.get<Record<string, unknown>>('external/config/ui');
    expect(response.status).toBe(200);
    for (const key of CONFIGURATION_UI_KEYS) {
      expect(response.data, `external/config/ui should expose ${key}`).toHaveProperty(key);
    }
  });

  test('api/configuration exposes selected feature flag values', async ({ apiClient }) => {
    const response = await apiClient.get<unknown>('api/configuration?configurationKey=termsAndConditionsEnabled', {
      throwOnError: false,
    });
    expectExactContractStatus(response.status, 'api/configuration?configurationKey=termsAndConditionsEnabled');
    expect(['boolean', 'string']).toContain(typeof response.data);
  });

  test('api/globalSearch/services contains the central must-run service-family set', async ({ apiClient }) => {
    const response = await apiClient.get<GlobalSearchService[]>('api/globalSearch/services', { throwOnError: false });
    expectExactContractStatus(response.status, 'api/globalSearch/services');
    const services = expectGlobalSearchServicesOnSuccess({
      status: response.status,
      data: response.data,
    });
    expectCentralMustRunFamiliesPresent(
      services.map((entry) => entry.serviceId),
      EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
      'api/globalSearch/services'
    );
    for (const service of services) {
      expect(service.serviceName.trim().length).toBeGreaterThan(0);
    }
  });

  test('static WA-supported family mutation proof catches a shared WA family regression', async ({}, testInfo) => {
    await attachMutationEvidence(testInfo);

    expectCentralMustRunFamiliesPresent(
      mutateStringArrayForDemo(EXUI_WA_SUPPORTED_SERVICE_FAMILIES, 'api/wa-supported-jurisdiction/get'),
      EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
      'api/wa-supported-jurisdiction/get'
    );
  });

  test('static staff-supported family mutation proof catches a Probate staff family regression', async ({}, testInfo) => {
    await attachMutationEvidence(testInfo);

    expectExactFamilySet(
      mutateStringArrayForDemo(EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES, 'api/staff-supported-jurisdiction/get'),
      EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES
    );
  });

  test('employment service-code mutation proof catches a missing BHA1 mapping', async ({}, testInfo) => {
    await attachMutationEvidence(testInfo);

    expectExactFamilySet(
      mutateStringArrayForDemo(
        EXUI_SERVICE_REF_DATA_MAPPING.EMPLOYMENT,
        'service-ref-data.employment.serviceCodes'
      ),
      EXUI_SERVICE_REF_DATA_MAPPING.EMPLOYMENT
    );
  });

  test('ia hearings routing mutation proof catches a missing Bail case type', async ({}, testInfo) => {
    await attachMutationEvidence(testInfo);

    expectExactFamilySet(
      mutateStringArrayForDemo(EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.IA, 'services.hearings.ia.caseTypes'),
      EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.IA
    );
  });

  test('civil hearings service pack mutation proof catches a missing Civil case type', async ({}, testInfo) => {
    await attachMutationEvidence(testInfo);

    expectExactFamilySet(
      mutateStringArrayForDemo(EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.CIVIL, 'services.hearings.civil.caseTypes'),
      EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY.CIVIL
    );
  });

  test('api/wa-supported-jurisdiction/get contains the central WA must-run family set', async ({ apiClient }, testInfo) => {
    const response = await apiClient.get<string[]>('api/wa-supported-jurisdiction/get', { throwOnError: false });
    expectExactContractStatus(response.status, 'api/wa-supported-jurisdiction/get');
    const actual = expectStringArrayOnSuccess(
      {
        status: response.status,
        data: response.data,
      },
      'api/wa-supported-jurisdiction/get'
    );
    await attachMutationEvidence(testInfo);

    expectCentralMustRunFamiliesPresent(
      mutateStringArrayForDemo(actual, 'api/wa-supported-jurisdiction/get'),
      EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
      'api/wa-supported-jurisdiction/get'
    );
  });

  test('api/staff-supported-jurisdiction/get matches the central staff-supported family list', async ({ apiClient }) => {
    const response = await apiClient.get<string[]>('api/staff-supported-jurisdiction/get', { throwOnError: false });
    expectExactContractStatus(response.status, 'api/staff-supported-jurisdiction/get');
    const actual = expectStringArrayOnSuccess(
      {
        status: response.status,
        data: response.data,
      },
      'api/staff-supported-jurisdiction/get'
    );
    expectExactFamilySet(
      mutateStringArrayForDemo(actual, 'api/staff-supported-jurisdiction/get'),
      EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES
    );
    expectCanaryFamiliesExcluded(actual);
  });
});
