import { expect, type Locator, type Page } from "@playwright/test";

import { Base } from "../../base";

import {
  CCD_CASE_REFERENCE_LENGTH,
  CCD_CASE_REFERENCE_PATTERN,
  EXUI_TIMEOUTS
} from "./exui-timeouts";

export class CaseSearchPage extends Base {
  private static readonly QUICK_SEARCH_OUTCOME_PROBE_MS = 10_000;

  readonly pageHeading = this.page.locator("main h1");
  readonly findCaseLinkOnMenu = this.page
    .locator('.hmcts-primary-navigation__nav .hmcts-primary-navigation__link[href*="case-search"]')
    .first();
  readonly findCaseLinkOnTopRight = this.page
    .locator('.hmcts-primary-navigation__search .hmcts-primary-navigation__link[href*="case-search"]')
    .first();
  readonly quickSearchContainer = this.page.locator(".hmcts-primary-navigation__global-search");
  readonly quickSearchContainerFallback = this.page.locator("li:has(#exuiCaseReferenceSearch)").first();
  readonly caseIdTextBox = this.page.locator("#exuiCaseReferenceSearch");
  readonly searchCaseFindButton = this.quickSearchContainer.getByRole("button", {
    name: "Find",
    exact: true
  });
  readonly searchCaseFindButtonFallback = this.quickSearchContainerFallback.getByRole("button", {
    name: "Find",
    exact: true
  });
  readonly noResultsHeading = this.page.locator("exui-no-results .govuk-heading-xl");
  readonly noResultsContainer = this.page.locator("exui-no-results");
  readonly backLink = this.page.locator("exui-no-results .govuk-back-link");
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
  readonly searchResultsSummary = this.page.locator("#search-result .pagination-top");

  constructor(page: Page) {
    super(page);
  }

  async searchWith16DigitCaseId(caseId: string): Promise<void> {
    if (!CCD_CASE_REFERENCE_PATTERN.test(caseId)) {
      throw new Error(
        `Expected ${CCD_CASE_REFERENCE_LENGTH}-digit case reference, received "${caseId}"`
      );
    }

    await this.caseIdTextBox.waitFor({
      state: "visible",
      timeout: EXUI_TIMEOUTS.SEARCH_FIELD_VISIBLE
    });
    await this.caseIdTextBox.click();
    await this.caseIdTextBox.fill(caseId);
    const primaryFindButtonVisible = await this.searchCaseFindButton.isVisible().catch(() => false);
    const findButton = primaryFindButtonVisible
      ? this.searchCaseFindButton
      : this.searchCaseFindButtonFallback;
    await findButton.waitFor({
      state: "visible",
      timeout: EXUI_TIMEOUTS.SEARCH_BUTTON_VISIBLE
    });
    await findButton.scrollIntoViewIfNeeded();

    try {
      await findButton.click({ timeout: EXUI_TIMEOUTS.SEARCH_BUTTON_CLICK });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      if (!errorMessage.includes("intercepts pointer events")) {
        throw error;
      }
      await this.caseIdTextBox.press("Enter");
    }

    await this.waitForPostSearchSpinnerCycle();
    const immediateOutcomeReached = await this.waitForImmediateSearchOutcome(
      CaseSearchPage.QUICK_SEARCH_OUTCOME_PROBE_MS
    );
    if (!immediateOutcomeReached && (await this.shouldRetrySearchSubmit(caseId))) {
      await this.caseIdTextBox.press("Enter");
      await this.waitForPostSearchSpinnerCycle();
    }
  }

  async goto(): Promise<void> {
    await this.openFromMainMenu();
  }

  async openFromMainMenu(): Promise<void> {
    await this.openFindCaseVia(this.findCaseLinkOnMenu);
  }

  async openFromTopRight(): Promise<void> {
    await this.openFindCaseVia(this.findCaseLinkOnTopRight);
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

  async startFindCaseJourney(
    caseReference: string,
    caseTypeLabel: string,
    jurisdictionLabel: string
  ): Promise<void> {
    await this.goto();
    await this.waitForReady();
    await this.ensureFiltersVisible();
    await this.selectJurisdiction(jurisdictionLabel);
    await this.selectCaseType(caseTypeLabel);
    await this.waitForDynamicFilters();
    await this.fillCcdNumber(caseReference);
    await this.applyFilters();
  }

  async openFirstResult(): Promise<void> {
    await this.resultsTable.waitFor({ state: "visible", timeout: 20_000 });
    await this.resultLinks.first().waitFor({ state: "visible", timeout: 20_000 });
    await this.resultLinks.first().click();
  }

  async openCaseDetailsFor(caseReference: string): Promise<void> {
    const normalizedCaseReference = caseReference.replace(/\D/g, "");
    if (!CCD_CASE_REFERENCE_PATTERN.test(normalizedCaseReference)) {
      throw new Error(
        `Expected ${CCD_CASE_REFERENCE_LENGTH}-digit case reference, received "${caseReference}"`
      );
    }

    const caseLink = this.page
      .locator(`ccd-search-result a.govuk-link[href*="/cases/case-details/"][href*="${normalizedCaseReference}"]`)
      .first();
    await caseLink.waitFor({ state: "visible", timeout: EXUI_TIMEOUTS.CASE_DETAILS_NAVIGATION });
    await caseLink.click();
  }

  private async waitForPostSearchSpinnerCycle(): Promise<void> {
    const spinner = this.page.locator("xuilib-loading-spinner").first();

    try {
      await spinner.waitFor({ state: "visible", timeout: EXUI_TIMEOUTS.SPINNER_APPEAR_BRIEF });
      await spinner.waitFor({
        state: "hidden",
        timeout: EXUI_TIMEOUTS.SEARCH_SPINNER_RESULT_HIDDEN
      });
    } catch {
      return;
    }
  }

  private async waitForImmediateSearchOutcome(timeoutMs: number): Promise<boolean> {
    const urlBeforeSubmit = this.page.url();

    return Promise.any([
      this.page
        .waitForURL((url) => url.toString() !== urlBeforeSubmit, { timeout: timeoutMs })
        .then(() => true),
      this.noResultsContainer.waitFor({ state: "visible", timeout: timeoutMs }).then(() => true)
    ]).catch(() => false);
  }

  private async shouldRetrySearchSubmit(caseId: string): Promise<boolean> {
    const currentUrl = this.page.url();
    if (!/\/cases(?:[/?#]|$)/.test(currentUrl)) {
      return false;
    }

    if (await this.noResultsContainer.isVisible().catch(() => false)) {
      return false;
    }

    const inputVisible = await this.caseIdTextBox.isVisible().catch(() => false);
    if (!inputVisible) {
      return false;
    }

    const currentValue = await this.caseIdTextBox.inputValue().catch(() => "");
    return currentValue === caseId;
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

  private async openFindCaseVia(link: Locator): Promise<void> {
    await link.waitFor({ state: "visible", timeout: EXUI_TIMEOUTS.SEARCH_FIELD_VISIBLE });
    await Promise.all([
      this.page.waitForURL(/\/cases\/case-search/, { timeout: EXUI_TIMEOUTS.GLOBAL_SEARCH_NAVIGATION }),
      link.click()
    ]);
    await this.waitForReady(EXUI_TIMEOUTS.SEARCH_FIELD_VISIBLE);
  }
}
