import { expect, test } from "../../../fixtures/ui";
import {
  applySearchCaseSessionCookies,
  ensureSearchCaseSessionAccess,
  overrideGlobalSearchResultsRoute,
  setupGlobalSearchMockRoutes
} from "../helpers/index.js";
import {
  buildGlobalSearchJurisdictionsMock,
  buildGlobalSearchNoResultsMock,
  buildGlobalSearchServicesMock,
  GLOBAL_SEARCH_CASE_REFERENCE
} from "../mocks/globalSearch.mock.js";
import {
  SEARCH_CASE_ERROR_STATUS_CODES,
  TEST_USERS
} from "../testData/index.js";

const userIdentifier = TEST_USERS.SEARCH_CASE;
const noResultsResponse = buildGlobalSearchNoResultsMock();
const servicesResponse = buildGlobalSearchServicesMock();
const jurisdictionsResponse = buildGlobalSearchJurisdictionsMock();

test.beforeAll(async ({}, testInfo) => {
  await ensureSearchCaseSessionAccess(testInfo);
});

test.beforeEach(async ({ page }, testInfo) => {
  await applySearchCaseSessionCookies(page, testInfo);
  await setupGlobalSearchMockRoutes(page, {
    jurisdictions: jurisdictionsResponse,
    services: servicesResponse,
    searchResultsHandler: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(noResultsResponse)
      });
    }
  });
});

test.describe(`Global Search negative flows as ${userIdentifier}`, { tag: ['@integration-bucket-1'] }, () => {
  for (const status of SEARCH_CASE_ERROR_STATUS_CODES) {
    test(`shows error no-results page when global search returns HTTP ${status}`, async ({
      caseListPage,
      globalSearchPage,
      page
    }) => {
      await overrideGlobalSearchResultsRoute(page, async (route) => {
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ message: `Forced failure ${status}` })
        });
      });

      const searchResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/api/globalsearch/results") &&
          response.status() === status
      );
      await caseListPage.navigateTo();
      await expect(
        globalSearchPage.performGlobalSearchWithCase(GLOBAL_SEARCH_CASE_REFERENCE, "PUBLICLAW")
      ).rejects.toThrow('Global search returned "Something went wrong" before results were usable');

      await searchResponse;
      await expect(page).toHaveURL(/\/search\/noresults/);
      await expect(page.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Search again" })).toBeVisible();
    });
  }
});
