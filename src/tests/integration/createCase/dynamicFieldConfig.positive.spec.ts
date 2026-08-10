import { expect, test } from "../../../fixtures/ui";
import {
  applySessionCookies,
  openCreateCaseJourney,
  routeCaseCreationFlow,
  setupCreateCaseBaseRoutes
} from "../helpers/index.js";
import { dynamicFieldConfigCaseData } from "../mocks/dynamicFieldConfig.mock.js";

const jurisdiction = "DIVORCE";
const caseType = "xuiTestJurisdiction";

test.describe(
  "Create case dynamic field-config coverage",
  { tag: ["@integration-bucket-2", "@integration", "@integration-create-case"] },
  () => {
    test.beforeEach(async ({ createCasePage, page }) => {
      await applySessionCookies(page, "SOLICITOR");
      await setupCreateCaseBaseRoutes(page, { caseData: dynamicFieldConfigCaseData() });
      await openCreateCaseJourney(page, createCasePage, {
        jurisdiction,
        caseType,
        afterNavigation: async () => expect(page.getByLabel("Case title")).toBeVisible()
      });
    });

    test("renders configured defaults, lists, hints and conditional fields", async ({ page }) => {
      await expect(page.getByLabel("Case title")).toHaveValue("Default case title");
      await expect(page.getByText("Enter a title for this case")).toBeVisible();
      await expect(page.getByLabel("Case type").locator("option:checked")).toHaveText("Standard");
      await expect(page.getByLabel("Reason for urgent handling")).toBeHidden();
      await expect(page.getByLabel("Service")).toBeVisible();
      await expect(page.getByLabel("Service")).toContainText("Civil");
      await expect(page.getByLabel("Service")).toContainText("Family");
      await expect(page.getByLabel("Hidden value without retention")).toBeVisible();
      await expect(page.getByLabel("Hidden value with retention")).toBeVisible();

      await page.getByLabel("Case type").selectOption({ label: "Urgent" });
      await expect(page.getByLabel("Reason for urgent handling")).toBeVisible();
      await expect(page.getByLabel("Hidden value without retention")).toBeHidden();
      await expect(page.getByLabel("Hidden value with retention")).toBeHidden();
    });

    test("submits configured values and retains only fields marked for hidden retention", async ({
      caseDetailsPage,
      createCasePage,
      page
    }) => {
      const createRequestPromise = routeCaseCreationFlow(page);

      await page.getByLabel("Case title").fill("Dynamic field-config case");
      await page.getByLabel("Case type").selectOption({ label: "Urgent" });
      await page.getByLabel("Reason for urgent handling").fill("Priority issue");
      await page.locator("#CaseReference").fill("123");
      await page.getByLabel("Service").selectOption({ label: "Family" });
      await createCasePage.continueButton.click();

      const answers = await caseDetailsPage.trRowsToObjectInPage(createCasePage.checkYourAnswersTable);
      expect(answers).toMatchObject({
        "Case title": "Dynamic field-config case",
        "Case type": "Urgent",
        "Case reference": "123",
        Service: "Family",
        "Reason for urgent handling": "Priority issue"
      });
      await createCasePage.testSubmitButton.click();
      const request = (await createRequestPromise) as { data?: Record<string, unknown> };
      expect(request.data).toMatchObject({
        CaseTitle: "Dynamic field-config case",
        CaseType: "urgent",
        CaseReference: "123",
        Service: { value: { code: "family", label: "Family" } },
        HiddenWithRetention: "keep-me"
      });
      expect(request.data).not.toHaveProperty("HiddenWithoutRetention");
    });
  }
);
