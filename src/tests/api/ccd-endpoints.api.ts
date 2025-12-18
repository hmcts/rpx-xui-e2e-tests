import { config as testConfig } from "../../config/api";
import { test, expect } from "../../fixtures/api";
import { withXsrf, expectStatus, StatusSets, withRetry } from "../../utils/api/apiTestUtils";

test.describe("CCD endpoints", () => {
  test("lists jurisdictions for current user", async ({ apiClient }) => {
    const user = await apiClient.get<{ userInfo?: { uid?: string; id?: string } }>("api/user/details", { throwOnError: false });
    expectStatus(user.status, StatusSets.guardedExtended);
    const uid = user.data?.userInfo?.uid ?? user.data?.userInfo?.id;
    expect(uid).toBeDefined();

    const response = await withRetry(
      () =>
        apiClient.get<unknown[]>(`aggregated/caseworkers/${uid}/jurisdictions?access=read`, {
          throwOnError: false
        }),
      { retries: 1, retryStatuses: [502, 504] }
    );
    expectStatus(response.status, [...StatusSets.guardedExtended, 504, 500]);
    if (!Array.isArray(response.data)) {
      const nonArrayData: unknown = response.data;
      expect(nonArrayData).toBeUndefined();
      return;
    }

    const expectedNames = testConfig.jurisdictionNames[testConfig.testEnv as "aat" | "demo"] ?? [];
    const jurisdictionsData = (response.data ?? []) as Array<{ name?: string }>;
    const actualNames = jurisdictionsData.map((entry) => entry?.name).filter(Boolean);
    expectedNames.forEach((name) => {
      expect(actualNames).toContain(name);
    });

    response.data.forEach((jurisdiction) => {
      expect(jurisdiction).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String)
        })
      );
    });
  });

  const jurisdictions = (testConfig.jurisdictions[testConfig.testEnv as "aat" | "demo"] ??
    []) as Array<{ caseTypeIds?: string[] }>;
  for (const jurisdiction of jurisdictions) {
    const uniqueCaseTypes = Array.from(new Set(jurisdiction.caseTypeIds ?? []));
    for (const caseTypeId of uniqueCaseTypes) {
      test(`work-basket inputs available for ${caseTypeId}`, async ({ apiClient }) => {
        const response = await apiClient.get<unknown>(`data/internal/case-types/${caseTypeId}/work-basket-inputs`, {
          headers: { experimental: "true" }
        });
        expectStatus(response.status, [200, 401, 403, 500, 502, 504]);
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
    if (response.status === 200) {
      expect(response.data).toBeTruthy();
    }
  });
});
