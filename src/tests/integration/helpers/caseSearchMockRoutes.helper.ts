import { expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import type { CaseListPage } from "../../../page-objects/pages/exui/caseList.po.js";
import type { CaseSearchPage } from "../../../page-objects/pages/exui/caseSearch.po.js";

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
  options: {
    waitForSpinner?: boolean;
    spinnerTimeoutMs?: number;
    navigationMode?: "full" | "shell";
    headerOnly?: boolean;
    headerTimeoutMs?: number;
  } = {},
): Promise<void> {
  const page = caseSearchPage.page;
  const waitForSpinner = options.waitForSpinner ?? true;
  const spinnerTimeoutMs = options.spinnerTimeoutMs ?? 8_000;
  const navigationMode = options.navigationMode ?? "full";
  const headerOnly = options.headerOnly ?? false;
  const headerTimeoutMs = options.headerTimeoutMs ?? 10_000;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const waitForCaseShell = async (timeoutMs = 15_000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const headerInputVisible = await page
        .locator("#exuiCaseReferenceSearch")
        .isVisible()
        .catch(() => false);
      const primaryNavVisible = await page
        .locator(".hmcts-primary-navigation")
        .first()
        .isVisible()
        .catch(() => false);
      if (headerInputVisible || primaryNavVisible) {
        return;
      }
      await sleep(250);
    }
    throw new Error(
      `Case shell did not become ready within ${timeoutMs}ms. URL=${page.url()}`,
    );
  };

  if (navigationMode === "shell") {
    await page.goto("/cases", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/cases/i);
    await waitForCaseShell();
  } else {
    await caseListPage.navigateTo();
  }

  const waitForSpinnerSafely = async (): Promise<void> => {
    if (!waitForSpinner) return;
    await Promise.race([
      caseListPage.exuiSpinnerComponent.wait(),
      sleep(spinnerTimeoutMs),
    ]).catch(() => undefined);
  };
  const runHeaderQuickSearchIfVisible = async (): Promise<boolean> => {
    const headerInput = page.locator("#exuiCaseReferenceSearch");
    const deadline = Date.now() + headerTimeoutMs;
    let headerVisible = await headerInput.isVisible().catch(() => false);
    while (!headerVisible && Date.now() < deadline) {
      await sleep(250);
      headerVisible = await headerInput.isVisible().catch(() => false);
    }
    if (!headerVisible) {
      return false;
    }
    await headerInput.fill(caseReference);
    const headerFindButton = page
      .locator(".hmcts-primary-navigation__global-search")
      .getByRole("button", { name: "Find", exact: true });
    if (await headerFindButton.isVisible().catch(() => false)) {
      await headerFindButton.click();
    } else {
      await page
        .locator("li:has(#exuiCaseReferenceSearch)")
        .first()
        .getByRole("button", { name: "Find", exact: true })
        .click();
    }
    return true;
  };

  const clickViewLinkIfPresent = async () => {
    const viewLink = page
      .locator('.govuk-table a.govuk-link[href*="/cases/case-details/"]')
      .first();
    if (await viewLink.isVisible().catch(() => false)) {
      await viewLink.click();
      await caseListPage.exuiSpinnerComponent.wait();
    }
  };

  if (await runHeaderQuickSearchIfVisible()) {
    await waitForSpinnerSafely();
    await clickViewLinkIfPresent();
    return;
  }

  if (headerOnly) {
    throw new Error(
      `Header quick search input (#exuiCaseReferenceSearch) not visible within ${headerTimeoutMs}ms on ${page.url()}.`,
    );
  }

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/search/);

  const fallbackCaseRefCandidates = [
    page.locator("#caseRef"),
    page.getByLabel(/16-digit case reference/i),
    page.locator("input[name='caseRef']"),
  ];
  const fallbackCaseRefInput =
    (await (async () => {
      for (const candidate of fallbackCaseRefCandidates) {
        if (
          await candidate
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          return candidate.first();
        }
      }
      return undefined;
    })()) ?? fallbackCaseRefCandidates[0].first();

  const fallbackServicesCandidates = [
    page.locator("#servicesList"),
    page.getByLabel(/services/i),
  ];
  const fallbackServicesSelect =
    (await (async () => {
      for (const candidate of fallbackServicesCandidates) {
        if (
          await candidate
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          return candidate.first();
        }
      }
      return undefined;
    })()) ?? fallbackServicesCandidates[0].first();

  const fallbackSearchButton = page
    .locator("main form")
    .first()
    .getByRole("button", { name: "Search", exact: true });

  if (await runHeaderQuickSearchIfVisible()) {
    await waitForSpinnerSafely();
    await clickViewLinkIfPresent();
    return;
  }

  await expect(fallbackCaseRefInput).toBeVisible({ timeout: 15_000 });
  await fallbackCaseRefInput.fill(caseReference);
  if (await fallbackServicesSelect.isVisible().catch(() => false)) {
    const serviceOptions = await fallbackServicesSelect
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => ({
          label: (option.textContent ?? "").trim().toLowerCase(),
          value: (option.getAttribute("value") ?? "").trim().toLowerCase(),
        })),
      )
      .catch(() => []);
    const hasPublicLawOption = serviceOptions.some(
      (option) =>
        option.value === "publiclaw" ||
        option.value === "public law" ||
        option.label === "publiclaw" ||
        option.label === "public law",
    );
    if (hasPublicLawOption) {
      await fallbackServicesSelect.selectOption("PUBLICLAW");
    }
  }
  await fallbackSearchButton.click();
  await waitForSpinnerSafely();
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
