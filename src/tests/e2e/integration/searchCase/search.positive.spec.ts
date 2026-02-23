import { expect, test } from "../../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";
import {
  createGlobalSearchResultsRouteHandler,
  setupGlobalSearchMockRoutes,
  submitHeaderQuickSearch,
} from "../helpers/index.js";
import {
  buildCaseDetailsMock,
  buildGlobalSearchNoResultsMock,
  buildGlobalSearchResultsMock,
  buildGlobalSearchServicesMock,
  buildSearchCaseJurisdictionsMock,
  INVALID_SEARCH_CASE_REFERENCE,
  VALID_SEARCH_CASE_REFERENCE,
} from "../mocks/search.mock.js";
import { TEST_USERS } from "../testData/index.js";
import { ensureSessionCookies } from "../utils/session.utils.js";

const userIdentifier = TEST_USERS.SOLICITOR;
const searchCaseJurisdictionsMock = buildSearchCaseJurisdictionsMock();
const globalSearchServicesMock = buildGlobalSearchServicesMock();
const globalSearchResultsHandler = createGlobalSearchResultsRouteHandler({
  matchingCaseReference: VALID_SEARCH_CASE_REFERENCE,
  successResponse: buildGlobalSearchResultsMock(VALID_SEARCH_CASE_REFERENCE),
  noResultsResponse: buildGlobalSearchNoResultsMock(),
});

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.beforeAll(async () => {
  await ensureSessionCookies(userIdentifier, { strict: true });
});

test.beforeEach(async ({ page }) => {
  await setupGlobalSearchMockRoutes(page, {
    jurisdictions: searchCaseJurisdictionsMock,
    services: globalSearchServicesMock,
    searchResultsHandler: globalSearchResultsHandler,
    caseDetailsHandler: async (route) => {
      const requestUrl = decodeURIComponent(route.request().url());
      const caseReference = /\d{16}/.exec(requestUrl)?.[0];
      if (!caseReference || caseReference !== VALID_SEARCH_CASE_REFERENCE) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: "Not Found" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildCaseDetailsMock(caseReference)),
      });
    },
  });
});

test.describe(`Search quick find as ${userIdentifier}`, () => {
  test("User can find case by valid 16-digit case reference from header search", async ({
    caseListPage,
    caseSearchPage,
    caseDetailsPage,
    page,
  }) => {
    await submitHeaderQuickSearch(
      VALID_SEARCH_CASE_REFERENCE,
      caseListPage,
      caseSearchPage,
    );

    await expect(page).toHaveURL(/\/cases\/case-details\//);
    await expect(caseDetailsPage.caseActionsDropdown).toBeVisible();

    const caseNumberFromUrl = await caseDetailsPage.getCaseNumberFromUrl();
    expect(caseNumberFromUrl).toBe(VALID_SEARCH_CASE_REFERENCE);
  });

  test("User remains on case list with no cases message for non-existent 16-digit header search", async ({
    caseListPage,
    caseSearchPage,
    page,
  }) => {
    await submitHeaderQuickSearch(
      INVALID_SEARCH_CASE_REFERENCE,
      caseListPage,
      caseSearchPage,
    );

    await expect(page).not.toHaveURL(/\/cases\/case-details\//);
    const finalUrl = await expect
      .poll(() => page.url(), { timeout: 20_000 })
      .toMatch(/\/(cases(?:[/?#]|$)|search\/noresults(?:[/?#]|$))/);
    void finalUrl;

    if (/\/search\/noresults(?:[/?#]|$)/.test(page.url())) {
      await expect(
        page.getByRole("heading", { level: 1, name: "No results found" }),
      ).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/cases(?:[/?#]|$)/);
      await expect(
        page.getByText("No cases found. Try using different filters."),
      ).toBeVisible();
    }
  });
});
