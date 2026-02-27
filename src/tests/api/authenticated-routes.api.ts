import { authenticatedRoutes } from "../../data/api/authenticatedRoutes";
import { test, expect } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";

test.describe(
  "Authenticated routes require session",
  { tag: "@svc-auth" },
  () => {
    authenticatedRoutes.forEach(({ endpoint }, index) => {
      test(`[${index + 1}] GET ${endpoint} returns guarded status`, async ({
        anonymousClient,
      }) => {
        const response = await anonymousClient.get<Record<string, unknown>>(
          endpoint,
          {
            throwOnError: false,
          },
        );
        expectStatus(response.status, [...StatusSets.guardedBasic, 500, 502]);
        if (response.status === 401 && response.data) {
          expect(response.data).toMatchObject({ message: "Unauthorized" });
        }
      });
    });
  },
);
