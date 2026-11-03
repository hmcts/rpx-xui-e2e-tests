import { createRequire } from "node:module";

// Explicit environment diagnostic only; no candidate or release credit.
import {
  EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
} from "../../../data/exui-central-assurance.js";
import { test, expect } from "../../../fixtures/api.js";
import {
  attachMutationEvidence,
  expectCentralMustRunFamiliesPresent,
  mutateStringArrayForDemo,
} from "../../../harness/diagnostics/central-assurance.utils.js";

const require = createRequire(import.meta.url);
const { readAatProfile, compareAatFamilies } =
  require("../../../../scripts/lib/exui-aat-profile.cjs") as {
    readAatProfile: () => unknown;
    compareAatFamilies: (
      key:
        | "globalSearchServices"
        | "waSupportedJurisdictions"
        | "staffSupportedJurisdictions",
      actual: string[],
    ) => { matches: boolean };
  };
if (process.env.TEST_ENV === "aat") readAatProfile();

type GlobalSearchService = { serviceId: string; serviceName: string };

const CONFIGURATION_UI_KEYS = [
  "clientId",
  "headerConfig",
  "idamWeb",
  "oAuthCallback",
  "protocol",
  "ccdGatewayUrl",
  "accessManagementEnabled",
  "waWorkflowApi",
] as const;

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

function expectGlobalSearchServicesOnSuccess(response: {
  status: number;
  data: unknown;
}): GlobalSearchService[] {
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

function expectExactContractStatus(status: number, endpoint: string): void {
  expect(
    status,
    `${endpoint} should be reachable for the exact assurance harness proof`,
  ).toBe(200);
}

test.describe("Harness environment configuration diagnostics", () => {
  test("external UI configuration exposes the expected EXUI keys", async ({
    anonymousClient,
  }) => {
    const response =
      await anonymousClient.get<Record<string, unknown>>("external/config/ui");
    expect(response.status).toBe(200);
    for (const key of CONFIGURATION_UI_KEYS) {
      expect(
        response.data,
        `external/config/ui should expose ${key}`,
      ).toHaveProperty(key);
    }
  });

  test("api/configuration exposes selected feature flag values", async ({
    apiClient,
  }) => {
    const response = await apiClient.get<unknown>(
      "api/configuration?configurationKey=termsAndConditionsEnabled",
      {
        throwOnError: false,
      },
    );
    expectExactContractStatus(
      response.status,
      "api/configuration?configurationKey=termsAndConditionsEnabled",
    );
    expect(["boolean", "string"]).toContain(typeof response.data);
  });

  test("api/globalSearch/services contains the central must-run service-family set", async ({
    apiClient,
  }) => {
    const response = await apiClient.get<GlobalSearchService[]>(
      "api/globalSearch/services",
      { throwOnError: false },
    );
    expectExactContractStatus(response.status, "api/globalSearch/services");
    const services = expectGlobalSearchServicesOnSuccess({
      status: response.status,
      data: response.data,
    });
    if (process.env.TEST_ENV === "aat") {
      expect(
        compareAatFamilies(
          "globalSearchServices",
          services.map((entry) => entry.serviceId),
        ).matches,
        "api/globalSearch/services differs from reviewed AAT service-family profile",
      ).toBe(true);
    } else {
      expectCentralMustRunFamiliesPresent(
        services.map((entry) => entry.serviceId),
        EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
        "api/globalSearch/services",
      );
    }
    for (const service of services) {
      expect(service.serviceName.trim().length).toBeGreaterThan(0);
    }
  });

  test("api/wa-supported-jurisdiction/get contains the central WA must-run family set", async ({
    apiClient,
  }, testInfo) => {
    const response = await apiClient.get<string[]>(
      "api/wa-supported-jurisdiction/get",
      { throwOnError: false },
    );
    expectExactContractStatus(
      response.status,
      "api/wa-supported-jurisdiction/get",
    );
    const actual = expectStringArrayOnSuccess(
      {
        status: response.status,
        data: response.data,
      },
      "api/wa-supported-jurisdiction/get",
    );
    await attachMutationEvidence(testInfo);

    if (process.env.TEST_ENV === "aat") {
      expect(
        compareAatFamilies(
          "waSupportedJurisdictions",
          mutateStringArrayForDemo(actual, "api/wa-supported-jurisdiction/get"),
        ).matches,
        "api/wa-supported-jurisdiction/get differs from reviewed AAT service-family profile",
      ).toBe(true);
    } else {
      expectCentralMustRunFamiliesPresent(
        mutateStringArrayForDemo(actual, "api/wa-supported-jurisdiction/get"),
        EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
        "api/wa-supported-jurisdiction/get",
      );
    }
  });

  test("api/staff-supported-jurisdiction/get contains the central staff-supported must-run family set", async ({
    apiClient,
  }) => {
    const response = await apiClient.get<string[]>(
      "api/staff-supported-jurisdiction/get",
      { throwOnError: false },
    );
    expectExactContractStatus(
      response.status,
      "api/staff-supported-jurisdiction/get",
    );
    const actual = expectStringArrayOnSuccess(
      {
        status: response.status,
        data: response.data,
      },
      "api/staff-supported-jurisdiction/get",
    );
    if (process.env.TEST_ENV === "aat") {
      expect(
        compareAatFamilies(
          "staffSupportedJurisdictions",
          mutateStringArrayForDemo(
            actual,
            "api/staff-supported-jurisdiction/get",
          ),
        ).matches,
        "api/staff-supported-jurisdiction/get differs from reviewed AAT service-family profile",
      ).toBe(true);
    } else {
      expectCentralMustRunFamiliesPresent(
        mutateStringArrayForDemo(
          actual,
          "api/staff-supported-jurisdiction/get",
        ),
        EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
        "api/staff-supported-jurisdiction/get",
      );
    }
  });
});
