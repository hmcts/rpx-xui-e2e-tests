import type { ApiResponsePayload } from "@hmcts/playwright-common";

import { config as testConfig } from "./config.ts";
import { test, expect } from "./fixtures.ts";
import { withXsrf, expectStatus, StatusSets, withRetry } from "./utils/apiTestUtils.ts";

test.describe("@api ccd endpoints", () => {
  test("lists jurisdictions for current user", async ({ apiClient }) => {
    const user = await apiClient.get<{ userInfo?: { uid?: string; id?: string } }>(
      "api/user/details",
      { throwOnError: false },
    );
    expectStatus(user.status, StatusSets.guardedExtended);
    const uid = user.data?.userInfo?.uid ?? user.data?.userInfo?.id;
    expect(uid).toBeDefined();

    const response = await withRetry<
      ApiResponsePayload<{ name?: string; id?: string; description?: string }[]>
    >(
      () =>
        apiClient.get<{ name?: string; id?: string; description?: string }[]>(
          `aggregated/caseworkers/${uid}/jurisdictions?access=read`,
          {
            throwOnError: false,
          },
        ),
      { retries: 1, retryStatuses: [502, 504] },
    );
    expectStatus(response.status, [...StatusSets.guardedExtended, 504, 500]);
    expect(Array.isArray(response.data)).toBe(true);
    if (!Array.isArray(response.data)) {
      return;
    }

    const expectedNames = (testConfig.jurisdcitionNames[testConfig.testEnv] ?? []) as string[];
    const actualNames = (response.data ?? [])
      .map((entry) => entry?.name)
      .filter((name): name is string => Boolean(name));
    expect(actualNames.length).toBeGreaterThan(0);
    const overlap = expectedNames.filter((name) => actualNames.includes(name));
    expect(overlap.length).toBeGreaterThan(0);

    response.data.forEach((jurisdiction) => {
      expect(jurisdiction).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
        }),
      );
    });
  });

  const jurisdictions = (testConfig.jurisdictions[testConfig.testEnv] ?? []) as {
    caseTypeIds?: string[];
  }[];
  for (const jurisdiction of jurisdictions) {
    const uniqueCaseTypes = Array.from(
      new Set((jurisdiction.caseTypeIds ?? []).filter((id): id is string => Boolean(id))),
    );
    for (const caseTypeId of uniqueCaseTypes) {
      if (!caseTypeId) {
        continue;
      }
      test(`work-basket inputs available for ${caseTypeId}`, async ({ apiClient }) => {
        const response = await apiClient.get<{ workbasketInputs?: unknown[] }>(
          `data/internal/case-types/${caseTypeId}/work-basket-inputs`,
          {
            headers: { experimental: "true" },
            throwOnError: false,
          },
        );
        expectStatus(response.status, [200, 401, 403, 404, 500, 502, 504]);
        if (response.status !== 200) {
          return;
        }
        const data = response.data;
        expect(data).toBeTruthy();
        expect(typeof data).toBe("object");
        expect(Array.isArray(data.workbasketInputs)).toBe(true);

        (data.workbasketInputs ?? []).forEach((input) => {
          expect(input).toEqual(
            expect.objectContaining({
              label: expect.any(String),
              field: expect.objectContaining({
                id: expect.any(String),
                field_type: expect.objectContaining({
                  id: expect.any(String),
                  type: expect.any(String),
                }),
              }),
            }),
          );
        });
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
              experimental: "true",
            },
            throwOnError: false,
          }),
        { retries: 1, retryStatuses: [502, 504] },
      ),
    );

    expectStatus(response.status, [200, 500, 502, 504]);
    if (response.status === 200) {
      expect(response.data).toBeTruthy();
    }
  });
});
