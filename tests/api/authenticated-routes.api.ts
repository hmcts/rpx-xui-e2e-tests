import { endpoints } from "./data/authenticatedRoutes.ts";
import { test, expect } from "./fixtures.ts";
import { expectStatus, StatusSets } from "./utils/apiTestUtils.ts";

test.describe("@api authenticated routes require session", () => {
  endpoints.forEach(({ endpoint }, index) => {
    test(`[${index + 1}] GET ${endpoint} returns guarded status`, async ({ anonymousClient }) => {
      const response = await anonymousClient.get<Record<string, unknown>>(endpoint, {
        throwOnError: false,
      });
      expectStatus(response.status, [...StatusSets.guardedBasic, 500, 502]);
      if (response.status === 401 && response.data) {
        expect(response.data).toMatchObject({ message: "Unauthorized" });
      }
    });
  });
});
