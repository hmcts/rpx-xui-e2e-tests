import { expect, test } from "../../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";
import { welshTranslationsSmall } from "../mocks/welshLanguage.mock.js";
import { TEST_USERS } from "../testData/index.js";
import { ensureSessionCookies } from "../utils/session.utils.js";

const userIdentifier = TEST_USERS.SOLICITOR;

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.beforeAll(async () => {
  await ensureSessionCookies(userIdentifier, { strict: true });
});

test.describe("Verify users can switch the language", () => {
  test.beforeEach(async ({ caseListPage, page }) => {
    await page.route("**/api/translation/cy*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: "{}",
      });
    });

    await page.goto("/cases", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await caseListPage.waitForReady(45000);
  });

  test("Verify translations are not shown when the translation endpoint returns an error", async ({
    createCasePage,
    caseListPage,
    page,
  }) => {
    await test.step("Change the language to Welsh", async () => {
      await caseListPage.exuiHeader.checkIsVisible();
      const translationErrorPromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/translation/cy") &&
          response.status() === 500,
        { timeout: 10_000 },
      );

      await caseListPage.exuiHeader.switchLanguage("Cymraeg");
      await caseListPage.exuiSpinnerComponent.wait();
      await page.waitForLoadState("domcontentloaded");
      await translationErrorPromise;
    });

    await test.step("Check the translations are not shown, but the translated banner still is", async () => {
      const signOutLabel = page
        .getByRole("banner")
        .locator("a, li, span, div")
        .filter({ hasText: /Sign out|Allgofnodi/i })
        .first();
      const notificationBanner = page.locator(".govuk-notification-banner");
      const notificationBannerTitle = notificationBanner.locator(
        ".govuk-notification-banner__title",
      );
      const caseListHeading = page.locator("main h1").first();
      const copyrightLink = page
        .getByRole("contentinfo")
        .getByRole("link", {
          name: /\u00a9 Crown copyright|\u00a9 Hawlfraint y Goron/i,
        })
        .first();

      await expect
        .soft(caseListPage.exuiHeader.languageToggle)
        .toContainText("English");
      await expect.soft(notificationBanner).toBeVisible();
      await expect.soft(notificationBannerTitle).toContainText("Pwysig");
      await expect
        .soft(caseListPage.exuiHeader.selectedPageItem)
        .not.toContainText(
          welshTranslationsSmall.translations["Manage Cases"].translation,
        );
      await expect
        .soft(signOutLabel)
        .not.toContainText(
          welshTranslationsSmall.translations["Sign out"].translation,
        );
      await expect
        .soft(caseListHeading)
        .not.toContainText(
          welshTranslationsSmall.translations["Case list"].translation,
        );
      await expect
        .soft(createCasePage.createCaseButton)
        .not.toContainText(
          welshTranslationsSmall.translations["Create case"].translation,
        );
      await expect
        .soft(copyrightLink)
        .not.toContainText(
          welshTranslationsSmall.translations["© Crown copyright"].translation,
        );
    });
  });
});
