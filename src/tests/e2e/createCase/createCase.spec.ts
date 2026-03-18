import { createLogger } from "@hmcts/playwright-common";

import { expect, test } from "../../../fixtures/ui";
import { ensureAuthenticatedPage } from "../../../utils/ui/sessionCapture";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils";
const jurisdiction = "DIVORCE";
const caseType = "XUI Case PoC";
let caseNumber: string;
const logger = createLogger({
  serviceName: "create-case-e2e",
  format: "pretty",
});
const CREATE_CASE_SETUP_MAX_ATTEMPTS = 3;
const CREATE_CASE_FLOW_MAX_ATTEMPTS = 2;

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDependencyEnvironmentFailure(error: unknown): boolean {
  const message = asMessage(error);
  return (
    /returned HTTP 5\d\d/i.test(message) ||
    /status\s+5\d\d/i.test(message) ||
    /something went wrong page/i.test(message) ||
    /network timeout/i.test(message) ||
    /ECONNRESET|ETIMEDOUT/i.test(message)
  );
}

test.describe("Verify creating cases works as expected", () => {
  test.describe.configure({ timeout: 600000 });
  let caseData;

  test.beforeEach(async ({ page, caseDetailsPage, createCasePage }) => {
    try {
      await retryOnTransientFailure(
        async () => {
          await ensureAuthenticatedPage(page, "PROD_LIKE", {
            waitForSelector: "exui-header",
          });
          caseData = await createCasePage.generateDivorcePoCData();
          await createCasePage.createDivorceCasePoC(
            jurisdiction,
            caseType,
            caseData,
            {
              maxAttempts: CREATE_CASE_FLOW_MAX_ATTEMPTS,
              createCaseMaxAttempts: CREATE_CASE_FLOW_MAX_ATTEMPTS,
            },
          );
          caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
        },
        {
          maxAttempts: CREATE_CASE_SETUP_MAX_ATTEMPTS,
          onRetry: async () => {
            if (page.isClosed()) {
              return;
            }
            try {
              await page.goto("/");
            } catch (error) {
              logger.warn(
                "Retry reset navigation failed before create-case beforeEach retry",
                { error },
              );
              throw error;
            }
          },
        },
      );
    } catch (error) {
      if (isDependencyEnvironmentFailure(error)) {
        throw new Error(
          `Create-case setup failed due to dependency environment instability: ${asMessage(error)}`,
        );
      }
      throw error;
    }
  });

  test("Verify creating a case in the divorce jurisdiction works as expected", async ({
    page,
    validatorUtils,
    caseDetailsPage,
  }) => {
    await test.step("Validate the case number format and URL", async () => {
      expect.soft(caseNumber).toMatch(validatorUtils.DIVORCE_CASE_NUMBER_REGEX);
      expect
        .soft(page.url())
        .toContain(`/${jurisdiction}/xuiTestJurisdiction/`);
    });

    await test.step("Check the case tab Data, matches previously entered data", async () => {
      const expected = {
        "Text Field 0": caseData.textField0,
        "Text Field 1": caseData.textField1,
        "Text Field 2": caseData.textField2,
        "Text Field 3": caseData.textField3,
        "Select your gender": caseData.gender,
        Title: caseData.person1Title,
        "First Name": caseData.person1FirstName,
        "Last Name": caseData.person1LastName,
        Gender: caseData.person1Gender,
      };
      const expectedJob = {
        Title: caseData.person1JobTitle,
        Description: caseData.person1JobDescription,
      };

      const table1 = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.divorceDataTable,
      );
      expect.soft(table1).toMatchObject(expected);
      const table2 = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.divorceDataSubTable,
      );
      expect.soft(table2).toMatchObject(expectedJob);
    });

    await test.step("Check the History tab shows the case creation event", async () => {
      await caseDetailsPage.selectCaseDetailsTab("History");

      const { updateRow, updateDate, updateAuthor } =
        await caseDetailsPage.getCaseHistoryByEvent("Create a case");

      expect
        .soft(updateRow, "Create a case row should be present")
        .toBeTruthy();
      expect.soft(updateAuthor, "Case author should be present").not.toBe("");

      const expectedDetails = {
        Date: updateDate,
        Author: updateAuthor,
        "End state": "Case created",
        Event: "Create a case",
        Summary: "-",
        Comment: "-",
      };
      const table = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.historyDetailsTable,
      );
      expect.soft(table).toMatchObject(expectedDetails);
    });
  });
});
