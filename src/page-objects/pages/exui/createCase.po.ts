import { faker } from "@faker-js/faker";
import { createLogger } from "@hmcts/playwright-common";
import { Locator, Page, expect } from "@playwright/test";

import { isTransientWorkflowFailure } from "../../../utils/ui/transient-failure.utils";
import { Base } from "../../base";

import { extractCaseNumberFromUrl } from "./caseDetails.po";
import {
  clickSubmitAndWaitFlow,
  findCreateCaseBootstrapFailure,
  startCreateCaseFlow,
} from "./createCase.flow";
import { buildCreateCaseLocators } from "./createCase.locators";
import { EXUI_TIMEOUTS } from "./exui-timeouts";

export type PersonData = {
  title?: string;
  firstName?: string;
  lastName?: string;
  maidenName?: string;
  gender?: string;
  jobTitle?: string;
  jobDescription?: string;
};

export type DivorcePoCData = {
  gender?: string;
  person1Title?: string;
  person1FirstName?: string;
  person1LastName?: string;
  person1Gender?: string;
  person1JobTitle?: string;
  person1JobDescription?: string;
  textField0?: string;
  textField1?: string;
  textField2?: string;
  textField3?: string;
  divorceReasons?: string[];
  // timestamp useful for tests to assert against
  generatedAt?: string;
};

type CreateDivorceCaseOptions = {
  maxAttempts?: number;
  createCaseMaxAttempts?: number;
};

type FillDivorcePocSectionsOptions = {
  data?: Partial<PersonData> | Array<Partial<PersonData>>;
  textFields?: Pick<
    DivorcePoCData,
    "textField0" | "textField1" | "textField2" | "textField3"
  >;
  gender?: string;
  divorceReasons?: string[];
};

const logger = createLogger({
  serviceName: "create-case",
  format: "pretty",
});

const CRITICAL_WIZARD_API_PATTERNS: RegExp[] = [
  /\/cases\/\d+\/event-triggers\//,
  /\/cases\/\d+\/events/,
  /\/event-triggers\/[^/]+\/validate/,
];

export class CreateCasePage extends Base {
  readonly container!: Locator;
  readonly caseDetailsContainer!: Locator;
  readonly caseAlertSuccessMessage!: Locator;
  readonly createCaseButton!: Locator;
  readonly jurisdictionSelect!: Locator;
  readonly caseTypeSelect!: Locator;
  readonly eventTypeSelect!: Locator;
  readonly startButton!: Locator;
  readonly submitButton!: Locator;
  readonly continueButton!: Locator;

  readonly legalRepParty1Block!: Locator;
  readonly legalRepParty2Block!: Locator;
  readonly party1RoleOnCase!: Locator;
  readonly party1Name!: Locator;
  readonly party1GroupId!: Locator;
  readonly party1Visibility!: Locator;
  readonly party2RoleOnCase!: Locator;
  readonly party2Name!: Locator;
  readonly party2GroupId!: Locator;
  readonly party2Visibility!: Locator;

  readonly textFieldInput!: Locator;
  readonly emailFieldInput!: Locator;
  readonly phoneNumberFieldInput!: Locator;
  readonly dateFieldDayInput!: Locator;
  readonly dateFieldMonthInput!: Locator;
  readonly dateFieldYearInput!: Locator;
  readonly dateTimeFieldDayInput!: Locator;
  readonly dateTimeFieldMonthInput!: Locator;
  readonly dateTimeFieldYearInput!: Locator;
  readonly dateTimeFieldHourInput!: Locator;
  readonly dateTimeFieldMinuteInput!: Locator;
  readonly dateTimeFieldSecondInput!: Locator;
  readonly currencyFieldInput!: Locator;
  readonly yesNoRadioButtons!: Locator;
  readonly applicantPostcode!: Locator;
  readonly complexType1JudgeIsRightRadios!: Locator;
  readonly complexType1LevelOfJudgeRadioButtons!: Locator;
  readonly complexType1LevelOfJudgeDetailsInput!: Locator;
  readonly complexType1LevelOfJudgeKeyInput!: Locator;
  readonly complexType2AddressLine1Input!: Locator;
  readonly complexType2EmailInput!: Locator;
  readonly complexType3ComplianceButton!: Locator;
  readonly complexType3ComplianceInput!: Locator;
  readonly complexType3DateOfBirthDay!: Locator;
  readonly complexType3DateOfBirthMonth!: Locator;
  readonly complexType3DateOfBirthYear!: Locator;
  readonly complexType3FileUploadInput!: Locator;
  readonly complexType3DateOfHearingDay!: Locator;
  readonly complexType3DateOfHearingMonth!: Locator;
  readonly complexType3DateOfHearingYear!: Locator;
  readonly complexType3DateOfHearingHour!: Locator;
  readonly complexType3DateOfHearingMinute!: Locator;
  readonly complexType3DateOfHearingSecond!: Locator;
  readonly complexType4AmountInput!: Locator;
  readonly complexType4FirstTickBox!: Locator;
  readonly complexType4SelectList!: Locator;

  readonly person1Title!: Locator;
  readonly genderRadioButtons!: Locator;
  readonly person1TitleInput!: Locator;
  readonly person1FirstNameInput!: Locator;
  readonly person1MaidenNameInput!: Locator;
  readonly person1LastNameInput!: Locator;
  readonly person1GenderSelect!: Locator;
  readonly person1JobTitleInput!: Locator;
  readonly person1JobDescriptionInput!: Locator;
  readonly person2!: Locator;
  readonly person2TitleInput!: Locator;
  readonly person2FirstNameInput!: Locator;
  readonly person2MaidenNameInput!: Locator;
  readonly person2LastNameInput!: Locator;
  readonly person2GenderSelect!: Locator;
  readonly person2JobTitleInput!: Locator;
  readonly person2JobDescriptionInput!: Locator;
  readonly additionalPeople!: Locator;
  readonly addNewPersonButton!: Locator;
  readonly doYouAgreeGroup!: Locator;
  readonly doYouAgreeYesRadio!: Locator;
  readonly doYouAgreeNoRadio!: Locator;

  readonly fileUploadInput!: Locator;
  readonly fileUploadStatusLabel!: Locator;
  readonly textField0Input!: Locator;
  readonly textField1Input!: Locator;
  readonly textField2Input!: Locator;
  readonly textField3Input!: Locator;
  readonly divorceReasons!: Locator;
  readonly checkYourAnswers!: Locator;
  readonly checkYourAnswersHeading!: Locator;
  readonly checkYourAnswersTable!: Locator;
  readonly checkYourAnswersSubTable!: Locator;
  readonly checkYourAnswersFieldLabels!: Locator;
  readonly checkYourAnswersChangeLinks!: Locator;
  readonly testSubmitButton!: Locator;

  readonly receiptDayInput!: Locator;
  readonly receiptMonthInput!: Locator;
  readonly receiptYearInput!: Locator;
  readonly tribunalOfficeSelect!: Locator;
  readonly claimantIndividualRadio!: Locator;
  readonly claimantCompanyRadio!: Locator;
  readonly claimantOrganisationNameInput!: Locator;
  readonly claimantIndividualFirstNameInput!: Locator;
  readonly claimantIndividualLastNameInput!: Locator;
  readonly addRespondentButton!: Locator;
  readonly respondentOneNameInput!: Locator;
  readonly respondentOrganisation!: Locator;
  readonly respondentCompanyNameInput!: Locator;
  readonly respondentAcasCertifcateSelectYes!: Locator;
  readonly respondentAcasCertificateNumberInput!: Locator;
  readonly respondentAddressLine1Input!: Locator;
  readonly respondentAddressPostcodeInput!: Locator;
  readonly sameAsClaimantWorkAddressYes!: Locator;
  readonly claimantRepresentedNo!: Locator;
  readonly hearingPreferenceVideo!: Locator;

