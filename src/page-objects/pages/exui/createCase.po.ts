import { faker } from "@faker-js/faker";
import { expect, type Locator, Page } from "@playwright/test";

import { isTransientWorkflowFailure } from "../../../tests/e2e/utils/transient-failure.utils.js";
import { Base } from "../../base";

import { extractCaseNumberFromUrl } from "./caseDetails.po.js";
import {
  matchCreateCaseOption,
  normalizeCreateCaseOptionToken,
  resolveCreateCaseStartEvent
} from "./createCase.options";
import { EXUI_TIMEOUTS } from "./exui-timeouts";

export type SelectOption = { label: string; value: string };

export interface CreateCaseSelection {
  availableJurisdictions: SelectOption[];
  availableCaseTypes: SelectOption[];
  selectedJurisdiction?: SelectOption;
  selectedCaseType?: SelectOption;
}

export type PersonData = {
  title?: string;
  firstName?: string;
  lastName?: string;
  maidenName?: string;
  gender?: string;
  jobTitle?: string;
  jobDescription?: string;
};

export type DivorcePoCData = PersonData & {
  textField0?: string;
  textField1?: string;
  textField2?: string;
  textField3?: string;
  divorceReasons?: string[];
  generatedAt?: string;
};

export class CreateCasePage extends Base {
  readonly container = this.page.locator("exui-case-home");
  readonly caseDetailsContainer = this.page.locator("exui-case-details-home");
  readonly caseAlertSuccessMessage = this.page
    .locator(".hmcts-banner--success .alert-message, .exui-alert .alert-message")
    .first();
  readonly createCaseButton = this.container.getByRole("link", { name: "Create case" });
  readonly jurisdictionSelect = this.page.getByLabel("Jurisdiction");
  readonly caseTypeSelect = this.page.getByLabel("Case type");
  readonly eventTypeSelect = this.page.locator("#cc-event");
  readonly startButton = this.page.getByRole("button", { name: "Start" });
  readonly submitButton = this.page.getByRole("button", { name: "Submit" });
  readonly fileUploadInput = this.page.locator("#DocumentUrl");
  readonly fileUploadStatusLabel = this.page.locator("ccd-write-document-field .error-message");

  // Locators for the Divorce
  readonly person1Title = this.page.locator("#Person1_Title");
  readonly person1TitleInput = this.page.locator("#Person1_Title");
  readonly person1FirstNameInput = this.page.locator("#Person1_FirstName");
  readonly person1MaidenNameInput = this.page.locator("#Person1_MaidenName");
  readonly person1LastNameInput = this.page.locator("#Person1_LastName");
  readonly person1GenderSelect = this.page.locator("#Person1_PersonGender");
  readonly person1JobTitleInput = this.page.locator("#Person1_PersonJob_Title");
  readonly person1JobDescriptionInput = this.page.locator("#Person1_PersonJob_Description");
  readonly person1RetainedGroup = this.page
    .getByRole("group", { name: /Person 1 - retained/i })
    .first();
  readonly person1RetainedTitleInput = this.person1RetainedGroup.getByLabel("Title (Optional)");
  readonly firstNameInput = this.page
    .getByRole("group", { name: "Person 1 - retained (Optional)" })
    .getByLabel("First Name (Optional)");
  readonly lastNameInput = this.page
    .getByRole("group", { name: "Person 1 - retained (Optional)" })
    .getByLabel("Last Name (Optional)");
  readonly genderSelect = this.page
    .getByRole("group", { name: "Person 1 - retained (Optional)" })
    .getByLabel("Gender (Optional)");
  readonly jobTitleInput = this.page
    .getByRole("group", { name: "Job (Optional)" })
    .getByLabel("Title (Optional)");
  readonly jobDescriptionInput = this.page.getByRole("textbox", { name: "Description (Optional)" });
  readonly person2TitleInput = this.page.locator("#Person2_Title");
  readonly person2FirstNameInput = this.page.locator(
    '[data-testid="Person2_FirstName"] input, [data-testid="Person2_FirstName"], #Person2_FirstName, [name="Person2_FirstName"]'
  );
  readonly person2MaidenNameInput = this.page.locator("#Person2_MaidenName");
  readonly person2LastNameInput = this.page.locator(
    '[data-testid="Person2_LastName"] input, [data-testid="Person2_LastName"], #Person2_LastName, [name="Person2_LastName"]'
  );
  readonly person2GenderSelect = this.page.locator("#Person2_PersonGender");
  readonly person2JobTitleInput = this.page.locator("#Person2_PersonJob_Title");
  readonly person2JobDescriptionInput = this.page.locator("#Person2_PersonJob_Description");
  readonly continueButton = this.page.getByRole("button", { name: "Continue" });
  readonly textField0Input = this.page.getByLabel("Text Field 0");
  readonly textField1Input = this.page.getByLabel("Text Field 1 (Optional)");
  readonly textField2Input = this.page.getByLabel("Text Field 2 (Optional)");
  readonly textField3Input = this.page.getByLabel("Text Field 3 (Optional)");
  readonly genderRadioButtons = this.page.locator("#Gender .multiple-choice, #Gender .govuk-radios__item");
  readonly divorceReasons = this.page.locator("#DivorceReason .multiple-choice, #DivorceReason .govuk-checkboxes__item");
  readonly checkYourAnswers = this.page.locator("form.check-your-answers");
  readonly checkYourAnswersHeading = this.page.getByRole("heading", { name: "Check your answers" });
  readonly checkYourAnswersTable = this.checkYourAnswers.locator("table").first();
  readonly testSubmitButton = this.page.getByRole("button", { name: "Test submit" });
  readonly eventCreationErrorHeading = this.page.getByRole("heading", { name: "The event could not be created" });
  readonly validationErrorMessage = this.page.locator(".validation-error, .govuk-error-message");
  readonly textFieldInput = this.page.locator("#TextField");
  readonly emailFieldInput = this.page.locator("#EmailField");
  readonly phoneNumberFieldInput = this.page.locator("#PhoneUKField");
  readonly dateFieldDayInput = this.page.locator("#DateField-day");
  readonly dateFieldMonthInput = this.page.locator("#DateField-month");
  readonly dateFieldYearInput = this.page.locator("#DateField-year");
  readonly dateTimeFieldDayInput = this.page.locator("#DateTimeField-day");
  readonly dateTimeFieldMonthInput = this.page.locator("#DateTimeField-month");
  readonly dateTimeFieldYearInput = this.page.locator("#DateTimeField-year");
  readonly dateTimeFieldHourInput = this.page.locator("#DateTimeField-hour");
  readonly dateTimeFieldMinuteInput = this.page.locator("#DateTimeField-minute");
  readonly dateTimeFieldSecondInput = this.page.locator("#DateTimeField-second");
  readonly currencyFieldInput = this.page.locator("#AmountInGBPField");
  readonly yesNoRadioButtons = this.page.locator("#YesOrNoField");
  readonly applicantPostcode = this.page.locator("#AppicantPostcodeField");
  readonly complexType1JudgeIsRightRadios = this.page.locator("#ComplexType_1_judgeLevelRadio");
  readonly complexType1LevelOfJudgeRadioButtons = this.page.locator("#ComplexType_1_proposal");
  readonly complexType1LevelOfJudgeDetailsInput = this.page.locator("#ComplexType_1_proposalReason");
  readonly complexType1LevelOfJudgeKeyInput = this.page.locator("#ComplexType_1_TextField");
  readonly complexType2AddressLine1Input = this.page.locator("#ComplexType_2_address__detailAddressLine1");
  readonly complexType2EmailInput = this.page.locator("#ComplexType_2_email");
  readonly complexType3ComplianceButton = this.page.locator("#ComplexType_3_responses button");
  readonly complexType3ComplianceInput = this.page.locator("#ComplexType_3_responses input");
  readonly complexType3DateOfBirthDay = this.page.locator("#dateOfBirth-day");
  readonly complexType3DateOfBirthMonth = this.page.locator("#dateOfBirth-month");
  readonly complexType3DateOfBirthYear = this.page.locator("#dateOfBirth-year");
  readonly complexType3FileUploadInput = this.page.locator("#ComplexType_3_document");
  readonly complexType3DateOfHearingDay = this.page.locator("#dateTimeUploaded-day");
  readonly complexType3DateOfHearingMonth = this.page.locator("#dateTimeUploaded-month");
  readonly complexType3DateOfHearingYear = this.page.locator("#dateTimeUploaded-year");
  readonly complexType3DateOfHearingHour = this.page.locator("#dateTimeUploaded-hour");
  readonly complexType3DateOfHearingMinute = this.page.locator("#dateTimeUploaded-minute");
  readonly complexType3DateOfHearingSecond = this.page.locator("#dateTimeUploaded-second");
  readonly complexType4AmountInput = this.page.locator("#ComplexType_4_amount");
  readonly complexType4FirstTickBox = this.page.locator("#ComplexType_4_selectedCategories-item_1");
  readonly complexType4SelectList = this.page.locator("#ComplexType_4_FixedListField");

