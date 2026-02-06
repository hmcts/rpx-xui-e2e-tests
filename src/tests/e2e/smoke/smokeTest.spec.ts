import { expect, test } from "../../../fixtures/ui";

test.use({ storageState: undefined });

test("IDAM entrypoint is available and shows login or authenticated landing page", async ({
  idamPage,
  page,
}) => {
  await page.goto("");

  await expect(idamPage.page).toHaveTitle(/HMCTS|Sign in/i);
  const loginUsername = page.locator(
    '[data-testid="idam-username-input"], #username, input[name="username"], input[type="email"]',
  );
  const loginPassword = page.locator(
    '[data-testid="idam-password-input"], #password, input[name="password"], input[type="password"]',
  );
  const authenticatedLanding = page
    .getByRole("heading", { name: /Case list/i })
    .or(page.getByRole("link", { name: /^Case list$/i }))
    .or(page.getByRole("link", { name: /^Create case$/i }))
    .or(page.getByRole("link", { name: /Sign out/i }));

  await expect(
    loginUsername.or(loginPassword).or(authenticatedLanding).first(),
  ).toBeVisible({ timeout: 30000 });
});
