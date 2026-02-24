import { TableUtils } from "@hmcts/playwright-common";
import { type Locator, Page } from "@playwright/test";

import { ValidatorUtils } from "../../../utils/ui/validator.utils.js";
import { Base } from "../../base";

const validatorUtils = new ValidatorUtils();
const tableUtils = new TableUtils();

const ALERT_VISIBLE_TIMEOUT_MS = 10_000;
const TABLE_VISIBLE_TIMEOUT_MS = 10_000;
const TAB_LOAD_TIMEOUT_MS = 5_000;

export class CaseDetailsPage extends Base {
  readonly container = this.page.locator("exui-case-details-home");

  readonly createCaseSuccessMessage = this.page.locator(".alert-message");

  readonly caseDetailsTabs = this.page.locator('div[role="tab"]');

  readonly caseActionsDropdown = this.page.locator("#next-step");

  readonly caseActionGoButton = this.page.locator(".event-trigger button");
  readonly caseSummaryHeading = this.page
    .locator("h2")
    .filter({ hasText: "Case information" })
    .first();
  readonly caseProgressMessage = this.page
    .locator("#progress_legalOfficer_updateTrib_dismissed_under_rule_31")
    .first();
  readonly extend26WeekTimelineLink = this.page.getByRole("link", {
    name: /extend 26 week timeline/i,
  });

  readonly submitCaseFlagButton = this.page.locator('.button[type="submit"]');

  readonly caseFlagCommentBox = this.page.locator("#flagComments");

  readonly commonRadioButtons = this.page.locator(".govuk-radios__item");

  readonly caseAlertSuccessMessage = this.page
    .locator(
      ".hmcts-banner--success .alert-message, .exui-alert .alert-message",
    )
    .first();

  readonly caseNotificationBannerTitle = this.page.locator(
    "#govuk-notification-banner-title",
  );

  readonly caseNotificationBannerBody = this.page.locator(
    ".govuk-notification-banner__heading",
  );