  // Locators for the Divorce - Case flags
  readonly party1RoleOnCase = this.page.locator("#LegalRepParty1Flags_roleOnCase");
  readonly party1Name = this.page.locator("#LegalRepParty1Flags_partyName");
  readonly party2RoleOnCase = this.page.locator("#LegalRepParty2Flags_roleOnCase");
  readonly party2Name = this.page.locator("#LegalRepParty2Flags_partyName");

  // Employment case locators
  readonly receiptDayInput = this.page.locator("#receiptDate-day");
  readonly receiptMonthInput = this.page.locator("#receiptDate-month");
  readonly receiptYearInput = this.page.locator("#receiptDate-year");
  readonly tribunalOfficeSelect = this.page.locator("#managingOffice");
  readonly claimantIndividualRadio = this.page.locator("#claimant_TypeOfClaimant-Individual");
  readonly claimantIndividualFirstNameInput = this.page.locator("#claimantIndType_claimant_first_names");
  readonly claimantIndividualLastNameInput = this.page.locator("#claimantIndType_claimant_last_name");
  readonly addRespondentButton = this.page.locator("#respondentCollection button");
  readonly respondentOneNameInput = this.page.locator("#respondentCollection_0_respondent_name");
  readonly respondentOrganisation = this.page.locator("#respondentCollection_0_respondentType-Organisation");
  readonly respondentAcasCertifcateSelectYes = this.page.locator("#respondentCollection_0_respondent_ACAS_question_Yes");
  readonly respondentAcasCertificateNumberInput = this.page.locator("#respondentCollection_0_respondent_ACAS");
  readonly respondentCompanyNameInput = this.page.locator("#respondentCollection_0_respondentOrganisation");
  readonly respondentAddressLine1Input = this.page.locator("#respondentCollection_0_respondent_address__detailAddressLine1");
  readonly respondentAddressPostcodeInput = this.page.locator("#respondentCollection_0_respondent_address__detailPostCode");
  readonly sameAsClaimantWorkAddressYes = this.page.locator("#claimantWorkAddressQuestion_Yes");
  readonly claimantRepresentedNo = this.page.locator("#claimantRepresentedQuestion_No");
  readonly hearingPreferenceVideo = this.page.locator("#claimantHearingPreference_hearing_preferences-Video");
  readonly manualEntryLink = this.page.locator(".manual-link");
  readonly claimantAddressLine1Input = this.page.locator("#claimantType_claimant_addressUK__detailAddressLine1");
  readonly externalTriageAddressLine1Input = this.page.locator("#address1");
  readonly externalTriagePostTownInput = this.page.locator("#postTown");
  readonly externalTriagePostCodeInput = this.page.locator("#postCode");
  readonly externalTriageAddressSelect = this.page.locator("#claimantWorkAddressUK");
  readonly postCodeSearchInput = this.page.locator("#postCodeLookup-input");
  readonly postCodeSearchButton = this.page.locator("#postCodeLookup-button");
  readonly addressSelect = this.page.locator("#claimantWorkAddressUK");

  // Warning modal
  readonly refreshModal = this.page.locator(".refresh-modal");
  readonly refreshModalConfirmButton = this.refreshModal.getByRole("button", { name: "Ok" });
  readonly errorSummary = this.page.locator(".govuk-error-summary, .error-summary, ccd-write-error-summary");
  readonly somethingWentWrongHeading = this.page
    .getByRole("heading", { name: /something went wrong/i })
    .first();

  constructor(page: Page) {
    super(page);
  }

  private async waitForCreateCasePoll(intervalMs: number): Promise<void> {
    // CCD wizard controls redraw asynchronously between steps; a short poll keeps the retry loop stable.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(intervalMs);
  }

  private async resolveVisibleField(
    candidates: Locator[],
    description: string,
    options?: { timeoutMs?: number; required?: true }
  ): Promise<Locator>;
  private async resolveVisibleField(
    candidates: Locator[],
    description: string,
    options: { timeoutMs?: number; required: false }
  ): Promise<Locator | null>;
  private async resolveVisibleField(
    candidates: Locator[],
    description: string,
    options: { timeoutMs?: number; required?: boolean } = {}
  ): Promise<Locator | null> {
    const required = options.required ?? true;
    const timeoutMs = options.timeoutMs ?? (required ? EXUI_TIMEOUTS.POC_FIELD_VISIBLE : 5_000);
    const deadlineMs = Date.now() + timeoutMs;

    while (Date.now() < deadlineMs) {
      for (const candidate of candidates) {
        if (await candidate.isVisible().catch(() => false)) {
          return candidate;
        }
      }

      await this.waitForCreateCasePoll(250);
    }

    if (!required) {
      return null;
    }

    throw new Error(`CreateCase: ${description} did not become visible within ${timeoutMs}ms.`);
  }

  private async resolveOptionalVisibleField(
    candidates: Locator[],
    description: string,
    timeoutMs = 5_000
  ): Promise<Locator | null> {
    return this.resolveVisibleField(candidates, description, {
      required: false,
      timeoutMs
    });
  }

