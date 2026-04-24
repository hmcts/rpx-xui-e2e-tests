import { expect, test } from "../../../fixtures/ui";
import {
  ensureWelshLanguageSessionAccess,
  setupWelshLanguageSession,
  type WelshLanguageSessionLease
} from "../helpers/index.js";
import { welshTranslationsSmall } from "../mocks/welshLanguage.mock.js";
import { TEST_USERS } from "../testData/index.js";

const userIdentifier = TEST_USERS.SOLICITOR;
let activeLease: WelshLanguageSessionLease | undefined;

test.beforeAll(async ({}, testInfo) => {
  await ensureWelshLanguageSessionAccess(testInfo);
});

test.describe(`Verify users can switch the language as ${userIdentifier} (@mocked translation API)`, () => {
  test.beforeEach(async ({ caseListPage, page }, testInfo) => {
    activeLease = await setupWelshLanguageSession(page, testInfo);
    await page.route("**/api/translation/cy*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(welshTranslationsSmall)
      });
    });

    await page.goto("/cases", {
      waitUntil: "domcontentloaded",
      timeout: 30_000
    });
    await caseListPage.waitForReady(45_000);
  });

  test.afterEach(async () => {
    await activeLease?.release();
    activeLease = undefined;
  });

  test("Verify translations are shown when the user selects to view the site in Welsh", async ({
    caseListPage,
    page
  }) => {
    await caseListPage.exuiHeader.checkIsVisible();
    await caseListPage.exuiHeader.switchLanguage("Cymraeg");
    await caseListPage.exuiHeader.waitForRenderedLanguageState("Cymraeg");
    await caseListPage.exuiSpinnerComponent.wait();
    await page.waitForLoadState("domcontentloaded");
    await expect(caseListPage.exuiHeader.selectedPageItem).toContainText(
      welshTranslationsSmall.translations["Manage Cases"].translation
    );
    await expect(caseListPage.exuiHeader.languageToggle).toContainText("English");

    await caseListPage.exuiHeader.switchLanguage("English");
    await caseListPage.exuiHeader.waitForRenderedLanguageState("English");
    await caseListPage.exuiSpinnerComponent.wait();
    await page.waitForLoadState("domcontentloaded");
    await caseListPage.exuiHeader.checkIsVisible();
    await expect(caseListPage.exuiHeader.selectedPageItem).toContainText("Manage Cases");
    await expect(caseListPage.exuiHeader.languageToggle).toContainText("Cymraeg");
  });
});
