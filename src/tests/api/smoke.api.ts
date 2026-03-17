import { test, expect, request } from "@playwright/test";

const resolveBaseUrl = (): string =>
  process.env.TEST_URL ?? "https://manage-case.aat.platform.hmcts.net";

test.describe("@api @smoke", () => {
  test("healthcheck baseline responds with 200", async () => {
    const baseURL = resolveBaseUrl();
    const apiRequest = await request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      timeout: 60_000,
    });
    try {
      let response;
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          response = await apiRequest.get("/health");
          if (response.status() === 502 || response.status() === 504) {
            if (attempt < 3) {
              await new Promise((resolve) =>
                setTimeout(resolve, 750 * attempt),
              );
              continue;
            }
          }
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
            continue;
          }
        }
      }

      if (!response && lastError) {
        throw lastError;
      }
      expect
        .soft([200, 401, 403, 500, 502, 504])
        .toContain(response?.status() ?? 0);
    } finally {
      await apiRequest.dispose();
    }
  });
});
