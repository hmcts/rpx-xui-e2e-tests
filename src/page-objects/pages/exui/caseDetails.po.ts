import { Page } from "@playwright/test";

import { ValidatorUtils } from "../../../utils/ui/validator.utils.js";
import { Base } from "../../base";

const validatorUtils = new ValidatorUtils();

export class CaseDetailsPage extends Base {
  readonly container = this.page.locator("exui-case-details-home");
  readonly createCaseSuccessMessage = this.page.locator(".alert-message");
  readonly caseDetailsTabs = this.page.locator('div[role="tab"]');
  readonly caseActionsDropdown = this.page.locator("#next-step");
  readonly caseActionGoButton = this.page.locator(".event-trigger button");
  readonly submitCaseFlagButton = this.page.locator(".button[type=\"submit\"]");
  readonly caseFlagCommentBox = this.page.locator("#flagComments");
  readonly commonRadioButtons = this.page.locator(".govuk-radios__item");
  readonly caseAlertSuccessMessage = this.page.locator(".hmcts-banner--success .alert-message");
  readonly caseNotificationBannerTitle = this.page.locator("#govuk-notification-banner-title");
  readonly caseNotificationBannerBody = this.page.locator(".govuk-notification-banner__heading");

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

  async openHistoryTab(): Promise<void> {
    await this.page.getByRole("tab", { name: "History" }).click();
    await this.waitForUiIdleState();
  }

  async waitForEventFormReady(selector: string, timeoutMs = 30_000): Promise<void> {
    await this.waitForUiIdleState({ timeoutMs });
    await this.page.locator(selector).waitFor({ state: "visible", timeout: timeoutMs });
  }
}
