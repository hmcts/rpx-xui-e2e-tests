import { expect, test } from "../../../fixtures/ui";

test.use({ storageState: { cookies: [], origins: [] } });

test(
  "IDAM login page is up and displays username and password fields",
  { tag: ["@e2e", "@e2e-smoke"] },
  async ({ config, idamPage, page }) => {
    const loginEntryUrl = new URL("/auth/login", config.urls.exuiDefaultUrl).toString();
    await page.goto(loginEntryUrl, { waitUntil: "domcontentloaded" });

    await expect(idamPage.page).toHaveTitle(/HMCTS|Sign in/i);
    await expect(idamPage.usernameInput).toBeVisible();
    await expect(idamPage.passwordInput).toBeVisible();
    await expect(idamPage.submitBtn).toBeVisible();
  }
);
