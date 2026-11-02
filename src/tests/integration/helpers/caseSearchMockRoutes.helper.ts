import { expect, type Page, type Route } from "@playwright/test";

import type { CaseSearchPage } from "../../../page-objects/pages/exui/caseSearch.po.js";
import {
  EXUI_TIMEOUTS,
  MAX_NAVIGATION_RETRY_ATTEMPTS
} from "../../../page-objects/pages/exui/exui-timeouts.js";

import {
  buildNgIntegrationAppConfigMock,
  setupNgIntegrationOrganisationRoute
} from "./ngIntegrationMockRoutes.helper.js";

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
  await setupNgIntegrationOrganisationRoute(page);

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

export async function setupFastCaseRetrievalConfigRoute(page: Page): Promise<void> {
  const appConfig = buildNgIntegrationAppConfigMock() as {
    caseEditorConfig?: Record<string, unknown>;
  };

  await page.route("**/assets/config/config.json*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...appConfig,
        caseEditorConfig: {
          ...appConfig.caseEditorConfig,
          activity_retry: 1,
          timeouts_case_retrieval: [1, 1],
          timeouts_case_retrieval_artificial_delay: 0
        }
      })
    });
  });
}

export async function submitHeaderQuickSearch(
  caseReference: string,
  caseSearchPage: CaseSearchPage
): Promise<void> {
  await gotoCasesReadyForHeaderQuickSearch(caseSearchPage);
  await caseSearchPage.searchWith16DigitCaseId(caseReference);
}

async function gotoCasesReadyForHeaderQuickSearch(caseSearchPage: CaseSearchPage): Promise<void> {
  for (let attempt = 1; attempt <= MAX_NAVIGATION_RETRY_ATTEMPTS; attempt += 1) {
    await caseSearchPage.page.goto("/cases", { waitUntil: "domcontentloaded" });
    try {
      await expect(caseSearchPage.caseIdTextBox).toBeVisible({
        timeout: EXUI_TIMEOUTS.SEARCH_FIELD_VISIBLE
      });
      return;
    } catch (error) {
      if (attempt === MAX_NAVIGATION_RETRY_ATTEMPTS) {
        throw error;
      }
    }
  }
}
