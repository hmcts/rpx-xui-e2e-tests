import { Page } from "@playwright/test";

import { ValidatorUtils } from "../../../utils/ui/validator.utils.js";
import { Base } from "../../base";

const validatorUtils = new ValidatorUtils();
const MEDIA_VIEWER_ROUTE_PATTERN = /\/media-viewer(?:\?|$)/;

export class CaseDetailsPage extends Base {
  readonly container = this.page.locator("exui-case-details-home");
  readonly createCaseSuccessMessage = this.page.locator(".alert-message");
  readonly caseDetailsTabs = this.page.locator('div[role="tab"]');
  readonly caseActionsDropdown = this.page.locator("#next-step");
  readonly caseActionGoButton = this.page.locator(".event-trigger button");
  readonly caseSummaryHeading = this.page.locator("h2").filter({ hasText: "Case information" }).first();
  readonly submitCaseFlagButton = this.page.locator(".button[type=\"submit\"]");
  readonly continueButton = this.container.getByRole("button", { name: "Continue", exact: true });
  readonly submitButton = this.page.getByRole("button", { name: "Submit" });
  readonly caseFlagCommentBox = this.page.locator("#flagComments");
  readonly commonRadioButtons = this.page.locator(".govuk-radios__item");
  readonly caseAlertSuccessMessage = this.page
    .locator(".hmcts-banner--success .alert-message, .exui-alert .alert-message")
    .first();
  readonly caseNotificationBannerTitle = this.page.locator("#govuk-notification-banner-title");
  readonly caseNotificationBannerBody = this.page.locator(".govuk-notification-banner__heading");
  readonly caseViewerTable = this.page.getByRole("table", { name: "case viewer table" });
  readonly documentOneRow = this.caseViewerTable.getByRole("row", { name: /^Document 1\b/i }).first();
  readonly documentOneAction = this.documentOneRow.locator("a,button").first();
  readonly someMoreDataTable = this.page.locator("table.SomeMoreData");
  readonly historyTable = this.page.locator("table.EventLogTable");
  readonly historyDetailsTable = this.page.locator("table.EventLogDetails");
  readonly eventCreationErrorHeading = this.page.getByRole("heading", {
    name: "The event could not be created"
  });

  constructor(page: Page) {
    super(page);
  }

  async waitForReady(timeoutMs = 30_000): Promise<void> {
    await this.container.waitFor({ state: "visible", timeout: timeoutMs });
    await this.waitForUiIdleState({ timeoutMs });
  }

  async getTableByName(tableName: string) {
    return this.page.getByRole("table", { name: tableName, exact: true });
  }

  async getCaseNumberFromAlert(): Promise<string> {
    const alertText = await this.caseAlertSuccessMessage.innerText();
    const caseNumberMatch = alertText.match(validatorUtils.DIVORCE_CASE_NUMBER_REGEX);
    if (!caseNumberMatch) {
      throw new Error(`Failed to extract case number from alert: "${alertText}"`);
    }
    return caseNumberMatch[0];
  }

  async getCaseNumberFromUrl(): Promise<string> {
    const pathname = new URL(this.page.url()).pathname;
    const caseNumber = pathname.slice(pathname.lastIndexOf("/") + 1);
    if (!/^\d{16}$/.test(caseNumber)) {
      throw new Error(`Failed to extract valid case number from URL: "${pathname}"`);
    }
    return caseNumber;
  }

