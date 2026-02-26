import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";
import { ensureSessionCookies } from "../../../utils/integration/session.utils.js";
import { caseBannerMatches } from "../../../utils/ui/banner.utils.js";
import { getTodayFormats, matchesToday } from "../../../utils/ui/date.utils.js";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils.js";

let caseNumber = "";
const updatedFirstName = faker.person.firstName();
const updatedLastName = faker.person.lastName();
const testField = `${faker.lorem.word()}${new Date().toLocaleTimeString()}`;
const userIdentifier = "SOLICITOR";

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.describe("Verify creating and updating a case works as expected", () => {
  test.describe.configure({ timeout: 420_000 });

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
    const caseDetailsUrl = `/cases/case-details/${caseNumber}`;
    const getSomeMoreDataText = async (): Promise<string> => {
      await caseDetailsPage.selectCaseDetailsTab("Some more data");
      const tableText = await caseDetailsPage.someMoreDataTable
        .first()
        .innerText();
      return tableText.replaceAll(/\s+/g, " ").trim();
    };
    const hasUpdatedData = async (): Promise<boolean> => {
      const tableText = await getSomeMoreDataText();
      return [
        `First Name ${updatedFirstName}`,
        `Last Name ${updatedLastName}`,
      ].every((expectedValue) => tableText.includes(expectedValue));
    };
    const getUpdateCaseEventCount = async (): Promise<number> => {
      await caseDetailsPage.selectCaseDetailsTab("History");
      const rows = await caseDetailsPage.mapHistoryTable();
      return rows.filter((row) => row.Event === "Update case").length;
    };
    const isUpdateAlreadyApplied = async (): Promise<boolean> => {
      await caseDetailsPage.page.goto(caseDetailsUrl, {
        waitUntil: "domcontentloaded",
      });
      await caseDetailsPage.waitForReady(60_000).catch(() => undefined);
      const updatedDataPresent = await hasUpdatedData();
      const updateEventCount = await getUpdateCaseEventCount();
      return [updatedDataPresent, updateEventCount > 0].every(Boolean);
    };

    await test.step("Start Update Case event and submit updates", async () => {
      await retryOnTransientFailure(
        async () => {
          if (await isUpdateAlreadyApplied()) {
            test.info().annotations.push({
              type: "idempotency-guard",
              description:
                "Update case action already applied on previous attempt; skipping replay.",
            });
            return;
          }

          const isPostSubmitReady = async (): Promise<boolean> => {
            const eventErrorVisible =
              await caseDetailsPage.eventCreationErrorHeading
                .isVisible()
                .catch(() => false);
            if (eventErrorVisible) {
              throw new Error(
                "CCD event creation error is visible after Update case submit.",
              );
            }
            const successBannerVisible =
              await caseDetailsPage.caseAlertSuccessMessage
                .isVisible()
                .catch(() => false);
            const caseActionsVisible = await caseDetailsPage.caseActionsDropdown
              .isVisible()
              .catch(() => false);
            return successBannerVisible || caseActionsVisible;
          };
          const waitForPostSubmitReady = async (
            timeoutMs: number,
          ): Promise<boolean> => {
            try {
              await expect
                .poll(isPostSubmitReady, {
                  timeout: timeoutMs,
                  intervals: [1_000, 2_000, 3_000],
                })
                .toBe(true);
              return true;
            } catch {
              return false;
            }
          };

          await caseDetailsPage.selectCaseAction("Update case", {
            expectedLocator: createCasePage.person2FirstNameInput,
            timeoutMs: 45_000,
          });
          await createCasePage.person2FirstNameInput.fill(updatedFirstName);
          await createCasePage.person2LastNameInput.fill(updatedLastName);
          await createCasePage.clickContinueAndWaitForNext(
            "after updating case fields",
          );
          await createCasePage.clickSubmitAndWait(
            "after updating case fields",
            {
              timeoutMs: 150_000,
              maxAutoAdvanceAttempts: 12,
            },
          );
          let postSubmitReady = await waitForPostSubmitReady(60_000);
          if (!postSubmitReady) {
            test.info().annotations.push({
              type: "post-submit-recovery",
              description:
                "Post-submit readiness check timed out; reloading case details for deterministic verification.",
            });
            const caseDetailsUrl = `/cases/case-details/${caseNumber}`;
            await caseDetailsPage.page.goto(caseDetailsUrl, {
              waitUntil: "domcontentloaded",
            });
            await caseDetailsPage.waitForReady(60_000).catch(() => undefined);
            postSubmitReady = await waitForPostSubmitReady(45_000);
            if (!postSubmitReady) {
              throw new Error(
                "Post-submit ready signal (success banner/case actions) not observed after recovery.",
              );
            }
          }
        },
        {
          maxAttempts: 3,
          onRetry: async (attempt, error) => {
            test.info().annotations.push({
              type: "retry-attempt",
              description: `attempt=${attempt + 1} reason=${String(error).slice(0, 200)}`,
            });
            await caseDetailsPage.page
              .goto(caseDetailsUrl, { waitUntil: "domcontentloaded" })
              .catch(() => undefined);
          },
          ensureIdempotent: async () => {
            await caseDetailsPage.page
              .goto(caseDetailsUrl, { waitUntil: "domcontentloaded" })
              .catch(() => undefined);
          },
        },
      );
    });

    await test.step("Verify update success banner", async () => {
      const expectedMessage = "has been updated with event: Update case";
      let bannerOrHistoryDetected = false;
      try {
        await expect
          .poll(
            async () => {
              const bannerVisible =
                await caseDetailsPage.caseAlertSuccessMessage
                  .isVisible()
                  .catch(() => false);
              if (bannerVisible) {
                const bannerText =
                  await caseDetailsPage.caseAlertSuccessMessage.innerText();
                if (
                  caseBannerMatches(bannerText, caseNumber, expectedMessage)
                ) {
                  return true;
                }
              }

              const historySelected = await caseDetailsPage
                .selectCaseDetailsTab("History")
                .then(() => true)
                .catch(() => false);
              if (!historySelected) {
                return false;
              }
              const { updateRow } =
                await caseDetailsPage.getUpdateCaseHistoryInfo();
              return Boolean(updateRow);
            },
            { timeout: 60_000, intervals: [2_000, 4_000, 6_000] },
          )
          .toBe(true);
        bannerOrHistoryDetected = true;
      } catch {
        test.info().annotations.push({
          type: "delayed-update-banner",
          description:
            "Update success banner/history signal was delayed; continuing to deterministic field/history assertions.",
        });
      }
      expect
        .soft(
          bannerOrHistoryDetected,
          "Banner/history success signal should usually appear before downstream verification steps.",
        )
        .toBe(true);
    });

    await test.step("Verify the 'Some more data' tab has updated names correctly", async () => {
      await expect
        .poll(getSomeMoreDataText, {
          timeout: 45_000,
          message:
            "Some more data table should contain updated first and last name values",
        })
        .toContain(`First Name ${updatedFirstName}`);
      await expect
        .poll(getSomeMoreDataText, { timeout: 45_000 })
        .toContain(`Last Name ${updatedLastName}`);

      await caseDetailsPage.page.goto(caseDetailsUrl, {
        waitUntil: "domcontentloaded",
      });
      await caseDetailsPage.waitForReady(60_000).catch(() => undefined);
      await expect
        .poll(getSomeMoreDataText, {
          timeout: 45_000,
          message:
            "Some more data should still contain updated names after case details reload",
        })
        .toContain(`First Name ${updatedFirstName}`);
      await expect
        .poll(getSomeMoreDataText, { timeout: 45_000 })
        .toContain(`Last Name ${updatedLastName}`);
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

      const initialUpdateEventCount = await getUpdateCaseEventCount();
      expect(
        initialUpdateEventCount,
        "Update case event should be recorded exactly once",
      ).toBe(1);

      await caseDetailsPage.page.goto(caseDetailsUrl, {
        waitUntil: "domcontentloaded",
      });
      await caseDetailsPage.waitForReady(60_000).catch(() => undefined);
      const updateEventCountAfterReload = await getUpdateCaseEventCount();
      expect(
        updateEventCountAfterReload,
        "Update case event count should remain stable after reload",
      ).toBe(initialUpdateEventCount);
    });
  });
});
