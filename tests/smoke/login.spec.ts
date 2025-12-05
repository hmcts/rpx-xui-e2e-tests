import { expect } from "@playwright/test";

import { test } from "../../fixtures/test.ts";

test.describe("@smoke login page", () => {
  test("IdAM login form renders inputs and submit", async ({ determinePage, idamPage }) => {
    await determinePage.goto("/");

    await expect(idamPage.page).toHaveTitle(/HMCTS|Sign in/i);
    await expect(idamPage.usernameInput).toBeVisible();
    await expect(idamPage.passwordInput).toBeVisible();
    await expect(idamPage.submitBtn).toBeVisible();
  });
});
