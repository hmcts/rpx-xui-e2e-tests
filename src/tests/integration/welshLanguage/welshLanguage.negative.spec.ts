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

test.describe(`Verify users can switch the language as ${userIdentifier} when the translation endpoint fails`, () => {
  test.beforeEach(async ({ caseListPage, page }, testInfo) => {
    activeLease = await setupWelshLanguageSession(page, testInfo);
    await page.route("**/api/translation/cy*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: "{}"
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

  test("Verify translations are not shown when the translation endpoint returns an error", async ({
    createCasePage,
    caseListPage,
    page
  }) => {
    const translationErrorPromise = page.waitForResponse(
      (response) => response.url().includes("/api/translation/cy") && response.status() === 500,
      { timeout: 15_000 }
    );

    await caseListPage.exuiHeader.checkIsVisible();
    await caseListPage.exuiHeader.switchLanguage("Cymraeg");
    await caseListPage.exuiSpinnerComponent.wait();
    await translationErrorPromise;

    await expect(caseListPage.exuiHeader.languageToggle).toContainText("English");
    await expect(caseListPage.exuiHeader.selectedPageItem).not.toContainText(
      welshTranslationsSmall.translations["Manage Cases"].translation
    );
    await expect(createCasePage.createCaseButton).not.toContainText(
      welshTranslationsSmall.translations["Create case"].translation
    );
    await expect(
      page.getByRole("contentinfo").getByRole("link", {
        name: /\u00a9 Crown copyright|\u00a9 Hawlfraint y Goron/i
      })
    ).not.toContainText(welshTranslationsSmall.translations["© Crown copyright"].translation);
  });
});
