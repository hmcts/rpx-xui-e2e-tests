import { uiExpect, uiTest } from "../../../fixtures/ui.js";
import { hasUiCreds } from "../../../utils/ui/auth.js";

uiTest.describe("UI health", () => {
  uiTest.skip(!hasUiCreds(), "UI credentials not configured (provide TEST_USERS_JSON or UI_USERNAME/UI_PASSWORD).");

  uiTest("@smoke should load the health endpoint", async ({ page }) => {
    const response = await page.goto("/health");
    // eslint-disable-next-line playwright/no-standalone-expect
    uiExpect(response?.ok()).toBeTruthy();
  });
});
