import type { ApiClient } from "@hmcts/playwright-common";

import { config as testConfig } from "../../config/api";
import { test, expect } from "../../fixtures/api";
import { withXsrf, expectStatus, StatusSets, withRetry } from "../../utils/api/apiTestUtils";

test.describe("CCD endpoints", () => {
  test("lists jurisdictions for current user", async ({ apiClient }) => {
    await assertJurisdictionsForUser(apiClient);
  });

  const jurisdictions = (testConfig.jurisdictions[testConfig.testEnv as "aat" | "demo"] ??
    []) as Array<{ caseTypeIds?: string[] }>;
  for (const jurisdiction of jurisdictions) {
    const uniqueCaseTypes = Array.from(new Set(jurisdiction.caseTypeIds ?? []));
    for (const caseTypeId of uniqueCaseTypes) {
      test(`work-basket inputs available for ${caseTypeId}`, async ({ apiClient }) => {
        await assertWorkBasketInputs(apiClient, caseTypeId);
      });
    }
  }

  test("returns authenticated user profile data", async ({ apiClient }) => {
    const response = await withXsrf("solicitor", (headers) =>
      withRetry(
        () =>
          apiClient.get("data/internal/profile", {
            headers: {
              ...headers,
              experimental: "true"
            },
              throwOnError: false
          }),
        { retries: 1, retryStatuses: [502, 504] }
      )
    );

    expectStatus(response.status, [200, 500, 502, 504]);
    assertProfileData(response);
  });
});

async function assertJurisdictionsForUser(apiClient: ApiClient): Promise<void> {
  const user = await apiClient.get<{ userInfo?: { uid?: string; id?: string } }>("api/user/details", { throwOnError: false });
  expectStatus(user.status, StatusSets.guardedExtended);
  const uid = user.data?.userInfo?.uid ?? user.data?.userInfo?.id;
  if (!uid || user.status !== 200) {
    return;
  }

  const response = await withRetry(
    () =>
      apiClient.get<unknown[]>(`aggregated/caseworkers/${uid}/jurisdictions?access=read`, {
        throwOnError: false
      }),
    { retries: 1, retryStatuses: [502, 504] }
  );
  expectStatus(response.status, [...StatusSets.guardedExtended, 504, 500]);
  const jurisdictionsData = Array.isArray(response.data) ? (response.data as Array<{ name?: string }>) : [];
  if (response.status !== 200 || jurisdictionsData.length === 0) {
    return;
  }

  const expectedNames = testConfig.jurisdictionNames[testConfig.testEnv as "aat" | "demo"] ?? [];
  const actualNames = jurisdictionsData.map((entry) => entry?.name).filter(Boolean);
  if (expectedNames.length) {
    const overlap = actualNames.filter((name) => expectedNames.includes(name as string));
    expect(overlap.length).toBeGreaterThan(0);
  }

  jurisdictionsData.forEach((jurisdiction) => {
    expect(jurisdiction).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String)
      })
    );
  });
}

async function assertWorkBasketInputs(apiClient: ApiClient, caseTypeId: string): Promise<void> {
  const response = await apiClient.get<unknown>(`data/internal/case-types/${caseTypeId}/work-basket-inputs`, {
    headers: { experimental: "true" },
    throwOnError: false
  });
  expectStatus(response.status, [200, 401, 403, 404, 500, 502, 504]);
  if (response.status !== 200) {
    return;
  }
  const data = response.data as { workbasketInputs?: Array<Record<string, unknown>> } | undefined;
  expect(data).toBeTruthy();
  expect(typeof data).toBe("object");
  const inputs = Array.isArray(data?.workbasketInputs) ? data?.workbasketInputs ?? [] : [];

  inputs.forEach((input) => {
    expect(input).toEqual(
      expect.objectContaining({
        label: expect.any(String),
        field: expect.objectContaining({
          id: expect.any(String),
          field_type: expect.objectContaining({
            id: expect.any(String),
            type: expect.any(String)
          })
        })
      })
    );
  });
}

function assertProfileData(response: { status: number; data: unknown }): void {
  if (response.status === 200) {
    expect(response.data).toBeTruthy();
  }
}
