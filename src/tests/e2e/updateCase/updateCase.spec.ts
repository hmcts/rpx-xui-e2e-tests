import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";
import { caseBannerMatches } from "../../../utils/ui/banner.utils.js";
import { getTodayFormats, matchesToday } from "../../../utils/ui/date.utils.js";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import { ensureSessionCookies } from "../integration/utils/session.utils.js";

let caseNumber = "";
const updatedFirstName = faker.person.firstName();
const updatedLastName = faker.person.lastName();
const testField = `${faker.lorem.word()}${new Date().toLocaleTimeString()}`;
const userIdentifier = "SOLICITOR";

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.describe("Verify creating and updating a case works as expected", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    await ensureSessionCookies(userIdentifier, { strict: true });
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
    await page.goto("/");
    await createCasePage.createDivorceCase(
      "DIVORCE",
      "XUI Case PoC",
      testField,
    );
    caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
  });

  test("Create, update and verify case history", async ({
    createCasePage,
    caseDetailsPage,
  }) => {
    await test.step("Start Update Case event", async () => {
      await caseDetailsPage.selectCaseAction("Update case", {
        expectedLocator: createCasePage.person2FirstNameInput,
        timeoutMs: 45_000,
      });
    });

    await test.step("Update case fields", async () => {
      await createCasePage.person2FirstNameInput.fill(updatedFirstName);
      await createCasePage.person2LastNameInput.fill(updatedLastName);
      await createCasePage.clickContinueAndWaitForNext(
        "after updating case fields",
      );
      await createCasePage.clickSubmitAndWait("after updating case fields", {
        timeoutMs: 150_000,
        maxAutoAdvanceAttempts: 12,
      });
      await caseDetailsPage.exuiSpinnerComponent.wait();
      await expect.soft(caseDetailsPage.caseAlertSuccessMessage).toBeVisible();
    });

    await test.step("Verify update success banner", async () => {
      const expectedMessage = "has been updated with event: Update case";
      await expect
        .poll(async () => {
          const bannerText =
            await caseDetailsPage.caseAlertSuccessMessage.innerText();
          return caseBannerMatches(bannerText, caseNumber, expectedMessage);
        })
        .toBe(true);
    });

    await test.step("Verify the 'Some more data' tab has updated names correctly", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Some more data");

      const expectedValues = {
        "First Name": updatedFirstName,
        "Last Name": updatedLastName,
      };

      await expect
        .poll(
          async () =>
            caseDetailsPage.trRowsToObjectInPage(
              caseDetailsPage.someMoreDataTable,
            ),
          {
            timeout: 30_000,
            message:
              "Some more data table should contain updated first and last name values",
          },
        )
        .toMatchObject(expectedValues);
    });

    await test.step("Verify that event details are shown on the History tab", async () => {
      await caseDetailsPage.selectCaseDetailsTab("History");
      const { updateRow, updateDate, updateAuthor, expectedDate } =
        await caseDetailsPage.getUpdateCaseHistoryInfo();

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
