import { expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import type { CaseListPage } from "../../../../page-objects/pages/exui/caseList.po.js";
import type { CaseSearchPage } from "../../../../page-objects/pages/exui/caseSearch.po.js";

export interface FindCaseMockRoutesConfig {
  jurisdictions: unknown;
  workBasketInputs: unknown;
  searchResultsHandler: (route: Route) => Promise<void>;
  caseDetailsHandler?: (route: Route) => Promise<void>;
}

export async function setupFindCaseMockRoutes(
  page: Page,
  config: FindCaseMockRoutesConfig,
): Promise<void> {
  await page.route("**/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.jurisdictions),
    });
  });

  await page.route(
    "**/caseworkers/**/jurisdictions/**/case-types/**/work-basket-inputs*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(config.workBasketInputs),
      });
    },
  );

  await page.route(
    "**/data/internal/case-types/**/work-basket-inputs*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(config.workBasketInputs),
      });
    },
  );

  await page.route(
    "**/data/internal/case-types/**/search-inputs*",
    async (route) => {
      const workBasketInputs = config.workBasketInputs as {
        searchInputs?: unknown;
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          searchInputs: workBasketInputs.searchInputs ?? [],
        }),
      });
    },
  );

  if (config.caseDetailsHandler) {
    await page.route("**/data/internal/cases/**", config.caseDetailsHandler);
  }

  await page.route(
    "**/data/internal/searchCases*",
    config.searchResultsHandler,
  );
}

export interface GlobalSearchMockRoutesConfig {
  jurisdictions: unknown;
  services: unknown;
  searchResultsHandler: (route: Route) => Promise<void>;
  caseDetailsHandler?: (route: Route) => Promise<void>;
}

export async function setupGlobalSearchMockRoutes(
  page: Page,
  config: GlobalSearchMockRoutesConfig,
): Promise<void> {
  await page.route(
    "**/aggregated/caseworkers/**/jurisdictions*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(config.jurisdictions),
      });
    },
  );

  await page.route("**/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.jurisdictions),
    });
  });

  await page.route("**/api/globalSearch/services*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.services),
    });
  });

  await page.route("**/api/globalsearch/services*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(config.services),
    });
  });

  await page.route(
    "**/data/internal/case-types/**/work-basket-inputs*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ workbasketInputs: [] }),
      });
    },
  );

  await page.route(
    "**/caseworkers/**/jurisdictions/**/case-types/**/work-basket-inputs*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ workbasketInputs: [] }),
      });
    },
  );

  await page.route(
    "**/data/internal/case-types/**/search-inputs*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ searchInputs: [] }),
      });
    },
  );

  await page.route("**/data/internal/searchCases*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ columns: [], results: [], total: 0 }),
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

export interface GlobalSearchResultsRouteHandlerOptions {
  matchingCaseReference: string;
  successResponse: unknown;
  noResultsResponse: unknown;
}

export function createGlobalSearchResultsRouteHandler(
  options: GlobalSearchResultsRouteHandlerOptions,
) {
  const { matchingCaseReference, successResponse, noResultsResponse } = options;

  return async (route: Route) => {
    let payload: GlobalSearchRequestPayload | undefined;
    const rawPostData = route.request().postData();
    if (rawPostData) {
      try {
        payload = JSON.parse(rawPostData) as GlobalSearchRequestPayload;
      } catch {
        payload = undefined;
      }
    }

    const searchedCaseReferences =
      payload?.searchCriteria?.caseReferences ?? [];
    const responseBody = searchedCaseReferences.includes(matchingCaseReference)
      ? successResponse
      : noResultsResponse;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    });
  };
}

export interface FindCaseSearchResultsHandlerOptions {
  existingCaseReference: string;
  matchingResponse: unknown;
  noMatchResponse: unknown;
  getCaseReferenceFromPayload: (payload: unknown) => string | undefined;
}

export function createFindCaseSearchResultsRouteHandler(
  options: FindCaseSearchResultsHandlerOptions,
): (route: Route) => Promise<void> {
  const {
    existingCaseReference,
    matchingResponse,
    noMatchResponse,
    getCaseReferenceFromPayload,
  } = options;

  return async (route: Route) => {
    const requestUrl = route.request().url();
    const rawPayload = route.request().postData();
    let searchPayload: unknown;
    if (rawPayload) {
      try {
        searchPayload = JSON.parse(rawPayload) as unknown;
      } catch {
        searchPayload = undefined;
      }
    }
    const requestedCaseReference = getCaseReferenceFromPayload(searchPayload);
    const decodedUrl = decodeURIComponent(requestUrl);
    const caseReferenceFromUrl = /\d{16}/.exec(decodedUrl)?.[0];
    const isMatch =
      requestedCaseReference === existingCaseReference ||
      Boolean(rawPayload?.includes(existingCaseReference)) ||
      caseReferenceFromUrl === existingCaseReference ||
      decodedUrl.includes(existingCaseReference);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(isMatch ? matchingResponse : noMatchResponse),
    });
  };
}

