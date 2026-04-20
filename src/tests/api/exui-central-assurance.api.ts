import {
  request,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

import {
  buildGlobalSearchServicesCatalog,
  EXUI_CANARY_SERVICE_FAMILIES,
  EXUI_CENTRAL_ASSURANCE_MVP_SCENARIOS,
  EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES,
  EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
  EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
  sortServiceFamilies,
} from "../../data/exui-central-assurance";
import { expect, test } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";
import { config } from "../../utils/ui/apiTestConfig";
import { loadSessionCookies } from "../../utils/ui/sessionCapture";
import { isUiHostUnavailableStatus } from "../../utils/ui/uiHostAvailability";

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function expectExactFamilySet(
  actual: readonly string[],
  expected: readonly string[],
): void {
  expect(sortedUnique(actual)).toEqual(sortServiceFamilies(expected));
}

function assertExactFamilySetWhenAvailable(
  response: { status: number; data: unknown },
  expected: readonly string[],
): void {
  if (response.status !== 200 || !Array.isArray(response.data)) {
    return;
  }

  expectExactFamilySet(response.data as string[], expected);
  expect(response.data).not.toEqual(
    expect.arrayContaining([...EXUI_CANARY_SERVICE_FAMILIES]),
  );
}

function assertGlobalSearchFamilySetWhenAvailable(
  response: {
    status: number;
    data: unknown;
  },
): void {
  if (response.status !== 200 || !Array.isArray(response.data)) {
    return;
  }

  const serviceIds = (response.data as Array<{ serviceId: string }>).map(
    (entry) => entry.serviceId,
  );
  expectExactFamilySet(serviceIds, EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES);
  expect(serviceIds).not.toEqual(
    expect.arrayContaining([...EXUI_CANARY_SERVICE_FAMILIES]),
  );
}

async function createUiSessionApiContext(): Promise<APIRequestContext> {
  const baseURL = config.baseUrl.replace(/\/+$/, "");
  try {
    const session = loadSessionCookies("FPL_GLOBAL_SEARCH");
    return request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      storageState: { cookies: session.cookies, origins: [] },
    });
  } catch {
    return request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });
  }
}

async function readJsonBody(response: APIResponse): Promise<unknown> {
  const contentType = response.headers()["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  return response.json().catch(() => undefined);
}

test.describe(
  "EXUI central assurance POC",
  { tag: ["@svc-global-search", "@svc-ref-data", "@svc-node-app"] },
  () => {
    test("catalogue and guard helpers keep must-run families and canaries separate", async () => {
      const globalSetupModule = await import("../../global/ui.global.setup");
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

      expect(
        globalSetupModule.__test__.shouldSkipUiGlobalSetup({
          PW_SKIP_UI_GLOBAL_SETUP: "1",
        } as NodeJS.ProcessEnv),
      ).toBe(true);
      expect(
        globalSetupModule.__test__.shouldSkipUiGlobalSetup({
          PW_SKIP_UI_GLOBAL_SETUP: undefined,
        } as NodeJS.ProcessEnv),
      ).toBe(false);

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
      const context = await createUiSessionApiContext();
      const response = await context.get("api/globalSearch/services", {
        failOnStatusCode: false,
      });
      const data = await readJsonBody(response);

      expectStatus(response.status(), StatusSets.guardedBasic);
      assertGlobalSearchFamilySetWhenAvailable({
        status: response.status(),
        data,
      });
      await context.dispose();
    });

    test("api/wa-supported-jurisdiction matches the central WA family list", async () => {
      const context = await createUiSessionApiContext();
      const response = await context.get("api/wa-supported-jurisdiction", {
        failOnStatusCode: false,
      });
      const data = await readJsonBody(response);

      expectStatus(response.status(), StatusSets.guardedBasic);
      assertExactFamilySetWhenAvailable(
        {
          status: response.status(),
          data,
        },
        EXUI_WA_SUPPORTED_SERVICE_FAMILIES,
      );
      await context.dispose();
    });

    test("api/staff-supported-jurisdiction keeps canaries outside the must-run set", async () => {
      const context = await createUiSessionApiContext();
      const response = await context.get("api/staff-supported-jurisdiction", {
        failOnStatusCode: false,
      });
      const data = await readJsonBody(response);

      expectStatus(response.status(), StatusSets.guardedBasic);
      assertExactFamilySetWhenAvailable(
        {
          status: response.status(),
          data,
        },
        EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES,
      );
      await context.dispose();
    });
  },
);
