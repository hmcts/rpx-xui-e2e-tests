import type { Page, Route } from "@playwright/test";

export interface FindCaseMockRoutesConfig {
  jurisdictions: unknown;
  workBasketInputs: unknown;
  searchResultsHandler: (route: Route) => Promise<void>;
  caseDetailsHandler?: (route: Route) => Promise<void>;
}

export async function setupFindCaseMockRoutes(
  page: Page,
  config: FindCaseMockRoutesConfig
): Promise<void> {
  await page.route("**/aggregated/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.jurisdictions)
    });
  });

  await page.route("**/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.jurisdictions)
    });
  });

  await page.route(
    "**/caseworkers/**/jurisdictions/**/case-types/**/work-basket-inputs*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(config.workBasketInputs)
      });
    }
  );

  await page.route("**/data/internal/case-types/**/work-basket-inputs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.workBasketInputs)
    });
  });

  await page.route("**/data/internal/case-types/**/search-inputs*", async (route) => {
    const workBasketInputs = config.workBasketInputs as { searchInputs?: unknown };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ searchInputs: workBasketInputs.searchInputs ?? [] })
    });
  });

  if (config.caseDetailsHandler) {
    await page.route("**/data/internal/cases/**", config.caseDetailsHandler);
  }

  await page.route("**/data/internal/searchCases*", config.searchResultsHandler);
}

export interface GlobalSearchMockRoutesConfig {
  jurisdictions: unknown;
  services: unknown;
  searchResultsHandler: (route: Route) => Promise<void>;
  caseDetailsHandler?: (route: Route) => Promise<void>;
}

export async function setupGlobalSearchMockRoutes(
  page: Page,
  config: GlobalSearchMockRoutesConfig
): Promise<void> {
  await page.route("**/aggregated/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.jurisdictions)
    });
  });

  await page.route("**/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.jurisdictions)
    });
  });

  await page.route("**/api/globalSearch/services*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.services)
    });
  });

  await page.route("**/api/globalsearch/services*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.services)
    });
  });

  await page.route("**/data/internal/case-types/**/work-basket-inputs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ workbasketInputs: [] })
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

  await page.route("**/data/internal/case-types/**/search-inputs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ searchInputs: [] })
    });
  });

  await page.route("**/data/internal/searchCases*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ columns: [], results: [], total: 0 })
    });
  });

  await page.route("**/api/globalsearch/results*", config.searchResultsHandler);
  await page.route("**/api/globalSearch/results*", config.searchResultsHandler);

  if (config.caseDetailsHandler) {
    await page.route("**/data/internal/cases/**", config.caseDetailsHandler);
  }
}

type GlobalSearchRequestPayload = {
  searchCriteria?: {
    caseReferences?: string[];
  };
};

export async function overrideGlobalSearchResultsRoute(
  page: Page,
  handler: (route: Route) => Promise<void>
): Promise<void> {
  await page.unroute("**/api/globalsearch/results*");
  await page.unroute("**/api/globalSearch/results*");
  await page.route("**/api/globalsearch/results*", handler);
  await page.route("**/api/globalSearch/results*", handler);
}

export async function overrideFindCaseSearchResultsRoute(
  page: Page,
  handler: (route: Route) => Promise<void>
): Promise<void> {
  await page.unroute("**/data/internal/searchCases*");
  await page.route("**/data/internal/searchCases*", handler);
}

export type SearchResultsRouteRequest = {
  decodedUrl: string;
  rawPostData?: string;
};

export function parseSearchResultsRouteRequest(
  route: Pick<Route, "request">
): SearchResultsRouteRequest {
  const request = route.request();
  return {
    decodedUrl: decodeURIComponent(request.url()),
    rawPostData: request.postData() ?? undefined
  };
}

export function parseGlobalSearchRequestPayload(
  rawPostData?: string
): GlobalSearchRequestPayload | undefined {
  if (!rawPostData) {
    return undefined;
  }
  try {
    return JSON.parse(rawPostData) as GlobalSearchRequestPayload;
  } catch {
    return undefined;
  }
}
