import { expect, test } from "../../../fixtures/ui";
import {
  applySessionCookies,
  openCreateCaseJourney,
  setupCreateCaseBaseRoutes
} from "../helpers/index.js";

const userIdentifier = "SOLICITOR";
const jurisdiction = "DIVORCE";
const caseType = "xuiTestJurisdiction";
const createCaseSubmissionEndpointPatterns: RegExp[] = [
  /\/cases\/\d+\/events(?:\/|$)/,
  /\/cases\/\d+\/event-triggers\/[^/]+(?:\/|$)/,
  /\/event-triggers\/[^/]+\/validate(?:\/|$)/
];
const apiErrorStatusCodes = [500, 503, 401];

test.describe(
  `Create case - submit flow validation as ${userIdentifier}`,
  { tag: ["@integration", "@integration-create-case"] },
  () => {
    test.beforeEach(async ({ createCasePage, page }) => {
      await applySessionCookies(page, userIdentifier);
      await setupCreateCaseBaseRoutes(page);
      await openCreateCaseJourney(page, createCasePage, { jurisdiction, caseType });
    });

    test("User should see a page refreshed modal when attempting to skip to the submit case page, without filling in required fields", async ({
      caseListPage,
      createCasePage,
      page
    }) => {
      await test.step("Navigate to the submit case page without filling in case details", async () => {
        createCasePage.clearApiCalls();
        await page.goto(`/cases/case-create/${jurisdiction}/${caseType}/createCase/submit`);
      });

      await test.step("Verify direct submit is blocked and warning modal is shown", async () => {
        await expect(createCasePage.exuiHeader.header).toBeVisible();
        await expect(createCasePage.testSubmitButton).toBeHidden();
        await expect(createCasePage.refreshModalConfirmButton).toBeVisible();
        await expect(createCasePage.refreshModal).toBeVisible();
        await createCasePage.refreshModalConfirmButton.click();
      });

      await test.step("Verify user is returned to case list and not to case details", async () => {
        await expect(page).toHaveURL(/\/cases(?:[/?#]|$)/);
        await expect(caseListPage.exuiHeader.header).toBeVisible();
        await expect(createCasePage.exuiCaseDetailsComponent.caseHeader).toBeHidden();
      });

      await test.step("Verify no create-case submission API request was made", async () => {
        const createCaseSubmissionCalls = createCasePage.getApiCalls().filter((call) => {
          if (call.method !== "POST") {
            return false;
          }
          return createCaseSubmissionEndpointPatterns.some((pattern) => pattern.test(call.url));
        });

        expect(
          createCaseSubmissionCalls,
          `Expected no create-case submission requests, but found: ${JSON.stringify(createCaseSubmissionCalls)}`
        ).toHaveLength(0);
      });
    });

    test("User should see validation errors if they attempt to submit the form with missing mandatory fields", async ({
      createCasePage,
      page
    }) => {
      await test.step("Navigate to the create case page", async () => {
        await page.goto(`/cases/case-create/${jurisdiction}/${caseType}/createCase`);
      });

      await test.step("Attempt to submit the form without filling in any mandatory fields", async () => {
        await createCasePage.genderRadioButtons.filter({ hasText: "Female" }).first().click();
        await createCasePage.continueButton.click();
        await createCasePage.continueButton.click();
        await expect(createCasePage.validationErrorMessage).toContainText("Text Field 0 is required");
      });
    });

    apiErrorStatusCodes.forEach((status) => {
      test(`User should see an error message if the create case API returns HTTP ${status}`, async ({
        createCasePage,
        page
      }) => {
        const caseData = await createCasePage.generateDivorcePoCData();
        const person1Data = await createCasePage.generateDivorcePoCPersonData({
          gender: "Female"
        });
        const errorMessage = `Forced failure ${status}`;

        await test.step("Mock the create case submission API to return an error", async () => {
          await page.route(`**/data/case-types/${caseType}/cases?ignore-warning=false*`, async (route) => {
            await route.fulfill({
              status,
              contentType: "application/json",
              body: JSON.stringify({ message: errorMessage })
            });
          });
        });

        await test.step("User fills out the form", async () => {
          await createCasePage.fillDivorcePocSections({
            data: person1Data,
            textFields: {
              textField0: caseData.textField0,
              textField1: caseData.textField1,
              textField2: caseData.textField2,
              textField3: caseData.textField3
            },
            gender: caseData.gender
          });
        });

        await test.step("Verify error message is displayed", async () => {
          await createCasePage.testSubmitButton.click();
          await createCasePage.assertCreateCaseSubmissionError(errorMessage);
        });
      });
    });
  }
);
