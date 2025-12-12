import { expect } from "@playwright/test";
import { hasApiAuth } from "../../utils/api/auth.js";
import { test } from "../../fixtures/index.js";

test.describe("API authentication", () => {
  test("@api @smoke should confirm authenticated status", async ({ apiContext }) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(!hasApiAuth(), "API auth env vars not configured (API_BEARER_TOKEN or API_USERNAME/API_PASSWORD/IDAM vars).");
    const response = await apiContext.get("/auth/isAuthenticated", { failOnStatusCode: false });
    expect(response.status()).toBeLessThan(400);
    const bodyText = await response.text();
    expect(bodyText.toLowerCase()).toContain("true");
  });
});
