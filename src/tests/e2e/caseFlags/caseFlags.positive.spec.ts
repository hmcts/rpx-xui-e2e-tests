import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";
import { caseBannerMatches } from "../utils/banner.utils.js";
import { isPageClosingError, rowMatchesExpected } from "../utils/case-flags.utils.js";
import { filterEmptyRows } from "../utils/table.utils.js";
import { setupCaseForJourney } from "../utils/test-setup/caseSetup.js";
import { buildCasePayloadFromTemplate } from "../utils/test-setup/payloads/registry.js";
import { retryOnTransientFailure } from "../utils/transient-failure.utils.js";
import { ensureUiSession, openHomeWithCapturedSession } from "../utils/ui-session.utils.js";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Case level case flags", { tag: ["@e2e", "@e2e-case-flags"] }, () => {
  test.describe.configure({ timeout: 180_000 });
  const jurisdiction = "EMPLOYMENT";
  const caseType = "ET_EnglandWales";
  let caseNumber = "";

  test.beforeAll(async () => {
    await ensureUiSession("SEARCH_EMPLOYMENT_CASE");
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }, testInfo) => {
    await openHomeWithCapturedSession(page, "SEARCH_EMPLOYMENT_CASE");
    const setup = await retryOnTransientFailure(
      async () =>
        setupCaseForJourney({
          scenario: "case-flags-employment-case-level",
          jurisdiction,
          caseType,
          apiEventId: "initiateCase",
          mode: "api-required",
          apiPayload: buildCasePayloadFromTemplate("employment.et-england-wales.initiate-case"),
          uiCreate: async () => {
            await createCasePage.createCaseEmployment(jurisdiction, caseType, "");
          },
          page,
          createCasePage,
          caseDetailsPage,
          testInfo
        }),
      {
        maxAttempts: 2,
        onRetry: async () => {
          if (!page.isClosed()) {
            await page.goto("/").catch(() => undefined);
          }
        }
      }
    );
    caseNumber = setup.caseNumber;
  });

  test("Create a new case level flag and verify the flag is displayed on the case", async ({
    caseDetailsPage,
    tableUtils
  }) => {
    await test.step("Record existing case level flags", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const flagsTable = await caseDetailsPage.waitForTableByName("Case level flags");
      const table = await tableUtils.parseDataTable(flagsTable);
      const visibleRows = filterEmptyRows(table);
      expect.soft(visibleRows.length).toBeGreaterThanOrEqual(0);
    });

    await test.step("Create a new case level flag", async () => {
      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create a case flag");
      await caseDetailsPage.selectCaseFlagTarget("Welsh");
    });

    await test.step("Check the case flag creation messages are seen", async () => {
      await expect
        .poll(async () => {
          if (await caseDetailsPage.hasCallbackValidationErrorAlert()) {
            throw new Error("Callback data failed validation while creating case-level case flag.");
          }
          const bannerText = await caseDetailsPage.caseAlertSuccessMessage.innerText().catch(() => "");
          return caseBannerMatches(bannerText, caseNumber, "has been updated with event: Create a case flag");
        })
        .toBe(true);
      await expect(caseDetailsPage.caseNotificationBannerTitle).toContainText("Important");
      await expect(caseDetailsPage.caseNotificationBannerBody).toContainText(
        "There is 1 active flag on this case."
      );
    });

    await test.step("Verify the case level flag is shown in the flags tab", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const expectedFlag = {
        "Case flags": "Welsh forms and communications",
        Comments: "Welsh",
        "Creation date": await caseDetailsPage.todaysDateFormatted(),
        "Last modified": "",
        "Flag status": "ACTIVE"
      };
      await expect
        .poll(
          async () => {
            if (caseDetailsPage.page.isClosed()) {
              return false;
            }
            try {
              const table = await tableUtils.parseDataTable(await caseDetailsPage.getTableByName("Case level flags"));
              const visibleRows = filterEmptyRows(table);
              return visibleRows.some((row) => rowMatchesExpected(row, expectedFlag));
            } catch (error) {
              if (isPageClosingError(error)) {
                return false;
              }
              throw error;
            }
          },
          { timeout: 45_000, intervals: [1_000, 2_000, 3_000] }
        )
        .toBe(true);
    });
  });
});

