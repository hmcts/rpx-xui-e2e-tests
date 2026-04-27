import { expect, type Locator, Page } from "@playwright/test";

import { Base } from "../../base";

export class CaseListPage extends Base {
  readonly errorPageHeading = this.page.getByRole("heading", { name: /something went wrong/i });
  readonly serviceDownError = this.exuiBodyComponent.serviceDownError;
  readonly container = this.page.locator("exui-case-home");
  readonly caseListHeading = this.page.locator("main h1");
  readonly filtersContainer = this.page.locator(".search-block .hmcts-filter-layout__filter");
  readonly jurisdictionSelect = this.page.locator("#wb-jurisdiction");
  readonly caseTypeSelect = this.page.locator("#wb-case-type");
  readonly textField0Input = this.page.locator("#TextField0");
  readonly filterToggle = this.page.getByRole("button", { name: /show filter|hide filter/i });
  readonly quickSearchContainer = this.page.locator(".hmcts-primary-navigation__global-search");
  readonly quickSearchCaseReferenceInput = this.page.locator("#exuiCaseReferenceSearch");
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
    await this.selectOptionWhenReady(select, jurisdiction, "jurisdiction");
  }

  public async searchByCaseType(caseType: string): Promise<void> {
    const select = await this.resolveCaseTypeSelect();
    await this.selectOptionWhenReady(select, caseType, "case type");
  }

  public async searchByTextField0(textField0: string): Promise<void> {
    const input = await this.resolveTextField0Input();
    await input.fill(textField0);
  }

  public async applyFilters(): Promise<void> {
    await this.exuiCaseListComponent.filters.applyFilterBtn.click();
    try {
      await this.waitForUiIdleState({ timeoutMs: 60_000 });
    } catch {
      await this.waitForUiIdleStateLenient(60_000);
    }
  }

  async goto() {
    await this.exuiHeader.selectHeaderMenuItem("Case list");
    await this.waitForReady();
  }

  async navigateTo(options: { timeoutMs?: number; maxAttempts?: number } = {}) {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const maxAttempts = options.maxAttempts ?? 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.page.goto("/cases", { waitUntil: "domcontentloaded" });
        await this.waitForReady(timeoutMs);
        return;
      } catch (error) {
        if (attempt === maxAttempts || !this.isTransientCasesNavigationFailure(error)) {
          throw error;
        }

        await this.page.goto("about:blank").catch(() => undefined);
      }
    }
  }

  async waitForReady(timeoutMs = 30_000): Promise<void> {
    await this.page.waitForURL(/\/cases/i, { timeout: timeoutMs }).catch(() => undefined);
    await this.acceptAnalyticsCookies().catch(() => undefined);
    await this.waitForCasesShellReady(timeoutMs);
  }

  async getPaginationFinalItem(): Promise<string | undefined> {
    const items = (await this.pagination.locator("li").allTextContents()).map((i) => i.trim());
    return items.length > 0 ? items[items.length - 1] : undefined;
  }

  async hasCaseReference(caseReference: string): Promise<boolean> {
    const link = this.page.locator(`a:has-text("${caseReference}")`);
    return (await link.count()) > 0;
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

  private async assertCasesPageHealthy(context: string): Promise<void> {
    if (await this.errorPageHeading.isVisible().catch(() => false)) {
      throw new Error(`Cases page showed "Something went wrong" while ${context}.`);
    }
    if (await this.serviceDownError.isVisible().catch(() => false)) {
      throw new Error(`Cases page showed service down while ${context}.`);
    }
  }

  private async waitForCasesSpinnerToSettle(timeoutMs: number): Promise<void> {
    await this.page
      .waitForFunction(() => document.querySelectorAll("xuilib-loading-spinner").length === 0, undefined, {
        timeout: timeoutMs
      })
      .catch(() => undefined);
  }

  private isTransientCasesNavigationFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /Cases page shell did not become ready|Cases page showed service down|service-down|Gateway Timeout|Azure Front Door|OriginTimeout/i.test(
      message
    );
  }

  private async waitForCasesShellReady(timeoutMs: number): Promise<void> {
    const bootstrapTimeoutMs = Math.min(Math.max(timeoutMs, 45_000), 60_000);
    await this.acceptAnalyticsCookies().catch(() => undefined);
    await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await this.waitForCasesSpinnerToSettle(10_000);
    const bootstrapSignal = await Promise.any([
      this.caseListHeading.waitFor({ state: "visible", timeout: bootstrapTimeoutMs }).then(() => "heading"),
      this.quickSearchCaseReferenceInput
        .waitFor({ state: "visible", timeout: bootstrapTimeoutMs })
        .then(() => "quick-search"),
      this.quickSearchContainer
        .waitFor({ state: "visible", timeout: bootstrapTimeoutMs })
        .then(() => "quick-search-container"),
      this.filtersContainer.waitFor({ state: "visible", timeout: bootstrapTimeoutMs }).then(() => "filters"),
      this.container.waitFor({ state: "visible", timeout: bootstrapTimeoutMs }).then(() => "container"),
      this.errorPageHeading.waitFor({ state: "visible", timeout: bootstrapTimeoutMs }).then(() => "error-page"),
      this.serviceDownError.waitFor({ state: "visible", timeout: bootstrapTimeoutMs }).then(() => "service-down")
    ]).catch(async () => {
      await this.assertCasesPageHealthy("waiting for cases shell bootstrap");
      throw new Error(`Cases page shell did not become ready within ${bootstrapTimeoutMs}ms.`);
    });

    if (bootstrapSignal === "error-page" || bootstrapSignal === "service-down") {
      await this.assertCasesPageHealthy("waiting for cases shell bootstrap");
    }

    await this.waitForCasesSpinnerToSettle(10_000);
    await this.assertCasesPageHealthy("waiting for cases shell bootstrap");

    try {
      await Promise.any([
        this.quickSearchCaseReferenceInput.waitFor({ state: "visible", timeout: 10_000 }),
        this.quickSearchContainer.waitFor({ state: "visible", timeout: 10_000 }),
        this.filtersContainer.waitFor({ state: "visible", timeout: 10_000 }),
        this.container.waitFor({ state: "visible", timeout: 10_000 })
      ]);
    } catch {
      await this.waitForCasesSpinnerToSettle(5_000);
      await this.assertCasesPageHealthy("waiting for cases page stabilization");
      await this.container.waitFor({ state: "visible", timeout: 10_000 });
    }

    try {
      await this.waitForUiIdleState({ timeoutMs });
    } catch {
      await this.waitForUiIdleStateLenient(timeoutMs);
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
      await new Promise((resolve) => setTimeout(resolve, 250));
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

  private async selectOptionWhenReady(
    select: Locator,
    desired: string,
    label: string,
    timeoutMs = 120_000
  ): Promise<void> {
    const readOptions = async () => this.readSelectOptions(select);
    const normalized = desired.trim().toLowerCase();
    const matchOption = (options: Array<{ label: string; value: string }>) =>
      options.find(
        (option) =>
          option.value.trim().toLowerCase() === normalized ||
          option.label.trim().toLowerCase() === normalized
      );
    const options = this.filterSelectableOptions(await readOptions());
    const hasOption = matchOption(options);
    if (!hasOption) {
      await expect
        .poll(async () => {
          const current = this.filterSelectableOptions(await readOptions());
          return Boolean(matchOption(current));
        }, { timeout: timeoutMs })
        .toBe(true);
    }
    const resolved = matchOption(this.filterSelectableOptions(await readOptions()));
    if (!resolved) {
      const available = (await readOptions())
        .map((option) => `${option.label || "(blank)"}${option.value ? ` [${option.value}]` : ""}`)
        .join(", ");
      throw new Error(`Case list: option "${desired}" not available for ${label}. Available options: ${available || "none"}`);
    }
    if (resolved.value) {
      await select.selectOption({ value: resolved.value });
    } else {
      await select.selectOption({ label: resolved.label });
    }
  }

  private async readSelectOptions(select: Locator): Promise<Array<{ label: string; value: string }>> {
    return select.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => {
        const label = (node.textContent ?? "").trim();
        const value = node.getAttribute("value") ?? "";
        return { label, value };
      })
    );
  }

  private filterSelectableOptions(options: Array<{ label: string; value: string }>): Array<{ label: string; value: string }> {
    return options.filter((option) => {
      const label = option.label.toLowerCase();
      return !(label.includes("select a value") && !option.value);
    });
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
