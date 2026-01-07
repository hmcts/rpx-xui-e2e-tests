import { expect, type Locator, type Page } from "@playwright/test";

import { Base } from "../../base";

export class CaseSearchPage extends Base {
  readonly container = this.page.locator("#content .search-block");
  readonly filterContainer = this.page.locator(
    "#content .search-block .hmcts-filter-layout__filter"
  );
  readonly filterToggle = this.page.getByRole("button", { name: /show filter|hide filter/i });
  readonly jurisdictionSelect = this.page.locator("#s-jurisdiction");
  readonly caseTypeSelect = this.page.locator("#s-case-type");
  readonly dynamicFilters = this.page.locator("#dynamicFilters");
  readonly ccdNumberInput = this.page.locator("#\\[CASE_REFERENCE\\]");
  readonly applyButton = this.page.locator('button[title="Apply filter"], button[aria-label="Apply filter"]');
  readonly resultsTable = this.page.locator("ccd-search-result");
  readonly resultLinks = this.page.locator("ccd-search-result .govuk-link");

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    const navFindCase = this.page
      .locator(".hmcts-primary-navigation__search")
      .getByRole("link", { name: /find case/i })
      .first();
    if (await navFindCase.isVisible().catch(() => false)) {
      await Promise.all([this.page.waitForLoadState("domcontentloaded"), navFindCase.click()]);
    } else {
      await this.exuiHeader.selectHeaderMenuItem("Find case");
    }
  }

  async waitForReady(timeoutMs = 30_000): Promise<void> {
    await this.page.getByRole("heading", { name: /search/i }).waitFor({ timeout: timeoutMs });
    await this.filterContainer.waitFor({ state: "visible", timeout: timeoutMs });
  }

  async ensureFiltersVisible(): Promise<void> {
    if (await this.filterToggle.isVisible().catch(() => false)) {
      const label = (await this.filterToggle.textContent().catch(() => ""))?.toLowerCase();
      if (label?.includes("show")) {
        await this.filterToggle.click();
      }
    }
  }

  async selectJurisdiction(value?: string): Promise<void> {
    if (!value) return;
    await this.jurisdictionSelect.waitFor({ state: "visible", timeout: 30_000 });
    await this.selectOptionByLabel(this.jurisdictionSelect, value);
    await this.waitForUiIdleStateLenient(30_000);
  }

  async selectCaseType(value?: string): Promise<void> {
    if (!value) return;
    await this.caseTypeSelect.waitFor({ state: "visible", timeout: 30_000 });
    await this.selectOptionByLabel(this.caseTypeSelect, value);
  }

  async waitForDynamicFilters(): Promise<void> {
    await this.dynamicFilters.waitFor({ state: "visible", timeout: 30_000 });
  }

  async fillCcdNumber(caseReference: string): Promise<void> {
    const normalizedRef = caseReference.replace(/\D/g, "");
    await this.ccdNumberInput.waitFor({ state: "visible", timeout: 30_000 });
    await this.ccdNumberInput.fill(normalizedRef || caseReference);
  }

  async applyFilters(): Promise<void> {
    if (await this.applyButton.first().isVisible().catch(() => false)) {
      await this.applyButton.first().click();
    }
    await this.waitForUiIdleStateLenient(45_000);
  }

  async openFirstResult(): Promise<void> {
    await this.resultsTable.waitFor({ state: "visible", timeout: 20_000 });
    await this.resultLinks.first().waitFor({ state: "visible", timeout: 20_000 });
    await this.resultLinks.first().click();
  }

  private async selectOptionByLabel(select: Locator, label: string): Promise<void> {
    const target = label.trim().toLowerCase();
    const options = await this.waitForOptions(select);
    const match = options.find((option) => option.toLowerCase().includes(target));
    if (!match) {
      throw new Error(`Search filter option "${label}" not found. Available: ${options.join(", ")}`);
    }
    await select.selectOption({ label: match });
  }

  private async waitForOptions(select: Locator, timeoutMs = 30_000): Promise<string[]> {
    await expect
      .poll(async () => {
        const options = await select.locator("option").evaluateAll((items) =>
          items.map((item) => (item.textContent ?? "").trim()).filter(Boolean)
        );
        return options.length;
      }, { timeout: timeoutMs })
      .toBeGreaterThan(0);

    return select.locator("option").evaluateAll((items) =>
      items.map((item) => (item.textContent ?? "").trim()).filter(Boolean)
    );
  }
}
