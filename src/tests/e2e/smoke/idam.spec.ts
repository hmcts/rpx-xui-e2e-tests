import { test, expect } from "../../../fixtures/ui";

test.use({ storageState: { cookies: [], origins: [] } });

test("@smoke IDAM login page is up and displays username and password fields", async ({
  idamPage,
  page,
  config,
}) => {
  const loginEntryUrl = new URL(
    "/auth/login",
    config.urls.exuiDefaultUrl,
  ).toString();
  await page.goto(loginEntryUrl, { waitUntil: "domcontentloaded" });

  await expect(idamPage.page).toHaveTitle(/HMCTS|Sign in/i);

  const usernameInput = page.locator(
    '[data-testid="idam-username-input"], input#username, input[name="username"], input[type="email"], input#email, input[name="email"], input[name="emailAddress"], input[autocomplete="email"]',
  );
  const passwordInput = page.locator(
    '[data-testid="idam-password-input"], input#password, input[name="password"], input[type="password"]',
  );
  const submitButton = page.locator(
    '[data-testid="idam-submit-button"], [name="save"], button[type="submit"]',
  );

  await expect(usernameInput.first()).toBeVisible({ timeout: 30_000 });
  await expect(passwordInput.first()).toBeVisible({ timeout: 30_000 });
  await expect(submitButton.first()).toBeVisible({ timeout: 30_000 });
});
