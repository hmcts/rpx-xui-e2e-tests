import { test, expect } from "../../../fixtures/ui";

test("@smoke case list loads for authenticated session", async ({ caseListPage }) => {
  await caseListPage.navigateTo();
  await caseListPage.acceptAnalyticsCookies();
  await expect(caseListPage.page).toHaveURL(/\/cases/i);
  await expect(caseListPage.container).toBeVisible();
  await expect(caseListPage.jurisdictionSelect).toBeVisible();
});
