import {
  request,
  type APIRequestContext,
} from "@playwright/test";

import { config } from "../../config/api.js";
import {
  buildGlobalSearchServicesCatalog,
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_CENTRAL_ASSURANCE_MVP_SCENARIOS,
  EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
  EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  sortServiceFamilies,
} from "../../data/exui-central-assurance.js";
import { expect, test } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";
import { isUiHostUnavailableStatus } from "../../utils/ui/uiHostAvailability.js";
import { loadSessionCookies } from "../e2e/integration/utils/session.utils.js";

type GlobalSearchService = { serviceId: string; serviceName: string };

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function expectExactFamilySet(
  actual: readonly string[],
  expected: readonly string[],
): void {
  expect(sortedUnique(actual)).toEqual(sortServiceFamilies(expected));
}

function expectStringArrayOnSuccess(
  response: { status: number; data: unknown },
  endpoint: string,
): string[] | undefined {
  if (response.status !== 200) {
    return undefined;
  }

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

function sortServices(
  services: readonly GlobalSearchService[],
): GlobalSearchService[] {
  return [...services].sort((left, right) =>
    left.serviceId.localeCompare(right.serviceId),
  );
}

function expectGlobalSearchServicesOnSuccess(
  response: {
    status: number;
    data: unknown;
  },
): GlobalSearchService[] | undefined {
  if (response.status !== 200) {
    return undefined;
  }

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
  if (!actual) {
    return;
  }

  expectExactFamilySet(actual, expected);
  expect(actual).not.toEqual(
    expect.arrayContaining([...EXUI_CANARY_SERVICE_FAMILIES]),
  );
}

function assertGlobalSearchFamilySetOnSuccess(response: { status: number; data: unknown }): void {
  const services = expectGlobalSearchServicesOnSuccess(response);
  if (!services) {
    return;
  }

  const serviceIds = services.map((entry) => entry.serviceId);
  expect(sortServices(services)).toEqual(
    sortServices(buildGlobalSearchServicesCatalog()),
  );
  expectExactFamilySet(serviceIds, EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES);
  expect(serviceIds).not.toEqual(
    expect.arrayContaining([...EXUI_CANARY_SERVICE_FAMILIES]),
  );
}

async function createCookieBackedApiContext(): Promise<APIRequestContext> {
  const baseURL = config.baseUrl.replace(/\/+$/, "");
  const session = loadSessionCookies("SOLICITOR");

  if (session.cookies.length === 0) {
    return request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });
  }

  return request.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    storageState: { cookies: session.cookies, origins: [] },
  });
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
        EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES.map((serviceId) =>
          expect.objectContaining({ serviceId }),
        ),
      );
      expect(isUiHostUnavailableStatus(502)).toBe(true);
      expect(isUiHostUnavailableStatus(503)).toBe(true);
      expect(isUiHostUnavailableStatus(504)).toBe(true);
      expect(isUiHostUnavailableStatus(500)).toBe(false);
    });

    test("api/globalSearch/services matches the central service-family catalogue", async () => {
      const context = await createCookieBackedApiContext();
      const response = await context.get("api/globalSearch/services", {
        failOnStatusCode: false,
      });

      expectStatus(response.status(), StatusSets.guardedBasic);
      assertGlobalSearchFamilySetOnSuccess({
        status: response.status(),
        data: await response.json().catch(() => undefined),
      });
      await context.dispose();
    });

    test("api/wa-supported-jurisdiction matches the central WA family list", async () => {
      const context = await createCookieBackedApiContext();
      const response = await context.get("api/wa-supported-jurisdiction", {
        failOnStatusCode: false,
      });

      expectStatus(response.status(), StatusSets.guardedBasic);
      assertExactFamilySetOnSuccess(
        {
          status: response.status(),
          data: await response.json().catch(() => undefined),
        },
        EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
        "api/wa-supported-jurisdiction",
      );
      await context.dispose();
    });

    test("api/staff-supported-jurisdiction keeps canaries outside the must-run set", async () => {
      const context = await createCookieBackedApiContext();
      const response = await context.get("api/staff-supported-jurisdiction", {
        failOnStatusCode: false,
      });

      expectStatus(response.status(), StatusSets.guardedBasic);
      assertExactFamilySetOnSuccess(
        {
          status: response.status(),
          data: await response.json().catch(() => undefined),
        },
        EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
        "api/staff-supported-jurisdiction",
      );
      await context.dispose();
    });
  },
);