export async function overrideGlobalSearchResultsRoute(
  page: Page,
  handler: (route: Route) => Promise<void>,
): Promise<void> {
  await page.unroute("**/api/globalsearch/results*");
  await page.unroute("**/api/globalSearch/results*");
  await page.route("**/api/globalsearch/results*", handler);
  await page.route("**/api/globalSearch/results*", handler);
}

export async function overrideFindCaseSearchResultsRoute(
  page: Page,
  handler: (route: Route) => Promise<void>,
): Promise<void> {
  await page.unroute("**/data/internal/searchCases*");
  await page.route("**/data/internal/searchCases*", handler);
}

export async function submitHeaderQuickSearch(
  caseReference: string,
  caseListPage: CaseListPage,
  caseSearchPage: CaseSearchPage,
): Promise<void> {
  await caseListPage.navigateTo();
  const page = caseSearchPage.page;
  const clickViewLinkIfPresent = async () => {
    const viewLink = page
      .locator('.govuk-table a.govuk-link[href*="/cases/case-details/"]')
      .first();
    if (await viewLink.isVisible().catch(() => false)) {
      await viewLink.click();
      await caseListPage.exuiSpinnerComponent.wait();
    }
  };

  const caseIdTextBox = page.locator("#exuiCaseReferenceSearch");
  const findButton = page
    .locator(".hmcts-primary-navigation__global-search")
    .getByRole("button", { name: "Find", exact: true });

  if (await caseIdTextBox.isVisible().catch(() => false)) {
    await caseIdTextBox.fill(caseReference);
    if (await findButton.isVisible().catch(() => false)) {
      await findButton.click();
    } else {
      await page
        .locator("li:has(#exuiCaseReferenceSearch)")
        .first()
        .getByRole("button", { name: "Find", exact: true })
        .click();
    }
    await caseListPage.exuiSpinnerComponent.wait();
    await clickViewLinkIfPresent();
    return;
  }

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/search/);

  const fallbackCaseRefInput = page.locator("#caseRef");
  const fallbackServicesSelect = page.locator("#servicesList");
  const fallbackSearchButton = page
    .locator("main form")
    .first()
    .getByRole("button", { name: "Search", exact: true });

  await expect(fallbackCaseRefInput).toBeVisible();
  await fallbackCaseRefInput.fill(caseReference);
  if (await fallbackServicesSelect.isVisible().catch(() => false)) {
    await fallbackServicesSelect.selectOption("PUBLICLAW");
  }
  await fallbackSearchButton.click();
  await caseListPage.exuiSpinnerComponent.wait();
  await clickViewLinkIfPresent();
}

export async function startFindCaseJourney(
  caseReference: string,
  caseTypeLabel: string,
  jurisdictionLabel: string,
  caseSearchPage: CaseSearchPage,
): Promise<void> {
  await caseSearchPage.goto();
  await caseSearchPage.waitForReady();
  await caseSearchPage.ensureFiltersVisible();
  await caseSearchPage.selectJurisdiction(jurisdictionLabel);
  await caseSearchPage.selectCaseType(caseTypeLabel);
  await caseSearchPage.waitForDynamicFilters();
  await caseSearchPage.fillCcdNumber(caseReference);
  await caseSearchPage.applyFilters();
}

export async function submitGlobalSearchFromMenu(
  caseReference: string,
  caseListPage: CaseListPage,
  page: Page,
): Promise<void> {
  await caseListPage.navigateTo();

  const searchLink = page
    .locator(
      '.hmcts-primary-navigation__link[href="/search"], .hmcts-primary-navigation__link[href*="/search"]',
    )
    .first();
  if (await searchLink.isVisible().catch(() => false)) {
    await Promise.all([page.waitForURL(/\/search/), searchLink.click()]);
  } else {
    await page.goto("/search", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/search/);
  }

  const caseIdTextBox = page.locator("#caseRef");
  const servicesOption = page.locator("#servicesList");
  const searchButton = page
    .locator("main form")
    .first()
    .getByRole("button", { name: "Search", exact: true });

  await caseIdTextBox.waitFor({ state: "visible" });
  await caseIdTextBox.fill(caseReference);
  await servicesOption.selectOption("PUBLICLAW");
  await searchButton.click();
  await caseListPage.exuiSpinnerComponent.wait();
}
