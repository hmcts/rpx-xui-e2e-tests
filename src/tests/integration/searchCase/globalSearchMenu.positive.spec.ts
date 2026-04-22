import { expect, test } from "../../../fixtures/ui";
import {
  applySearchCaseSessionCookies,
  createGlobalSearchResultsRouteHandler,
  ensureSearchCaseSessionAccess,
  setupGlobalSearchMockRoutes
} from "../helpers/index.js";
import {
  buildGlobalSearchCaseDetailsMock,
  buildGlobalSearchJurisdictionsMock,
  buildGlobalSearchMenuResultsMock,
  buildGlobalSearchNoResultsMock,
  buildGlobalSearchServicesMock,
  GLOBAL_SEARCH_CASE_NAME,
  GLOBAL_SEARCH_CASE_REFERENCE,
  GLOBAL_SEARCH_NON_EXISTENT_CASE_REFERENCE
} from "../mocks/globalSearch.mock.js";
import { TEST_USERS } from "../testData/index.js";

const userIdentifier = TEST_USERS.SEARCH_CASE;
const servicesMockResponse = buildGlobalSearchServicesMock();
const jurisdictionsMockResponse = buildGlobalSearchJurisdictionsMock();
const globalSearchResultsMockResponse = buildGlobalSearchMenuResultsMock();
const globalSearchNoResultsMockResponse = buildGlobalSearchNoResultsMock();

const globalSearchResultsHandler = createGlobalSearchResultsRouteHandler({
  matchingCaseReference: GLOBAL_SEARCH_CASE_REFERENCE,
  successResponse: globalSearchResultsMockResponse,
  noResultsResponse: globalSearchNoResultsMockResponse
});

test.beforeAll(async ({}, testInfo) => {
  await ensureSearchCaseSessionAccess(testInfo);
});

test.beforeEach(async ({ page }, testInfo) => {
  await applySearchCaseSessionCookies(page, testInfo);
  await setupGlobalSearchMockRoutes(page, {
    jurisdictions: jurisdictionsMockResponse,
    services: servicesMockResponse,
    searchResultsHandler: globalSearchResultsHandler,
    caseDetailsHandler: async (route) => {
      const requestUrl = route.request().url();
      const caseReference = requestUrl.split("/").pop() ?? GLOBAL_SEARCH_CASE_REFERENCE;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildGlobalSearchCaseDetailsMock(caseReference))
      });
    }
  });
});

test.describe(`Global search from menu bar as ${userIdentifier}`, () => {
  test("searches by 16-digit case reference and navigates to case details", async ({
    caseListPage,
    globalSearchPage,
    caseDetailsPage,
    page
  }) => {
    await caseListPage.navigateTo();
    await globalSearchPage.performGlobalSearchWithCase(GLOBAL_SEARCH_CASE_REFERENCE, "PUBLICLAW");
    await expect(globalSearchPage.searchResultsHeader).toHaveText("Search results");
    await expect(globalSearchPage.searchResultRows.first()).toContainText(GLOBAL_SEARCH_CASE_NAME);
    await expect(globalSearchPage.searchResultRows.first()).toContainText(GLOBAL_SEARCH_CASE_REFERENCE);
    await expect(globalSearchPage.searchResultRows.first()).toContainText("Public Law");
    await expect(globalSearchPage.viewLink).toBeVisible();
    await expect(globalSearchPage.viewLink).toHaveAttribute(
      "href",
      /\/cases\/case-details\/PUBLICLAW\/PRLAPPS\//
    );

    await Promise.all([
      page.waitForURL(/\/cases\/case-details\/PUBLICLAW\/PRLAPPS\//),
      globalSearchPage.viewLink.click()
    ]);
    await expect(caseDetailsPage.caseActionsDropdown).toBeVisible();
    await expect(caseDetailsPage.caseSummaryHeading).toHaveText("Case information");
    const caseNumberFromUrl = await caseDetailsPage.getCaseNumberFromUrl();
    expect(caseNumberFromUrl).toBe(GLOBAL_SEARCH_CASE_REFERENCE);
  });

  test("shows no results content for non-existent 16-digit case reference", async ({
    caseListPage,
    globalSearchPage,
    page
  }) => {
    await caseListPage.navigateTo();
    await globalSearchPage.submitFromMenu(GLOBAL_SEARCH_NON_EXISTENT_CASE_REFERENCE, "PUBLICLAW");

    await expect(page).toHaveURL(/\/search\/noresults/);
    await expect(page.getByRole("heading", { level: 1, name: "No results found" })).toBeVisible();
    await expect(page.getByText("Try searching again.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Search", exact: true })).toBeVisible();
  });
});