  async waitForDivorcePocPersonalDetailsReady(
    timeoutMs = EXUI_TIMEOUTS.POC_FIELD_VISIBLE
  ): Promise<void> {
    await this.resolveVisibleField(
      [
        this.person1TitleInput,
        this.person1RetainedTitleInput,
        this.person1FirstNameInput,
        this.firstNameInput
      ],
      "divorce PoC personal details form",
      { timeoutMs }
    );
  }

  async ensureCreateCasePage(timeoutMs = 120_000): Promise<void> {
    const onCreatePage = await this.startButton.isVisible().catch(() => false);
    if (!onCreatePage) {
      const homeCreateCaseVisible = await this.createCaseButton.isVisible().catch(() => false);
      if (homeCreateCaseVisible) {
        await this.createCaseButton.click();
      } else {
        const primaryNavCreateCaseLink = this.page
          .locator("nav[aria-label='Primary navigation']")
          .getByRole("link", { name: "Create case" });
        const primaryNavVisible = await primaryNavCreateCaseLink.isVisible().catch(() => false);
        if (primaryNavVisible) {
          await primaryNavCreateCaseLink.click();
        } else {
          await this.page.goto("/cases/case-filter");
        }
      }
    }
    await expect(this.startButton).toBeVisible({ timeout: timeoutMs });
    await expect(this.jurisdictionSelect).toBeVisible({ timeout: timeoutMs });
  }

  async resolveCreateCaseSelection(
    desiredJurisdiction: string,
    desiredCaseType: string
  ): Promise<CreateCaseSelection> {
    const selectionTimeoutMs = 120_000;
    await this.ensureCreateCasePage();
    const availableJurisdictions = await this.readSelectableOptionsWithGrace(
      this.jurisdictionSelect,
      selectionTimeoutMs
    );
    const selectedJurisdiction = this.matchOption(availableJurisdictions, desiredJurisdiction);
    if (!selectedJurisdiction) {
      return {
        availableJurisdictions,
        availableCaseTypes: [],
        selectedJurisdiction,
        selectedCaseType: undefined
      };
    }

    await this.selectOptionWhenReady(
      this.jurisdictionSelect,
      this.resolveOptionValue(selectedJurisdiction)
    );
    const availableCaseTypes = await this.readSelectableOptionsWithGrace(
      this.caseTypeSelect,
      selectionTimeoutMs
    );
    const selectedCaseType = this.matchOption(availableCaseTypes, desiredCaseType);
    return {
      availableJurisdictions,
      availableCaseTypes,
      selectedJurisdiction,
      selectedCaseType
    };
  }

  async createCase(jurisdiction: string, caseType: string, eventType?: string) {
    const requestedEventType = eventType?.trim();
    await this.ensureCreateCasePage();
    await this.selectOptionWhenReady(this.jurisdictionSelect, jurisdiction);
    await this.selectOptionWhenReady(this.caseTypeSelect, caseType);
    if (requestedEventType) {
      await this.selectOptionWhenReady(this.eventTypeSelect, requestedEventType);
    }
    await this.ensureStartButtonReady(requestedEventType);
    await this.startButton.click();
  }

  async createDivorceCase(jurisdiction: string, caseType: string, textField0: string) {
    const normalizedCaseType = normalizeCreateCaseOptionToken(caseType);
    if (normalizedCaseType === normalizeCreateCaseOptionToken("xuiCaseFlagsV1")) {
      await this.createCaseFlagDivorceCase(textField0, jurisdiction, caseType);
      return;
    }

    if (
      normalizedCaseType === normalizeCreateCaseOptionToken("XUI Test Case type") ||
      normalizedCaseType === normalizeCreateCaseOptionToken("xuiTestCaseType")
    ) {
      await this.createDivorceTestCase(jurisdiction, caseType, textField0);
      return;
    }

    if (normalizedCaseType === normalizeCreateCaseOptionToken("XUI Case PoC")) {
      await this.createCase(jurisdiction, caseType);
      await this.fillGenericDivorceCase(textField0);
      return;
    }

    throw new Error(`createDivorceCase does not support case type: ${caseType}`);
  }

