import { expect, test } from "../../../fixtures/ui";
import { requireCreateCaseSelection } from "../utils/create-case-selection.utils.js";
import { ensureUiSession, openHomeWithCapturedSession } from "../utils/ui-session.utils.js";

test.describe("Verify creating cases works as expected", () => {
  const userIdentifier = "DIVORCE_SOLICITOR";
  test.use({ storageState: { cookies: [], origins: [] } });
  test.setTimeout(360_000);

  test.beforeAll(async () => {
    await ensureUiSession(userIdentifier);
  });

  test.beforeEach(async ({ page, createCasePage }) => {
    await openHomeWithCapturedSession(page, userIdentifier);
    await createCasePage.acceptAnalyticsCookies();
    await createCasePage.waitForUiIdleState();
  });

  test("Verify creating a case in the divorce jurisdiction works as expected", async ({
    validatorUtils,
    createCasePage,
    caseDetailsPage,
    page
  }) => {
    let caseNumber = "";
    const jurisdiction = "DIVORCE";
    const caseType = "XUI Case PoC";
    let caseData: Awaited<ReturnType<typeof createCasePage.generateDivorcePoCData>>;
    let person1Data: Awaited<ReturnType<typeof createCasePage.generateDivorcePoCPersonData>>;
    const selection = await createCasePage.resolveCreateCaseSelection(jurisdiction, caseType);
    requireCreateCaseSelection(selection, jurisdiction, caseType);

    await test.step("Create a case through the source-style PoC flow", async () => {
      caseData = await createCasePage.generateDivorcePoCData({
        textField0: "Hide all",
        divorceReasons: ["Adultery"]
      });
      person1Data = await createCasePage.generateDivorcePoCPersonData({
        gender: "Male"
      });

      await createCasePage.createCase(jurisdiction, caseType, "");
      await createCasePage.fillDivorcePocSections({
        data: person1Data,
        textFields: {
          textField0: caseData.textField0,
          textField1: caseData.textField1,
          textField2: caseData.textField2,
          textField3: caseData.textField3
        },
        divorceReasons: caseData.divorceReasons,
        gender: caseData.gender
      });
      await createCasePage.testSubmitButton.click();
      await expect(caseDetailsPage.caseAlertSuccessMessage).toBeVisible();
      caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
    });

    await test.step("Validate the case number format and URL", async () => {
      expect.soft(caseNumber).toMatch(validatorUtils.DIVORCE_CASE_NUMBER_REGEX);
      expect.soft(page.url()).toContain(`/${jurisdiction}/xuiTestJurisdiction/`);
    });

    await test.step("Check the Data tab matches the entered values", async () => {
      const table1 = await caseDetailsPage.trRowsToObjectInPage(caseDetailsPage.divorceDataTable);
      expect.soft(table1).toMatchObject({
        "Text Field 0": caseData.textField0,
        "Text Field 2": caseData.textField2,
        "Text Field 3": caseData.textField3,
        "Select your gender": caseData.gender,
        Title: person1Data.title,
        "First Name": person1Data.firstName,
        "Last Name": person1Data.lastName,
        Gender: person1Data.gender
      });
      expect.soft(table1).not.toHaveProperty("Text Field 1");
      const table2 = await caseDetailsPage.trRowsToObjectInPage(caseDetailsPage.divorceDataSubTable);
      expect.soft(table2).toMatchObject({
        Title: person1Data.jobTitle,
        Description: person1Data.jobDescription
      });
    });

    await test.step("Check the History tab shows the case creation event", async () => {
      await caseDetailsPage.selectCaseDetailsTab("History");
      const { updateRow, updateDate, updateAuthor } =
        await caseDetailsPage.getCaseHistoryByEvent("Create a case");
      expect.soft(updateRow, "Create a case row should be present").toBeTruthy();
      expect.soft(updateAuthor, "Case author should be present").not.toBe("");

      const table = await caseDetailsPage.trRowsToObjectInPage(caseDetailsPage.historyDetailsTable);
      expect.soft(table).toMatchObject({
        Date: updateDate,
        Author: updateAuthor,
        "End state": "Case created",
        Event: "Create a case",
        Summary: "-",
        Comment: "-"
      });
    });
  });
});
