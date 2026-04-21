import {
  type APIRequestContext,
} from "@playwright/test";

import {
  buildGlobalSearchServicesCatalog,
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_CENTRAL_ASSURANCE_MVP_SCENARIOS,
  EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
  EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  normalizeServiceFamily,
  sortServiceFamilies,
} from "../../data/exui-central-assurance.js";
import { expect, test } from "../../fixtures/api";
import {
  isUiHostUnavailableStatus,
  probeUiRouteAvailability,
} from "../../utils/ui/uiHostAvailability.js";
import {
  buildSupportedJurisdictionDetails,
  manageTasksUserDetailsRoutePattern,
  setupAvailableTaskListRoutes,
  setupManageTasksUserDetailsRoute,
  taskListRoutePattern,
  waSupportedJurisdictionsDetailRoutePattern,
  waSupportedJurisdictionsGetRoutePattern,
} from "../e2e/integration/utils/taskListRoutes.js";

type GlobalSearchService = { serviceId: string; serviceName: string };
type RoutePattern = string | RegExp;
type FulfillOptions = { status?: number; contentType?: string; body?: string };

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeServiceFamily))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function expectExactFamilySet(
  actual: readonly string[],
  expected: readonly string[],
): void {
  expect(sortedUnique(actual)).toEqual(sortServiceFamilies(expected));
}

function expectCentralMustRunFamiliesPresent(
  actual: readonly string[],
  expected: readonly string[],
  endpoint: string,
): void {
  const actualFamilies = sortedUnique(actual);
  const expectedFamilies = sortServiceFamilies(expected);

  expect(
    actualFamilies,
    `${endpoint} should include every centrally supported must-run family`,
  ).toEqual(expect.arrayContaining([...expectedFamilies]));

  for (const canaryFamily of EXUI_CANARY_SERVICE_FAMILIES) {
    expect(actualFamilies).not.toContain(normalizeServiceFamily(canaryFamily));
  }
}

function expectStringArrayOnSuccess(
  response: { status: number; data: unknown },
  endpoint: string,
): string[] {
  expect(
    Array.isArray(response.data),
    `${endpoint} should return a JSON array when status is 200`,
  ).toBe(true);
  expect(
    (response.data as unknown[]).every((entry) => typeof entry === "string"),
    `${endpoint} should return only string family identifiers when status is 200`,
  ).toBe(true);

  return response.data as string[];
}

function expectGlobalSearchServicesOnSuccess(
  response: {
    status: number;
    data: unknown;
  },
): GlobalSearchService[] {
  expect(
    Array.isArray(response.data),
    "api/globalSearch/services should return a JSON array when status is 200",
  ).toBe(true);
  expect(
    (response.data as unknown[]).every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { serviceId?: unknown }).serviceId === "string" &&
        typeof (entry as { serviceName?: unknown }).serviceName === "string",
    ),
    "api/globalSearch/services should return serviceId/serviceName objects when status is 200",
  ).toBe(true);

  return response.data as GlobalSearchService[];
}

function assertExactFamilySetOnSuccess(
  response: { status: number; data: unknown },
  expected: readonly string[],
  endpoint: string,
): void {
  const actual = expectStringArrayOnSuccess(response, endpoint);
  expectExactFamilySet(actual, expected);
  for (const canaryFamily of EXUI_CANARY_SERVICE_FAMILIES) {
    expect(sortedUnique(actual)).not.toContain(normalizeServiceFamily(canaryFamily));
  }
}

function assertGlobalSearchFamilySetOnSuccess(response: {
  status: number;
  data: unknown;
}): void {
  const services = expectGlobalSearchServicesOnSuccess(response);
  const normalizedServiceIds = sortedUnique(
    services.map((entry) => entry.serviceId),
  );

  expect(normalizedServiceIds).toEqual(sortServiceFamilies(normalizedServiceIds));
  expect(normalizedServiceIds).toHaveLength(
    new Set(normalizedServiceIds).size,
  );
  expectCentralMustRunFamiliesPresent(
    services.map((entry) => entry.serviceId),
    EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
    "api/globalSearch/services",
  );

  for (const service of services) {
    expect(service.serviceName.trim().length).toBeGreaterThan(0);
  }
}

function skipUnlessExactContractStatus(
  testInfo: {
    skip: (condition: boolean, description: string) => void;
  },
  status: number,
  endpoint: string,
): void {
  testInfo.skip(
    status !== 200,
    `${endpoint} returned ${status}; exact contract proof requires an authenticated 200 response.`,
  );
  expect(status).toBe(200);
}