  private async createDivorceTestCase(
    jurisdiction: string,
    caseType: string,
    testData: string
  ): Promise<void> {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const today = new Date();
        await this.createCase(jurisdiction, caseType, "");
        await this.assertNoEventCreationError("after starting divorce test case");

        await this.textFieldInput.fill(testData);
        await this.clickContinueAndWait("after text field");

        await this.emailFieldInput.fill(faker.internet.email({ provider: "example.com" }));
        await this.phoneNumberFieldInput.fill("07123456789");
        await this.dateFieldDayInput.fill(today.getDate().toString());
        await this.dateFieldMonthInput.fill((today.getMonth() + 1).toString());
        await this.dateFieldYearInput.fill((today.getFullYear() - 20).toString());
        await this.dateTimeFieldDayInput.fill(today.getDate().toString());
        await this.dateTimeFieldMonthInput.fill((today.getMonth() + 1).toString());
        await this.dateTimeFieldYearInput.fill(today.getFullYear().toString());
        await this.dateTimeFieldHourInput.fill("10");
        await this.dateTimeFieldMinuteInput.fill("30");
        await this.dateTimeFieldSecondInput.fill("15");
        await this.currencyFieldInput.fill("1000");
        await this.clickContinueAndWait("after contact details");

        await this.yesNoRadioButtons.getByLabel("Yes").check();
        await this.applicantPostcode.fill("SW1A 1AA");
        await this.complexType1JudgeIsRightRadios.getByLabel("No").check();
        await this.complexType1LevelOfJudgeRadioButtons.getByLabel("Item 1").check();
        await this.complexType1LevelOfJudgeDetailsInput.fill(
          "Details about why this level of judge is needed."
        );
        await this.complexType1LevelOfJudgeKeyInput.fill("Key information");
        await this.manualEntryLink.click();
        await this.complexType2AddressLine1Input.fill("10 Test Street");
        await this.complexType2EmailInput.fill(faker.internet.email({ provider: "example.com" }));
        await this.uploadFile(
          "sample.pdf",
          "application/pdf",
          "%PDF-1.4\n%test\n%%EOF",
          this.complexType3FileUploadInput
        );
        await this.complexType3ComplianceButton.click();
        await this.complexType3ComplianceInput.fill("Compliant response");
        await this.complexType3DateOfBirthDay.fill("15");
        await this.complexType3DateOfBirthMonth.fill("06");
        await this.complexType3DateOfBirthYear.fill("1990");
        await this.complexType3DateOfHearingDay.fill(today.getDate().toString());
        await this.complexType3DateOfHearingMonth.fill((today.getMonth() + 1).toString());
        await this.complexType3DateOfHearingYear.fill(today.getFullYear().toString());
        await this.complexType3DateOfHearingHour.fill("14");
        await this.complexType3DateOfHearingMinute.fill("45");
        await this.complexType3DateOfHearingSecond.fill("30");
        await this.complexType4AmountInput.fill("500");
        await this.complexType4FirstTickBox.check();
        await this.complexType4SelectList.selectOption("Item 1");
        await this.clickContinueAndWait("after complex type fields");

        await this.assertNoEventCreationError("before submitting divorce test case");
        await this.clickSubmitAndWait("before submitting divorce test case", {
          timeoutMs: 60_000
        });
        await this.waitForCaseDetails("after submitting divorce test case");
        return;
      } catch (error) {
        const eventErrorVisible = await this.eventCreationErrorHeading.isVisible().catch(() => false);
        const shouldRetry =
          (eventErrorVisible || isTransientWorkflowFailure(error)) && attempt < maxAttempts;
        if (shouldRetry) {
          this.logger.warn("Divorce test case creation failed; retrying", {
            attempt,
            maxAttempts
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

  async createCaseEmployment(jurisdiction: string, caseType: string, textField0: string) {
    void textField0;
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.createCase(jurisdiction, caseType, "Create Case");
        await this.assertNoEventCreationError("after starting employment case");

        const today = new Date();
        await this.receiptDayInput.fill(today.getDate().toString());
        await this.receiptMonthInput.fill((today.getMonth() + 1).toString());
        await this.receiptYearInput.fill(today.getFullYear().toString());
        await this.tribunalOfficeSelect.selectOption("Leeds");

        const receiptUrl = this.page.url();
        await this.clickContinueAndWait("after receipt details");
        await this.ensureWizardAdvanced("after receipt details", receiptUrl, {
          expectedPathIncludes: "initiateCase2",
          expectedLocator: this.claimantIndividualRadio
        });

        await this.claimantIndividualRadio.check();
        await this.claimantIndividualFirstNameInput.fill("Test");
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
        await Promise.race([
          this.respondentAcasCertifcateSelectYes.waitFor({ state: "visible", timeout: 15_000 }),
          this.respondentOrganisation
            .waitFor({ state: "visible", timeout: 15_000 })
            .catch(() => undefined)
        ]).catch(() => undefined);
        const respondentOrganisationVisible = await this.respondentOrganisation
          .isVisible()
          .catch(() => false);
        const respondentOrganisationEnabled = respondentOrganisationVisible
          ? await this.respondentOrganisation.isEnabled().catch(() => false)
          : false;
        if (respondentOrganisationVisible && respondentOrganisationEnabled) {
          await this.respondentOrganisation.check();
        }
        await this.respondentAcasCertifcateSelectYes.waitFor({ state: "visible" });
        await this.respondentAcasCertifcateSelectYes.check();
        await this.respondentAcasCertificateNumberInput.fill("ACAS123456");
        const respondentCompanyNameVisible = await this.respondentCompanyNameInput
          .isVisible()
          .catch(() => false);
        if (respondentCompanyNameVisible) {
          await this.respondentCompanyNameInput.fill("Respondent Company");
        }
        await this.manualEntryLink.waitFor({ state: "visible" });
        await this.manualEntryLink.click();
        await this.respondentAddressLine1Input.waitFor({ state: "visible" });
        await this.respondentAddressLine1Input.fill("1 Respondent Street");
        await this.respondentAddressPostcodeInput.waitFor({ state: "visible" });
        await this.respondentAddressPostcodeInput.fill("SW1A 1AA");

        await this.clickContinueAndWait("after respondent details");

        await this.sameAsClaimantWorkAddressYes.waitFor({ state: "visible" });
        await this.sameAsClaimantWorkAddressYes.click();
        await this.clickContinueAndWait("after work address confirmation");
        await this.clickContinueAndWait("after claim details");

        await this.claimantRepresentedNo.waitFor({ state: "visible" });
        await this.claimantRepresentedNo.click();
        await this.clickContinueAndWait("after claimant representation");

        await this.hearingPreferenceVideo.waitFor({ state: "visible" });
        await this.hearingPreferenceVideo.click();
        await this.clickSubmitAndWait("after hearing preference selection", { timeoutMs: 60_000 });
        await this.waitForCaseDetails("after submitting employment case");
        return;
      } catch (error) {
        const shouldRetry =
          attempt < maxAttempts &&
          ((await this.eventCreationErrorHeading.isVisible().catch(() => false)) ||
            isTransientWorkflowFailure(error));
        if (!shouldRetry) {
          throw error;
        }

        this.logger.warn("Employment case creation failed; retrying", { attempt, maxAttempts });
        if (!this.page.isClosed()) {
          await this.page.goto("/cases/case-filter");
        }
      }
    }
  }

  async createCaseFlagDivorceCase(
    testData: string,
    jurisdiction = "DIVORCE",
    caseType = "xuiCaseFlagsV1"
  ) {
    await this.createCase(jurisdiction, caseType);
    await this.party1RoleOnCase.fill(testData);
    await this.party1Name.fill(testData);
    await this.party2RoleOnCase.fill(`${testData}2`);
    await this.party2Name.fill(`${testData}2`);
    await this.clickContinueAndWaitForNext("after submitting divorce case flags (continue)");
    await this.testSubmitButton.click();
    await this.waitForSpinnerToComplete("after submitting divorce case flags (submit)");
    await this.waitForCaseDetails("after submitting divorce case flags");
  }

  async uploadFile(
    fileName: string,
    mimeType: string,
    fileContent: string | Buffer,
    fileInput?: Locator,
    fileContentEncoding: BufferEncoding = "utf8"
  ): Promise<void> {
    const maxRetries = 3;
    const baseDelayMs = 3_000;
    const resolvedFileInput = fileInput ?? this.page.locator('input[type="file"]').first();
    const filePayload = {
      name: fileName,
      mimeType,
      buffer: Buffer.isBuffer(fileContent)
        ? fileContent
        : Buffer.from(fileContent, fileContentEncoding)
    };

    const safeBackoff = async (attempt: number) => {
      if (this.page.isClosed()) {
        throw new Error("Page closed during upload retry backoff");
      }
      await this.waitForCreateCasePoll(baseDelayMs * Math.pow(2, attempt - 1));
    };

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      if (this.page.isClosed()) {
        throw new Error("Page closed before upload retry attempt");
      }

      const responsePromise = this.page
        .waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            /\/documents?(?:v2)?(?:[/?#]|$)/.test(new URL(response.url()).pathname),
          { timeout: EXUI_TIMEOUTS.UPLOAD_RESPONSE }
        )
        .catch(() => null);
      await resolvedFileInput.setInputFiles(filePayload);

      const response = await responsePromise;
      if (!response) {
        if (attempt < maxRetries) {
          await safeBackoff(attempt);
          continue;
        }
        throw new Error("Upload timed out after retries");
      }

      if (!response.ok()) {
        if (attempt < maxRetries) {
          await safeBackoff(attempt);
          continue;
        }
        throw new Error(`Upload failed with HTTP ${response.status()} after ${maxRetries} retries`);
      }

      await this.fileUploadStatusLabel
        .waitFor({ state: "hidden", timeout: 30_000 })
        .catch(() => undefined);
      return;
    }
  }

  private async clickSubmitButtonWithRetry(
    context: string,
    submitButton?: Locator
  ): Promise<void> {
    const visibleSubmitButton = submitButton ?? (await this.getVisibleActionButton(this.submitButton));
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
      this.logger.warn("Submit click intercepted; retrying with force", { context });
      // The sticky action bar occasionally intercepts the first click while the wizard settles.
      await visibleSubmitButton.click({ force: true, timeout: EXUI_TIMEOUTS.SUBMIT_CLICK }); // eslint-disable-line playwright/no-force-option
    }
  }

  async clickContinueMultipleTimes(count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const visible = await this.continueButton.isVisible().catch(() => false);
      if (!visible) {
        return;
      }
      await this.continueButton.click();
      await this.waitForUiIdleStateLenient();
    }
  }

