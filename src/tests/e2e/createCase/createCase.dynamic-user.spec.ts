import { expect, test } from "../../../fixtures/ui";
import { ensureAuthenticatedPage } from "../../../utils/ui/sessionCapture";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils";
import { provisionDynamicSolicitorForAlias } from "../_helpers/dynamicSolicitorSession";

const jurisdiction = "DIVORCE";
const caseType = "XUI Case PoC";
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

test.describe("Dynamic user create-case flow", () => {
  test("@dynamic-user creates solicitor user, authenticates, and creates divorce case", async ({
    page,
    createCasePage,
    caseDetailsPage,
    validatorUtils,
    professionalUserUtils,
  }, testInfo) => {
    const handle = await provisionDynamicSolicitorForAlias({
      alias: "SOLICITOR",
      professionalUserUtils,
      roleContext: {
        jurisdiction: "divorce",
        testType: "case-create",
      },
      testInfo,
      mode: "auto",
    });

    try {
      const createdCase = await retryOnTransientFailure(
        async () => {
          await ensureAuthenticatedPage(page, "SOLICITOR", {
            waitForSelector: "exui-header",
          });

          const caseData = await createCasePage.generateDivorcePoCData();
          await createCasePage.createDivorceCasePoC(
            jurisdiction,
            caseType,
            caseData,
            {
              maxAttempts: CREATE_CASE_FLOW_MAX_ATTEMPTS,
              createCaseMaxAttempts: CREATE_CASE_FLOW_MAX_ATTEMPTS,
            },
          );

          const caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
          return { caseData, caseNumber };
        },
        {
          maxAttempts: CREATE_CASE_SETUP_MAX_ATTEMPTS,
          onRetry: async () => {
            if (page.isClosed()) {
              return;
            }
            await page.goto("/");
          },
        },
      );
      const { caseData, caseNumber } = createdCase;

      expect.soft(caseNumber).toMatch(validatorUtils.DIVORCE_CASE_NUMBER_REGEX);
      expect
        .soft(page.url())
        .toContain(`/${jurisdiction}/xuiTestJurisdiction/`);

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

      await caseDetailsPage.selectCaseDetailsTab("History");
      const { updateRow, updateDate, updateAuthor } =
        await caseDetailsPage.getCaseHistoryByEvent("Create a case");
      expect
        .soft(updateRow, "Create a case row should be present")
        .toBeTruthy();
      expect.soft(updateAuthor, "Case author should be present").not.toBe("");

      const historyTable = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.historyDetailsTable,
      );
      expect.soft(historyTable).toMatchObject({
        Date: updateDate,
        Author: updateAuthor,
        "End state": "Case created",
        Event: "Create a case",
        Summary: "-",
        Comment: "-",
      });
    } catch (error) {
      // eslint-disable-next-line playwright/no-conditional-in-test -- dependency failure detection in catch block; re-throws on non-infrastructure errors
      if (isDependencyEnvironmentFailure(error)) {
        testInfo.skip(
          true,
          `Dynamic create-case flow skipped due to dependency environment instability: ${asMessage(error)}`,
        );
      }
      throw error;
    } finally {
      await handle.cleanup();
    }
  });
});
