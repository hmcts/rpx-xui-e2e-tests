import { faker } from "@faker-js/faker";
import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import { UserUtils } from "../../../utils/ui/user.utils";
import { loadSessionCookies } from "../integration/utils/session.utils.js";

const userUtils = new UserUtils();
const requiredUsers = ["SEARCH_EMPLOYMENT_CASE", "USER_WITH_FLAGS"];
const missingUsers = requiredUsers.filter((user) => !userUtils.hasUserCredentials(user));
const shouldRunCaseFlags = missingUsers.length === 0;

const applySessionCookies = async (page: { context: () => { addCookies: (cookies: Cookie[]) => Promise<void> } }, cookies: Cookie[]) => {
  if (cookies.length) {
    await page.context().addCookies(cookies);
  }
};

if (shouldRunCaseFlags) {
  test.describe("Case level case flags", () => {
    const testValue = faker.person.firstName();
    let caseNumber = "";
  const jurisdiction = "EMPLOYMENT";
  const caseType = "ET_EnglandWales";
  let sessionCookies: Cookie[] = [];

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
    const { cookies } = loadSessionCookies("SEARCH_EMPLOYMENT_CASE");
    sessionCookies = cookies;
    await applySessionCookies(page, sessionCookies);
    await page.goto("/");
    await createCasePage.createCaseEmployment(jurisdiction, caseType, testValue);
    caseNumber = await caseDetailsPage.getCaseNumberFromAlert();
  });

  test("Create a new case level flag and verify the flag is displayed on the case", async ({ caseDetailsPage, tableUtils }) => {
    await test.step("Check there are no flags already present", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const table = await tableUtils.mapExuiTable(await caseDetailsPage.getTableByName("Case level flags"));
      expect.soft(table[0]).toMatchObject({});
    });

    await test.step("Create a new case level flag", async () => {
      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create a case flag");
      await caseDetailsPage.selectCaseFlagTarget("Welsh");
    });

    await test.step("Check the case flag creation messages are seen", async () => {
      expect.soft(await caseDetailsPage.caseAlertSuccessMessage.innerText()).toContain(
        `Case ${caseNumber} has been updated with event: Create a case flag`
      );
      expect.soft(await caseDetailsPage.caseNotificationBannerTitle.innerText()).toContain("Important");
      expect.soft(await caseDetailsPage.caseNotificationBannerBody.innerText()).toContain(
        "There is 1 active flag on this case."
      );
    });

    await test.step("Verify the case level flag is shown in the history tab", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const expectedFlag = {
        "Case flags": "Welsh forms and communications",
        Comments: "Welsh",
        "Creation date": await caseDetailsPage.todaysDateFormatted(),
        "Last modified": "",
        "Flag status": "ACTIVE"
      };
      const table = await tableUtils.mapExuiTable(await caseDetailsPage.getTableByName("Case level flags"));
      expect(table[0]).toMatchObject(expectedFlag);
    });
  });
  });

  test.describe("Party level case flags", () => {
    const testValue = faker.person.firstName();
    let caseNumber = "";
  const jurisdiction = "DIVORCE";
  const caseType = "xuiCaseFlagsV1";
  let sessionCookies: Cookie[] = [];

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
    const { cookies } = loadSessionCookies("USER_WITH_FLAGS");
    sessionCookies = cookies;
    await applySessionCookies(page, sessionCookies);
    await page.goto("/");
    await createCasePage.createCaseFlagDivorceCase(testValue, jurisdiction, caseType);
    caseNumber = await caseDetailsPage.getCaseNumberFromAlert();
  });

  test("Create a new party level flag and verify the flag is displayed on the case", async ({ caseDetailsPage, tableUtils }) => {
    await test.step("Check there are no flags already present", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const table = await tableUtils.mapExuiTable(await caseDetailsPage.getTableByName(testValue));
      expect.soft(table[0]).toMatchObject({});
    });

    await test.step("Create a new party level flag", async () => {
      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create case flag");
      await caseDetailsPage.selectPartyFlagTarget(testValue, "Welsh");
    });

    await test.step("Check the case flag creation messages are seen", async () => {
      expect.soft(await caseDetailsPage.caseAlertSuccessMessage.innerText()).toContain(
        `Case ${caseNumber} has been updated with event: Create case flag`
      );
      expect.soft(await caseDetailsPage.caseNotificationBannerTitle.innerText()).toContain("Important");
      expect.soft(await caseDetailsPage.caseNotificationBannerBody.innerText()).toContain(
        "There is 1 active flag on this case."
      );
    });

    await test.step("Verify the party level case flag is shown in the history tab", async () => {
      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const expectedFlag = {
        "Party level flags": "I want to speak Welsh at a hearing",
        Comments: `Welsh ${testValue}`,
        "Creation date": await caseDetailsPage.todaysDateFormatted(),
        "Last modified": "",
        "Flag status": "ACTIVE"
      };
      const table = await tableUtils.mapExuiTable(await caseDetailsPage.getTableByName(testValue));
      expect(table[0]).toMatchObject(expectedFlag);
    });
  });
  });
}
