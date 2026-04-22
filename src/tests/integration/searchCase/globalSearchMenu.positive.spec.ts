import { expect, test } from "../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import {
  createGlobalSearchResultsRouteHandler,
  ensureUiSessionOrSkip,
  setupGlobalSearchMockRoutes,
  submitGlobalSearchFromMenu
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

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.beforeAll(async ({ browser }, testInfo) => {
  void browser;
  await ensureUiSessionOrSkip(userIdentifier, testInfo);
});

test.beforeEach(async ({ page }) => {
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
    caseDetailsPage,
    page
  }) => {
    const searchResultsHeader = page.locator(".govuk-width-container .govuk-heading-xl");
    const searchResultsTable = page.locator("main").getByRole("table").first();
    const firstRow = searchResultsTable.locator("tbody tr").first();
    const viewLink = page.locator('.govuk-table a.govuk-link[href*="/cases/case-details/"]').first();

    await submitGlobalSearchFromMenu(GLOBAL_SEARCH_CASE_REFERENCE, caseListPage, page);
    await expect(searchResultsHeader).toHaveText("Search results");
    await expect(firstRow).toContainText(GLOBAL_SEARCH_CASE_NAME);
    await expect(firstRow).toContainText(GLOBAL_SEARCH_CASE_REFERENCE);
    await expect(firstRow).toContainText("Public Law");
    await expect(viewLink).toBeVisible();
    await expect(viewLink).toHaveAttribute("href", /\/cases\/case-details\/PUBLICLAW\/PRLAPPS\//);

    await Promise.all([page.waitForURL(/\/cases\/case-details\/PUBLICLAW\/PRLAPPS\//), viewLink.click()]);
    await expect(caseDetailsPage.caseActionsDropdown).toBeVisible();
    await expect(caseDetailsPage.caseSummaryHeading).toHaveText("Case information");
    const caseNumberFromUrl = await caseDetailsPage.getCaseNumberFromUrl();
    expect(caseNumberFromUrl).toBe(GLOBAL_SEARCH_CASE_REFERENCE);
  });

  test("shows no results content for non-existent 16-digit case reference", async ({
    caseListPage,
    page
  }) => {
    await submitGlobalSearchFromMenu(GLOBAL_SEARCH_NON_EXISTENT_CASE_REFERENCE, caseListPage, page);

    await expect(page).toHaveURL(/\/search\/noresults/);
    await expect(page.getByRole("heading", { level: 1, name: "No results found" })).toBeVisible();
    await expect(page.getByText("Try searching again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Search again", exact: true })).toBeVisible();
  });
});
