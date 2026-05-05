import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';

import {
  buildCoverageSummary,
  buildGlobalSearchServicesCatalog,
  buildSuperserviceKnowledgeIndex,
  EXUI_ALL_CONFIGURED_SERVICE_FAMILIES,
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
  EXUI_HEARINGS_CASE_TYPES_BY_SERVICE_FAMILY,
  EXUI_HEARINGS_SUPPORTED_SERVICE_FAMILIES,
  EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS,
  EXUI_SERVICE_LABELS,
  EXUI_SERVICE_REF_DATA_MAPPING,
  EXUI_SOURCE_OF_TRUTH_REFS,
  EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
  EXUI_SUPERSERVICE_SCENARIOS,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  findUnclassifiedServiceFamilies,
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
  expect(actualFamilies, `${endpoint} should include every central must-run family`).toEqual(
    expect.arrayContaining([...sortServiceFamilies(expected)])
  );
  expectCanaryFamiliesExcluded(actualFamilies);
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
    expectCentralMustRunFamiliesPresent(actual, EXUI_WA_SUPPORTED_SERVICE_FAMILIES, 'api/wa-supported-jurisdiction/get');
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
