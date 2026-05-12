import { readFileSync } from 'node:fs';

import type { APIRequestContext, TestInfo } from '@playwright/test';

import {
  buildDefinitionRepoCoverageTotals,
  buildCoverageSummary,
  buildGlobalSearchServicesCatalog,
  buildServiceDefinitionProfileSummary,
  buildSuperserviceKnowledgeIndex,
  EXUI_ALL_CONFIGURED_SERVICE_FAMILIES,
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
  EXUI_HISTORIC_FAILURE_COVERAGE,
  EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY,
  EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES,
  EXUI_PRL_NORMALIZED_SLICES,
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

const ASSURANCE_MUTATIONS = {
  'drop-prl-wa-family': {
    endpoint: 'api/wa-supported-jurisdiction/get',
    description:
      'Demo fault: simulate EXUI no longer exposing Private Law as a Work Allocation-supported service family.',
    removedFamily: 'PRIVATELAW',
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

function skipUnlessExactContractStatus(
  testInfo: { skip: (condition: boolean, description: string) => void },
  status: number,
  endpoint: string
): void {
  if ((process.env.TEST_ENV ?? '').toLowerCase() === 'local') {
    expect(status, `${endpoint} should be reachable in the local superservice proof`).toBe(200);
    return;
  }

  testInfo.skip(status !== 200, `${endpoint} returned ${status}; exact superservice proof requires an authenticated 200.`);
  expect(status).toBe(200);
}

test.describe('EXUI superservice central assurance POC', { tag: ['@svc-node-app', '@svc-ref-data'] }, () => {
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
          id: 'canary-cmc-hrs',
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

  test('source-truth snapshot matches the executable superservice manifest constants', () => {
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

  test('service-definition profiles widen the proof beyond PRL and keep known source gaps explicit', () => {
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
        'PRIVATELAW',
        'PUBLICLAW',
        'SSCS',
      ])
    );
    expect(profileSummary['source-unidentified']).toEqual(['ST_CIC']);
    expect(profileSummary['source-unavailable']).toEqual(['PROBATE']);
    expect(profileSummary['config-backed']).toEqual(['HRS']);
    expect(findReleaseBlockingFamiliesWithoutCcdBackedProfile()).toEqual(['ST_CIC']);
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
        canary: ['CMC', 'HRS'],
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
        'hidden-complex-retention',
        'wa-task-lifecycle-correlation',
        'wa-tab-location-availability',
        'role-assignment-null-service',
        'protected-endpoint-auth-negative',
        'event-history-external-role-gate',
        'event-history-layout-width',
        'event-start-spinner-latency',
        'idam-passport-session-smoke',
      ])
    );
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
    const catchableFailures = EXUI_HISTORIC_FAILURE_COVERAGE.filter((failure) => failure.coverageStatus !== 'out-of-scope');

    expect(catchableFailures.every((failure) => failure.wouldHaveCaught)).toBe(true);
    expect(outOfScopeFailures).toEqual([
      expect.objectContaining({
        id: 'media-viewer-redaction-coordinate',
        missReason: expect.any(String),
        wouldHaveCaught: false,
      }),
    ]);
    expect(outOfScopeFailures.every((failure) => (failure.missReason ?? '').trim().length > 0)).toBe(true);
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

  test('api/configuration exposes selected feature flag values', async ({ apiClient }, testInfo) => {
    const response = await apiClient.get<unknown>('api/configuration?configurationKey=termsAndConditionsEnabled', {
      throwOnError: false,
    });
    skipUnlessExactContractStatus(testInfo, response.status, 'api/configuration?configurationKey=termsAndConditionsEnabled');
    expect(['boolean', 'string']).toContain(typeof response.data);
  });

  test('api/globalSearch/services contains the central must-run service-family set', async ({ apiClient }, testInfo) => {
    const response = await apiClient.get<GlobalSearchService[]>('api/globalSearch/services', { throwOnError: false });
    skipUnlessExactContractStatus(testInfo, response.status, 'api/globalSearch/services');
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

  test('api/wa-supported-jurisdiction/get mutation proof catches a shared WA family regression', async ({}, testInfo) => {
    await attachMutationEvidence(testInfo);

    expectCentralMustRunFamiliesPresent(
      mutateStringArrayForDemo(EXUI_WA_SUPPORTED_SERVICE_FAMILIES, 'api/wa-supported-jurisdiction/get'),
      EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
      'api/wa-supported-jurisdiction/get'
    );
  });

  test('api/wa-supported-jurisdiction/get contains the central WA must-run family set', async ({ apiClient }, testInfo) => {
    const response = await apiClient.get<string[]>('api/wa-supported-jurisdiction/get', { throwOnError: false });
    skipUnlessExactContractStatus(testInfo, response.status, 'api/wa-supported-jurisdiction/get');
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

  test('api/staff-supported-jurisdiction/get matches the central staff-supported family list', async ({
    apiClient,
  }, testInfo) => {
    const response = await apiClient.get<string[]>('api/staff-supported-jurisdiction/get', { throwOnError: false });
    skipUnlessExactContractStatus(testInfo, response.status, 'api/staff-supported-jurisdiction/get');
    const actual = expectStringArrayOnSuccess(
      {
        status: response.status,
        data: response.data,
      },
      'api/staff-supported-jurisdiction/get'
    );
    expectExactFamilySet(actual, EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES);
    expectCanaryFamiliesExcluded(actual);
  });
});