  async clickSubmitAndWait(
    context: string,
    options: { maxAutoAdvanceAttempts?: number; timeoutMs?: number } = {}
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const maxAutoAdvanceAttempts =
      options.maxAutoAdvanceAttempts ??
      Math.max(
        2,
        Math.min(8, Math.floor(timeoutMs / EXUI_TIMEOUTS.SUBMIT_AUTO_ADVANCE_MIN))
      );
    let autoAdvanceAttempts = 0;
    const deadline = Date.now() + timeoutMs;
    const autoAdvanceTimeoutMs = Math.max(
      EXUI_TIMEOUTS.SUBMIT_AUTO_ADVANCE_MIN,
      Math.min(EXUI_TIMEOUTS.SUBMIT_AUTO_ADVANCE_MAX, Math.floor(timeoutMs / 2))
    );

    while (Date.now() < deadline) {
      if (this.page.isClosed()) {
        throw new Error(`Page closed while waiting for submit button ${context}`);
      }

      await this.assertNoEventCreationError(`while waiting for submit ${context}`);
      const onSomethingWentWrongPage = await this.somethingWentWrongHeading
        .isVisible()
        .catch(() => false);
      if (onSomethingWentWrongPage) {
        throw new Error(`Case event failed ${context}: Something went wrong page was displayed.`);
      }

      const onCaseDetailsSummaryPage =
        !this.page.url().includes("/trigger/") &&
        (await this.page.locator("#next-step").isVisible().catch(() => false));
      if (onCaseDetailsSummaryPage) {
        return;
      }

      const visibleSubmitButton = await this.getVisibleActionButton(this.submitButton);
      if (visibleSubmitButton) {
        await this.clickSubmitButtonWithRetry(context, visibleSubmitButton);
        await this.waitForSpinnerToComplete(`after submit ${context}`, timeoutMs);
        await this.assertNoEventCreationError(`after submit ${context}`);
        const hasValidationError = await this.checkForErrorMessage();
        if (hasValidationError) {
          const validationText = await this.getValidationErrorText();
          throw new Error(
            `Validation error after submit ${context}: ${validationText || "unknown validation error"}`
          );
        }
        return;
      }

      const visibleContinueButton = await this.getVisibleActionButton(this.continueButton);
      if (visibleContinueButton) {
        const continueEnabled = await visibleContinueButton.isEnabled().catch(() => false);
        if (!continueEnabled) {
          this.logger.warn(
            "Continue button visible but disabled while waiting for submit; polling for stable action state",
            {
              context,
              autoAdvanceAttempts
            }
          );
          await this.waitForCreateCasePoll(EXUI_TIMEOUTS.SUBMIT_POLL_INTERVAL);
          continue;
        }

        autoAdvanceAttempts += 1;
        if (autoAdvanceAttempts > maxAutoAdvanceAttempts) {
          throw new Error(
            `Exceeded ${maxAutoAdvanceAttempts} auto-advance attempts before submit ${context}`
          );
        }

        await this.clickContinueAndWait(
          `auto-advance ${autoAdvanceAttempts} before submit ${context}`,
          {
            continueButton: visibleContinueButton,
            timeoutMs: autoAdvanceTimeoutMs
          }
        );
        continue;
      }

      const spinnerVisible = await this.page
        .locator("xuilib-loading-spinner")
        .first()
        .isVisible()
        .catch(() => false);
      if (spinnerVisible) {
        await this.waitForSpinnerToComplete(
          `while waiting for submit ${context}`,
          autoAdvanceTimeoutMs
        ).catch(() => {
          // Keep polling in the main loop even when spinner is slow or intermittent.
        });
        await this.waitForCreateCasePoll(EXUI_TIMEOUTS.SUBMIT_SPINNER_STABILIZE_WAIT);
        continue;
      }

      await this.waitForCreateCasePoll(EXUI_TIMEOUTS.SUBMIT_POLL_INTERVAL);
    }

    const visibleActionButtons = await this.page
      .getByRole("button")
      .allInnerTexts()
      .then((texts) =>
        texts
          .map((text) => text.trim())
          .filter((text) => text.length > 0)
          .filter((text) => /(continue|submit|save)/i.test(text))
          .slice(0, 10)
      )
      .catch(() => []);

    throw new Error(
      `Submit button did not become available ${context}. URL=${this.page.url()} autoAdvance=${autoAdvanceAttempts}/${maxAutoAdvanceAttempts} visibleActionButtons=${visibleActionButtons.join(" | ") || "none"}`
    );
  }

