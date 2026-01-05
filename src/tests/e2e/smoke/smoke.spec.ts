import { test, expect } from "../../../fixtures/ui";

test("@smoke successful login shows case list page", async ({ idamPage, caseListPage }) => {
  await caseListPage.navigateTo();
  await caseListPage.acceptAnalyticsCookies();

  await expect(idamPage.page).toHaveTitle(/HMCTS|Sign in/i);
  await expect(idamPage.usernameInput).toBeVisible();
  await expect(idamPage.passwordInput).toBeVisible();
  await expect(idamPage.submitBtn).toBeVisible();

  const username = process.env.PRL_SOLICITOR_USERNAME;
  const password = process.env.PRL_SOLICITOR_PASSWORD;
  if (!username || !password) {
    throw new Error("PRL_SOLICITOR_USERNAME/PRL_SOLICITOR_PASSWORD must be set to run UI smoke login.");
  }

  await idamPage.login({ username, password });
  await caseListPage.acceptAnalyticsCookies();
  await expect(caseListPage.page).toHaveURL(/\/cases/i);
  await expect(caseListPage.container).toBeVisible();
  await expect(caseListPage.jurisdictionSelect).toBeVisible();
});