  readonly manualEntryLink!: Locator;
  readonly claimantAddressLine1Input!: Locator;
  readonly externalTriageAddressLine1Input!: Locator;
  readonly externalTriagePostTownInput!: Locator;
  readonly externalTriagePostCodeInput!: Locator;
  readonly externalTriageAddressSelect!: Locator;
  readonly postCodeSearchInput!: Locator;
  readonly postCodeSearchButton!: Locator;
  readonly addressSelect!: Locator;

  readonly refreshModal!: Locator;
  readonly refreshModalConfirmButton!: Locator;
  readonly errorMessage!: Locator;
  readonly errorSummary!: Locator;
  readonly errorSummaryTitle!: Locator;
  readonly errorSummaryItems!: Locator;
  readonly eventCreationErrorHeading!: Locator;
  readonly somethingWentWrongHeading!: Locator;
  readonly validationErrorMessage!: Locator;

  constructor(page: Page) {
    super(page);
    Object.assign(this, buildCreateCaseLocators(page));
  }

  public async findTableInCheckAnswers(name: string) {
    return this.checkYourAnswers.locator(
      `.complex-panel:has(.complex-panel-title:has-text("${name}")) table`,
    );
  }
  public async findSubTableInCheckAnswers(name: string) {
    return this.checkYourAnswers.locator(
      `.complex-panel:has(.complex-panel-title:has-text("${name}")) table table`,
    );
  }
  private async waitForSelectReady(selector: string, timeoutMs?: number) {
    const effectiveTimeoutMs =
      timeoutMs ?? EXUI_TIMEOUTS.WAIT_FOR_SELECT_READY_DEFAULT;
    const apiCallsBaseline = this.getApiCalls().length;
    const deadline = Date.now() + effectiveTimeoutMs;

    while (Date.now() < deadline) {
      const ready = await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return (
          el instanceof HTMLSelectElement &&
          el.options.length > 1 &&
          !el.disabled
        );
      }, selector);

      if (ready) {
        return;
      }

      const bootstrapFailure = findCreateCaseBootstrapFailure(
        this.getApiCalls(),
        apiCallsBaseline,
      );
      if (bootstrapFailure) {
        throw new Error(
          `Create case bootstrap failed while waiting for select "${selector}": ` +
            `${bootstrapFailure.method} ${bootstrapFailure.url} returned HTTP ${bootstrapFailure.status}`,
        );
      }

