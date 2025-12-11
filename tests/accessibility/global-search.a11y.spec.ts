import { expect, type Page } from "@playwright/test";

import { test } from "../../fixtures/test";

const CASE_OFFICER = "IAC_CaseOfficer_R2";
const isA11yBlocking = process.env.A11Y_BLOCKING === "1";

test.describe("@a11y @search Global search accessibility", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs(CASE_OFFICER);
  });

  test("Search cases screen passes axe scan", async ({ page, config, axeUtils }) => {
    await openSearchCases(page, config.urls.manageCaseBaseUrl);
    await expect(page.getByRole("heading", { name: "Search cases" })).toBeVisible();
    await expect(page.getByLabel("16-digit case reference", { exact: true })).toBeVisible();
    if (isA11yBlocking) {
      await axeUtils.audit();
    }
  });
});

async function openSearchCases(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/search`);
  const heading = page.getByRole("heading", { name: "Search cases" });
  await expect(heading).toBeVisible({ timeout: 30_000 });
}
