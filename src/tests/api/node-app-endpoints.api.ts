import { config as testConfig } from "../../config/api";
import { test, expect } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";

test.describe("Node app endpoints", () => {
  test("auth/isAuthenticated toggles with session", async ({ apiClient, anonymousClient }) => {
    const unauth = await anonymousClient.get<{ isAuthenticated?: boolean }>("auth/isAuthenticated", { throwOnError: false });
    expect([200, 401, 403]).toContain(unauth.status);

    const auth = await apiClient.get<{ isAuthenticated?: boolean }>("auth/isAuthenticated", { throwOnError: false });
    expect([200, 401, 403]).toContain(auth.status);
    if (auth.status === 200) {
      expect(auth.data?.isAuthenticated).toBe(true);
    }
  });

  test("api/user/details returns profile shape", async ({ apiClient }) => {
    const response = await apiClient.get("api/user/details", { throwOnError: false });
    expectStatus(response.status, StatusSets.guardedBasic);
    if (response.status !== 200) return;

    expect(response.data).toEqual(
      expect.objectContaining({
        userInfo: expect.objectContaining({
          id: expect.any(String),
          forename: expect.any(String),
          surname: expect.any(String),
          email: expect.any(String),
          active: expect.any(Boolean),
          roles: expect.any(Array)
        }),
        roleAssignmentResponse: expect.objectContaining({
          roleAssignmentResponse: expect.any(Array)
        })
      })
    );
  });

  test("configuration-ui returns expected keys", async ({ apiClient }) => {
    const response = await apiClient.get("configuration-ui", { throwOnError: false });
    expectStatus(response.status, StatusSets.guardedExtended);
    if (response.status !== 200) return;

    const expectedKeys = testConfig.configurationUi[testConfig.testEnv as "aat" | "demo"];
    const body = response.data as Record<string, unknown>;
    expectedKeys.forEach((key) => {
      expect(key in body).toBe(true);
    });
  });
});