  private normalizeUnknownError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    try {
      return JSON.stringify(error) ?? "[Unable to stringify error]";
    } catch {
      return "[Unstringifiable error object]";
    }
  }

  private normalizePath(url: string): string {
    return new URL(url, this.page.url()).pathname;
  }

  private async extractCreatedCaseNumberFromBanner(): Promise<string | null> {
    const bannerVisible = await this.caseAlertSuccessMessage.isVisible().catch(() => false);
    if (!bannerVisible) {
      return null;
    }

    const bannerText = await this.caseAlertSuccessMessage.innerText().catch(() => "");
    const numericMatch = /\d{16}/.exec(bannerText.replace(/\D/g, ""));
    return numericMatch?.[0] ?? null;
  }

  private async recoverCaseDetailsFromCreatedBanner(
    context: string,
    initialError: unknown
  ): Promise<boolean> {
    if (this.page.isClosed()) {
      return false;
    }

    const caseNumber =
      extractCaseNumberFromUrl(this.page.url()) ?? (await this.extractCreatedCaseNumberFromBanner());
    if (!caseNumber) {
      return false;
    }

    this.logger.warn("Case details did not render after submit; trying direct case details URL", {
      context,
      caseNumber,
      initialError: this.normalizeUnknownError(initialError).slice(0, 220)
    });

    try {
      await this.page.goto(`/cases/case-details/${caseNumber}`);
      await this.assertNoEventCreationError(`${context} (after direct case details navigation)`);
      await this.caseDetailsContainer.waitFor({
        state: "visible",
        timeout: EXUI_TIMEOUTS.CASE_DETAILS_VISIBLE
      });
      return true;
    } catch (recoveryError) {
      this.logger.warn("Direct case details recovery failed", {
        context,
        caseNumber,
        recoveryError: this.normalizeUnknownError(recoveryError).slice(0, 220)
      });
      return false;
    }
  }

  async waitForCaseDetails(context: string): Promise<void> {
    await this.assertNoEventCreationError(context);
    try {
      await this.caseDetailsContainer.waitFor({
        state: "visible",
        timeout: EXUI_TIMEOUTS.CASE_DETAILS_VISIBLE
      });
    } catch (error) {
      const recovered = await this.recoverCaseDetailsFromCreatedBanner(context, error);
      if (!recovered) {
        throw error;
      }
    }
  }

  async assertNoEventCreationError(context: string): Promise<void> {
    const eventErrorVisible = await this.eventCreationErrorHeading.isVisible().catch(() => false);
    if (eventErrorVisible) {
      throw new Error(`Case event failed ${context}: The event could not be created.`);
    }

    const somethingWentWrongVisible = await this.somethingWentWrongHeading
      .isVisible()
      .catch(() => false);
    if (somethingWentWrongVisible) {
      throw new Error(`Case event failed ${context}: Something went wrong page was displayed.`);
    }
  }

  private async getVisibleActionButton(buttons: Locator): Promise<Locator | null> {
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

  private async waitForSpinnerToComplete(context: string, timeoutMs?: number): Promise<void> {
    const effectiveTimeoutMs = timeoutMs ?? this.getRecommendedTimeoutMs();
    const spinner = this.page.locator("xuilib-loading-spinner").first();
    try {
      await spinner.waitFor({ state: "hidden", timeout: effectiveTimeoutMs });
    } catch (error) {
      const stillVisible = await spinner.isVisible().catch(() => false);
      if (stillVisible) {
        throw new Error(`Spinner still visible ${context}`, { cause: error });
      }
      this.logger.warn("Spinner hidden wait failed, proceeding because spinner not visible", {
        context,
        error
      });
    }
  }

  async checkForErrorMessage(
    message?: string,
    timeout = EXUI_TIMEOUTS.VALIDATION_ERROR_VISIBLE
  ): Promise<boolean> {
    const check = async (locator: Locator) => {
      try {
        await locator.waitFor({ state: "visible", timeout });
        if (message) {
          const text = await locator.first().innerText({ timeout: EXUI_TIMEOUTS.ERROR_META_TEXT_READ });
          return text.includes(message);
        }
        return true;
      } catch {
        return false;
      }
    };

    const [validationVisible, summaryVisible] = await Promise.all([
      check(this.validationErrorMessage),
      check(this.errorSummary)
    ]);

    return validationVisible || summaryVisible;
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

    const [validationText, summaryText] = await Promise.all([
      readText(this.validationErrorMessage),
      readText(this.errorSummary)
    ]);
    return [validationText, summaryText].filter(Boolean).join(" | ");
  }

  private async clickContinueAndWait(
    context: string,
    options: { force?: boolean; timeoutMs?: number; continueButton?: Locator } = {}
  ): Promise<void> {
    const visibleContinueButton =
      options.continueButton ?? (await this.getVisibleActionButton(this.continueButton));
    if (!visibleContinueButton) {
      throw new Error(`Continue button not visible ${context}`);
    }

    await visibleContinueButton.scrollIntoViewIfNeeded();
    await expect(visibleContinueButton).toBeEnabled();
    await visibleContinueButton.click({
      force: options.force,
      timeout: Math.min(
        options.timeoutMs ?? EXUI_TIMEOUTS.CONTINUE_CLICK_DEFAULT,
        EXUI_TIMEOUTS.CONTINUE_CLICK_DEFAULT
      )
    });
    await this.waitForUiIdleStateLenient(options.timeoutMs ?? EXUI_TIMEOUTS.WIZARD_ADVANCE_DEFAULT);
    await this.waitForSpinnerToComplete(`after ${context}`, options.timeoutMs);
    await this.assertNoEventCreationError(context);

    if (await this.checkForErrorMessage()) {
      const errorText = await this.getValidationErrorText();
      throw new Error(
        `Validation error after ${context}${errorText ? `: ${errorText}` : ""}`
      );
    }
  }

  async clickContinueAndWaitForNext(
    context: string,
    options: { force?: boolean; timeoutMs?: number } = {}
  ): Promise<void> {
    await this.clickContinueAndWait(context, options);
  }

  async ensureWizardAdvanced(
    context: string,
    initialUrl: string,
    options: {
      expectedPathIncludes?: string;
      expectedLocator?: Locator;
      timeoutMs?: number;
    } = {}
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? EXUI_TIMEOUTS.WIZARD_ADVANCE_DEFAULT;
    const initialPath = this.normalizePath(initialUrl);
    const expectedPathIncludes = options.expectedPathIncludes;
    const expectedLocator = options.expectedLocator;

    const waitForAdvance = async () => {
      if (expectedPathIncludes) {
        await this.page.waitForURL((url) => url.pathname.includes(expectedPathIncludes), {
          timeout: timeoutMs
        });
      } else {
        await this.page.waitForURL((url) => this.normalizePath(url.toString()) !== initialPath, {
          timeout: timeoutMs
        });
      }
      if (expectedLocator) {
        await expectedLocator.waitFor({ state: "visible", timeout: timeoutMs });
      }
    };

    try {
      await waitForAdvance();
    } catch {
      if (await this.checkForErrorMessage()) {
        const errorText = await this.getValidationErrorText();
        throw new Error(
          `Validation error after ${context}${errorText ? `: ${errorText}` : ""}`
        );
      }
      const visibleContinueButton = await this.getVisibleActionButton(this.continueButton);
      if (!visibleContinueButton) {
        throw new Error(
          `Continue button not visible while retrying wizard advance after ${context}`
        );
      }
      await this.clickContinueAndWait(`while retrying wizard advance after ${context}`, {
        continueButton: visibleContinueButton,
        timeoutMs
      });
      await waitForAdvance();
    }
  }

  private async ensureStartButtonReady(
    requestedEventType?: string,
    timeoutMs = EXUI_TIMEOUTS.WAIT_FOR_SELECT_READY_EXTENDED
  ): Promise<void> {
    const startEnabled = await this.startButton.isEnabled().catch(() => false);
    if (startEnabled) {
      return;
    }

    const eventSelectVisible = await this.eventTypeSelect.isVisible().catch(() => false);
    if (eventSelectVisible) {
      const eventOptions = await this.readSelectableOptionsWithGrace(this.eventTypeSelect, timeoutMs);
      const desiredEvent = resolveCreateCaseStartEvent(eventOptions, requestedEventType);
      if (desiredEvent) {
        const selectedValue = await this.eventTypeSelect.inputValue().catch(() => "");
        const currentEvent =
          matchCreateCaseOption(eventOptions, selectedValue) ??
          eventOptions.find((option) => option.value === selectedValue);
        const selectedToken = normalizeCreateCaseOptionToken(
          currentEvent?.value || currentEvent?.label || selectedValue
        );
        const desiredToken = normalizeCreateCaseOptionToken(
          desiredEvent.value || desiredEvent.label
        );
        if (selectedToken !== desiredToken) {
          await this.selectOptionWhenReady(
            this.eventTypeSelect,
            this.resolveOptionValue(desiredEvent),
            timeoutMs
          );
        }
      }
    }

    await expect
      .poll(() => this.startButton.isEnabled().catch(() => false), { timeout: timeoutMs })
      .toBe(true);
  }

  private async fillGenericDivorceCase(textField0: string): Promise<void> {
    const gender = faker.helpers.arrayElement(["Male", "Female", "Not given"]);
    const person1TitleInput = await this.resolveVisibleField(
      [this.person1TitleInput, this.person1RetainedTitleInput],
      "Person 1 title"
    );
    const person1FirstNameInput = await this.resolveVisibleField(
      [this.person1FirstNameInput, this.firstNameInput],
      "Person 1 first name"
    );
    const person1LastNameInput = await this.resolveVisibleField(
      [this.person1LastNameInput, this.lastNameInput],
      "Person 1 last name"
    );
    const person1GenderSelect = await this.resolveVisibleField(
      [this.person1GenderSelect, this.genderSelect],
      "Person 1 gender"
    );
    const person1JobTitle = faker.person.jobTitle();
    const person1JobDescription = faker.lorem.sentence();

    await this.page.getByLabel(gender, { exact: true }).check();
    await person1TitleInput.click();
    await person1TitleInput.fill(faker.person.prefix());
    await person1TitleInput.press("Tab");
    await person1FirstNameInput.fill(faker.person.firstName());
    await person1FirstNameInput.press("Tab");
    await person1LastNameInput.fill(faker.person.lastName());
    await person1LastNameInput.press("Tab");
    await person1GenderSelect.selectOption(gender);

    const person1JobTitleInput = await this.resolveOptionalVisibleField(
      [this.person1JobTitleInput, this.jobTitleInput],
      "Person 1 job title"
    );
    if (person1JobTitleInput) {
      await person1JobTitleInput.click();
      await person1JobTitleInput.fill(person1JobTitle);

      const person1JobDescriptionInput = await this.resolveOptionalVisibleField(
        [this.person1JobDescriptionInput, this.jobDescriptionInput],
        "Person 1 job description"
      );
      if (person1JobDescriptionInput) {
        await person1JobDescriptionInput.click();
        await person1JobDescriptionInput.fill(person1JobDescription);
      }
    }
    await this.continueButton.click();
    await this.textField0Input.click();
    await this.textField0Input.fill(textField0);
    await this.textField0Input.press("Tab");
    await this.textField3Input.fill(faker.lorem.word());
    await this.textField3Input.press("Tab");
    await this.textField1Input.fill(faker.lorem.word());
    await this.textField1Input.press("Tab");
    await this.textField2Input.fill(faker.lorem.word());
    await this.continueButton.click();
    await this.testSubmitButton.click();
    await this.waitForUiIdleState();
  }

  async findTableInCheckAnswers(name: string): Promise<Locator> {
    return this.checkYourAnswers.locator(
      `.complex-panel:has(.complex-panel-title:has-text("${name}")) table`
    );
  }

  async findSubTableInCheckAnswers(name: string): Promise<Locator> {
    return this.checkYourAnswers.locator(
      `.complex-panel:has(.complex-panel-title:has-text("${name}")) table table`
    );
  }

  async assertCreateCaseSubmissionError(
    expectedMessage: string,
    options: { timeoutMs?: number } = {}
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 60_000;

    await expect
      .poll(
        async () => {
          const [eventErrorVisible, validationErrorVisible] = await Promise.all([
            this.eventCreationErrorHeading.isVisible().catch(() => false),
            this.validationErrorMessage.isVisible().catch(() => false)
          ]);

          return eventErrorVisible || validationErrorVisible;
        },
        {
          timeout: timeoutMs,
          message: "Expected a create-case submission error surface to be rendered"
        }
      )
      .toBeTruthy();

    await expect(this.page.getByText(expectedMessage, { exact: true })).toBeVisible({ timeout: timeoutMs });
  }

  async selectDivorceReasons(reasons: string[]): Promise<void> {
    const divorceReasonField = this.page.locator("#DivorceReason");
    if (!(await divorceReasonField.isVisible().catch(() => false))) {
      return;
    }

    for (const reason of reasons) {
      const divorceReasonOption = divorceReasonField
        .locator(".multiple-choice, .govuk-checkboxes__item")
        .filter({ hasText: reason })
        .first();
      if (!(await divorceReasonOption.isVisible().catch(() => false))) {
        return;
      }

      await divorceReasonOption.scrollIntoViewIfNeeded({ timeout: EXUI_TIMEOUTS.POC_FIELD_VISIBLE });
      const divorceReasonCheckbox = divorceReasonOption.locator('input[type="checkbox"]').first();
      await divorceReasonOption.locator("label").first().click({ timeout: EXUI_TIMEOUTS.POC_FIELD_VISIBLE });
      await expect(divorceReasonCheckbox).toBeChecked({ timeout: EXUI_TIMEOUTS.POC_FIELD_VISIBLE });
    }
  }

  async fillDivorcePocSections(
    options: {
      data?: Partial<DivorcePoCData> | Array<Partial<DivorcePoCData>>;
      textFields?: Pick<DivorcePoCData, "textField0" | "textField1" | "textField2" | "textField3">;
      gender?: string;
      divorceReasons?: string[];
    } = {}
  ): Promise<void> {
    await this.waitForDivorcePocPersonalDetailsReady();

    const peopleData = Array.isArray(options.data)
      ? options.data
      : options.data
        ? [options.data]
        : [];

    const fillPerson = async (person: "person1" | "person2", data?: Partial<DivorcePoCData>) => {
      if (!data) {
        return;
      }

      const titleInput =
        person === "person1"
          ? await this.resolveVisibleField(
              [this.person1TitleInput, this.person1RetainedTitleInput],
              "Person 1 title"
            )
          : await this.resolveVisibleField([this.person2TitleInput], "Person 2 title");
      const firstNameInput =
        person === "person1"
          ? await this.resolveVisibleField(
              [this.person1FirstNameInput, this.firstNameInput],
              "Person 1 first name"
            )
          : await this.resolveVisibleField([this.person2FirstNameInput], "Person 2 first name");
      const lastNameInput =
        person === "person1"
          ? await this.resolveVisibleField(
              [this.person1LastNameInput, this.lastNameInput],
              "Person 1 last name"
            )
          : await this.resolveVisibleField([this.person2LastNameInput], "Person 2 last name");
      const genderSelect =
        person === "person1"
          ? await this.resolveVisibleField(
              [this.person1GenderSelect, this.genderSelect],
              "Person 1 gender"
            )
          : await this.resolveVisibleField([this.person2GenderSelect], "Person 2 gender");

      if (data.title) {
        await titleInput.fill(data.title);
      }
      if (data.firstName) {
        await firstNameInput.fill(data.firstName);
      }
      if (data.lastName) {
        await lastNameInput.fill(data.lastName);
      }
      if (data.gender) {
        await genderSelect.selectOption(data.gender);
      }

      if (data.maidenName !== undefined && data.gender?.toLowerCase() === "female") {
        const maidenNameInput =
          person === "person1"
            ? await this.resolveOptionalVisibleField([this.person1MaidenNameInput], "Person 1 maiden name")
            : await this.resolveOptionalVisibleField([this.person2MaidenNameInput], "Person 2 maiden name");
        await maidenNameInput?.fill(data.maidenName);
      }

      if (data.jobTitle || data.jobDescription) {
        const jobTitleInput =
          person === "person1"
            ? await this.resolveOptionalVisibleField(
                [this.person1JobTitleInput, this.jobTitleInput],
                "Person 1 job title"
              )
            : await this.resolveOptionalVisibleField([this.person2JobTitleInput], "Person 2 job title");

        if (data.jobTitle && jobTitleInput) {
          await jobTitleInput.fill(data.jobTitle);
        }

        if (data.jobDescription) {
          const jobDescriptionInput =
            person === "person1"
              ? await this.resolveOptionalVisibleField(
                  [this.person1JobDescriptionInput, this.jobDescriptionInput],
                  "Person 1 job description"
                )
              : await this.resolveOptionalVisibleField(
                  [this.person2JobDescriptionInput],
                  "Person 2 job description"
                );
          await jobDescriptionInput?.fill(data.jobDescription);
        }
      }
    };

    const selectedGender = options.gender ?? "Male";
    const selectedGenderOption = this.genderRadioButtons.filter({ hasText: selectedGender }).first();
    if (await selectedGenderOption.isVisible().catch(() => false)) {
      await selectedGenderOption.click();
    } else {
      await this.page.getByLabel(selectedGender, { exact: true }).first().check().catch(() => undefined);
    }

    await fillPerson("person1", peopleData[0]);
    await fillPerson("person2", peopleData[1]);

    const personalDetailsUrl = this.page.url();
    await this.clickContinueAndWait("after PoC personal details");
    await this.ensureWizardAdvanced("after PoC personal details", personalDetailsUrl, {
      expectedLocator: this.textField0Input,
      timeoutMs: EXUI_TIMEOUTS.POC_FIELD_VISIBLE
    });

    if (options.textFields?.textField1 !== undefined) {
      await this.textField1Input.fill(options.textFields.textField1);
    }
    if (options.textFields?.textField2 !== undefined) {
      await this.textField2Input.fill(options.textFields.textField2);
    }
    if (options.textFields?.textField3 !== undefined) {
      await this.textField3Input.fill(options.textFields.textField3);
    }
    if (options.textFields?.textField0 !== undefined) {
      await this.textField0Input.fill(options.textFields.textField0);
    }
    if (options.divorceReasons?.length) {
      await this.selectDivorceReasons(options.divorceReasons);
    }

    const hiddenFieldDetailsUrl = this.page.url();
    await this.clickContinueAndWait("after hidden field details");
    await this.ensureWizardAdvanced("after hidden field details", hiddenFieldDetailsUrl, {
      expectedLocator: this.checkYourAnswersHeading,
      timeoutMs: EXUI_TIMEOUTS.POC_FIELD_VISIBLE
    });
  }

  async generateDivorcePoCPersonData(overrides: Partial<PersonData> = {}): Promise<PersonData> {
    const gender = overrides.gender ?? "Male";
    return {
      title: overrides.title ?? faker.person.prefix(),
      firstName: overrides.firstName ?? faker.person.firstName(),
      maidenName:
        overrides.maidenName ??
        (gender.toLowerCase() === "female" ? faker.person.lastName() : undefined),
      lastName: overrides.lastName ?? faker.person.lastName(),
      gender,
      jobTitle: overrides.jobTitle ?? faker.person.jobTitle(),
      jobDescription: overrides.jobDescription ?? faker.lorem.sentence()
    };
  }

  async generateDivorcePoCData(overrides: Partial<DivorcePoCData> = {}): Promise<DivorcePoCData> {
    return {
      gender: overrides.gender ?? faker.helpers.arrayElement(["Male", "Female", "Not given"]),
      textField0: overrides.textField0 ?? `${faker.lorem.word()}-${Date.now()}`,
      textField1: overrides.textField1 ?? `${faker.lorem.word()}-${Date.now()}`,
      textField2: overrides.textField2 ?? `${faker.lorem.word()}-${Date.now()}`,
      textField3: overrides.textField3 ?? `${faker.lorem.word()}-${Date.now()}`,
      divorceReasons: overrides.divorceReasons ?? ["Adultery"],
      generatedAt: overrides.generatedAt ?? new Date().toISOString()
    };
  }

  private async selectOptionWhenReady(
    select: Locator,
    desired: string,
    timeoutMs = 120_000
  ): Promise<void> {
    const readOptions = async () => this.readSelectOptions(select);

    try {
      await expect(select).toBeVisible({ timeout: timeoutMs });
      await expect(select).toBeEnabled({ timeout: timeoutMs });
      await select.click({ timeout: timeoutMs });
      await expect
        .poll(async () => {
          const options = this.filterSelectableOptions(await readOptions());
          return options.length;
        }, { timeout: timeoutMs })
        .toBeGreaterThan(0);
    } catch {
      const options = (await readOptions()).map((option) =>
        `${option.label || "(blank)"}${option.value ? ` [${option.value}]` : ""}`
      );
      const available = options.length ? options.join(", ") : "none";
      throw new Error(
        `CreateCase: option "${desired}" not available. Available options: ${available}`
      );
    }

    const selectableOptions = this.filterSelectableOptions(await readOptions());
    const matchedOption = matchCreateCaseOption(selectableOptions, desired);
    if (!matchedOption) {
      const options = (await readOptions()).map((option) =>
        `${option.label || "(blank)"}${option.value ? ` [${option.value}]` : ""}`
      );
      const available = options.length ? options.join(", ") : "none";
      throw new Error(
        `CreateCase: option "${desired}" not available. Available options: ${available}`
      );
    }

    if (matchedOption.value) {
      await select.selectOption({ value: matchedOption.value });
    } else {
      await select.selectOption({ label: matchedOption.label });
    }
  }

  private async readSelectOptions(select: Locator): Promise<SelectOption[]> {
    return select.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => {
        const label = (node.textContent ?? "").trim();
        const value = node.getAttribute("value") ?? "";
        return { label, value };
      })
    );
  }

  private async readSelectableOptionsWithGrace(
    select: Locator,
    timeoutMs = 30_000
  ): Promise<SelectOption[]> {
    try {
      await expect(select).toBeVisible({ timeout: timeoutMs });
      await expect(select).toBeEnabled({ timeout: timeoutMs });
      await expect
        .poll(async () => {
          const options = this.filterSelectableOptions(await this.readSelectOptions(select));
          return options.length;
        }, { timeout: timeoutMs })
        .toBeGreaterThan(0);
    } catch {
      return this.filterSelectableOptions(await this.readSelectOptions(select));
    }

    return this.filterSelectableOptions(await this.readSelectOptions(select));
  }

  private filterSelectableOptions(options: SelectOption[]): SelectOption[] {
    return options.filter((option) => {
      const label = option.label.toLowerCase();
      return !(label.includes("select a value") && !option.value);
    });
  }

  private matchOption(options: SelectOption[], desired: string): SelectOption | undefined {
    return matchCreateCaseOption(options, desired);
  }

  private resolveOptionValue(option: SelectOption): string {
    return option.value || option.label;
  }
}
