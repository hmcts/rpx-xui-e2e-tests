import type { Locator, Page } from "@playwright/test";

import { Base } from "../../base";

export class CaseListPage extends Base {
  readonly container = this.page.locator("exui-case-home");
  readonly jurisdictionSelect = this.page.locator("#wb-jurisdiction");
  readonly caseTypeSelect = this.page.locator("#wb-case-type");
  readonly textField0Input = this.page.locator("#TextField0");
  readonly filterToggle = this.page.getByRole("button", { name: /show filter|hide filter/i });
  readonly caseListResultsAmount = this.page.locator("#search-result .pagination-top");
  readonly caseSearchResultsMessage = this.page.locator("#search-result");
  readonly pagination = this.page.locator(".ngx-pagination");

  constructor(page: Page) {
    super(page);
  }

  async openCaseByReference(cleanedCaseNumber: string): Promise<void> {
    const caseLink = this.page.locator(`a:has-text("${cleanedCaseNumber}")`);
    await caseLink.first().waitFor({ state: "visible" });
    await caseLink.first().click();
  }

  public async searchByJurisdiction(jurisdiction: string): Promise<void> {
    const select = await this.resolveJurisdictionSelect();
    await select.selectOption(jurisdiction);
  }

  public async searchByCaseType(caseType: string): Promise<void> {
    const select = await this.resolveCaseTypeSelect();
    await select.selectOption(caseType);
  }

  public async searchByTextField0(textField0: string): Promise<void> {
    const input = await this.resolveTextField0Input();
    await input.fill(textField0);
  }

  public async applyFilters(): Promise<void> {
    await this.exuiCaseListComponent.filters.applyFilterBtn.click();
    await this.waitForUiIdleState();
  }

  async goto() {
    await this.exuiHeader.selectHeaderMenuItem("Case list");
    await this.waitForReady();
  }

  async navigateTo() {
    await this.page.goto("/cases", { waitUntil: "domcontentloaded" });
    await this.waitForReady();
  }

  async waitForReady(timeoutMs = 30_000): Promise<void> {
    await this.page.waitForURL(/\/cases/i, { timeout: timeoutMs });
    await this.container.waitFor({ state: "visible", timeout: timeoutMs });
    await this.waitForUiIdleState({ timeoutMs });
  }

  async getPaginationFinalItem(): Promise<string | undefined> {
    const items = (await this.pagination.locator("li").allTextContents()).map((i) => i.trim());
    return items.length > 0 ? items[items.length - 1] : undefined;
  }

  private async ensureFiltersVisible(timeoutMs = 30_000): Promise<void> {
    if (!(await this.filterToggle.isVisible().catch(() => false))) {
      return;
    }
    const label = (await this.filterToggle.textContent().catch(() => ""))?.toLowerCase();
    if (label?.includes("show")) {
      await this.filterToggle.click();
      await this.filterToggle.waitFor({ state: "visible", timeout: timeoutMs }).catch(() => {
        // If the toggle disappears, continue and wait for inputs.
      });
    }
  }

  private async waitForFirstVisible(
    candidates: Array<{ locator: Locator; label: string }>,
    timeoutMs = 60_000
  ) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const candidate of candidates) {
        if (await candidate.locator.first().isVisible().catch(() => false)) {
          return candidate.locator.first();
        }
      }
      await this.page.waitForTimeout(250);
    }
    const labels = candidates.map((candidate) => candidate.label).join(", ");
    throw new Error(`Case list filters not visible after ${timeoutMs}ms (tried: ${labels}).`);
  }

  private async resolveJurisdictionSelect(timeoutMs = 60_000) {
    await this.ensureFiltersVisible(timeoutMs);
    return this.waitForFirstVisible(
      [
        { locator: this.page.locator("#wb-jurisdiction"), label: "#wb-jurisdiction" },
        { locator: this.page.getByLabel(/jurisdiction/i), label: "label:jurisdiction" },
        { locator: this.page.locator("select[name='jurisdiction']"), label: "select[name='jurisdiction']" },
        { locator: this.page.locator("select[formcontrolname='jurisdiction']"), label: "select[formcontrolname='jurisdiction']" }
      ],
      timeoutMs
    );
  }

  private async resolveCaseTypeSelect(timeoutMs = 60_000) {
    await this.ensureFiltersVisible(timeoutMs);
    return this.waitForFirstVisible(
      [
        { locator: this.page.locator("#wb-case-type"), label: "#wb-case-type" },
        { locator: this.page.getByLabel(/case type/i), label: "label:case type" },
        { locator: this.page.locator("select[name='caseType']"), label: "select[name='caseType']" },
        { locator: this.page.locator("select[formcontrolname='caseType']"), label: "select[formcontrolname='caseType']" }
      ],
      timeoutMs
    );
  }

  private async resolveTextField0Input(timeoutMs = 60_000) {
    await this.ensureFiltersVisible(timeoutMs);
    return this.waitForFirstVisible(
      [
        { locator: this.page.locator("#TextField0"), label: "#TextField0" },
        { locator: this.page.getByLabel(/text field 0/i), label: "label:text field 0" },
        { locator: this.page.locator("input[name='TextField0']"), label: "input[name='TextField0']" }
      ],
      timeoutMs
    );
  }
}
