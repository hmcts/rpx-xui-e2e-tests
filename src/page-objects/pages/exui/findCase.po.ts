import { type Locator, type Page } from "@playwright/test";

import { CaseSearchPage } from "./caseSearch.po.js";

export class FindCasePage extends CaseSearchPage {
  readonly resetFilterButton = this.page.locator('button[type="reset"]');
  readonly showHideFilterButton = this.filterToggle;
  readonly filtersContainer = this.filterContainer;
  readonly applyFilterButton = this.applyButton;
  readonly ccdCaseReference = this.ccdNumberInput;
  readonly pagination = this.page.locator(".ngx-pagination");
  readonly searchResultsContainer = this.page.locator("#search-result");
  readonly searchResultsTable = this.resultsTable;
  readonly firstRowOfSearchResultsTable = this.resultLinks.first();
  readonly workBasketFilterPanel = this.page.locator("ccd-search-filters-wrapper").first();

  constructor(page: Page) {
    super(page);
  }

  public async navigateToFindCase(): Promise<void> {
    await this.goto();
  }

  public async fillSearchCriteria(caseNumber: string, caseType: string, jurisdiction: string): Promise<void> {
    await this.selectJurisdiction(jurisdiction);
    await this.selectCaseType(caseType);
    await this.waitForDynamicFilters();
    await this.fillCcdNumber(caseNumber);
  }

  public async submitSearch(): Promise<void> {
    await this.applyFilters();
  }

  public async displayCaseDetailsFor(caseNumber: string): Promise<void> {
    await this.openCaseDetailsFor(caseNumber);
  }

  public async openFindCaseViaLocator(link: Locator): Promise<void> {
    await Promise.all([
      this.page.waitForURL(/\/cases\/case-search/),
      link.click()
    ]);
    await this.waitForReady();
  }
}
