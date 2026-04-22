import { expect, test } from "../../../fixtures/ui";
import {
  ensureWelshLanguageSessionAccess,
  setupWelshLanguageSession,
  type WelshLanguageSessionLease
} from "../helpers/index.js";
import { TEST_USERS } from "../testData/index.js";

const userIdentifier = TEST_USERS.SOLICITOR;
let activeLease: WelshLanguageSessionLease | undefined;

test.beforeAll(async ({}, testInfo) => {
  await ensureWelshLanguageSessionAccess(testInfo);
});

test.describe(`@nightly Welsh language backend smoke as ${userIdentifier}`, () => {
  test.beforeEach(async ({ caseListPage, page }, testInfo) => {
    activeLease = await setupWelshLanguageSession(page, testInfo);
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

  test("translation endpoint responds and language toggle switches to Welsh", async ({
    caseListPage,
    page
  }) => {
    await caseListPage.exuiHeader.checkIsVisible();

    const translationResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/translation/cy") && response.request().method() === "GET",
      { timeout: 30_000 }
    );

    await caseListPage.exuiHeader.switchLanguage("Cymraeg");
    await caseListPage.exuiSpinnerComponent.wait();

    const translationResponse = await translationResponsePromise;
    expect(translationResponse.status()).toBe(200);

    const payload = (await translationResponse.json().catch(() => null)) as
      | { translations?: Record<string, unknown> }
      | null;
    expect(payload).not.toBeNull();
    expect(Object.keys(payload?.translations ?? {}).length).toBeGreaterThan(0);

    await expect(caseListPage.exuiHeader.languageToggle).toContainText("English");
  });
});
