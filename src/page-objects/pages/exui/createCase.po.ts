import { faker } from "@faker-js/faker";
import { expect, type Locator, Page } from "@playwright/test";

import { Base } from "../../base";

import { EXUI_TIMEOUTS } from "./exui-timeouts";

export type SelectOption = { label: string; value: string };

export interface CreateCaseSelection {
  availableJurisdictions: SelectOption[];
  availableCaseTypes: SelectOption[];
  selectedJurisdiction?: SelectOption;
  selectedCaseType?: SelectOption;
}

export class CreateCasePage extends Base {
  readonly container = this.page.locator("exui-case-home");
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
  readonly person2FirstNameInput = this.page.locator(
    '[data-testid="Person2_FirstName"] input, [data-testid="Person2_FirstName"], #Person2_FirstName, [name="Person2_FirstName"]'
  );
  readonly person2LastNameInput = this.page.locator(
    '[data-testid="Person2_LastName"] input, [data-testid="Person2_LastName"], #Person2_LastName, [name="Person2_LastName"]'
  );
  readonly continueButton = this.page.getByRole("button", { name: "Continue" });
  readonly textField0Input = this.page.getByLabel("Text Field 0");
  readonly textField1Input = this.page.getByLabel("Text Field 1 (Optional)");
  readonly textField2Input = this.page.getByLabel("Text Field 2 (Optional)");
  readonly textField3Input = this.page.getByLabel("Text Field 3 (Optional)");
  readonly checkYourAnswersHeading = this.page.getByRole("heading", { name: "Check your answers" });
  readonly testSubmitButton = this.page.getByRole("button", { name: "Test submit" });
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
  readonly sameAsClaimantWorkAddressYes = this.page.locator("#claimantWorkAddressQuestion_Yes");
  readonly claimantRepresentedNo = this.page.locator("#claimantRepresentedQuestion_No");
  readonly hearingPreferenceVideo = this.page.locator("#claimantHearingPreference_hearing_preferences-Video");
  readonly manualEntryLink = this.page.locator(".manual-link");
  readonly claimantAddressLine1Input = this.page.locator("#claimantType_claimant_addressUK__detailAddressLine1");

  // Warning modal
  readonly refreshModal = this.page.locator(".refresh-modal");
  readonly refreshModalConfirmButton = this.refreshModal.getByRole("button", { name: "Ok" });