      await this.page.waitForTimeout(EXUI_TIMEOUTS.SUBMIT_POLL_INTERVAL);
    }

    throw new Error(
      `Create case select "${selector}" did not become ready within ${effectiveTimeoutMs}ms`,
    );
  }

  // CCD mixes option values and labels, so selection needs tolerant matching.
  private async selectOptionSmart(selectLocator: Locator, option: string) {
    await selectLocator.waitFor({ state: "visible" });
    const options = await selectLocator.evaluate((el) =>
      Array.from((el as HTMLSelectElement).options).map((o) => ({
        value: o.value,
        label: o.label,
      })),
    );

    const normalized = option.toLowerCase();
    const match =
      options.find((o) => o.value === option) ||
      options.find((o) => o.label === option) ||
      options.find((o) => o.value.toLowerCase() === normalized) ||
      options.find((o) => o.label.toLowerCase() === normalized);

    if (!match) {
      const available = options
        .map((o) => `${o.label} (${o.value})`)
        .join(", ");
      throw new Error(
        `Option not found for "${option}". Available: ${available}`,
      );
    }

    await selectLocator.selectOption({ value: match.value });
  }

  async assertNoEventCreationError(context: string) {
    const isVisible = await this.eventCreationErrorHeading
      .isVisible()
      .catch(() => false);
    if (!isVisible) {
      return;
    }
    throw new Error(
      `Case event failed ${context}: The event could not be created.`,
    );
  }

  async assertCreateCaseSubmissionError(
    expectedMessage: string,
    options: { timeoutMs?: number } = {},
  ) {
    const timeoutMs = options.timeoutMs ?? 60_000;

    await expect
      .poll(
        async () => {
          const [
            eventErrorVisible,
            errorSummaryVisible,
            somethingWentWrongVisible,
          ] = await Promise.all([
            this.eventCreationErrorHeading.isVisible().catch(() => false),
            this.errorSummary.isVisible().catch(() => false),
            this.somethingWentWrongHeading.isVisible().catch(() => false),
          ]);

          return (
            eventErrorVisible ||
            errorSummaryVisible ||
            somethingWentWrongVisible
          );
        },
        {
          timeout: timeoutMs,
          message:
            "Expected a create-case submission error surface to be rendered",
        },
      )
      .toBeTruthy();

    await expect(
      this.page.getByText(expectedMessage, { exact: true }),
    ).toBeVisible({ timeout: timeoutMs });
  }

  private normalizePath(url: string): string {
    return new URL(url, this.page.url()).pathname;
  }

  async waitForCaseDetails(context: string) {
    await this.assertNoEventCreationError(context);
    try {
      await this.caseDetailsContainer.waitFor({
        state: "visible",
        timeout: EXUI_TIMEOUTS.CASE_DETAILS_VISIBLE,
      });
    } catch (error) {
      const recovered = await this.recoverCaseDetailsFromCreatedBanner(
        context,
        error,
      );
      if (recovered) {
        return;
      }
      throw error;
    }
  }

  private async extractCreatedCaseNumberFromBanner(): Promise<string | null> {
    const bannerVisible = await this.caseAlertSuccessMessage
      .isVisible()
      .catch(() => false);
    if (!bannerVisible) {
      return null;
    }

    const bannerText = await this.caseAlertSuccessMessage
      .innerText()
      .catch(() => "");
    if (!/has been created/i.test(bannerText)) {
      return null;
    }

    const numericMatch = /\d{16}/.exec(bannerText.replace(/\D/g, "")); // NOSONAR typescript:S5852 — replaceAll requires ES2021; tsconfig targets ES2020
    return numericMatch?.[0] ?? null;
  }

  private normalizeUnknownError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    try {
      const serialized = JSON.stringify(error);
      return serialized ?? "[Unable to stringify error]";
    } catch {
      return "[Unstringifiable error object]";
    }
  }

  private async recoverCaseDetailsFromCreatedBanner(
    context: string,
    initialError: unknown,
  ): Promise<boolean> {
    if (this.page.isClosed()) {
      return false;
    }

    const caseNumber =
      extractCaseNumberFromUrl(this.page.url()) ??
      (await this.extractCreatedCaseNumberFromBanner());
    if (!caseNumber) {
      return false;
    }

    const caseDetailsUrl = `/cases/case-details/${caseNumber}`;
    const initialErrorMessage = this.normalizeUnknownError(initialError);
    this.logger.warn(
      "Case details did not render after submit; trying direct case details URL",
      {
        context,
        caseNumber,
        caseDetailsUrl,
        initialError: initialErrorMessage.slice(0, 220),
      },
    );

    try {
      await this.page.goto(caseDetailsUrl);
      await this.assertNoEventCreationError(
        `${context} (after direct case details navigation)`,
      );
      await this.caseDetailsContainer.waitFor({
        state: "visible",
        timeout: EXUI_TIMEOUTS.CASE_DETAILS_VISIBLE,
      });
      return true;
    } catch (recoveryError) {
      const recoveryErrorMessage = this.normalizeUnknownError(recoveryError);
      this.logger.warn("Direct case details recovery failed", {
        context,
        caseNumber,
        caseDetailsUrl,
        recoveryError: recoveryErrorMessage.slice(0, 220),
      });
      return false;
    }
  }

  private async getVisibleActionButton(
    buttons: Locator,
  ): Promise<Locator | null> {
    let fallbackVisibleButton: Locator | null = null;
    const count = await buttons.count();
    for (let index = count - 1; index >= 0; index -= 1) {
      const candidate = buttons.nth(index);
      const isVisible = await candidate.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }
      if (!fallbackVisibleButton) {
        fallbackVisibleButton = candidate;
      }
      const isEnabled = await candidate.isEnabled().catch(() => false);
      if (isEnabled) {
        return candidate;
      }
    }
    return fallbackVisibleButton;
  }

  async clickContinueAndWait(
    context: string,
    options: {
      force?: boolean;
      timeoutMs?: number;
      continueButton?: Locator;
    } = {},
  ) {
    const stepTimeout =
      options.timeoutMs ?? EXUI_TIMEOUTS.CONTINUE_CLICK_DEFAULT;
    const enabledTimeout = Math.max(EXUI_TIMEOUTS.SUBMIT_CLICK, stepTimeout);
    const visibleContinueButton =
      options.continueButton ??
      (await this.getVisibleActionButton(this.continueButton));
    if (!visibleContinueButton) {
      throw new Error(`Continue button not visible ${context}`);
    }
    await visibleContinueButton.scrollIntoViewIfNeeded();
    await expect(visibleContinueButton).toBeEnabled({
      timeout: enabledTimeout,
    });
    const clickTimeout = Math.min(
      stepTimeout,
      EXUI_TIMEOUTS.CONTINUE_CLICK_DEFAULT,
    );
    try {
      await visibleContinueButton.click({
        force: options.force,
        timeout: clickTimeout,
      });
    } catch (error) {
      const message = this.normalizeUnknownError(error);
      if (!message.includes("intercepts pointer events")) {
        throw error;
      }
      this.logger.warn(
        "Continue click intercepted by spinner; waiting and retrying click",
        { context },
      );
      const spinnerSettleTimeout = Math.max(
        5_000,
        Math.min(stepTimeout, EXUI_TIMEOUTS.SUBMIT_AUTO_ADVANCE_MAX),
      );
      await this.page
        .locator("xuilib-loading-spinner")
        .first()
        .waitFor({ state: "hidden", timeout: spinnerSettleTimeout })
        .catch(() => {
          // Best-effort wait; retry click below handles residual spinner overlays.
        });
      try {
        await visibleContinueButton.click({
          force: options.force,
          timeout: clickTimeout,
        });
      } catch (retryError) {
        const retryMessage = this.normalizeUnknownError(retryError);
        if (
          !retryMessage.includes("intercepts pointer events") ||
          options.force === true
        ) {
          throw retryError;
        }
        this.logger.warn(
          "Continue click still intercepted after wait; retrying with force",
          { context },
        );
        await visibleContinueButton.click({
          force: true,
          timeout: clickTimeout,
        });
      }
    }
    await this.waitForSpinnerToComplete(`after ${context}`, stepTimeout);
    await this.assertNoEventCreationError(context);
    const hasValidationError = await this.checkForErrorMessage();
    if (hasValidationError) {
      throw new Error(`Validation error after ${context}`);
    }
  }

  async clickContinueAndWaitForNext(
    context: string,
    options: { force?: boolean; timeoutMs?: number } = {},
  ) {
    await this.clickContinueAndWait(context, options);
  }

  private async clickSubmitButtonWithRetry(
    context: string,
    submitButton?: Locator,
  ) {
    const visibleSubmitButton =
      submitButton ?? (await this.getVisibleActionButton(this.submitButton));
    if (!visibleSubmitButton) {
      throw new Error(`Submit button not visible ${context}`);
    }
    await visibleSubmitButton.scrollIntoViewIfNeeded();
    await expect(visibleSubmitButton).toBeEnabled();
    try {
      await visibleSubmitButton.click({ timeout: EXUI_TIMEOUTS.SUBMIT_CLICK });
    } catch (error) {
      const message = this.normalizeUnknownError(error);
      if (!message.includes("intercepts pointer events")) {
        throw error;
      }
      this.logger.warn("Submit click intercepted; retrying with force", {
        context,
      });
      await visibleSubmitButton.click({
        force: true,
        timeout: EXUI_TIMEOUTS.SUBMIT_CLICK,
      });
    }
  }

  async clickSubmitAndWait(
    context: string,
    options: { timeoutMs?: number; maxAutoAdvanceAttempts?: number } = {},
  ) {
    const timeoutMs = options.timeoutMs ?? this.getRecommendedTimeoutMs();
    const maxAutoAdvanceAttempts =
      options.maxAutoAdvanceAttempts ??
      Math.max(
        2,
        Math.min(
          8,
          Math.floor(timeoutMs / EXUI_TIMEOUTS.SUBMIT_AUTO_ADVANCE_MIN),
        ),
      );
    await clickSubmitAndWaitFlow({
      page: this.page,
      context,
      timeoutMs,
      maxAutoAdvanceAttempts,
      submitButton: this.submitButton,
      continueButton: this.continueButton,
      somethingWentWrongHeading: this.somethingWentWrongHeading,
      getApiCalls: () => this.getApiCalls(),
      getVisibleActionButton: async (locator) =>
        (await this.getVisibleActionButton(locator)) ?? undefined,
      clickSubmitButtonWithRetry: (submitContext, submitButton) =>
        this.clickSubmitButtonWithRetry(submitContext, submitButton),
      clickContinueAndWait: (continueContext, continueOptions) =>
        this.clickContinueAndWait(continueContext, continueOptions),
      waitForSpinnerToComplete: (spinnerContext, spinnerTimeoutMs) =>
        this.waitForSpinnerToComplete(spinnerContext, spinnerTimeoutMs),
      assertNoEventCreationError: (errorContext) =>
        this.assertNoEventCreationError(errorContext),
      checkForErrorMessage: () => this.checkForErrorMessage(),
      getValidationErrorText: () => this.getValidationErrorText(),
      failFastOnCriticalWizardEndpointFailure: (
        failureContext,
        baselineIndex,
      ) =>
        this.failFastOnCriticalWizardEndpointFailure(
          failureContext,
          baselineIndex,
        ),
      warn: (message, meta) => this.logger.warn(message, meta),
    });
  }

  async waitForSpinnerToComplete(context: string, timeoutMs?: number) {
    const effectiveTimeoutMs = timeoutMs ?? this.getRecommendedTimeoutMs();
    const spinner = this.page.locator("xuilib-loading-spinner").first();
    try {
      await spinner.waitFor({ state: "hidden", timeout: effectiveTimeoutMs });
    } catch (error) {
      const stillVisible = await spinner.isVisible().catch(() => false);
      if (stillVisible) {
        throw new Error(`Spinner still visible ${context}`);
      }
      this.logger.warn(
        "Spinner hidden wait failed, proceeding because spinner not visible",
        { context, error },
      );
    }
  }

  private failFastOnCriticalWizardEndpointFailure(
    context: string,
    baselineIndex = 0,
  ) {
    // Only inspect calls seen during the current submit cycle to avoid stale failures from earlier actions.
    const recentCalls = this.getApiCalls().slice(Math.max(0, baselineIndex));
    const criticalFailure = recentCalls.find(
      (call) =>
        call.status >= 500 &&
        CRITICAL_WIZARD_API_PATTERNS.some((pattern) => pattern.test(call.url)),
    );

    if (criticalFailure) {
      throw new Error(
        `Critical wizard endpoint failure ${context}: ${criticalFailure.method} ${criticalFailure.url} returned HTTP ${criticalFailure.status}`,
      );
    }
  }

  async ensureWizardAdvanced(
    context: string,
    initialUrl: string,
    options: {
      expectedPathIncludes?: string;
      expectedLocator?: Locator;
      timeoutMs?: number;
    } = {},
  ) {
    const timeoutMs = options.timeoutMs ?? EXUI_TIMEOUTS.WIZARD_ADVANCE_DEFAULT;
    const initialPath = this.normalizePath(initialUrl);
    const expectedPathIncludes = options.expectedPathIncludes;
    const expectedLocator = options.expectedLocator;
    const waitForAdvance = async () => {
      if (expectedPathIncludes) {
        await this.page.waitForURL(
          (url) => url.pathname.includes(expectedPathIncludes),
          { timeout: timeoutMs },
        );
      } else {
        await this.page.waitForURL(
          (url) => this.normalizePath(url.toString()) !== initialPath,
          { timeout: timeoutMs },
        );
      }
      if (expectedLocator) {
        await expectedLocator.waitFor({ state: "visible", timeout: timeoutMs });
      }
    };

    try {
      await waitForAdvance();
      return;
    } catch {
      if (this.page.isClosed()) {
        throw new Error(
          `Page closed while waiting for wizard to advance after ${context}`,
        );
      }
      const hasValidationError = await this.checkForErrorMessage();
      if (hasValidationError) {
        throw new Error(`Validation error after ${context}`);
      }
      if (this.page.isClosed()) {
        throw new Error(
          `Page closed before retrying wizard advance after ${context}`,
        );
      }
      const visibleContinueButton = await this.getVisibleActionButton(
        this.continueButton,
      );
      if (!visibleContinueButton) {
        throw new Error(
          `Continue button not visible while retrying wizard advance after ${context}`,
        );
      }
      await this.clickContinueAndWait(
        `while retrying wizard advance after ${context}`,
        {
          continueButton: visibleContinueButton,
          timeoutMs,
        },
      );
      await waitForAdvance();
    }
  }

  async clickContinueMultipleTimes(
    count: number,
    options: { force?: boolean; timeoutMs?: number } = {},
  ) {
    for (let i = 0; i < count; i++) {
      const visibleContinueButton = await this.getVisibleActionButton(
        this.continueButton,
      );
      if (!visibleContinueButton) {
        logger.info("Continue button not visible; stopping early", {
          iteration: i + 1,
          total: count,
        });
        break;
      }
      await this.clickContinueAndWait(`after continue ${i + 1} of ${count}`, {
        continueButton: visibleContinueButton,
        force: options.force,
        timeoutMs: options.timeoutMs,
      });
      logger.info("Clicked continue button", {
        iteration: i + 1,
        total: count,
      });
    }
  }

  async checkForErrorMessage(
    message?: string,
    timeout = EXUI_TIMEOUTS.VALIDATION_ERROR_VISIBLE,
  ): Promise<boolean> {
    const check = async (sel: Locator) => {
      try {
        await sel.waitFor({ state: "visible", timeout });
        if (message) {
          const txt = await sel.textContent();
          return !!txt && txt.includes(message);
        }
        return true;
      } catch {
        // Element not found or timeout - expected when no error present
        return false;
      }
    };

    const [a, b] = await Promise.all([
      check(this.errorMessage),
      check(this.errorSummary),
    ]);

    const safeErrorMeta = async (
      sel: Locator,
    ): Promise<{
      present: boolean;
      length: number;
      containsCaseReference: boolean;
      containsEmail: boolean;
    } | null> => {
      const visible = await sel.isVisible().catch(() => false);
      if (!visible) {
        return null;
      }
      return sel
        .first()
        .innerText({ timeout: EXUI_TIMEOUTS.ERROR_META_TEXT_READ })
        .then((text) => {
          const trimmed = text.trim();
          return {
            present: true,
            length: trimmed.length,
            containsCaseReference: /\b\d{16}\b/.test(trimmed),
            containsEmail: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
              trimmed,
            ),
          };
        })
        .catch(() => null);
    };

    if (a || b) {
      logger.error("Error message displayed on page", {
        errorMessageMeta: a ? await safeErrorMeta(this.errorMessage) : null,
        errorSummaryMeta: b ? await safeErrorMeta(this.errorSummary) : null,
      });
      return true;
    }

    return false;
  }

  private async getValidationErrorText(): Promise<string> {
    const readText = async (locator: Locator): Promise<string> => {
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) {
        return "";
      }
      return locator
        .first()
        .innerText({ timeout: EXUI_TIMEOUTS.ERROR_META_TEXT_READ })
        .then((text) => text.trim())
        .catch(() => "");
    };

    const [errorText, summaryText] = await Promise.all([
      readText(this.errorMessage),
      readText(this.errorSummary),
    ]);
    return [errorText, summaryText].filter(Boolean).join(" | ");
  }

  async ensureDoYouAgreeAnswered(answer: "Yes" | "No" = "Yes") {
    const groupVisible = await this.doYouAgreeGroup
      .first()
      .isVisible()
      .catch(() => false);
    if (groupVisible) {
      const target =
        answer === "Yes" ? this.doYouAgreeYesRadio : this.doYouAgreeNoRadio;
      const alreadyChecked = await target.isChecked().catch(() => false);
      if (!alreadyChecked) {
        await target.check();
      }
      return;
    }

    const fallback = this.yesNoRadioButtons.getByLabel(answer).first();
    const fallbackVisible = await fallback.isVisible().catch(() => false);
    if (fallbackVisible) {
      const alreadyChecked = await fallback.isChecked().catch(() => false);
      if (!alreadyChecked) {
        await fallback.check();
      }
    }
  }

  async createCase(
    jurisdiction: string,
    caseType: string,
    eventType: string | undefined,
    options: {
      maxAttempts?: number;
    } = {},
  ) {
    const maxAttempts = options.maxAttempts ?? 2;
    await startCreateCaseFlow({
      page: this.page,
      jurisdiction,
      caseType,
      eventType,
      maxAttempts,
      createCaseButton: this.createCaseButton,
      jurisdictionSelect: this.jurisdictionSelect,
      caseTypeSelect: this.caseTypeSelect,
      eventTypeSelect: this.eventTypeSelect,
      startButton: this.startButton,
      somethingWentWrongHeading: this.somethingWentWrongHeading,
      getApiCalls: () => this.getApiCalls(),
      waitForSelectReady: (selector, timeoutMs) =>
        this.waitForSelectReady(selector, timeoutMs),
      selectOptionSmart: (selectLocator, option) =>
        this.selectOptionSmart(selectLocator, option),
      normalizeUnknownError: (error) => this.normalizeUnknownError(error),
      warn: (message, meta) => logger.warn(message, meta),
      debug: (message, meta) => logger.debug(message, meta),
    });
  }

  async addressLookup(postCode: string, addressOption: string) {
    await this.postCodeSearchInput.fill(postCode);
    await this.postCodeSearchButton.click();
    await this.addressSelect.selectOption(addressOption);
  }

  async uploadFile(
    fileName: string,
    mimeType: string,
    fileContent: string,
    fileInput?: Locator,
  ) {
    const maxRetries = 3;
    const baseDelayMs = 3000; // initial backoff
    const visibleFileInput = this.page
      .locator('input[type="file"]:visible')
      .first();
    const resolvedFileInput = fileInput ?? visibleFileInput;
    const safeBackoff = async (attempt: number) => {
      if (this.page.isClosed()) {
        throw new Error("Page closed during upload retry backoff");
      }
      await this.page.waitForTimeout(baseDelayMs * Math.pow(2, attempt - 1));
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (this.page.isClosed()) {
        throw new Error("Page closed before upload retry attempt");
      }
      const responsePromise = this.page.waitForResponse(
        (r) => r.url().includes("/document") && r.request().method() === "POST",
        {
          timeout: EXUI_TIMEOUTS.UPLOAD_RESPONSE,
        },
      );
      await resolvedFileInput.setInputFiles({
        name: fileName,
        mimeType,
        buffer: Buffer.from(fileContent),
      });

      const res = await responsePromise.catch(() => null);

      if (!res) {
        // no response within timeout — treat as failure or retry depending on policy
        if (attempt < maxRetries) {
          await safeBackoff(attempt);
          continue;
        } else {
          throw new Error("Upload timed out after retries");
        }
      }

      if (res.status() !== 200) {
        if (attempt < maxRetries) {
          // exponential backoff before retrying
          await safeBackoff(attempt);
          continue;
        } else {
          throw new Error(
            `Upload failed: server returned status ${res.status()} after ${maxRetries} retries`,
          );
        }
      }

      break;
    }
    await this.fileUploadStatusLabel
      .waitFor({ state: "hidden", timeout: EXUI_TIMEOUTS.UPLOAD_RESPONSE })
      .catch(async () => {
        const uploadStatusText = (
          await this.fileUploadStatusLabel
            .first()
            .textContent()
            .catch(() => "")
        )?.trim();
        if (uploadStatusText) {
          throw new Error(
            `Upload did not complete cleanly: ${uploadStatusText}`,
          );
        }
      });
  }

  async uploadEmploymentFile(
    fileName: string,
    mimeType: string,
    fileContent: string,
  ) {
    await this.prepareEmploymentDraftUploadPage();
    await this.page.locator("#documentCollection button").click();
    await this.uploadFile(fileName, mimeType, fileContent);
    await this.page
      .locator("#documentCollection_0_topLevelDocuments")
      .selectOption("Misc");
    await this.page
      .locator("#documentCollection_0_miscDocuments")
      .selectOption("Other");
    await this.clickSubmitAndWait("after uploading employment document", {
      timeoutMs: 60_000,
      maxAutoAdvanceAttempts: 1,
    });
    await this.waitForCaseDetails("after uploading employment document");
  }
  async createCaseEmployment(
    jurisdiction: string,
    caseType: string,
    options: { allowDraftClaimFallback?: boolean } = {},
  ) {
    const maxAttempts = 2;
    const preferredEventLabels = options.allowDraftClaimFallback
      ? ["Create Case", "Create draft claim"]
      : ["Create Case"];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let lastSelectionError: unknown;
        for (const eventLabel of preferredEventLabels) {
          try {
            await this.createCase(jurisdiction, caseType, eventLabel);
            lastSelectionError = undefined;
            break;
          } catch (error) {
            lastSelectionError = error;
            const message = this.normalizeUnknownError(error);
            const missingRequestedOption = message.includes(
              `Option not found for "${eventLabel}"`,
            );
            const canTryAlternateEvent =
              missingRequestedOption &&
              eventLabel !== preferredEventLabels.at(-1);
            if (canTryAlternateEvent) {
              logger.info(
                "Employment case creation event label unavailable; trying fallback label",
                {
                  attempt,
                  requestedEventLabel: eventLabel,
                },
              );
              continue;
            }
            throw error;
          }
        }

        if (lastSelectionError) {
          throw lastSelectionError;
        }

        await this.assertNoEventCreationError("after starting employment case");
        const isExternalDraftClaimFlow =
          this.page.url().includes("/et1ReppedCreateCase/") ||
          (await this.postCodeSearchInput.isVisible().catch(() => false));

        if (isExternalDraftClaimFlow) {
          const claimantWorkLocationPostcode = "SW20 0BX";
          await this.postCodeSearchInput.waitFor({ state: "visible" });
          await this.postCodeSearchInput.fill(claimantWorkLocationPostcode);
          await this.postCodeSearchButton.click();

          const resolvedAddressMode = await Promise.race([
            this.externalTriageAddressSelect
              .waitFor({ state: "visible" })
              .then(() => "address-select" as const),
            this.externalTriageAddressLine1Input
              .waitFor({ state: "visible" })
              .then(() => "manual-address" as const),
          ]);

          if (resolvedAddressMode === "address-select") {
            const addressOptions =
              await this.externalTriageAddressSelect.evaluate((element) => {
                const select = element as HTMLSelectElement;
                return Array.from(select.options).map((option) => ({
                  text: option.text.trim(),
                  value: option.value,
                }));
              });
            const firstResolvedAddressValue = addressOptions.find(
              (option) =>
                option.value &&
                option.value.trim().length > 0 &&
                !/no address found/i.test(option.text),
            )?.value;
            if (firstResolvedAddressValue) {
              await this.externalTriageAddressSelect.selectOption(
                firstResolvedAddressValue,
              );
            } else {
              await this.manualEntryLink.waitFor({ state: "visible" });
              await this.manualEntryLink.click();
              await this.externalTriageAddressLine1Input.waitFor({
                state: "visible",
              });
              await this.externalTriageAddressLine1Input.fill("1 Test Street");
              await this.externalTriagePostTownInput.fill("London");
              await this.externalTriagePostCodeInput.fill(
                claimantWorkLocationPostcode,
              );
            }
          } else {
            await this.externalTriageAddressLine1Input.waitFor({
              state: "visible",
            });
            await this.externalTriageAddressLine1Input.fill("1 Test Street");
            await this.externalTriagePostTownInput.fill("London");
            await this.externalTriagePostCodeInput.fill(
              claimantWorkLocationPostcode,
            );
          }

          await this.clickSubmitAndWait(
            "after external draft claim work location",
            {
              timeoutMs: 60_000,
              maxAutoAdvanceAttempts: 1,
            },
          );
          await this.waitForCaseDetails(
            "after submitting employment draft claim",
          );
          return;
        }

        await this.receiptDayInput.waitFor({ state: "visible" });
        const today = new Date();
        await this.receiptDayInput.fill(today.getDate().toString());
        await this.receiptMonthInput.fill((today.getMonth() + 1).toString());
        await this.receiptYearInput.fill(today.getFullYear().toString());
        await this.tribunalOfficeSelect.selectOption("Leeds");

        const receiptUrl = this.page.url();
        await this.clickContinueAndWait("after receipt details");
        await this.ensureWizardAdvanced("after receipt details", receiptUrl, {
          expectedPathIncludes: "initiateCase2",
          expectedLocator: this.claimantIndividualRadio,
        });
        await this.claimantIndividualRadio.check();
        await this.claimantIndividualFirstNameInput.fill("Test ");
        await this.claimantIndividualLastNameInput.fill("Person");
        await this.manualEntryLink.waitFor({ state: "visible" });
        await this.manualEntryLink.click();
        await this.claimantAddressLine1Input.waitFor({ state: "visible" });
        await this.claimantAddressLine1Input.fill("1 Test Street");

        await this.clickContinueAndWait("after claimant address");

        await this.addRespondentButton.waitFor({ state: "visible" });
        await this.addRespondentButton.click();
        await this.respondentOneNameInput.waitFor({ state: "visible" });
        await this.respondentOneNameInput.fill("Respondent One");
        await this.respondentOrganisation.waitFor({ state: "visible" });
        if (
          !(await this.respondentOrganisation.isChecked().catch(() => false))
        ) {
          try {
            await this.respondentOrganisation.check();
          } catch {
            await this.respondentOrganisation.click({ force: true });
          }
          await expect(this.respondentOrganisation).toBeChecked({
            timeout: 5_000,
          });
        }
        await this.respondentAcasCertifcateSelectYes.waitFor({
          state: "visible",
        });
        await this.respondentAcasCertifcateSelectYes.check();
        await this.respondentAcasCertificateNumberInput.fill("ACAS123456");
        await this.respondentCompanyNameInput.fill("Respondent Company");
        await this.manualEntryLink.waitFor({ state: "visible" });
        await this.manualEntryLink.click();
        await this.respondentAddressLine1Input.waitFor({ state: "visible" });
        await this.respondentAddressLine1Input.fill("1 Respondent Street");
        await this.respondentAddressPostcodeInput.waitFor({ state: "visible" });
        await this.respondentAddressPostcodeInput.fill("SW1A 1AA");

        await this.clickContinueAndWait("after respondent details");
        if (
          await this.sameAsClaimantWorkAddressYes.isVisible().catch(() => false)
        ) {
          await this.sameAsClaimantWorkAddressYes.click();
          await this.clickContinueAndWait("after work address confirmation");
        }

        if (
          !(await this.claimantRepresentedNo.isVisible().catch(() => false))
        ) {
          await this.clickContinueAndWait("after claim details");
        }

        await this.claimantRepresentedNo.waitFor({ state: "visible" });
        await this.claimantRepresentedNo.click();

        await this.clickContinueAndWait("after claimant representation");

        await this.hearingPreferenceVideo.waitFor({ state: "visible" });
        await this.hearingPreferenceVideo.click();

        await this.clickSubmitButtonWithRetry(
          "after hearing preference selection",
        );
        await this.waitForSpinnerToComplete("after submitting employment case");
        await this.waitForCaseDetails("after submitting employment case");
        return;
      } catch (error) {
        const eventErrorVisible = await this.eventCreationErrorHeading
          .isVisible()
          .catch(() => false);
        if (eventErrorVisible && attempt < maxAttempts) {
          logger.warn("Employment case creation failed; retrying", {
            attempt,
            maxAttempts,
          });
          await this.page.goto("/cases/case-filter");
          continue;
        }
        throw error;
      }
    }
  }

  private async prepareEmploymentDraftUploadPage(): Promise<void> {
    const maxAdvanceAttempts = 8;
    for (let attempt = 1; attempt <= maxAdvanceAttempts; attempt += 1) {
      const currentUrl = this.page.url();
      if (/\/trigger\/uploadDocument\/uploadDocument/i.test(currentUrl)) {
        return;
      }
      const documentCollectionButton = this.page.locator(
        "#documentCollection button",
      );
      if (await documentCollectionButton.isVisible().catch(() => false)) {
        return;
      }

      await this.assertNoEventCreationError(
        `during employment draft upload preparation (attempt ${attempt})`,
      );
      await this.ensureEmploymentDraftRespondentCollectionItem();
      await this.ensureEmploymentDraftClaimantRepresentationAnswered();

      if (await this.reEnterEmploymentDraftUpdateFromCaseDetails()) {
        continue;
      }

      const visibleContinueButton = this.page
        .getByRole("button", { name: /^continue\b/i })
        .first();
      if (!(await visibleContinueButton.isVisible().catch(() => false))) {
        throw new Error(
          `Employment draft update did not reach a document upload page; no Continue button visible at ${this.page.url()}`,
        );
      }
      await this.clickContinueAndWait(
        `employment draft upload preparation step ${attempt}`,
      );
    }

    throw new Error(
      "Employment draft update did not reach the document upload page after 8 steps",
    );
  }

  private async reEnterEmploymentDraftUpdateFromCaseDetails(): Promise<boolean> {
    if (this.page.isClosed()) {
      return false;
    }

    const inCaseDetailsSummary =
      !this.page.url().includes("/trigger/") &&
      (await this.page
        .locator("#next-step")
        .isVisible()
        .catch(() => false));

    if (!inCaseDetailsSummary) {
      return false;
    }

    const caseActionsDropdown = this.page.locator("#next-step");
    const goButton = this.page.locator(".event-trigger button");
    if (!(await goButton.isVisible().catch(() => false))) {
      return false;
    }

    try {
      await caseActionsDropdown.selectOption({ label: "Update case" });
    } catch {
      if (this.page.isClosed()) {
        return false;
      }
      const updateCaseOption = await caseActionsDropdown.evaluate((element) => {
        if (!(element instanceof HTMLSelectElement)) {
          return null;
        }
        const option = Array.from(element.options).find((candidate) =>
          /update case/i.test(candidate.label),
        );
        return option?.value ?? null;
      });
      if (!updateCaseOption) {
        return false;
      }
      await caseActionsDropdown.selectOption(updateCaseOption);
    }

    await goButton.click();
    await this.waitForSpinnerToComplete(
      "after re-entering employment update-case flow",
    );
    await this.page.waitForLoadState("domcontentloaded");
    await this.assertNoEventCreationError(
      "after re-entering employment update-case flow",
    );
    return true;
  }

  private async ensureEmploymentDraftRespondentCollectionItem(): Promise<void> {
    if (!this.page.url().includes("/UPDATE_CASE_DRAFT3")) {
      return;
    }

    const existingCollectionItem = this.page
      .locator('[id^="respondentCollection_0"]')
      .first();
    if ((await existingCollectionItem.count()) > 0) {
      return;
    }

    await this.addRespondentButton.waitFor({ state: "visible" });
    await this.addRespondentButton.click();
    await expect(
      this.page.locator('[id^="respondentCollection_0"]').first(),
    ).toBeAttached();
  }

  private async ensureEmploymentDraftClaimantRepresentationAnswered(): Promise<void> {
    if (!this.page.url().includes("/UPDATE_CASE_DRAFT8")) {
      return;
    }

    const claimantRepresentationGroup = this.page.getByRole("group", {
      name: "Is the Claimant Represented?",
    });
    if (!(await claimantRepresentationGroup.isVisible().catch(() => false))) {
      return;
    }

    const noRadio = claimantRepresentationGroup.getByRole("radio", {
      name: "No",
    });
    if (await noRadio.isChecked().catch(() => false)) {
      return;
    }

    await noRadio.check();
  }

  async createDivorceCase(
    jurisdiction: string,
    caseType: string,
    testInput: string,
    options: CreateDivorceCaseOptions = {},
  ) {
    switch (caseType) {
      case "xuiCaseFlagsV1":
        return this.createDivorceCaseFlag(testInput, jurisdiction, caseType);
      case "XUI Case PoC":
        return this.createDivorceCasePoC(
          jurisdiction,
          caseType,
          testInput,
          options,
        );
      case "xuiTestCaseType":
        return this.createDivorceCaseTest(testInput, jurisdiction, caseType);
      default:
        throw new Error(
          `createDivorceCase does not support case type: ${caseType}`,
        );
    }
  }

  async createDivorceCaseTest(
    testData: string,
    jurisdiction: string = "DIVORCE",
    caseType: string = "xuiTestCaseType",
  ) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const today = new Date();
        await this.createCase(jurisdiction, caseType, "");
        await this.assertNoEventCreationError(
          "after starting divorce test case",
        );

        await this.textFieldInput.fill(testData);
        await this.clickContinueAndWait("after text field");

        await this.emailFieldInput.fill(
          faker.internet.email({ provider: "example.com" }),
        );
        await this.phoneNumberFieldInput.fill("07123456789");
        await this.dateFieldDayInput.fill(today.getDate().toString());
        await this.dateFieldMonthInput.fill((today.getMonth() + 1).toString());
        await this.dateFieldYearInput.fill(
          (today.getFullYear() - 20).toString(),
        );
        await this.dateTimeFieldDayInput.fill(today.getDate().toString());
        await this.dateTimeFieldMonthInput.fill(
          (today.getMonth() + 1).toString(),
        );
        await this.dateTimeFieldYearInput.fill(today.getFullYear().toString());
        await this.dateTimeFieldHourInput.fill("10");
        await this.dateTimeFieldMinuteInput.fill("30");
        await this.dateTimeFieldSecondInput.fill("15");
        await this.currencyFieldInput.fill("1000");
        await this.clickContinueAndWait("after contact details");

        await this.yesNoRadioButtons.getByLabel("Yes").check();
        await this.applicantPostcode.fill("SW1A 1AA");
        await this.complexType1JudgeIsRightRadios.getByLabel("No").check();
        await this.complexType1LevelOfJudgeRadioButtons
          .getByLabel("Item 1")
          .check();
        await this.complexType1LevelOfJudgeDetailsInput.fill(
          "Details about why this level of judge is needed.",
        );
        await this.complexType1LevelOfJudgeKeyInput.fill("Key information");
        await this.manualEntryLink.click();
        await this.complexType2AddressLine1Input.fill("10 Test Street");
        await this.complexType2EmailInput.fill(
          faker.internet.email({ provider: "example.com" }),
        );
        await this.uploadFile(
          "sample.pdf",
          "application/pdf",
          "%PDF-1.4\n%test\n%%EOF",
          this.complexType3FileUploadInput,
        );
        await this.complexType3ComplianceButton.click();
        await this.complexType3ComplianceInput.fill("Compliant response");
        await this.complexType3DateOfBirthDay.fill("15");
        await this.complexType3DateOfBirthMonth.fill("06");
        await this.complexType3DateOfBirthYear.fill("1990");
        await this.complexType3DateOfHearingDay.fill(
          today.getDate().toString(),
        );
        await this.complexType3DateOfHearingMonth.fill(
          (today.getMonth() + 1).toString(),
        );
        await this.complexType3DateOfHearingYear.fill(
          today.getFullYear().toString(),
        );
        await this.complexType3DateOfHearingHour.fill("14");
        await this.complexType3DateOfHearingMinute.fill("45");
        await this.complexType3DateOfHearingSecond.fill("30");
        await this.complexType4AmountInput.fill("500");
        await this.complexType4FirstTickBox.check();
        await this.complexType4SelectList.selectOption("Item 1");
        await this.clickContinueAndWait("after complex type fields");

        await this.assertNoEventCreationError(
          "before submitting divorce test case",
        );
        await this.clickSubmitAndWait("before submitting divorce test case", {
          timeoutMs: 60_000,
        });
        await this.waitForCaseDetails("after submitting divorce test case");
        return;
      } catch (error) {
        const eventErrorVisible = await this.eventCreationErrorHeading
          .isVisible()
          .catch(() => false);
        const shouldRetry =
          (eventErrorVisible || isTransientWorkflowFailure(error)) &&
          attempt < maxAttempts;
        if (shouldRetry) {
          logger.warn("Divorce test case creation failed; retrying", {
            attempt,
            maxAttempts,
          });
          if (!this.page.isClosed()) {
            await this.page.goto("/cases/case-filter");
          }
          continue;
        }
        throw error;
      }
    }
  }

  async createDivorceCaseFlag(
    testData: string,
    jurisdiction: string = "DIVORCE",
    caseType: string = "xuiCaseFlagsV1",
  ) {
    await this.createCase(jurisdiction, caseType, "");
    await this.party1RoleOnCase.fill(testData);
    await this.party1Name.fill(testData);
    await this.party2RoleOnCase.fill(`${testData}2`);
    await this.party2Name.fill(`${testData}2`);
    await this.clickContinueAndWait(
      "after submitting divorce case flags (continue)",
    );
    await this.testSubmitButton.click();
    await this.waitForSpinnerToComplete(
      "after submitting divorce case flags (submit)",
    );
    await this.waitForCaseDetails("after submitting divorce case flags");
  }

  async selectDivorceReasons(reasons: string[]) {
    const divorceReasonField = this.page.locator("#DivorceReason");
    if (!(await divorceReasonField.isVisible().catch(() => false))) {
      return;
    }

    for (const reason of reasons) {
      const divorceReasonCheckbox = divorceReasonField
        .getByLabel(reason, { exact: true })
        .first();
      const checkboxVisible = await divorceReasonCheckbox
        .isVisible()
        .catch(() => false);
      if (checkboxVisible) {
        await divorceReasonCheckbox.check({ force: true });
        continue;
      }

      const checkboxId = await divorceReasonCheckbox
        .getAttribute("id")
        .catch(() => null);
      const labelLocator =
        checkboxId && checkboxId.trim().length > 0
          ? divorceReasonField.locator(`label[for="${checkboxId}"]`).first()
          : divorceReasonField.getByText(reason, { exact: true }).first();
      const labelVisible = await labelLocator.isVisible().catch(() => false);
      if (labelVisible) {
        await labelLocator.click({ force: true });
      }
    }
  }

  private normalizeDivorcePocPeopleData(
    data?: FillDivorcePocSectionsOptions["data"],
  ): Array<Partial<PersonData>> {
    if (Array.isArray(data)) {
      return data;
    }

    return data ? [data] : [];
  }

  private async fillDivorcePocPerson(
    person: "person1" | "person2",
    data?: Partial<PersonData>,
  ): Promise<void> {
    if (!data) {
      return;
    }

    const titleInput =
      person === "person1" ? this.person1TitleInput : this.person2TitleInput;
    const firstNameInput =
      person === "person1"
        ? this.person1FirstNameInput
        : this.person2FirstNameInput;
    const lastNameInput =
      person === "person1"
        ? this.person1LastNameInput
        : this.person2LastNameInput;
    const genderSelect =
      person === "person1"
        ? this.person1GenderSelect
        : this.person2GenderSelect;
    const maidenNameInput =
      person === "person1"
        ? this.person1MaidenNameInput
        : this.person2MaidenNameInput;
    const jobTitleInput =
      person === "person1"
        ? this.person1JobTitleInput
        : this.person2JobTitleInput;
    const jobDescriptionInput =
      person === "person1"
        ? this.person1JobDescriptionInput
        : this.person2JobDescriptionInput;

    const fieldsToFill: Array<[Locator, string | undefined]> = [
      [titleInput, data.title],
      [firstNameInput, data.firstName],
      [lastNameInput, data.lastName],
      [jobTitleInput, data.jobTitle],
      [jobDescriptionInput, data.jobDescription],
    ];
    for (const [locator, value] of fieldsToFill) {
      if (value) {
        await locator.fill(value);
      }
    }

    if (data.gender) {
      await genderSelect.selectOption(data.gender);
    }

    if (data.gender?.toLowerCase() === "female") {
      await maidenNameInput.waitFor({ state: "visible" });
      await maidenNameInput.fill(data.maidenName ?? "");
    }
  }

  private async advanceFromDivorcePocPersonalDetails(): Promise<void> {
    const personalDetailsUrl = this.page.url();
    await this.clickContinueAndWait("after PoC personal details");
    await this.ensureWizardAdvanced(
      "after PoC personal details",
      personalDetailsUrl,
      {
        expectedLocator: this.textField0Input,
        timeoutMs: EXUI_TIMEOUTS.POC_FIELD_VISIBLE,
      },
    );
  }

  private async fillDivorcePocTextFields(
    textFields?: FillDivorcePocSectionsOptions["textFields"],
  ): Promise<void> {
    if (textFields?.textField1 !== undefined) {
      await this.textField1Input.fill(textFields.textField1);
    }
    if (textFields?.textField2 !== undefined) {
      await this.textField2Input.fill(textFields.textField2);
    }
    if (textFields?.textField3 !== undefined) {
      await this.textField3Input.fill(textFields.textField3);
    }
    if (textFields?.textField0 !== undefined) {
      await this.textField0Input.fill(textFields.textField0);
    }
  }

  private async advanceFromDivorcePocHiddenFieldDetails(): Promise<void> {
    const hiddenFieldDetailsUrl = this.page.url();
    await this.clickContinueAndWait("after hidden field details");
    await this.ensureWizardAdvanced(
      "after hidden field details",
      hiddenFieldDetailsUrl,
      {
        expectedLocator: this.checkYourAnswersHeading,
        timeoutMs: EXUI_TIMEOUTS.POC_FIELD_VISIBLE,
      },
    );
  }

  private async fillDivorcePocSectionsOnce(
    options: FillDivorcePocSectionsOptions,
  ): Promise<void> {
    const peopleData = this.normalizeDivorcePocPeopleData(options.data);

    await this.genderRadioButtons
      .getByLabel(options.gender ?? "Male", { exact: true })
      .first()
      .click();
    await this.fillDivorcePocPerson("person1", peopleData[0]);
    await this.fillDivorcePocPerson("person2", peopleData[1]);
    await this.advanceFromDivorcePocPersonalDetails();
    await this.fillDivorcePocTextFields(options.textFields);

    if (options.divorceReasons?.length) {
      await this.selectDivorceReasons(options.divorceReasons);
    }

    await this.advanceFromDivorcePocHiddenFieldDetails();
  }

  private async isTransientDivorcePocSectionFailure(
    error: unknown,
  ): Promise<boolean> {
    const message = this.normalizeUnknownError(error);
    return (
      isTransientWorkflowFailure(error) ||
      message.includes("Validation error after after PoC personal details") ||
      message.includes("The event could not be created") ||
      (await this.eventCreationErrorHeading.isVisible().catch(() => false))
    );
  }

  async fillDivorcePocSections(
    options: FillDivorcePocSectionsOptions = {},
  ): Promise<void> {
    const startUrl = this.page.url();
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.fillDivorcePocSectionsOnce(options);
        return;
      } catch (error) {
        if (
          !(await this.isTransientDivorcePocSectionFailure(error)) ||
          attempt >= maxAttempts
        ) {
          throw error;
        }

        logger.warn(
          "Divorce PoC section fill failed during wizard advance; retrying from start page",
          {
            attempt,
            maxAttempts,
          },
        );
        await this.page.goto(startUrl);
        await this.person1TitleInput.waitFor({
          state: "visible",
          timeout: EXUI_TIMEOUTS.POC_FIELD_VISIBLE,
        });
      }
    }
  }

  async createDivorceCasePoC(
    // NOSONAR typescript:S3776 — Cognitive Complexity acceptable per agents.md §6.2.10: multi-attempt Divorce PoC creation with retry and data-variant handling
    jurisdiction: string,
    caseType: string,
    dataOrTextField0?: DivorcePoCData | string,
    options: CreateDivorceCaseOptions = {},
  ) {
    const data =
      typeof dataOrTextField0 === "string"
        ? ({ textField0: dataOrTextField0 } as DivorcePoCData)
        : dataOrTextField0;
    const maxAttempts = options.maxAttempts ?? 2;
    const preferredGenders = data?.gender
      ? [data.gender]
      : ["Male", "Female", "Not given", "Not Known", "Unknown"];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.createCase(jurisdiction, caseType, "", {
          maxAttempts: options.createCaseMaxAttempts,
        });
        const availableGender = await this.person1GenderSelect.evaluate(
          (select) => {
            const options = Array.from(
              (select as HTMLSelectElement).options,
            ).map((option) => option.label.trim());
            return options;
          },
        );
        const gender =
          preferredGenders.find((candidate) =>
            availableGender.includes(candidate),
          ) ?? "Male";
        const genderRadio = this.page.getByLabel(gender, { exact: true });
        if (await genderRadio.isVisible().catch(() => false)) {
          await genderRadio.check();
        }
        await this.person1TitleInput.click();
        await this.person1TitleInput.fill(
          data?.person1Title ?? faker.person.prefix(),
        );
        await this.person1FirstNameInput.fill(
          data?.person1FirstName ?? faker.person.firstName(),
        );
        await this.person1LastNameInput.fill(
          data?.person1LastName ?? faker.person.lastName(),
        );
        await this.person1GenderSelect.selectOption(
          data?.person1Gender ?? gender,
        );
        await this.person1JobTitleInput.fill(
          data?.person1JobTitle ?? faker.person.jobTitle(),
        );
        await this.person1JobDescriptionInput.fill(
          data?.person1JobDescription ?? faker.lorem.sentence(),
        );
        const personalDetailsUrl = this.page.url();
        await this.clickContinueAndWait("after PoC personal details");
        await this.ensureWizardAdvanced(
          "after PoC personal details",
          personalDetailsUrl,
          {
            expectedLocator: this.textField0Input,
            timeoutMs: EXUI_TIMEOUTS.POC_FIELD_VISIBLE,
          },
        );
        await this.textField0Input.fill(data?.textField0 ?? faker.lorem.word());
        await this.textField3Input.fill(data?.textField3 ?? faker.lorem.word());
        await this.textField1Input.fill(data?.textField1 ?? faker.lorem.word());
        await this.textField2Input.fill(data?.textField2 ?? faker.lorem.word());
        await this.clickContinueAndWait("after PoC text fields");
        await this.checkYourAnswersHeading.waitFor({
          state: "visible",
          timeout: EXUI_TIMEOUTS.POC_FIELD_VISIBLE,
        });

        await this.testSubmitButton.click();
        await this.waitForSpinnerToComplete(
          "after submitting divorce PoC case",
        );
        await this.waitForCaseDetails("after submitting divorce PoC case");

        return;
      } catch (error) {
        const message = this.normalizeUnknownError(error);
        const isTransientCreationFailure =
          isTransientWorkflowFailure(error) ||
          message.includes("Validation error after after PoC text fields") ||
          message.includes("The event could not be created") ||
          (await this.eventCreationErrorHeading.isVisible().catch(() => false));
        if (isTransientCreationFailure && attempt < maxAttempts) {
          logger.warn("Divorce PoC case creation failed; retrying", {
            attempt,
            maxAttempts,
          });
          if (!this.page.isClosed()) {
            await this.page.goto("/cases/case-filter");
          }
          continue;
        }
        throw error;
      }
    }
  }

  async generateDivorcePoCPersonData(
    overrides: Partial<PersonData> = {},
  ): Promise<PersonData> {
    return {
      title: overrides.title ?? faker.person.prefix(),
      firstName:
        overrides.firstName ??
        `${faker.person.firstName()} ${faker.person.middleName()}`,
      maidenName: overrides.maidenName ?? faker.person.lastName(),
      lastName: overrides.lastName ?? faker.person.lastName(),
      gender: overrides.gender ?? "Male",
      jobTitle: overrides.jobTitle ?? faker.person.jobTitle(),
      jobDescription: overrides.jobDescription ?? faker.lorem.sentence(),
    };
  }

  async generateDivorcePoCData(
    overrides: Partial<DivorcePoCData> = {},
  ): Promise<DivorcePoCData> {
    const gender =
      overrides.gender ??
      faker.helpers.arrayElement(["Male", "Female", "Not given"]);
    const reasonsForDivorce = overrides.divorceReasons ?? [
      faker.helpers.arrayElement([
        "Behaviour",
        "Adultery",
        "Desertion",
        "2-year separation (with consent)",
        "5-year separation",
      ]),
    ];
    const generatedAt = overrides.generatedAt ?? new Date().toISOString();
    return {
      gender,
      person1Title: overrides.person1Title ?? faker.person.prefix(),
      person1FirstName: overrides.person1FirstName ?? faker.person.firstName(),
      person1LastName: overrides.person1LastName ?? faker.person.lastName(),
      person1Gender: overrides.person1Gender ?? gender,
      person1JobTitle: overrides.person1JobTitle ?? faker.person.jobTitle(),
      person1JobDescription:
        overrides.person1JobDescription ?? faker.lorem.sentence(),
      textField0:
        overrides.textField0 ??
        faker.lorem.sentence() + faker.date.soon().getTime(),
      textField1:
        overrides.textField1 ??
        faker.lorem.sentence() + faker.date.soon().getTime(),
      textField2:
        overrides.textField2 ??
        faker.lorem.sentence() + faker.date.soon().getTime(),
      textField3:
        overrides.textField3 ??
        faker.lorem.sentence() + faker.date.soon().getTime(),
      divorceReasons: overrides.divorceReasons ?? reasonsForDivorce,
      generatedAt,
    };
  }
}
