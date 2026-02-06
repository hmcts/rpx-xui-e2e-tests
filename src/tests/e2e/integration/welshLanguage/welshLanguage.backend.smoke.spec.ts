import { expect, test } from "../../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";
import { ensureSessionCookies } from "../utils/session.utils.js";

const userIdentifier = "SOLICITOR";

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.beforeAll(async () => {
  await ensureSessionCookies(userIdentifier, { strict: true });
});

test.describe("@nightly Welsh language backend smoke", () => {
  test.beforeEach(async ({ caseListPage, page }) => {
    await page.goto("/cases", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await caseListPage.waitForReady(45000);
  });

  test("translation endpoint responds and language toggle switches to Welsh", async ({
    caseListPage,
    page,
  }) => {
    await caseListPage.exuiHeader.checkIsVisible();

    const translationResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/translation/cy") &&
        response.request().method() === "GET",
      { timeout: 30000 },
    );

    await caseListPage.exuiHeader.switchLanguage("Cymraeg");
    await caseListPage.exuiSpinnerComponent.wait();
    await page.waitForLoadState("domcontentloaded");

    const translationResponse = await translationResponsePromise;
    expect(translationResponse.status()).toBe(200);

    const payload = (await translationResponse.json().catch(() => null)) as {
      translations?: Record<string, unknown>;
    } | null;
    expect(payload).not.toBeNull();
    expect(Object.keys(payload?.translations ?? {}).length).toBeGreaterThan(0);

    await expect(caseListPage.exuiHeader.languageToggle).toContainText(
      "English",
    );
  });
});
