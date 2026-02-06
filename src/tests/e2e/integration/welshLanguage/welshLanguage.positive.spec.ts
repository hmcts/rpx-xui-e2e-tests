import { expect, test } from "../../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";
import { ensureSessionCookies } from "../utils/session.utils.js";

const userIdentifier = "SOLICITOR";

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.beforeAll(async () => {
  await ensureSessionCookies(userIdentifier, { strict: true });
});

test.describe("Verify users can switch the language (@mocked translation API)", () => {
  test.beforeEach(async ({ caseListPage, page }) => {
    await page.route("**/api/translation/cy*", async (route) => {
      const body = JSON.stringify({
        translations: {
          "Manage Cases": {
            translation: "Rhestr achosion",
          },
          "Sign out": {
            translation: "Allgofnodi",
          },
        },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body,
      });
    });

    await page.goto("/cases", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await caseListPage.waitForReady(45000);
  });

  test("Verify translations are shown when the user selects to view the site in Welsh", async ({
    caseListPage,
    page,
  }) => {
    await test.step("Change the language to Welsh", async () => {
      await caseListPage.exuiHeader.checkIsVisible();
      await caseListPage.exuiHeader.switchLanguage("Cymraeg");
      await caseListPage.exuiSpinnerComponent.wait();
      await page.waitForLoadState("domcontentloaded");
      await caseListPage.exuiHeader.selectedPageItem.waitFor({
        state: "visible",
        timeout: 15000,
      });
    });

    await test.step("Check the translation for Manage Cases is shown and the language toggle switches to English", async () => {
      await expect(caseListPage.exuiHeader.selectedPageItem).toContainText(
        "Rhestr achosion",
      );
      await expect(caseListPage.exuiHeader.languageToggle).toContainText(
        "English",
      );
    });

    await test.step("Check the language can be switched back to English and the correct translations are shown", async () => {
      await caseListPage.exuiHeader.switchLanguage("English");
      await caseListPage.exuiSpinnerComponent.wait();
      await caseListPage.exuiHeader.checkIsVisible();
      await expect(caseListPage.exuiHeader.selectedPageItem).toContainText(
        "Manage Cases",
      );
      await expect(caseListPage.exuiHeader.languageToggle).toContainText(
        "Cymraeg",
      );
    });
  });
});