  constructor(page: Page) {
    super(page);
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
    await this.ensureCreateCasePage();
    const availableJurisdictions = await this.readSelectableOptionsWithGrace(
      this.jurisdictionSelect
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
    const availableCaseTypes = await this.readSelectableOptionsWithGrace(this.caseTypeSelect);
    const selectedCaseType = this.matchOption(availableCaseTypes, desiredCaseType);
    return {
      availableJurisdictions,
      availableCaseTypes,
      selectedJurisdiction,
      selectedCaseType
    };
  }

  async createCase(jurisdiction: string, caseType: string, eventType?: string) {
    await this.ensureCreateCasePage();
    await this.selectOptionWhenReady(this.jurisdictionSelect, jurisdiction);
    await this.selectOptionWhenReady(this.caseTypeSelect, caseType);
    if (eventType) {
      await this.eventTypeSelect.click();
      await this.eventTypeSelect.selectOption({ label: eventType });
    }
    await this.startButton.click();
  }

  async createDivorceCase(jurisdiction: string, caseType: string, textField0: string) {
    if (caseType === "xuiCaseFlagsV1") {
      await this.createCaseFlagDivorceCase(textField0, jurisdiction, caseType);
      return;
    }

    if (caseType === "XUI Test Case type" || caseType === "xuiTestCaseType") {
      await this.createDivorceTestCase(jurisdiction, caseType, textField0);
      return;
    }

    const gender = faker.helpers.arrayElement(["Male", "Female", "Not given"]);
    await this.createCase(jurisdiction, caseType);
    await this.page.getByLabel(gender, { exact: true }).check();
    await this.person1Title.click();
    await this.person1Title.fill(faker.person.prefix());
    await this.person1Title.press("Tab");
    await this.firstNameInput.fill(faker.person.firstName());
    await this.firstNameInput.press("Tab");
    await this.lastNameInput.fill(faker.person.lastName());
    await this.lastNameInput.press("Tab");
    await this.genderSelect.selectOption(gender);
    await this.jobTitleInput.click();
    await this.jobTitleInput.fill(faker.person.jobTitle());
    await this.jobDescriptionInput.click();
    await this.jobDescriptionInput.fill(faker.lorem.sentence());
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

  private async createDivorceTestCase(
    jurisdiction: string,
    caseType: string,
    testData: string
  ): Promise<void> {
    const today = new Date();
    await this.createCase(jurisdiction, caseType);

    await this.textFieldInput.fill(testData);
    await this.continueButton.click();
    await this.emailFieldInput.waitFor({ state: "visible", timeout: 30_000 });

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
    await this.continueButton.click();
    await this.yesNoRadioButtons.waitFor({ state: "visible", timeout: 30_000 });

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
    await this.continueButton.click();
    await this.clickSubmitAndWait("after submitting divorce test case", { timeoutMs: 60_000 });
  }

  async createCaseEmployment(jurisdiction: string, caseType: string, textField0: string) {
    void textField0;
    await this.createCase(jurisdiction, caseType, "Create Case");

    const today = new Date();
    await this.receiptDayInput.fill(today.getDate().toString());
    await this.receiptMonthInput.fill((today.getMonth() + 1).toString());
    await this.receiptYearInput.fill((today.getFullYear() - 1).toString());
    await this.tribunalOfficeSelect.selectOption("Leeds");

    await this.continueButton.waitFor({ state: "visible" });
    await this.continueButton.click();
    await this.continueButton.click();

    await this.claimantIndividualRadio.check();
    await this.claimantIndividualFirstNameInput.fill("Test");
    await this.claimantIndividualLastNameInput.fill("Person");

    await this.manualEntryLink.click();
    await this.claimantAddressLine1Input.fill("1 Test Street");

    await this.continueButton.click();

    await this.addRespondentButton.click();
    await this.respondentOneNameInput.fill("Respondent One");
    await this.respondentOrganisation.click();
    await this.respondentAcasCertifcateSelectYes.click();
    await this.respondentAcasCertificateNumberInput.fill("ACAS123456");
    await this.respondentCompanyNameInput.fill("Respondent Company");
    await this.manualEntryLink.click();
    await this.respondentAddressLine1Input.fill("1 Respondent Street");

    await this.continueButton.click();

    await this.sameAsClaimantWorkAddressYes.click();
    await this.continueButton.click();
    await this.continueButton.click();
    await this.claimantRepresentedNo.click();
    await this.continueButton.click();
    await this.hearingPreferenceVideo.click();
    await this.submitButton.click();
    await this.waitForUiIdleState();
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
    await this.continueButton.click();
    await this.waitForUiIdleState();
    await this.testSubmitButton.click();
    await this.waitForUiIdleState();
  }

  async uploadFile(
    fileName: string,
    mimeType: string,
    fileContent: string,
    fileInput?: Locator,
    fileContentEncoding: BufferEncoding = "utf8"
  ): Promise<void> {
    const resolvedFileInput = fileInput ?? this.fileUploadInput;
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/document(sv2)?(?:[/?#]|$)/.test(new URL(response.url()).pathname),
      { timeout: 60_000 }
    );

    await resolvedFileInput.setInputFiles({
      name: fileName,
      mimeType,
      buffer: Buffer.from(fileContent, fileContentEncoding)
    });

    const response = await responsePromise;
    expect(response.ok(), `Upload failed with HTTP ${response.status()}`).toBe(true);
    await this.fileUploadStatusLabel.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
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

    while (Date.now() < deadline) {
      const onCaseDetailsSummaryPage =
        !this.page.url().includes("/trigger/") &&
        (await this.page.locator("#next-step").isVisible().catch(() => false));
      if (onCaseDetailsSummaryPage) {
        return;
      }

      const visibleSubmitButton = await this.submitButton.isVisible().catch(() => false);
      const submitEnabled = visibleSubmitButton
        ? await this.submitButton.isEnabled().catch(() => false)
        : false;
      if (visibleSubmitButton && submitEnabled) {
        await this.submitButton.waitFor({ state: "visible", timeout: timeoutMs });
        await this.submitButton.click();
        await this.waitForUiIdleStateLenient(timeoutMs);
      }

      const successBannerVisible = await this.page
        .locator(".hmcts-banner--success .alert-message, .exui-alert .alert-message")
        .first()
        .isVisible()
        .catch(() => false);
      const nowOnCaseDetailsSummaryPage =
        !this.page.url().includes("/trigger/") &&
        (await this.page.locator("#next-step").isVisible().catch(() => false));

      if (successBannerVisible || nowOnCaseDetailsSummaryPage) {
        return;
      }

      const visibleContinueButton = await this.continueButton.isVisible().catch(() => false);
      const continueEnabled = visibleContinueButton
        ? await this.continueButton.isEnabled().catch(() => false)
        : false;
      if (visibleContinueButton && continueEnabled) {
        autoAdvanceAttempts += 1;
        if (autoAdvanceAttempts > maxAutoAdvanceAttempts) {
          throw new Error(
            `Exceeded ${maxAutoAdvanceAttempts} auto-advance attempts before submit ${context}`
          );
        }

        await this.continueButton.click();
        await this.waitForUiIdleStateLenient(timeoutMs);
        continue;
      }

      if ((visibleSubmitButton && !submitEnabled) || (visibleContinueButton && !continueEnabled)) {
        await Promise.race([
          this.submitButton
            .waitFor({ state: "hidden", timeout: EXUI_TIMEOUTS.SUBMIT_POLL_INTERVAL })
            .catch(() => undefined),
          this.continueButton
            .waitFor({ state: "hidden", timeout: EXUI_TIMEOUTS.SUBMIT_POLL_INTERVAL })
            .catch(() => undefined),
          this.page
            .locator("xuilib-loading-spinner")
            .first()
            .waitFor({ state: "visible", timeout: EXUI_TIMEOUTS.SUBMIT_POLL_INTERVAL })
            .catch(() => undefined)
        ]);
        continue;
      }

      const spinnerVisible = await this.page
        .locator("xuilib-loading-spinner")
        .first()
        .isVisible()
        .catch(() => false);
      if (spinnerVisible) {
        await this.waitForUiIdleStateLenient(timeoutMs);
        continue;
      }

      await Promise.race([
        this.submitButton.waitFor({ state: "visible", timeout: EXUI_TIMEOUTS.SUBMIT_POLL_INTERVAL }).catch(() => undefined),
        this.continueButton.waitFor({ state: "visible", timeout: EXUI_TIMEOUTS.SUBMIT_POLL_INTERVAL }).catch(() => undefined),
        this.page
          .locator("xuilib-loading-spinner")
          .first()
          .waitFor({ state: "visible", timeout: EXUI_TIMEOUTS.SUBMIT_POLL_INTERVAL })
          .catch(() => undefined)
      ]);
    }

    throw new Error(`Expected case-details summary or success banner confirmation ${context}`);
  }

  private async selectOptionWhenReady(
    select: Locator,
    desired: string,
    timeoutMs = 120_000
  ): Promise<void> {
    const readOptions = async () => this.readSelectOptions(select);
    const valueSelector = desired.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const optionByLabel = select.locator("option", { hasText: desired });
    const optionByValue = select.locator(`option[value="${valueSelector}"]`);

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

    const hasValue = (await optionByValue.count()) > 0;
    const hasLabel = (await optionByLabel.count()) > 0;
    if (!hasValue && !hasLabel) {
      const options = (await readOptions()).map((option) =>
        `${option.label || "(blank)"}${option.value ? ` [${option.value}]` : ""}`
      );
      const available = options.length ? options.join(", ") : "none";
      throw new Error(
        `CreateCase: option "${desired}" not available. Available options: ${available}`
      );
    }

    if (hasValue) {
      await select.selectOption({ value: desired });
    } else {
      await select.selectOption({ label: desired });
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
    const normalized = desired.trim().toLowerCase();
    return options.find(
      (option) =>
        option.value.trim().toLowerCase() === normalized ||
        option.label.trim().toLowerCase() === normalized
    );
  }

  private resolveOptionValue(option: SelectOption): string {
    return option.value || option.label;
  }
}
