import { setTimeout as sleep } from "node:timers/promises";

import { TableUtils } from "@hmcts/playwright-common";
import { type Locator, Page } from "@playwright/test";

import { ValidatorUtils } from "../../../utils/ui/validator.utils.js";
import { Base } from "../../base";

import { EXUI_TIMEOUTS } from "./exui-timeouts.js";

const validatorUtils = new ValidatorUtils();
const tableUtils = new TableUtils();

const ALERT_VISIBLE_TIMEOUT_MS = EXUI_TIMEOUTS.CASE_ALERT_VISIBLE;
const TABLE_VISIBLE_TIMEOUT_MS = EXUI_TIMEOUTS.TABLE_VISIBLE;
const TAB_LOAD_TIMEOUT_MS = EXUI_TIMEOUTS.TAB_LOAD;

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

  async waitForReady(timeoutMs?: number): Promise<void> {
    const effectiveTimeoutMs =
      timeoutMs ??
      this.getRecommendedTimeoutMs({
        min: EXUI_TIMEOUTS.CASE_READY_DEFAULT,
        max: EXUI_TIMEOUTS.CASE_DETAILS_VISIBLE,
        fallback: EXUI_TIMEOUTS.CASE_READY_DEFAULT,
      });
    await this.container.waitFor({
      state: "visible",
      timeout: effectiveTimeoutMs,
    });
    await this.waitForUiIdleState({ timeoutMs: effectiveTimeoutMs });
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

    const normalizedAction = action.trim().toLowerCase();
    const actionAliases =
      normalizedAction === "create case flag" ||
      normalizedAction === "create a case flag"
        ? [action, "Create a case flag", "Create case flag"]
        : [action];
    const availableLabels = await this.caseActionsDropdown
      .locator("option")
      .allInnerTexts()
      .catch(() => []);
    const resolvedActionLabel =
      actionAliases.find((candidate) =>
        availableLabels.some(
          (label) =>
            label.trim().toLowerCase() === candidate.trim().toLowerCase(),
        ),
      ) ?? action;

    try {
      await this.caseActionsDropdown.selectOption({
        label: resolvedActionLabel,
      });
    } catch {
      await this.caseActionsDropdown.selectOption(resolvedActionLabel);
    }

    await this.caseActionGoButton.click();
    await this.waitForSpinnerToComplete("after selecting case action");
    await this.page.waitForLoadState("domcontentloaded");

    if (!options.expectedLocator) {
      return;
    }

    const timeoutMs =
      options.timeoutMs ??
      this.getRecommendedTimeoutMs({
        min: EXUI_TIMEOUTS.WIZARD_ADVANCE_DEFAULT,
        max: EXUI_TIMEOUTS.CASE_DETAILS_VISIBLE,
        fallback: EXUI_TIMEOUTS.CASE_DETAILS_VISIBLE,
      });
    const waitForExpected = async () =>
      options.expectedLocator?.waitFor({
        state: "visible",
        timeout: timeoutMs,
      });

    const attemptSelection = async () => {
      try {
        await this.caseActionsDropdown.selectOption({
          label: resolvedActionLabel,
        });
      } catch {
        await this.caseActionsDropdown.selectOption(resolvedActionLabel);
      }
      await this.caseActionGoButton.click();
      await this.waitForSpinnerToComplete("after selecting case action");
      await this.page.waitForLoadState("domcontentloaded");
      await waitForExpected();
    };

    try {
      await waitForExpected();
    } catch (error) {
      const onTriggerPage = /\/trigger\//i.test(this.page.url());
      if (onTriggerPage) {
        return;
      }
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
        await this.caseActionsDropdown.waitFor({
          state: "visible",
          timeout: EXUI_TIMEOUTS.SUBMIT_CLICK,
        });
        await attemptSelection();
      } catch (retryError) {
        await this.page.reload({ waitUntil: "domcontentloaded" });
        await this.waitForUiIdleState({
          timeoutMs: EXUI_TIMEOUTS.WAIT_FOR_SELECT_READY_EXTENDED,
        }).catch(() => {});
        await this.caseActionsDropdown.waitFor({
          state: "visible",
          timeout: EXUI_TIMEOUTS.WAIT_FOR_SELECT_READY_EXTENDED,
        });
        await this.caseActionGoButton.waitFor({
          state: "visible",
          timeout: EXUI_TIMEOUTS.WAIT_FOR_SELECT_READY_EXTENDED,
        });
        try {
          await attemptSelection();
        } catch {
          throw retryError;
        }
      }
    }
  }

  async selectCaseDetailsEvent(action: string) {
    await this.selectCaseAction(action);
  }

  async selectFirstRadioOption() {
    await this.commonRadioButtons.first().getByRole("radio").check();
    await this.submitCaseFlagButton.click();
    await this.waitForSpinnerToComplete(
      "after selecting first radio option",
      30_000,
    );
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

  private async assertNoBlockingErrors(context: string): Promise<void> {
    const callbackError = this.page.getByText(
      "callback data failed validation",
      { exact: false },
    );
    const eventCreationError = this.eventCreationErrorHeading;

    if (await callbackError.isVisible().catch(() => false)) {
      throw new Error(`Callback data failed validation ${context}.`);
    }
    if (await eventCreationError.isVisible().catch(() => false)) {
      throw new Error(`Case flag event could not be created ${context}.`);
    }
  }

  private isPointerInterceptionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("intercepts pointer events") ||
      message.includes("not receiving pointer events")
    );
  }

  private async clickSubmitWithRetry(context: string): Promise<void> {
    await this.waitForSpinnerToComplete(
      `before clicking submit ${context}`,
      15_000,
    ).catch(() => {});
    try {
      await this.submitCaseFlagButton.click({ timeout: 4_000 });
    } catch (error) {
      if (this.page.isClosed()) {
        throw new Error(`Page closed while clicking submit ${context}.`);
      }
      if (this.isPointerInterceptionError(error)) {
        await this.waitForSpinnerToComplete(
          `before retrying submit ${context}`,
          20_000,
        ).catch(() => {});
        try {
          await this.submitCaseFlagButton.click({
            timeout: 3_000,
          });
        } catch (retryError) {
          if (!this.isPointerInterceptionError(retryError)) {
            throw retryError;
          }
          await this.submitCaseFlagButton.evaluate((element) => {
            (element as HTMLButtonElement).click();
          });
        }
        return;
      }
      throw new Error(`Failed to click submit ${context}.`, { cause: error });
    }
  }

  private async checkRadioWithRetry(
    radio: Locator,
    context: string,
  ): Promise<void> {
    await this.waitForSpinnerToComplete(
      `before selecting radio ${context}`,
      15_000,
    ).catch(() => {});
    try {
      await radio.check({ timeout: 4_000 });
    } catch (error) {
      if (this.page.isClosed()) {
        throw new Error(`Page closed while selecting radio ${context}.`);
      }
      if (this.isPointerInterceptionError(error)) {
        await this.waitForSpinnerToComplete(
          `before retrying radio ${context}`,
          20_000,
        ).catch(() => {});
        await radio.check({ timeout: 3_000 }).catch(async () => {
          await radio.evaluate((element) => {
            const input = element as HTMLInputElement;
            input.checked = true;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });
        const checked = await radio.isChecked().catch(() => false);
        if (!checked) {
          await radio.evaluate((element) => {
            const input = element as HTMLInputElement;
            input.checked = true;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          });
        }
        return;
      }
      throw new Error(`Failed to select radio ${context}.`, { cause: error });
    }
  }

  private async readRadioLabel(
    radio: Locator,
    fallbackValue: string,
  ): Promise<string> {
    return (
      (await radio
        .evaluate((element) => {
          const radioElement = element as HTMLInputElement;
          const labelText = radioElement.labels?.[0]?.textContent?.trim();
          return labelText || radioElement.value || "";
        })
        .catch(() => "")) || fallbackValue
    );
  }

  private async selectPartyTargetRadio(
    target: string,
    exactLabel: Locator,
    fallbackLabel: Locator,
    partyRadios: Locator,
  ): Promise<string> {
    let selectedTargetLabel = target;
    try {
      await partyRadios.first().waitFor({ state: "visible", timeout: 15_000 });

      if (await exactLabel.isVisible().catch(() => false)) {
        selectedTargetLabel = await this.readRadioLabel(exactLabel, target);
        await this.checkRadioWithRetry(
          exactLabel,
          `exact party target "${target}"`,
        );
      } else if (await fallbackLabel.isVisible().catch(() => false)) {
        selectedTargetLabel = await this.readRadioLabel(fallbackLabel, target);
        await this.checkRadioWithRetry(
          fallbackLabel,
          `fallback party target "${target}"`,
        );
      } else {
        const firstVisibleParty = partyRadios.first();
        selectedTargetLabel = await this.readRadioLabel(
          firstVisibleParty,
          target,
        );
        await this.checkRadioWithRetry(
          firstVisibleParty,
          "first visible party target",
        );
      }
    } catch {
      if (this.page.isClosed()) {
        throw new Error("Page closed while selecting party flag target.");
      }
      const callbackError = this.page.getByText(
        "callback data failed validation",
        { exact: false },
      );
      const eventCreationError = this.eventCreationErrorHeading;

      if (await callbackError.isVisible().catch(() => false)) {
        throw new Error(
          "Callback data failed validation while selecting party flag target.",
        );
      }
      if (await eventCreationError.isVisible().catch(() => false)) {
        throw new Error(
          "Case flag event could not be created while selecting party flag target.",
        );
      }
      const fallbackVisible = await fallbackLabel
        .isVisible()
        .catch(() => false);
      if (fallbackVisible) {
        selectedTargetLabel = await this.readRadioLabel(fallbackLabel, target);
        await this.checkRadioWithRetry(
          fallbackLabel,
          `fallback party target "${target}"`,
        );
      } else {
        const firstVisibleParty = partyRadios.first();
        await firstVisibleParty.waitFor({ state: "visible", timeout: 8_000 });
        selectedTargetLabel = await this.readRadioLabel(
          firstVisibleParty,
          target,
        );
        await this.checkRadioWithRetry(
          firstVisibleParty,
          "first visible party target",
        );
      }
    }
    return selectedTargetLabel;
  }

  private async advanceFlagTypeStep(
    flagTypeRadio: Locator,
    flagType: string,
    selectedFlagType: boolean,
  ): Promise<boolean> {
    if (
      !selectedFlagType &&
      (await flagTypeRadio.isVisible().catch(() => false))
    ) {
      await this.checkRadioWithRetry(
        flagTypeRadio,
        `party flag type "${flagType}"`,
      );
      await this.clickSubmitWithRetry("after selecting party flag type");
      await this.waitForSpinnerToComplete(
        "after selecting party flag type",
        8_000,
      ).catch(() => {});
      await sleep(300);
      return true;
    }
    return false;
  }

  private async advancePartyLevelStep(
    firstVisibleRadio: Locator,
    selectedFlagType: boolean,
    selectedPartyOption: boolean,
  ): Promise<boolean> {
    if (
      selectedFlagType &&
      !selectedPartyOption &&
      (await firstVisibleRadio.isVisible().catch(() => false))
    ) {
      await this.checkRadioWithRetry(
        firstVisibleRadio,
        "first party-level flag option",
      );
      await this.clickSubmitWithRetry("after selecting party-level option");
      await this.waitForSpinnerToComplete(
        "after selecting party-level option",
        8_000,
      ).catch(() => {});
      await sleep(300);
      return true;
    }
    return false;
  }

  private async completeCommentStep(
    flagType: string,
    selectedTargetLabel: string,
  ): Promise<boolean> {
    if (await this.caseFlagCommentBox.isVisible().catch(() => false)) {
      await this.caseFlagCommentBox.fill(`${flagType} ${selectedTargetLabel}`);
      await this.clickSubmitWithRetry("after adding party flag comment");
      await this.waitForSpinnerToComplete(
        "after submitting party flag comment",
        8_000,
      ).catch(() => {});
      const reviewHeadingVisible = await this.page
        .getByRole("heading", { name: /review flag details/i })
        .isVisible()
        .catch(() => false);
      if (
        reviewHeadingVisible &&
        (await this.submitCaseFlagButton.isVisible().catch(() => false))
      ) {
        await this.clickSubmitWithRetry("after reviewing party flag details");
        await this.waitForSpinnerToComplete(
          "after final party flag submit",
          8_000,
        ).catch(() => {});
      }
      return true;
    }
    return false;
  }

  async selectPartyFlagTarget(
    target: string,
    flagType: string,
  ): Promise<string> {
    await this.assertNoBlockingErrors("before selecting party flag target");

    await this.page
      .getByRole("heading", { name: /where should this flag be added\?/i })
      .waitFor({ state: "visible", timeout: 25_000 });

    const exactLabel = this.page.getByLabel(`${target} (${target})`);
    const escapedTarget = target.replaceAll(
      /[.*+?^${}()|[\]\\]/g,
      String.raw`\$&`,
    );
    const fallbackLabel = this.page.getByLabel(
      new RegExp(String.raw`\b${escapedTarget}\b`, "i"),
    );
    const partyRadios = this.page.getByRole("radio");

    const selectedTargetLabel = await this.selectPartyTargetRadio(
      target,
      exactLabel,
      fallbackLabel,
      partyRadios,
    );
    await this.clickSubmitWithRetry("after selecting party flag target");

    const flagTypeRadio = this.commonRadioButtons.getByLabel(flagType, {
      exact: false,
    });
    const firstVisibleRadio = this.commonRadioButtons
      .first()
      .getByRole("radio");
    const deadline = Date.now() + 90_000;
    let selectedFlagType = false;
    let selectedPartyOption = false;

    while (Date.now() < deadline) {
      await this.assertNoBlockingErrors("during party flag creation flow");
      if (this.page.isClosed()) {
        throw new Error("Page closed during party flag creation flow.");
      }

      if (await this.completeCommentStep(flagType, selectedTargetLabel)) {
        return selectedTargetLabel;
      }

      if (
        await this.advanceFlagTypeStep(
          flagTypeRadio,
          flagType,
          selectedFlagType,
        )
      ) {
        selectedFlagType = true;
        continue;
      }

      if (
        await this.advancePartyLevelStep(
          firstVisibleRadio,
          selectedFlagType,
          selectedPartyOption,
        )
      ) {
        selectedPartyOption = true;
        continue;
      }

      const onPartyTargetStep = await this.page
        .getByRole("heading", { name: /where should this flag be added\?/i })
        .isVisible()
        .catch(() => false);
      if (
        onPartyTargetStep &&
        (await this.submitCaseFlagButton.isVisible().catch(() => false))
      ) {
        await this.clickSubmitWithRetry(
          "while advancing from party target step",
        );
      }

      await this.waitForSpinnerToComplete(
        "while waiting for party flag creation flow",
        8_000,
      ).catch(() => {});
      await sleep(500);
    }

    const snapshot = {
      url: this.page.url(),
      flagTypeVisible: await flagTypeRadio.isVisible().catch(() => false),
      firstRadioVisible: await firstVisibleRadio.isVisible().catch(() => false),
      commentVisible: await this.caseFlagCommentBox
        .isVisible()
        .catch(() => false),
      submitVisible: await this.submitCaseFlagButton
        .isVisible()
        .catch(() => false),
    };
    throw new Error(
      `Timed out while creating party flag. snapshot=${JSON.stringify(snapshot)}`,
    );
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
    const requested = tabName.trim();
    const normalized = requested.toLowerCase();

    const tabAliases = this.getTabNameAliases(requested, normalized);
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      for (const alias of tabAliases) {
        const escapedAlias = alias.replaceAll(
          /[.*+?^${}()|[\]\\]/g,
          String.raw`\$&`,
        );
        const roleTab = this.page
          .getByRole("tab", {
            name: new RegExp(String.raw`^${escapedAlias}(?:\s*,|\s*$)`, "i"),
          })
          .first();
        if (await roleTab.isVisible().catch(() => false)) {
          await roleTab.click({ timeout: 10_000 });
          const selected = await roleTab
            .getAttribute("aria-selected")
            .then((value) => value === "true")
            .catch(() => false);
          if (!selected) {
            await sleep(250);
            continue;
          }
          await this.waitForUiIdleState({
            timeoutMs: TAB_LOAD_TIMEOUT_MS,
          }).catch(() => {
            // Some tabs do not trigger additional UI activity after selection.
          });
          return;
        }

        const legacyTab = this.page
          .locator(".mat-tab-label-content, .tabs-list li, li, a, button, div")
          .filter({
            hasText: new RegExp(String.raw`^\s*${escapedAlias}\s*$`, "i"),
          })
          .first();
        if (await legacyTab.isVisible().catch(() => false)) {
          await legacyTab.click({ timeout: 10_000 });
          await this.waitForUiIdleState({
            timeoutMs: TAB_LOAD_TIMEOUT_MS,
          }).catch(() => {
            // Some tabs do not trigger additional UI activity after selection.
          });
          return;
        }
      }

      if (this.page.isClosed()) {
        throw new Error(
          `Page closed while waiting for case details tab "${tabName}".`,
        );
      }
      await sleep(500);
    }

    const availableRoleTabs = await this.caseDetailsTabs
      .allInnerTexts()
      .catch(() => []);
    const availableLegacyTabs = await this.page
      .locator(".mat-tab-label-content, .tabs-list li")
      .allInnerTexts()
      .catch(() => []);
    const availableTabs = [...availableRoleTabs, ...availableLegacyTabs];
    throw new Error(
      `Case details tab "${tabName}" not found. Available tabs: ${
        availableTabs
          .map((tab) => tab.trim())
          .filter((tab) => tab.length > 0)
          .join(", ") || "<none>"
      }.`,
    );
  }

  private getTabNameAliases(requested: string, normalized: string): string[] {
    if (normalized === "flags") {
      return [requested, "Case flags", "Case Flags"];
    }
    if (normalized === "documents") {
      return [requested, "Documents", "Case documents", "Case Documents"];
    }
    return [requested];
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
    const parsed = await tableUtils.parseKeyValueTable(
      selector,
      typeof selector === "string" ? this.page : undefined,
    );
    if (Object.keys(parsed).length > 0) {
      return parsed;
    }

    const tableLocator =
      typeof selector === "string" ? this.page.locator(selector) : selector;
    return tableLocator.first().evaluate((table) => {
      const result: Record<string, string> = {};
      const rows = Array.from(table.querySelectorAll("tr"));

      for (const row of rows) {
        const key = (
          row.querySelector("th, [role='rowheader']")?.textContent ?? ""
        ).trim();
        const value = (
          row.querySelector("td, [role='cell']")?.textContent ?? ""
        ).trim();
        if (!key || !value) {
          continue;
        }
        result[key] = value;
      }

      return result;
    });
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
    timeoutMs?: number,
  ): Promise<void> {
    const effectiveTimeoutMs =
      timeoutMs ??
      this.getRecommendedTimeoutMs({
        min: EXUI_TIMEOUTS.SUBMIT_AUTO_ADVANCE_MIN,
        max: 120_000,
        fallback: EXUI_TIMEOUTS.CASE_DETAILS_VISIBLE,
      });
    const spinner = this.page.locator("xuilib-loading-spinner").first();
    try {
      await spinner.waitFor({ state: "hidden", timeout: effectiveTimeoutMs });
    } catch (error) {
      const stillVisible = await spinner.isVisible().catch(() => false);
      if (stillVisible) {
        throw new Error(`Spinner still visible ${context}`, { cause: error });
      }
    }
  }
}
