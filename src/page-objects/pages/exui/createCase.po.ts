import { faker } from "@faker-js/faker";
import { expect, type Locator, Page } from "@playwright/test";

import { Base } from "../../base";

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
  readonly continueButton = this.page.getByRole("button", { name: "Continue" });
  readonly textField0Input = this.page.getByLabel("Text Field 0");
  readonly textField1Input = this.page.getByLabel("Text Field 1 (Optional)");
  readonly textField2Input = this.page.getByLabel("Text Field 2 (Optional)");
  readonly textField3Input = this.page.getByLabel("Text Field 3 (Optional)");
  readonly checkYourAnswersHeading = this.page.getByRole("heading", { name: "Check your answers" });
  readonly testSubmitButton = this.page.getByRole("button", { name: "Test submit" });

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
      await this.createCaseButton.click();
    }
    await expect(this.startButton).toBeVisible({ timeout: timeoutMs });
    await expect(this.jurisdictionSelect).toBeVisible({ timeout: timeoutMs });
  }

  async resolveCreateCaseSelection(
    desiredJurisdiction: string,
    desiredCaseType: string
  ): Promise<CreateCaseSelection> {
    await this.ensureCreateCasePage();
    await expect
      .poll(async () => {
        const options = this.filterSelectableOptions(
          await this.readSelectOptions(this.jurisdictionSelect)
        );
        return options.length;
      }, { timeout: 120_000 })
      .toBeGreaterThan(0);
    const availableJurisdictions = this.filterSelectableOptions(
      await this.readSelectOptions(this.jurisdictionSelect)
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
    await expect
      .poll(async () => {
        const options = this.filterSelectableOptions(
          await this.readSelectOptions(this.caseTypeSelect)
        );
        return options.length;
      }, { timeout: 120_000 })
      .toBeGreaterThan(0);
    const availableCaseTypes = this.filterSelectableOptions(
      await this.readSelectOptions(this.caseTypeSelect)
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
