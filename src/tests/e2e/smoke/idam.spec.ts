import { test, expect } from "../../../fixtures/ui";

test.use({ storageState: { cookies: [], origins: [] } });

test("@smoke IDAM login page is up and displays username and password fields", async ({ idamPage, page, config }) => {
  const loginEntryUrl = new URL("/auth/login", config.urls.exuiDefaultUrl).toString();
  await page.goto(loginEntryUrl, { waitUntil: "domcontentloaded" });

  await expect(idamPage.page).toHaveTitle(/HMCTS|Sign in/i);

  const usernameInput = page.locator('input#username, input[name="username"], input[type="email"]');
  const passwordInput = page.locator('input#password, input[name="password"], input[type="password"]');
  const submitButton = page.locator('[name="save"], button[type="submit"]');
  await expect(usernameInput.first()).toBeVisible();
  await expect(passwordInput.first()).toBeVisible();
  await expect(submitButton.first()).toBeVisible();
});
