import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";

const formatOptions = (options: Array<{ label: string; value: string }>): string =>
  options.length
    ? options
        .map((option) => `${option.label || "(blank)"}${option.value ? ` [${option.value}]` : ""}`)
        .join(", ")
    : "none";

test.describe("Verify creating and updating a case works as expected", () => {
  test.beforeEach(async ({ caseListPage, config }) => {
    await caseListPage.page.goto(config.urls.manageCaseBaseUrl);
    await caseListPage.acceptAnalyticsCookies();
    await caseListPage.waitForReady();
  });

  test("Create, update and verify case history", async ({
    validatorUtils,
    createCasePage,
    caseListPage,
    caseDetailsPage,
    page
  }, testInfo) => {
    let caseNumber = "";
    const textField0 = faker.lorem.word();
    const desiredJurisdiction = "DIVORCE";
    const desiredCaseType = "XUI Case PoC";
    const selection = await createCasePage.resolveCreateCaseSelection(
      desiredJurisdiction,
      desiredCaseType
    );
    if (!selection.selectedJurisdiction || !selection.selectedCaseType) {
      const availableJurisdictions = formatOptions(selection.availableJurisdictions);
      const availableCaseTypes = formatOptions(selection.availableCaseTypes);
      testInfo.skip(
        true,
        `Create case requires jurisdiction "${desiredJurisdiction}" and case type "${desiredCaseType}". ` +
          `Available jurisdictions: ${availableJurisdictions}. Available case types: ${availableCaseTypes}.`
      );
      return;
    }
    const jurisdictionValue =
      selection.selectedJurisdiction.value || selection.selectedJurisdiction.label;
    const jurisdictionLabel =
      selection.selectedJurisdiction.label || selection.selectedJurisdiction.value;
    const caseTypeValue = selection.selectedCaseType.value || selection.selectedCaseType.label;
    const caseTypeLabel = selection.selectedCaseType.label || selection.selectedCaseType.value;

    await test.step("Create a case and validate the case number", async () => {
      await createCasePage.createDivorceCase(jurisdictionValue, caseTypeValue, textField0);
      await expect(createCasePage.exuiCaseDetailsComponent.caseHeader).toBeVisible();
      caseNumber = await createCasePage.exuiCaseDetailsComponent.caseHeader.innerText();
      validatorUtils.validateDivorceCaseNumber(caseNumber);
    });

    await test.step("Find the created case in the case list", async () => {
      await caseListPage.goto();
      await caseListPage.searchByJurisdiction(jurisdictionLabel);
      await caseListPage.searchByCaseType(caseTypeLabel);
      await caseListPage.searchByTextField0(textField0);
      await caseListPage.exuiCaseListComponent.searchByCaseState("Case created");
      await caseListPage.applyFilters();
      const cleanedCaseNumber = caseNumber.replace(/^#/, "");
      await expect
        .poll(async () => caseListPage.hasCaseReference(cleanedCaseNumber), { timeout: 120_000 })
        .toBe(true);
    });

    await test.step("Open the created case", async () => {
      const cleanedCaseNumber = caseNumber.replace(/^#/, "");
      await caseListPage.openCaseByReference(cleanedCaseNumber);
      await caseDetailsPage.waitForReady();
    });

    await test.step("Start Update Case event", async () => {
      await expect(page.locator("#next-step")).toBeVisible();
      await page.getByLabel("Next step").selectOption("3: Object");
      await page.getByRole("button", { name: "Go" }).click();
      await caseDetailsPage.waitForEventFormReady("#Person2_FirstName");
    });

    await test.step("Update case fields", async () => {
      await page.locator("#Person2_FirstName").fill("test");
      await page.locator("#Person2_LastName").fill("test street");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: "Submit" }).click();
    });

    await test.step("Verify update success banner", async () => {
      const banner = page.locator(".alert-message");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/Case #[\d-]+ has/i);
    });

    await test.step("Verify update event appears in history", async () => {
      await caseDetailsPage.openHistoryTab();
      const eventEntries = page.locator("ccd-event-log-details span.text-16", {
        hasText: "Update case"
      });
      await expect(eventEntries.first()).toBeVisible();
    });
  });
});