  async selectCaseAction(
    action: string,
    options: {
      expectedLocator?: ReturnType<Page["locator"]>;
      timeoutMs?: number;
      retry?: boolean;
    } = {}
  ) {
    await this.caseActionGoButton.waitFor({ state: "visible" });
    await this.caseActionsDropdown.waitFor({ state: "visible" });
    const availableOptions = await this.caseActionsDropdown.locator("option").evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          label: (node.textContent ?? "").trim(),
          value: (node.getAttribute("value") ?? "").trim()
        }))
        .filter((option) => option.label || option.value)
    );
    const matchingOption = availableOptions.find(
      (option) => option.label === action || option.value === action
    );
    if (!matchingOption) {
      throw new Error(
        `Case action "${action}" is not available. Available actions: ${availableOptions.map((option) => option.label || option.value).join(", ")}`
      );
    }

    await this.caseActionsDropdown.selectOption(
      matchingOption.label === action ? { label: action } : matchingOption.value || action
    );
    await this.caseActionGoButton.click();
    await this.exuiSpinnerComponent.wait();

    if (!options.expectedLocator) {
      return;
    }

    const timeoutMs = options.timeoutMs ?? 30_000;
    try {
      await options.expectedLocator.waitFor({ state: "visible", timeout: timeoutMs });
    } catch (error) {
      const eventErrorVisible = await this.eventCreationErrorHeading.isVisible().catch(() => false);
      if (eventErrorVisible) {
        throw new Error(`Case event failed after selecting "${action}": The event could not be created.`);
      }
      if (options.retry === false) {
        throw error;
      }
      await this.caseActionsDropdown.selectOption(
        matchingOption.label === action ? { label: action } : matchingOption.value || action
      );
      await this.caseActionGoButton.click();
      await this.exuiSpinnerComponent.wait();
      await options.expectedLocator.waitFor({ state: "visible", timeout: timeoutMs });
    }
  }

  async selectFirstRadioOption() {
    await this.commonRadioButtons.first().getByRole("radio").check();
    await this.submitCaseFlagButton.click();
    await this.exuiSpinnerComponent.wait();
  }

  async todaysDateFormatted(): Promise<string> {
    return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  async addFlagComment(comment: string) {
    await this.caseFlagCommentBox.fill(comment);
    await this.submitCaseFlagButton.click();
  }

  async selectPartyFlagTarget(target: string, flagType: string) {
    await this.page.getByLabel(`${target} (${target})`).check();
    await this.submitCaseFlagButton.click();
    await this.commonRadioButtons.getByLabel(flagType).waitFor({ state: "visible" });
    await this.commonRadioButtons.getByLabel(flagType).check();
    await this.submitCaseFlagButton.click();
    await this.selectFirstRadioOption();
    await this.addFlagComment(`${flagType} ${target}`);
    await this.submitCaseFlagButton.click();
    await this.exuiSpinnerComponent.wait();
  }

  async selectCaseFlagTarget(flagType: string) {
    await this.page.getByLabel("Case level").check();
    await this.submitCaseFlagButton.click();
    await this.page.getByLabel(flagType).waitFor({ state: "visible" });
    await this.page.getByLabel(flagType).check();
    await this.submitCaseFlagButton.click();
    await this.caseFlagCommentBox.fill(`${flagType}`);
    await this.submitCaseFlagButton.click();
    await this.submitCaseFlagButton.click();
    await this.exuiSpinnerComponent.wait();
  }

  async selectCaseDetailsTab(tabName: string) {
    await this.caseDetailsTabs.filter({ hasText: tabName }).click();
  }

  async getCurrentPageUrl(): Promise<string> {
    return this.page.url();
  }

  async reopenCaseDetails(caseDetailsUrl: string): Promise<void> {
    await this.page.goto(caseDetailsUrl);
    await this.caseActionsDropdown.waitFor({ state: "visible", timeout: 60_000 });
    await this.caseActionGoButton.waitFor({ state: "visible", timeout: 60_000 });
  }

  async openDocumentOne(): Promise<void> {
    await this.documentOneAction.waitFor({ state: "visible", timeout: 30_000 });
    await this.documentOneAction.click();
  }

  async openDocumentOneInMediaViewer(): Promise<Page> {
    await this.openDocumentOne();

    await this.page
      .waitForFunction(
        (routePatternSource) => {
          const routePattern = new RegExp(routePatternSource);
          return window.location.href.match(routePattern) !== null;
        },
        MEDIA_VIEWER_ROUTE_PATTERN.source,
        { timeout: 30_000 }
      )
      .catch(() => undefined);

    return this.page
      .context()
      .pages()
      .find((candidate) => MEDIA_VIEWER_ROUTE_PATTERN.test(candidate.url())) ?? this.page;
  }

  async openHistoryTab(): Promise<void> {
    await this.selectCaseDetailsTab("History");
  }

  async mapHistoryTable(): Promise<Record<string, string>[]> {
    const headers = (await this.historyTable.locator("thead tr th").allInnerTexts()).map((header) =>
      header.replace(/\t.*/g, "")
    );
    const rows = this.historyTable.locator("tbody tr");
    const rowCount = await rows.count();
    const data: Record<string, string>[] = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const cells = await rows.nth(rowIndex).locator("th, td").allInnerTexts();
      const row: Record<string, string> = {};

      for (let headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
        row[headers[headerIndex]] = cells[headerIndex] ?? "";
      }

      data.push(row);
    }

    return data;
  }

  async getCaseHistoryByEvent(event: string): Promise<{
    updateRow: Record<string, string> | undefined;
    updateDate: string;
    updateAuthor: string;
    expectedDate: string;
  }> {
    const rows = await this.mapHistoryTable();
    const updateRow = rows.find((row) => row.Event === event);
    const updateDate = updateRow?.Date || "";
    const updateAuthor = updateRow?.Author || "";
    const expectedDate = await this.todaysDateFormatted();
    return { updateRow, updateDate, updateAuthor, expectedDate };
  }

  async trRowsToObjectInPage(selector: string | ReturnType<Page["locator"]>): Promise<Record<string, string>> {
    const rows =
      typeof selector === "string"
        ? this.page.locator(`${selector} tr`)
        : selector.locator("tr");
    const rowCount = await rows.count();
    const output: Record<string, string> = {};

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = rows.nth(rowIndex);
      const cells = row.locator("th, td");
      const cellCount = await cells.count();
      if (cellCount < 2) {
        continue;
      }
      const key = (await cells.nth(0).innerText()).trim();
      const value = (await cells.nth(1).innerText()).trim();
      if (key) {
        output[key] = value;
      }
    }

    return output;
  }

  async waitForEventFormReady(selector: string, timeoutMs = 30_000): Promise<void> {
    await this.waitForUiIdleState({ timeoutMs });
    await this.page.locator(selector).waitFor({ state: "visible", timeout: timeoutMs });
  }
}
