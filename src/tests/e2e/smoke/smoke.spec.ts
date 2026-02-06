import { test, expect } from "../../../fixtures/ui";

test("@smoke case list loads for authenticated session", async ({
  caseListPage,
}) => {
  await caseListPage.navigateTo();
  await caseListPage.acceptAnalyticsCookies();
  await expect(caseListPage.page).toHaveURL(/\/cases/i);
  const caseListHeading = caseListPage.page.getByRole("heading", {
    name: /Case list/i,
  });
  const appShell = caseListPage.container.or(caseListHeading);
  await expect(appShell.first()).toBeVisible({ timeout: 60_000 });
});