  readonly continueButton = this.page.getByRole("button", { name: "Continue" });
  readonly submitButton = this.page.getByRole("button", { name: "Submit" });
  readonly historyTable = this.page.locator("table.EventLogTable");
  readonly historyDetailsTable = this.page.locator("table.EventLogDetails");
  readonly caseDocumentsTable = this.page.locator("table.complex-panel-table");
  readonly someMoreDataTable = this.page.locator("table.SomeMoreData");
  readonly eventCreationErrorHeading = this.page.getByRole("heading", {
    name: "The event could not be created",
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
    await this.caseAlertSuccessMessage.waitFor({
      state: "visible",
      timeout: ALERT_VISIBLE_TIMEOUT_MS,
    });
    const alertText = await this.caseAlertSuccessMessage.innerText();
    const caseNumberMatch =
      validatorUtils.DIVORCE_CASE_NUMBER_REGEX.exec(alertText);
    if (!caseNumberMatch) {
      throw new Error(
        `Failed to extract case number from alert: "${alertText}"`,
      );
    }
    return caseNumberMatch[0];
  }

  async getCaseNumberFromUrl(): Promise<string> {
    const pathname = new URL(this.page.url()).pathname;
    const caseNumber = pathname.slice(pathname.lastIndexOf("/") + 1);
    if (!/^\d{16}$/.test(caseNumber)) {
      throw new Error(
        `Failed to extract valid case number from URL: "${pathname}"`,
      );
    }
    return caseNumber;
  }

  async selectCaseAction(
    action: string,
    options: {
      expectedLocator?: Locator;
      timeoutMs?: number;
      retry?: boolean;
    } = {},
  ) {
    await this.caseActionGoButton.waitFor({ state: "visible" });
    await this.caseActionsDropdown.waitFor({ state: "visible" });

    try {
      await this.caseActionsDropdown.selectOption({ label: action });
    } catch {
      await this.caseActionsDropdown.selectOption(action);
    }

    await this.caseActionGoButton.click();
    await this.waitForSpinnerToComplete("after selecting case action");
    await this.page.waitForLoadState("domcontentloaded");

    if (!options.expectedLocator) {
      return;
    }

    const timeoutMs = options.timeoutMs ?? 30_000;
    const waitForExpected = async () =>
      options.expectedLocator?.waitFor({
        state: "visible",
        timeout: timeoutMs,
      });

    try {
      await waitForExpected();
    } catch (error) {
      const eventErrorVisible = await this.eventCreationErrorHeading
        .isVisible()
        .catch(() => false);
      if (eventErrorVisible) {
        throw new Error(
          `Case event failed after selecting "${action}": The event could not be created.`,
          { cause: error },
        );
      }
      if (options.retry === false) {
        throw error;
      }

      try {
        await this.caseActionsDropdown.selectOption({ label: action });
      } catch {
        await this.caseActionsDropdown.selectOption(action);
      }
      await this.caseActionGoButton.click();
      await this.waitForSpinnerToComplete("after retrying case action");
      await this.page.waitForLoadState("domcontentloaded");
      await waitForExpected();
    }
  }

  async selectCaseDetailsEvent(action: string) {
    await this.selectCaseAction(action);
  }

  async selectFirstRadioOption() {
    await this.commonRadioButtons.first().getByRole("radio").check();
    await this.submitCaseFlagButton.click();
    await this.waitForSpinnerToComplete("after selecting first radio option");
  }

  async todaysDateFormatted(): Promise<string> {
    return new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  async addFlagComment(comment: string) {
    await this.caseFlagCommentBox.fill(comment);
    await this.submitCaseFlagButton.click();
  }

  async selectPartyFlagTarget(target: string, flagType: string) {
    const callbackError = this.page.getByText(
      "callback data failed validation",
      {
        exact: false,
      },
    );
    if (await callbackError.isVisible().catch(() => false)) {
      throw new Error(
        "Callback data failed validation before selecting party flag target.",
      );
    }

    const exactLabel = this.page.getByLabel(`${target} (${target})`);
    const escapedTarget = target.replaceAll(
      /[.*+?^${}()|[\]\\]/g,
      String.raw`\$&`,
    );
    const fallbackLabel = this.page.getByLabel(new RegExp(escapedTarget, "i"));

    try {
      await exactLabel.waitFor({ state: "visible", timeout: 15_000 });
      await exactLabel.check();
    } catch {
      await fallbackLabel.waitFor({ state: "visible", timeout: 15_000 });
      await fallbackLabel.check();
    }

    await this.submitCaseFlagButton.click();
    await this.waitForSpinnerToComplete("after selecting party flag target");

    await this.commonRadioButtons
      .getByLabel(flagType)
      .waitFor({ state: "visible", timeout: 30_000 });
    await this.commonRadioButtons.getByLabel(flagType).check();
    await this.submitCaseFlagButton.click();
    await this.waitForSpinnerToComplete("after selecting party flag type");

    await this.selectFirstRadioOption();
    await this.addFlagComment(`${flagType} ${target}`);
    await this.submitCaseFlagButton.click();
    await this.waitForSpinnerToComplete("after submitting party flag");
  }

  async selectCaseFlagTarget(flagType: string) {
    await this.page.getByLabel("Case level").check();
    await this.submitCaseFlagButton.click();
    await this.waitForSpinnerToComplete("after selecting case level");

    await this.page
      .getByLabel(flagType)
      .waitFor({ state: "visible", timeout: 30_000 });
    await this.page.getByLabel(flagType).check();
    await this.submitCaseFlagButton.click();
    await this.waitForSpinnerToComplete("after selecting case flag type");

    await this.caseFlagCommentBox.fill(`${flagType}`);
    await this.submitCaseFlagButton.click();
    await this.waitForSpinnerToComplete("after submitting case flag comment");

    await this.submitCaseFlagButton.click();
    await this.waitForSpinnerToComplete("after final case flag submit");
  }

  async selectCaseDetailsTab(tabName: string) {
    await this.caseDetailsTabs.filter({ hasText: tabName }).click();
    await this.waitForUiIdleState({ timeoutMs: TAB_LOAD_TIMEOUT_MS }).catch(
      () => {
        // Some tabs do not trigger additional UI activity after selection.
      },
    );
  }

  async openHistoryTab(): Promise<void> {
    await this.page.getByRole("tab", { name: "History" }).click();
    await this.waitForUiIdleState();
  }

  async waitForEventFormReady(
    selector: string,
    timeoutMs = 30_000,
  ): Promise<void> {
    await this.waitForUiIdleState({ timeoutMs });
    await this.page
      .locator(selector)
      .waitFor({ state: "visible", timeout: timeoutMs });
  }

  async getDocumentsList(): Promise<Array<Record<string, string>>> {
    const tables = await this.page.locator("table").elementHandles();
    let targetIndex = -1;

    for (let i = 0; i < tables.length; i++) {
      const hasHeaders = await tables[i].evaluate((table) => {
        const tableElement = table as HTMLTableElement;
        const thead = tableElement.querySelector(":scope > thead");
        if (!thead) {
          return false;
        }
        const headerCells = new Set(
          Array.from(thead.querySelectorAll("th, td")).map((element) =>
            (element.textContent ?? "").trim(),
          ),
        );
        return (
          headerCells.has("Number") &&
          headerCells.has("Document Category") &&
          headerCells.has("Type of Document")
        );
      });
      if (hasHeaders) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex >= 0) {
      const documentsTable = this.page.locator("table").nth(targetIndex);
      await documentsTable.waitFor({
        state: "visible",
        timeout: TABLE_VISIBLE_TIMEOUT_MS,
      });
      return tableUtils.parseDataTable(documentsTable);
    }

    const fallbackTable = this.caseDocumentsTable.first();
    await fallbackTable.waitFor({
      state: "visible",
      timeout: TABLE_VISIBLE_TIMEOUT_MS,
    });
    return tableUtils.parseDataTable(fallbackTable);
  }

  async trRowsToObjectInPage(
    selector: string | Locator,
  ): Promise<Record<string, string>> {
    return tableUtils.parseKeyValueTable(
      selector,
      typeof selector === "string" ? this.page : undefined,
    );
  }

  async mapHistoryTable(): Promise<Record<string, string>[]> {
    if ((await this.historyTable.count()) === 0) {
      throw new Error("History table not found on page");
    }

    return tableUtils.parseDataTable(this.historyTable);
  }

  async getUpdateCaseHistoryInfo(): Promise<{
    updateRow: Record<string, string> | undefined;
    updateDate: string;
    updateAuthor: string;
    expectedDate: string;
  }> {
    const rows = await this.mapHistoryTable();
    const updateRow = rows.find((row) => row.Event === "Update case");
    const updateDate = updateRow?.Date || "";
    const updateAuthor = updateRow?.Author || "";
    const expectedDate = await this.todaysDateFormatted();

    return { updateRow, updateDate, updateAuthor, expectedDate };
  }

  private async waitForSpinnerToComplete(
    context: string,
    timeoutMs = 120_000,
  ): Promise<void> {
    const spinner = this.page.locator("xuilib-loading-spinner").first();
    try {
      await spinner.waitFor({ state: "hidden", timeout: timeoutMs });
    } catch {
      const stillVisible = await spinner.isVisible().catch(() => false);
      if (stillVisible) {
        throw new Error(`Spinner still visible ${context}`);
      }
    }
  }
}
