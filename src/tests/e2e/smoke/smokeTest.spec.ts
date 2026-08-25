import { expect, test } from "../../../fixtures/ui";
import { UserUtils } from "../../../utils/ui/user.utils.js";

test.use({ storageState: { cookies: [], origins: [] } });

test(
  "interactive IDAM login establishes an XUI session",
  { tag: ["@e2e", "@e2e-smoke"] },
  async ({ config, idamPage, page }) => {
    const credentials = new UserUtils().getUserCredentials("COURT_ADMIN");
    await page.goto(config.urls.manageCaseBaseUrl, { waitUntil: "domcontentloaded" });

    await expect(idamPage.page).toHaveTitle(/HMCTS|Sign in/i);
    await expect(idamPage.usernameInput).toBeVisible();
    await idamPage.usernameInput.fill(credentials.email);
    const primarySubmit = page.getByRole("button", { name: /^(Continue|Sign in)$/ });

    // IDAM supports both a progressive email-first form and a single-page form.
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (!(await idamPage.passwordInput.isVisible().catch(() => false))) {
      await primarySubmit.click();
      // eslint-disable-next-line playwright/no-conditional-expect
      await expect(idamPage.passwordInput).toBeVisible();
    }

    await idamPage.passwordInput.fill(credentials.password);
    await primarySubmit.click();

    await expect
      .poll(
        async () => {
          const cookieNames = new Set((await page.context().cookies()).map((cookie) => cookie.name));
          return cookieNames.has("Idam.Session") && cookieNames.has("__auth__");
        },
        { timeout: 30_000, message: "Interactive login did not establish the required XUI session cookies" }
      )
      .toBe(true);

    const authResponse = await page.request.get(new URL("/auth/isAuthenticated", config.urls.manageCaseBaseUrl).toString(), {
      failOnStatusCode: false
    });
    expect(authResponse.status(), "Interactive login auth validation should return HTTP 200").toBe(200);
    const authBody = (await authResponse.json()) as boolean | { isAuthenticated?: boolean };
    expect(authBody === true || (typeof authBody === "object" && authBody?.isAuthenticated === true)).toBe(true);

    await page.goto("/cases", { waitUntil: "domcontentloaded" });
    await expect(page.locator("exui-header")).toBeVisible();
  }
);
