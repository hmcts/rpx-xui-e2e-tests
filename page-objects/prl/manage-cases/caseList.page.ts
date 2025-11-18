import { expect, type Locator, type Page } from "@playwright/test";

import { prlConfig } from "../../../config";

export class PrlCaseListPage {
  private readonly page: Page;
  private readonly caseLinks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.caseLinks = page.locator(
      'a[aria-label^="go to case with Case reference:"]',
    );
  }

  async goto(): Promise<void> {
    await this.page.goto(`${prlConfig.manageCasesBaseUrl}/cases/case-list`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async showAllCases(): Promise<void> {
    const resetFilterButton = this.page.getByTitle(/reset filter/i).first();
    if ((await resetFilterButton.count()) > 0) {
      await resetFilterButton.click();
      await this.waitForSpinner();
    }

    const allCasesRadio = this.page.getByRole("radio", { name: /all cases/i });
    if ((await allCasesRadio.count()) > 0) {
      await allCasesRadio.first().check({ force: true });
    }

    for (const label of ["Day", "Month", "Year"]) {
      const inputs = this.page.getByLabel(label, { exact: true });
      const count = await inputs.count();
      for (let i = 0; i < count; i += 1) {
        await inputs.nth(i).fill("");
      }
    }

    const applyButton = this.page.getByRole("button", { name: /apply/i });
    if ((await applyButton.count()) > 0) {
      await applyButton.first().click();
      await this.waitForSpinner();
    }
  }

  async expectFiltersVisible(): Promise<void> {
    await expect(this.page.getByRole("heading", { name: /case list/i })).toBeVisible();
    await expect(this.page.getByRole("button", { name: /hide filter/i })).toBeVisible();
  }

  async expectResults(): Promise<void> {
    await expect(this.caseLinks.first()).toBeVisible({ timeout: 15_000 });
  }

  private async waitForSpinner(): Promise<void> {
    const spinner = this.page.locator("xuilib-loading-spinner");
    await expect
      .poll(async () => await spinner.count(), { timeout: 30_000 })
      .toBe(0);
  }
}
