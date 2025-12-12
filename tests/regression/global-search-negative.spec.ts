import { test, expect } from "../../fixtures/test";

const CASE_OFFICER = "IAC_CaseOfficer_R2";

test.describe("@regression @search Global search negative flows", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs(CASE_OFFICER);
  });

  test("Non-existent case id shows error message", async ({ page }) => {
    await page.getByRole("link", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: "Search cases" })).toBeVisible();

    const fakeCaseId = `999${Date.now()}`.slice(0, 16);
    await page.getByLabel("16-digit case reference", { exact: true }).fill(fakeCaseId);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("text=/No results found|Something went wrong/")).toBeVisible();
  });
});
