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
  readonly caseFlagCommentBox = this.page.locator("#flagComments");
  readonly commonRadioButtons = this.page.locator(".govuk-radios__item");
  readonly caseAlertSuccessMessage = this.page.locator(".hmcts-banner--success .alert-message");
  readonly caseNotificationBannerTitle = this.page.locator("#govuk-notification-banner-title");
  readonly caseNotificationBannerBody = this.page.locator(".govuk-notification-banner__heading");
  readonly caseViewerTable = this.page.getByRole("table", { name: "case viewer table" });
  readonly documentOneRow = this.caseViewerTable.getByRole("row", { name: /^Document 1\b/i }).first();
  readonly documentOneAction = this.documentOneRow.locator("a,button").first();

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

  async selectCaseAction(action: string) {
    await this.caseActionGoButton.waitFor();
    await this.caseActionsDropdown.selectOption(action);
    await this.caseActionGoButton.click();
    await this.exuiSpinnerComponent.wait();
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
    await this.page.getByRole("tab", { name: "History" }).click();
    await this.waitForUiIdleState();
  }

  async waitForEventFormReady(selector: string, timeoutMs = 30_000): Promise<void> {
    await this.waitForUiIdleState({ timeoutMs });
    await this.page.locator(selector).waitFor({ state: "visible", timeout: timeoutMs });
  }
}
