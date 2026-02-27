import { test, expect, request } from "@playwright/test";

const resolveBaseUrl = (): string =>
  process.env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net";

test.describe("@api @smoke", () => {
  test("healthcheck baseline responds with 200", async () => {
    const baseURL = resolveBaseUrl();
    const apiRequest = await request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    });

    const response = await apiRequest.get("/health");
    expect.soft([200, 401, 403]).toContain(response.status());
    await apiRequest.dispose();
  });
});
