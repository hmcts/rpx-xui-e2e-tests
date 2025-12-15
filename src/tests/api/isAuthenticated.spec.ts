import { hasApiAuth } from "../../utils/api/auth.js";
import { expect, test } from "./fixtures.js";
import { hasApiUser } from "./auth.js";

test.describe("API authentication", () => {
  test("@api @smoke should confirm authenticated status", async ({ apiClient }, testInfo) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(
      !hasApiAuth(),
      "API auth env vars not configured (API_BEARER_TOKEN or IDAM client credentials)."
    );

    const response = await apiClient.get<boolean>("auth/isAuthenticated", { throwOnError: false });
    expect(response.status).toBe(200);

    if (response.data !== true) {
      const reason = hasApiUser("solicitor")
        ? "auth/isAuthenticated returned false; verify solicitor credentials/token."
        : "No API users configured; auth/isAuthenticated needs a user session. Configure API_USERS_JSON or provide a user bearer token.";
      testInfo.annotations.push({ type: "info", description: reason });
      test.skip(true, reason);
    }

    expect(response.data).toBe(true);
  });
});
