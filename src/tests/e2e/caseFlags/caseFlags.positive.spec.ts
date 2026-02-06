import { faker } from "@faker-js/faker";
import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import {
  caseBannerMatches,
  getCaseBannerInfo,
  normalizeCaseNumber,
} from "../../../utils/ui/banner.utils.js";
import { filterEmptyRows } from "../../../utils/ui/table.utils.js";
import { UserUtils } from "../../../utils/ui/user.utils.js";
import {
  applyCookiesToPage,
  ensureSessionCookies,
} from "../integration/utils/session.utils.js";

const userUtils = new UserUtils();
const requiredUsers = ["SEARCH_EMPLOYMENT_CASE", "USER_WITH_FLAGS"];
const missingUsers = requiredUsers.filter(
  (user) => !userUtils.hasUserCredentials(user),
);
const shouldRunCaseFlags = missingUsers.length === 0;

if (shouldRunCaseFlags) {
  test.describe("Case level case flags", () => {
    test.describe.configure({ timeout: 120_000 });
    let caseNumber = "";
    let searchEmploymentCookies: Cookie[] = [];

    const jurisdiction = "EMPLOYMENT";
    const caseType = "ET_EnglandWales";

    test.beforeAll(async () => {
      const session = await ensureSessionCookies("SEARCH_EMPLOYMENT_CASE", {
        strict: true,
      });
      searchEmploymentCookies = session.cookies;
    });

    test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
      await applyCookiesToPage(page, searchEmploymentCookies);
      await page.goto("/");
      await createCasePage.createCaseEmployment(jurisdiction, caseType);
      caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
    });

    test("Create a new case level flag and verify the flag is displayed on the case", async ({
      caseDetailsPage,
      tableUtils,
    }) => {
      await test.step("Record existing case level flags", async () => {
        await caseDetailsPage.selectCaseDetailsTab("Flags");
        const table = await tableUtils.mapExuiTable(
          await caseDetailsPage.getTableByName("Case level flags"),
        );
        const visibleRows = filterEmptyRows(table);
        expect.soft(visibleRows.length).toBeGreaterThanOrEqual(0);
      });

      await test.step("Create a new case level flag", async () => {
        await caseDetailsPage.exuiSpinnerComponent.wait();
        await caseDetailsPage.selectCaseAction("Create a case flag");
        await caseDetailsPage.selectCaseFlagTarget("Welsh");
      });

      await test.step("Check the case flag creation messages are seen", async () => {
        const bannerText =
          await caseDetailsPage.caseAlertSuccessMessage.innerText();
        const { digits, message } = getCaseBannerInfo(bannerText);
        expect.soft(digits).toBe(normalizeCaseNumber(caseNumber));
        expect
          .soft(message)
          .toContain("has been updated with event: Create a case flag");
        expect
          .soft(await caseDetailsPage.caseNotificationBannerTitle.innerText())
          .toContain("Important");
        expect
          .soft(await caseDetailsPage.caseNotificationBannerBody.innerText())
          .toMatch(/active flag/i);
      });

      await test.step("Verify the case level flag is shown in the flags tab", async () => {
        await caseDetailsPage.selectCaseDetailsTab("Flags");
        const expectedFlag = {
          "Case flags": "Welsh forms and communications",
          Comments: "Welsh",
          "Creation date": await caseDetailsPage.todaysDateFormatted(),
          "Last modified": "",
          "Flag status": "ACTIVE",
        };

        await expect
          .poll(async () => {
            const table = await tableUtils.mapExuiTable(
              await caseDetailsPage.getTableByName("Case level flags"),
            );
            const visibleRows = filterEmptyRows(table);
            return visibleRows.some((row) =>
              Object.entries(expectedFlag).every(
                ([key, value]) => row[key] === value,
              ),
            );
          })
          .toBe(true);
      });
    });
  });

  test.describe("Party level case flags", () => {
    test.describe.configure({ timeout: 120_000 });
    const testValue = faker.person.firstName();
    let caseNumber = "";
    let flagsCookies: Cookie[] = [];

    const jurisdiction = "DIVORCE";
    const caseType = "xuiCaseFlagsV1";

    test.beforeAll(async () => {
      const session = await ensureSessionCookies("USER_WITH_FLAGS", {
        strict: true,
      });
      flagsCookies = session.cookies;
    });

    test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
      await applyCookiesToPage(page, flagsCookies);
      await page.goto("/");
      await createCasePage.createDivorceCaseFlag(
        testValue,
        jurisdiction,
        caseType,
      );
      caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
    });

    test("Create a new party level flag and verify the flag is displayed on the case", async ({
      caseDetailsPage,
      tableUtils,
    }) => {
      await test.step("Record existing party level flags", async () => {
        await caseDetailsPage.selectCaseDetailsTab("Flags");
        const table = await tableUtils.mapExuiTable(
          await caseDetailsPage.getTableByName(testValue),
        );
        const visibleRows = filterEmptyRows(table);
        expect.soft(visibleRows.length).toBeGreaterThanOrEqual(0);
      });

      await test.step("Create a new party level flag", async () => {
        await caseDetailsPage.exuiSpinnerComponent.wait();
        await caseDetailsPage.selectCaseAction("Create case flag");
        await caseDetailsPage.selectPartyFlagTarget(testValue, "Welsh");
      });

      await test.step("Check the case flag creation messages are seen", async () => {
        const callbackError = caseDetailsPage.page.getByText(
          "callback data failed validation",
          {
            exact: false,
          },
        );
        await expect(callbackError).toBeHidden();

        await expect
          .poll(async () => {
            const bannerText =
              await caseDetailsPage.caseAlertSuccessMessage.innerText();
            return caseBannerMatches(
              bannerText,
              caseNumber,
              "has been updated with event: Create case flag",
            );
          })
          .toBe(true);

        expect
          .soft(await caseDetailsPage.caseNotificationBannerTitle.innerText())
          .toContain("Important");
        expect
          .soft(await caseDetailsPage.caseNotificationBannerBody.innerText())
          .toMatch(/active flag/i);
      });

      await test.step("Verify the party level case flag is shown in the flags tab", async () => {
        await caseDetailsPage.selectCaseDetailsTab("Flags");
        const expectedFlag = {
          "Party level flags": "I want to speak Welsh at a hearing",
          Comments: `Welsh ${testValue}`,
          "Creation date": await caseDetailsPage.todaysDateFormatted(),
          "Last modified": "",
          "Flag status": "ACTIVE",
        };

        await expect
          .poll(async () => {
            const table = await tableUtils.mapExuiTable(
              await caseDetailsPage.getTableByName(testValue),
            );
            const visibleRows = filterEmptyRows(table);
            return visibleRows.some((row) =>
              Object.entries(expectedFlag).every(
                ([key, value]) => row[key] === value,
              ),
            );
          })
          .toBe(true);
      });
    });
  });
}
