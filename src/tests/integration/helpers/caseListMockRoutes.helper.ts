import type { Page, Route } from "@playwright/test";

export async function setupCaseListBaseRoutes(
  page: Page,
  jurisdictions: unknown
): Promise<void> {
  await page.route("**/aggregated/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(jurisdictions)
    });
  });

  await page.route("**/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(jurisdictions)
    });
  });

  await page.route(
    "**/caseworkers/**/jurisdictions/**/case-types/**/work-basket-inputs*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ workbasketInputs: [] })
      });
    }
  );

  await page.route("**/data/internal/case-types/**/work-basket-inputs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ workbasketInputs: [] })
    });
  });
}

export async function setupCaseListSearchRoute(
  page: Page,
  handler: (route: Route) => Promise<void>
): Promise<void> {
  await page.route("**/data/internal/searchCases*", handler);
}
