import { expect } from "@playwright/test";

import { test } from "../../fixtures/test";

test.describe("@smoke @cookies Cookie banner", () => {
  test.beforeEach(async ({ page, config }) => {
    // Ensure banner appears
    await page.context().clearCookies();
    await page.goto(config.urls.manageCaseBaseUrl);
  });

  test("Accept additional cookies hides banner", async ({ page }) => {
    const accept = page.getByRole("button", { name: /Accept additional cookies/i });
    await expect(accept).toBeVisible();
    await accept.click();

    await expect(accept).toBeHidden({ timeout: 5_000 });
    const reject = page.getByRole("button", { name: /Reject additional cookies/i });
    await expect(reject).toBeHidden({ timeout: 5_000 });
  });

  test("Reject additional cookies hides banner", async ({ page }) => {
    const reject = page.getByRole("button", { name: /Reject additional cookies/i });
    await expect(reject).toBeVisible();
    await reject.click();

    await expect(reject).toBeHidden({ timeout: 5_000 });
    const accept = page.getByRole("button", { name: /Accept additional cookies/i });
    await expect(accept).toBeHidden({ timeout: 5_000 });
  });
});
