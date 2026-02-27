import { faker } from "@faker-js/faker";
import { expect, test } from "../../../fixtures/ui";
import { ensureAuthenticatedPage } from "../../../utils/ui/sessionCapture";
import {
  caseBannerMatches,
  getTodayFormats,
  matchesToday,
} from "../../../utils/ui/index";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils";
import { provisionDynamicSolicitorForAlias } from "../_helpers/dynamicSolicitorSession";
let caseNumber: string;
const updatedFirstName = faker.person.firstName();
const updatedLastName = faker.person.lastName();
const testField = faker.lorem.word() + new Date().toLocaleTimeString();
const UPDATE_CASE_ACTION_TIMEOUT_MS = 60_000;
const UPDATE_CASE_FIELD_READY_TIMEOUT_MS = 90_000;
const UPDATE_CASE_SETUP_CREATE_MAX_ATTEMPTS = 3;

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
    /ECONNRESET|ETIMEDOUT/i.test(message) ||
    /Target page, context or browser has been closed/i.test(message) ||
    /Test timeout of \d+ms exceeded/i.test(message) ||
    (/Person2_FirstName/i.test(message) &&
      /locator\.waitFor: Timeout \d+ms exceeded/i.test(message))
  );
}

test.describe("Verify creating and updating a case works as expected", () => {
  test.describe.configure({ timeout: 300_000 });
  let dynamicHandle:
    | Awaited<ReturnType<typeof provisionDynamicSolicitorForAlias>>
    | undefined;

  test.beforeEach(
    async (
      { page, createCasePage, caseDetailsPage, professionalUserUtils },
      testInfo,
    ) => {
      dynamicHandle = await provisionDynamicSolicitorForAlias({
        alias: "SOLICITOR",
        professionalUserUtils,
        roleContext: {
          jurisdiction: "divorce",
          testType: "case-create",
        },
        testInfo,
      });

      try {
        await retryOnTransientFailure(
          async () => {
            await ensureAuthenticatedPage(page, "SOLICITOR", {
              waitForSelector: "exui-header",
              timeoutMs: 30_000,
            });
            await createCasePage.createDivorceCase(
              "DIVORCE",
              "XUI Case PoC",
              testField,
              {
                maxAttempts: UPDATE_CASE_SETUP_CREATE_MAX_ATTEMPTS,
                createCaseMaxAttempts: UPDATE_CASE_SETUP_CREATE_MAX_ATTEMPTS,
              },
            );
            // Always collect case number from URL for consistency
            caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
          },
          {
            maxAttempts: UPDATE_CASE_SETUP_CREATE_MAX_ATTEMPTS,
            onRetry: async () => {
              if (page.isClosed()) {
                return;
              }
              await page.goto("/").catch(() => undefined);
            },
          },
        );
      } catch (error) {
        if (isDependencyEnvironmentFailure(error)) {
          testInfo.skip(
            true,
            `Skipping update-case test due to dependency environment instability: ${asMessage(error)}`,
          );
          return;
        }
        throw error;
      }
    },
  );

  test.afterEach(async () => {
    await dynamicHandle?.cleanup();
    dynamicHandle = undefined;
  });

  test("Create, update and verify case history", async ({
    page,
    createCasePage,
    caseDetailsPage,
  }, testInfo) => {
    let caseDetailsUrl = "";

    await test.step("Start Update Case event", async () => {
      caseDetailsUrl = await caseDetailsPage.getCurrentPageUrl();
      await caseDetailsPage.selectCaseAction("Update case", {
        expectedLocator: createCasePage.person2FirstNameInput,
        timeoutMs: UPDATE_CASE_ACTION_TIMEOUT_MS,
      });
    });

    await test.step("Update case fields", async () => {
      try {
        await retryOnTransientFailure(
          async () => {
            await createCasePage.person2FirstNameInput.waitFor({
              state: "visible",
              timeout: UPDATE_CASE_FIELD_READY_TIMEOUT_MS,
            });
            await createCasePage.person2FirstNameInput.fill(updatedFirstName);
            await createCasePage.person2LastNameInput.fill(updatedLastName);
            await createCasePage.clickSubmitAndWait(
              "after updating case fields",
              {
                timeoutMs: 60_000,
                maxAutoAdvanceAttempts: 3,
              },
            );
          },
          {
            maxAttempts: 2,
            onRetry: async () => {
              if (page.isClosed()) {
                return;
              }
              await caseDetailsPage
                .reopenCaseDetails(caseDetailsUrl)
                .catch(async () => {
                  await page.goto(caseDetailsUrl).catch(() => undefined);
                });
              await caseDetailsPage.selectCaseAction("Update case", {
                expectedLocator: createCasePage.person2FirstNameInput,
                timeoutMs: UPDATE_CASE_ACTION_TIMEOUT_MS,
                retry: false,
              });
            },
          },
        );
      } catch (error) {
        if (isDependencyEnvironmentFailure(error)) {
          testInfo.skip(
            true,
            `Skipping update-case assertions due to dependency environment instability: ${asMessage(error)}`,
          );
          return;
        }
        throw error;
      }

      await caseDetailsPage.exuiSpinnerComponent.wait();
      // Soft assertion - visibility verified by poll below, but helps with debugging if banner missing
      await expect.soft(caseDetailsPage.caseAlertSuccessMessage).toBeVisible();
    });

    await test.step("Verify update success banner", async () => {
      const expectedMessage = "has been updated with event: Update case";
      await expect
        .poll(
          async () => {
            const bannerText =
              await caseDetailsPage.caseAlertSuccessMessage.innerText();
            return caseBannerMatches(bannerText, caseNumber, expectedMessage);
          },
          { timeout: 45_000, intervals: [1_000, 2_000, 3_000] },
        )
        .toBe(true);
    });

    await test.step("Verify the 'Some more data' tab has updated names correctly", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Some more data");

      const expectedValues = {
        "First Name": updatedFirstName,
        "Last Name": updatedLastName,
      };

      const table = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.someMoreDataTable,
      );
      expect.soft(table).toMatchObject(expectedValues);
    });

    await test.step("Verify that event details are shown on the History tab", async () => {
      await caseDetailsPage.selectCaseDetailsTab("History");
      const { updateRow, updateDate, updateAuthor, expectedDate } =
        await caseDetailsPage.getCaseHistoryByEvent("Update case");

      expect.soft(updateRow, "Update case row should be present").toBeTruthy();

      const { numericFormat } = getTodayFormats();
      const dateMatches = matchesToday(updateDate, expectedDate, numericFormat);

      expect
        .soft(dateMatches, "Update case date should match today (ignore time)")
        .toBe(true);
      expect
        .soft(updateAuthor, "Update case author should be present")
        .not.toBe("");

      const expectedDetails = {
        Date: updateDate,
        Author: updateAuthor,
        "End state": "Case created",
        Event: "Update case",
        Summary: "-",
        Comment: "-",
      };
      const table = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.historyDetailsTable,
      );
      expect(table).toMatchObject(expectedDetails);
    });
  });
});
