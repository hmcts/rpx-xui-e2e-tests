import { expect, test } from "../../fixtures/index.js";

test.describe("API health", () => {
  test("@api @smoke should return healthy status", async ({ apiContext }) => {
    const response = await apiContext.get("/health");
    expect(response.ok()).toBeTruthy();
  });
});
