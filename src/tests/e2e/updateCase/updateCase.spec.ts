import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";
import { requireCreateCaseSelection } from "../utils/create-case-selection.utils.js";
import { retryOnTransientFailure } from "../utils/transient-failure.utils.js";
import { ensureUiSession, openHomeWithCapturedSession } from "../utils/ui-session.utils.js";

const updatedFirstName = faker.person.firstName();
const updatedLastName = faker.person.lastName();
const testField = `${faker.lorem.word()}${Date.now()}`;
const UPDATE_CASE_ACTION_TIMEOUT_MS = 60_000;
const DIVORCE_SOLICITOR = "DIVORCE_SOLICITOR";

function caseBannerMatches(bannerText: string, caseNumber: string, expectedMessage: string): boolean {
  const normalizedBanner = bannerText.replace(/\D/g, "");
  const normalizedCaseNumber = caseNumber.replace(/\D/g, "");
  return normalizedBanner.includes(normalizedCaseNumber) && bannerText.includes(expectedMessage);
}

function getTodayFormats(): { expectedDate: string; numericFormat: string } {
  const now = new Date();
  return {
    expectedDate: now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }),
    numericFormat: now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    })
  };
}

function matchesToday(value: string, expectedDate: string, numericFormat: string): boolean {
  return value.includes(expectedDate) || value.includes(numericFormat);
}

test.describe(
  "Verify creating and updating a case works as expected",
  { tag: ["@e2e", "@e2e-update-case"] },
  () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test.describe.configure({ timeout: 240_000 });

    test.beforeAll(async () => {
      await ensureUiSession(DIVORCE_SOLICITOR);
    });

    test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
      await retryOnTransientFailure(
        async () => {
          await openHomeWithCapturedSession(page, DIVORCE_SOLICITOR);
          await createCasePage.acceptAnalyticsCookies();
          await createCasePage.waitForUiIdleState();

          const selection = await createCasePage.resolveCreateCaseSelection(
            "DIVORCE",
            "XUI Case PoC"
          );
          requireCreateCaseSelection(selection, "DIVORCE", "XUI Case PoC");
          await createCasePage.createDivorceCase("DIVORCE", "XUI Case PoC", testField);
          await caseDetailsPage.waitForReady();
        },
        {
          maxAttempts: 1,
          onRetry: async () => {
            if (page.isClosed()) {
              return;
            }
            await page.goto("/").catch(() => undefined);
          }
        }
      );
    });

    test("Create, update and verify case history", async ({
      page,
      createCasePage,
      caseDetailsPage
    }) => {
      let caseNumber = "";
      let caseDetailsUrl = "";

      await test.step("Collect the case number", async () => {
        caseDetailsUrl = await caseDetailsPage.getCurrentPageUrl();
        caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
      });

      await test.step("Start Update Case event", async () => {
        await caseDetailsPage.selectCaseAction("Update case", {
          expectedLocator: createCasePage.person2FirstNameInput,
          timeoutMs: UPDATE_CASE_ACTION_TIMEOUT_MS
        });
      });

      await test.step("Update case fields", async () => {
        await retryOnTransientFailure(
          async () => {
            await createCasePage.person2FirstNameInput.fill(updatedFirstName);
            await createCasePage.person2LastNameInput.fill(updatedLastName);
            await createCasePage.clickSubmitAndWait("after updating case fields", {
              timeoutMs: 60_000,
              maxAutoAdvanceAttempts: 3
            });
          },
          {
            maxAttempts: 2,
            onRetry: async () => {
              if (page.isClosed()) {
                return;
              }
              await caseDetailsPage.reopenCaseDetails(caseDetailsUrl).catch(async () => {
                await page.goto(caseDetailsUrl).catch(() => undefined);
              });
              await caseDetailsPage.selectCaseAction("Update case", {
                expectedLocator: createCasePage.person2FirstNameInput,
                timeoutMs: UPDATE_CASE_ACTION_TIMEOUT_MS,
                retry: false
              });
            }
          }
        );

        await caseDetailsPage.exuiSpinnerComponent.wait();
        await expect.soft(caseDetailsPage.caseAlertSuccessMessage).toBeVisible();
      });

      await test.step("Verify update success banner", async () => {
        const expectedMessage = "has been updated with event: Update case";
        await expect
          .poll(
            async () => {
              const bannerText = await caseDetailsPage.caseAlertSuccessMessage.innerText();
              return caseBannerMatches(bannerText, caseNumber, expectedMessage);
            },
            { timeout: 45_000, intervals: [1_000, 2_000, 3_000] }
          )
          .toBe(true);
      });

      await test.step("Verify the 'Some more data' tab has updated names correctly", async () => {
        await caseDetailsPage.selectCaseDetailsTab("Some more data");

        const table = await caseDetailsPage.trRowsToObjectInPage(caseDetailsPage.someMoreDataTable);
        expect.soft(table).toMatchObject({
          "First Name": updatedFirstName,
          "Last Name": updatedLastName
        });
      });

      await test.step("Verify that event details are shown on the History tab", async () => {
        await caseDetailsPage.openHistoryTab();
        const { updateRow, updateDate, updateAuthor, expectedDate } =
          await caseDetailsPage.getCaseHistoryByEvent("Update case");
        expect.soft(updateRow, "Update case row should be present").toBeTruthy();

        const { numericFormat } = getTodayFormats();
        expect.soft(
          matchesToday(updateDate, expectedDate, numericFormat),
          "Update case date should match today (ignore time)"
        ).toBe(true);
        expect.soft(updateAuthor, "Update case author should be present").not.toBe("");

        const table = await caseDetailsPage.trRowsToObjectInPage(caseDetailsPage.historyDetailsTable);
        expect(table).toMatchObject({
          Date: updateDate,
          Author: updateAuthor,
          "End state": "Case created",
          Event: "Update case",
          Summary: "-",
          Comment: "-"
        });
      });
    });
  }
);
