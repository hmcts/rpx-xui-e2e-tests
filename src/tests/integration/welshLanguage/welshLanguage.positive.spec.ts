import { expect, test } from "../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import { ensureUiSessionOrSkip } from "../helpers/index.js";
import { welshTranslationsSmall } from "../mocks/welshLanguage.mock.js";
import { TEST_USERS } from "../testData/index.js";

const userIdentifier = TEST_USERS.SOLICITOR;

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.beforeAll(async ({ browser }, testInfo) => {
  void browser;
  await ensureUiSessionOrSkip(userIdentifier, testInfo);
});

test.describe("Verify users can switch the language (@mocked translation API)", () => {
  test.beforeEach(async ({ caseListPage, page }) => {
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

  test("Verify translations are shown when the user selects to view the site in Welsh", async ({
    caseListPage
  }) => {
    await caseListPage.exuiHeader.checkIsVisible();
    await caseListPage.exuiHeader.switchLanguage("Cymraeg");
    await caseListPage.exuiSpinnerComponent.wait();
    await expect(caseListPage.exuiHeader.selectedPageItem).toContainText(
      welshTranslationsSmall.translations["Manage Cases"].translation
    );
    await expect(caseListPage.exuiHeader.languageToggle).toContainText("English");

    await caseListPage.exuiHeader.switchLanguage("English");
    await caseListPage.exuiSpinnerComponent.wait();
    await caseListPage.exuiHeader.checkIsVisible();
    await expect(caseListPage.exuiHeader.selectedPageItem).toContainText("Manage Cases");
    await expect(caseListPage.exuiHeader.languageToggle).toContainText("Cymraeg");
  });
});