test.describe("Party level case flags", { tag: ["@e2e", "@e2e-case-flags"] }, () => {
  test.describe.configure({ timeout: 300_000 });
  const jurisdiction = "DIVORCE";
  const caseType = "xuiCaseFlagsV1";
  let caseNumber = "";
  let testValue = "";

  test.beforeAll(async () => {
    await ensureUiSession("USER_WITH_FLAGS");
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }, testInfo) => {
    testValue = faker.person.firstName();
    await openHomeWithCapturedSession(page, "USER_WITH_FLAGS");
    const setup = await retryOnTransientFailure(
      async () =>
        setupCaseForJourney({
          scenario: "case-flags-divorce-party-level",
          jurisdiction,
          caseType,
          apiEventId: "createCase",
          mode: "api-required",
          apiPayload: buildCasePayloadFromTemplate("divorce.xui-test-case-type.create-case-flags", {
            overrides: {
              LegalRepParty1Flags: {
                roleOnCase: testValue,
                partyName: testValue
              },
              LegalRepParty2Flags: {
                roleOnCase: `${testValue}2`,
                partyName: `${testValue}2`
              }
            }
          }),
          uiCreate: async () => {
            await createCasePage.createCaseFlagDivorceCase(testValue, jurisdiction, caseType);
          },
          page,
          createCasePage,
          caseDetailsPage,
          testInfo
        }),
      {
        maxAttempts: 2,
        onRetry: async () => {
          if (!page.isClosed()) {
            await page.goto("/").catch(() => undefined);
          }
        }
      }
    );
    caseNumber = setup.caseNumber;
  });

  test("Create a new party level flag and verify the flag is displayed on the case", async ({
    caseDetailsPage,
    tableUtils
  }) => {
    await test.step("Record existing party level flags", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const flagsTable = await caseDetailsPage.waitForTableByName(testValue);
      const table = await tableUtils.parseDataTable(flagsTable);
      const visibleRows = filterEmptyRows(table);
      expect.soft(visibleRows.length).toBeGreaterThanOrEqual(0);
    });

    await test.step("Create a new party level flag", async () => {
      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create case flag");
      await caseDetailsPage.selectPartyFlagTarget(testValue, "Welsh");
    });

    await test.step("Check the case flag creation messages are seen", async () => {
      await expect
        .poll(
          async () => {
            if (await caseDetailsPage.hasCallbackValidationErrorAlert()) {
              throw new Error("Callback data failed validation while creating party-level case flag.");
            }
            if (await caseDetailsPage.eventCreationErrorHeading.isVisible().catch(() => false)) {
              throw new Error("CCD event creation failed while creating party-level case flag.");
            }
            const bannerText = await caseDetailsPage.caseAlertSuccessMessage.innerText().catch(() => "");
            return caseBannerMatches(bannerText, caseNumber, "has been updated with event: Create case flag");
          },
          { timeout: 45_000, intervals: [1_000, 2_000, 3_000] }
        )
        .toBe(true);
      await expect(caseDetailsPage.caseNotificationBannerTitle).toContainText("Important");
      await expect(caseDetailsPage.caseNotificationBannerBody).toContainText(
        "There is 1 active flag on this case."
      );
    });

    await test.step("Verify the party level case flag is shown in the flags tab", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const expectedFlag = {
        "Party level flags": "I want to speak Welsh at a hearing",
        Comments: `Welsh ${testValue}`,
        "Creation date": await caseDetailsPage.todaysDateFormatted(),
        "Last modified": "",
        "Flag status": "ACTIVE"
      };
      await expect
        .poll(
          async () => {
            if (caseDetailsPage.page.isClosed()) {
              return false;
            }
            if (await caseDetailsPage.hasCallbackValidationErrorAlert()) {
              throw new Error("Callback data failed validation while verifying party-level case flag.");
            }
            try {
              const table = await tableUtils.parseDataTable(await caseDetailsPage.getTableByName(testValue));
              const visibleRows = filterEmptyRows(table);
              return visibleRows.some((row) => rowMatchesExpected(row, expectedFlag));
            } catch (error) {
              if (isPageClosingError(error)) {
                return false;
              }
              throw error;
            }
          },
          { timeout: 45_000, intervals: [1_000, 2_000, 3_000] }
        )
        .toBe(true);
    });
  });
});