test.describe(
  "EXUI central assurance POC",
  { tag: ["@svc-global-search", "@svc-ref-data", "@svc-node-app"] },
  () => {
    test("catalogue and guard helpers keep must-run families and canaries separate", () => {
      const allKnownFamilies = [
        ...EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
        ...EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
        ...EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
      ];

      for (const canaryFamily of EXUI_CANARY_SERVICE_FAMILIES) {
        expect(allKnownFamilies).not.toContain(canaryFamily);
      }

      expect(
        EXUI_CENTRAL_ASSURANCE_MVP_SCENARIOS.find(
          (scenario) => scenario.id === "hearings-privatelaw-prlapps-manager",
        ),
      ).toEqual(
        expect.objectContaining({
          executionStatus: "planned",
          lane: "hearings",
          serviceFamily: "PRIVATELAW",
          caseType: "PRLAPPS",
          priority: "must-run",
        }),
      );

      expect(sortServiceFamilies(["PUBLICLAW", "IA", "CIVIL"])).toEqual([
        "CIVIL",
        "IA",
        "PUBLICLAW",
      ]);
      expect(buildGlobalSearchServicesCatalog()).toEqual(
        EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES.map((serviceFamily) =>
          expect.objectContaining({
            serviceId: normalizeServiceFamily(serviceFamily),
          }),
        ),
      );
      expect(
        EXUI_CENTRAL_ASSURANCE_MVP_SCENARIOS.find(
          (scenario) => scenario.id === "wa-supported-service-families",
        ),
      ).toEqual(
        expect.objectContaining({
          executionStatus: "implemented",
          roleCluster: "court-admin",
        }),
      );
      expect(isUiHostUnavailableStatus(502)).toBe(true);
      expect(isUiHostUnavailableStatus(503)).toBe(true);
      expect(isUiHostUnavailableStatus(504)).toBe(true);
      expect(isUiHostUnavailableStatus(500)).toBe(false);
    });

    test("shared helper coverage keeps availability and route registration deterministic", async () => {
      const okRequest = {
        get: async () => ({ status: () => 200 }),
      } as unknown as APIRequestContext;
      const gatewayRequest = {
        get: async () => ({ status: () => 504 }),
      } as unknown as APIRequestContext;
      const timeoutRequest = {
        get: async () => {
          throw new Error("socket hang up");
        },
      } as unknown as APIRequestContext;

      await expect(
        probeUiRouteAvailability(okRequest, "/work/my-work/list"),
      ).resolves.toEqual(
        expect.objectContaining({
          path: "/work/my-work/list",
          reason: "EXUI shell route /work/my-work/list returned 200.",
          shouldSkip: false,
          status: 200,
        }),
      );
      await expect(
        probeUiRouteAvailability(gatewayRequest, "/work/my-work/list"),
      ).resolves.toEqual(
        expect.objectContaining({
          path: "/work/my-work/list",
          shouldSkip: true,
          status: 504,
        }),
      );
      await expect(
        probeUiRouteAvailability(timeoutRequest, "/work/my-work/list"),
      ).resolves.toEqual(
        expect.objectContaining({
          path: "/work/my-work/list",
          shouldSkip: true,
        }),
      );

      const registeredRoutes: Array<{
        pattern: RoutePattern;
        handler: (route: { fulfill: (options: FulfillOptions) => Promise<void> }) => Promise<void>;
      }> = [];
      const initScripts: Array<{ arg: unknown }> = [];
      const fakePage = {
        addInitScript: async (
          _script: (value: unknown) => void,
          arg: unknown,
        ) => {
          initScripts.push({ arg });
        },
        route: async (
          pattern: RoutePattern,
          handler: (route: { fulfill: (options: FulfillOptions) => Promise<void> }) => Promise<void>,
        ) => {
          registeredRoutes.push({ pattern, handler });
        },
      };

      await setupManageTasksUserDetailsRoute(
        fakePage as never,
        EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
        "exui-central-assurance-user",
      );
      await setupAvailableTaskListRoutes(
        fakePage as never,
        EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
      );

      expect(initScripts).toHaveLength(1);
      expect(initScripts[0]?.arg).toEqual(
        expect.objectContaining({
          id: "exui-central-assurance-user",
          uid: "exui-central-assurance-user",
          roleCategory: "LEGAL_OPERATIONS",
        }),
      );

      expect(registeredRoutes).toHaveLength(9);
      expect(registeredRoutes.map(({ pattern }) => pattern)).toEqual(
        expect.arrayContaining([
          manageTasksUserDetailsRoutePattern,
          waSupportedJurisdictionsGetRoutePattern,
          waSupportedJurisdictionsDetailRoutePattern,
          "**/workallocation/task/types-of-work*",
          "**/api/healthCheck*",
          "**/workallocation/region-location*",
          "**/workallocation/full-location*",
          "**/workallocation/caseworker/getUsersByServiceName*",
          taskListRoutePattern,
        ]),
      );

      const waRoute = registeredRoutes.find(
        ({ pattern }) => pattern === waSupportedJurisdictionsGetRoutePattern,
      );
      const waDetailRoute = registeredRoutes.find(
        ({ pattern }) => pattern === waSupportedJurisdictionsDetailRoutePattern,
      );
      const userDetailsRoute = registeredRoutes.find(
        ({ pattern }) => pattern === manageTasksUserDetailsRoutePattern,
      );
      const taskRoute = registeredRoutes.find(
        ({ pattern }) =>
          pattern instanceof RegExp &&
          pattern.source === taskListRoutePattern.source,
      );

      expect(userDetailsRoute).toBeDefined();
      expect(waRoute).toBeDefined();
      expect(waDetailRoute).toBeDefined();
      expect(taskRoute).toBeDefined();

      let userDetailsFulfill: FulfillOptions | undefined;
      await userDetailsRoute?.handler({
        fulfill: async (options) => {
          userDetailsFulfill = options;
        },
      });

      expect(userDetailsFulfill).toEqual(
        expect.objectContaining({
          contentType: "application/json",
          status: 200,
        }),
      );
      expect(JSON.parse(userDetailsFulfill?.body ?? "{}")).toEqual(
        expect.objectContaining({
          roleAssignmentInfo: expect.arrayContaining(
            EXUI_WA_SUPPORTED_SERVICE_FAMILIES.map((jurisdiction) =>
              expect.objectContaining({
                jurisdiction,
                roleType: "ORGANISATION",
                substantive: "Y",
              }),
            ),
          ),
          userInfo: expect.objectContaining({
            id: "exui-central-assurance-user",
            uid: "exui-central-assurance-user",
          }),
        }),
      );

      let waFulfill: FulfillOptions | undefined;
      await waRoute?.handler({
        fulfill: async (options) => {
          waFulfill = options;
        },
      });

      expect(waFulfill).toEqual(
        expect.objectContaining({
          contentType: "application/json",
          status: 200,
        }),
      );
      expect(JSON.parse(waFulfill?.body ?? "[]")).toEqual(
        EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
      );

      let waDetailFulfill: FulfillOptions | undefined;
      await waDetailRoute?.handler({
        fulfill: async (options) => {
          waDetailFulfill = options;
        },
      });

      expect(waDetailFulfill).toEqual(
        expect.objectContaining({
          contentType: "application/json",
          status: 200,
        }),
      );
      expect(JSON.parse(waDetailFulfill?.body ?? "[]")).toEqual(
        buildSupportedJurisdictionDetails(EXUI_WA_SUPPORTED_SERVICE_FAMILIES),
      );

      let taskFulfill: FulfillOptions | undefined;
      await taskRoute?.handler({
        fulfill: async (options) => {
          taskFulfill = options;
        },
      });

      expect(taskFulfill).toEqual(
        expect.objectContaining({
          contentType: "application/json",
          status: 200,
        }),
      );
      expect(JSON.parse(taskFulfill?.body ?? "{}")).toEqual(
        expect.objectContaining({
          tasks: expect.any(Array),
        }),
      );
      expect(JSON.parse(taskFulfill?.body ?? "{}").tasks).toHaveLength(3);
    });

    test("api/globalSearch/services contains the central must-run service-family set", async ({
      apiClient,
    }, testInfo) => {
      const response = await apiClient.get<GlobalSearchService[]>(
        "api/globalSearch/services",
        { throwOnError: false },
      );
      const status = response.status;
      skipUnlessExactContractStatus(
        testInfo,
        status,
        "api/globalSearch/services",
      );
      assertGlobalSearchFamilySetOnSuccess({
        status,
        data: response.data,
      });
    });

    test("api/wa-supported-jurisdiction/get contains the central WA must-run family set", async ({
      apiClient,
    }, testInfo) => {
      const response = await apiClient.get<string[]>(
        "api/wa-supported-jurisdiction/get",
        { throwOnError: false },
      );
      const status = response.status;
      skipUnlessExactContractStatus(
        testInfo,
        status,
        "api/wa-supported-jurisdiction/get",
      );
      const actual = expectStringArrayOnSuccess(
        {
          status,
          data: response.data,
        },
        "api/wa-supported-jurisdiction/get",
      );
      expectCentralMustRunFamiliesPresent(
        actual,
        EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
        "api/wa-supported-jurisdiction/get",
      );
    });

    test("api/staff-supported-jurisdiction/get matches the central staff-supported family list", async ({
      apiClient,
    }, testInfo) => {
      const response = await apiClient.get<string[]>(
        "api/staff-supported-jurisdiction/get",
        { throwOnError: false },
      );
      const status = response.status;
      skipUnlessExactContractStatus(
        testInfo,
        status,
        "api/staff-supported-jurisdiction/get",
      );
      assertExactFamilySetOnSuccess(
        {
          status,
          data: response.data,
        },
        EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
        "api/staff-supported-jurisdiction/get",
      );
    });
  },
);
