import { expect, test } from "../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import { ensureUiSessionOrSkip } from "../helpers/index.js";
import { TEST_USERS } from "../testData/index.js";

const userIdentifier = TEST_USERS.SOLICITOR;

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.beforeAll(async ({ browser }, testInfo) => {
  void browser;
  await ensureUiSessionOrSkip(userIdentifier, testInfo);
});

test.describe("@nightly Welsh language backend smoke", () => {
  test.beforeEach(async ({ caseListPage, page }) => {
    await page.goto("/cases", {
      waitUntil: "domcontentloaded",
      timeout: 30_000
    });
    await caseListPage.waitForReady(45_000);
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
