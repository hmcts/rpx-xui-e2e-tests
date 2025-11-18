import { expect, type Page } from "@playwright/test";

import { test } from "../../fixtures/test";

const CASE_WORKER = "IAC_CaseOfficer_R2";

test.describe("@performance Manage Case dashboard lighthouse", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs(CASE_WORKER);
  });

  test("Dashboard view meets baseline lighthouse scores", async ({ lighthousePage, lighthouseUtils, config }) => {
    await gotoDashboard(lighthousePage, config.urls.manageCaseBaseUrl);
    await lighthouseUtils.audit({ performance: 40, accessibility: 80, "best-practices": 80 });
  });
});

async function gotoDashboard(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl);
  await expect(page.getByRole("link", { name: "Case list" })).toBeVisible();
}
