import { expect, test } from "../../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";
import {
  createGlobalSearchResultsRouteHandler,
  setupGlobalSearchMockRoutes,
  submitHeaderQuickSearch,
} from "../helpers/index.js";
import {
  buildGlobalSearchResultsMock,
  buildGlobalSearchNoResultsMock,
  buildGlobalSearchServicesMock,
  buildSearchCaseJurisdictionsMock,
  VALID_SEARCH_CASE_REFERENCE,
} from "../mocks/search.mock.js";
import {
  SEARCH_CASE_ERROR_STATUS_CODES,
  SEARCH_CASE_MALFORMED_JSON_BODY,
  TEST_USERS,
} from "../testData/index.js";
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
  });

  await page.route(
    "**/api/role-access/roles/access-get-by-caseId",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    },
  );
  await page.route("**/api/wa-supported-jurisdiction/get", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(["PUBLICLAW"]),
    });
  });
  await page.route(
    "**/workallocation/caseworker/getUsersByServiceName",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    },
  );
  await page.route(
    "**/api/prd/judicial/searchJudicialUserByIdamId",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    },
  );
});

test.describe(`Header quick search negative flows as ${userIdentifier}`, () => {
  for (const status of SEARCH_CASE_ERROR_STATUS_CODES.filter(
    (currentStatus) => currentStatus !== 403,
  )) {
    test(`handles case-details load failure for HTTP ${status}`, async ({
      caseListPage,
      caseSearchPage,
      page,
    }) => {
      let caseDetailsRequestSeen = false;
      await page.route("**/data/internal/cases/**", async (route) => {
        caseDetailsRequestSeen = true;
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ message: `Forced failure ${status}` }),
        });
      });

      await submitHeaderQuickSearch(
        VALID_SEARCH_CASE_REFERENCE,
        caseListPage,
        caseSearchPage,
      );

      await expect
        .poll(() => caseDetailsRequestSeen, { timeout: 20_000 })
        .toBe(true);
      await expect(page).not.toHaveURL(/\/cases\/case-details\//);
      await expect
        .poll(() => page.url(), { timeout: 20_000 })
        .toMatch(
          /\/(cases(?:[/?#]|$)|work\/my-work\/list(?:[/?#]|$)|search\/noresults(?:[/?#]|$))/,
        );
    });
  }

  test("handles case-details load failure for HTTP 403", async ({
    caseListPage,
    caseSearchPage,
    page,
  }) => {
    let caseDetailsRequestSeen = false;
    await page.route("**/data/internal/cases/**", async (route) => {
      caseDetailsRequestSeen = true;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ message: "Forced failure 403" }),
      });
    });

    await submitHeaderQuickSearch(
      VALID_SEARCH_CASE_REFERENCE,
      caseListPage,
      caseSearchPage,
    );

    await expect
      .poll(() => caseDetailsRequestSeen, { timeout: 20_000 })
      .toBe(true);
    await expect(page).toHaveURL(
      new RegExp(
        `/cases/restricted-case-access/${VALID_SEARCH_CASE_REFERENCE}`,
      ),
    );
    await expect(
      page.getByText(
        "This case is restricted. The details of the users with access are provided below.",
      ),
    ).toBeVisible();
  });

  test("handles malformed case-details response from header quick search", async ({
    caseListPage,
    caseSearchPage,
    page,
  }) => {
    let caseDetailsRequestSeen = false;
    await page.route("**/data/internal/cases/**", async (route) => {
      caseDetailsRequestSeen = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: SEARCH_CASE_MALFORMED_JSON_BODY,
      });
    });

    await submitHeaderQuickSearch(
      VALID_SEARCH_CASE_REFERENCE,
      caseListPage,
      caseSearchPage,
    );

    await expect
      .poll(() => caseDetailsRequestSeen, { timeout: 20_000 })
      .toBe(true);
    await expect(page).not.toHaveURL(/\/cases\/case-details\//);
    await expect
      .poll(() => page.url(), { timeout: 20_000 })
      .toMatch(
        /\/(cases(?:[/?#]|$)|work\/my-work\/list(?:[/?#]|$)|search\/noresults(?:[/?#]|$))/,
      );
  });

  test("handles timed-out case-details request from header quick search", async ({
    caseListPage,
    caseSearchPage,
    page,
  }) => {
    let caseDetailsRequestSeen = false;
    await page.route("**/data/internal/cases/**", async (route) => {
      caseDetailsRequestSeen = true;
      await route.abort("timedout");
    });

    await submitHeaderQuickSearch(
      VALID_SEARCH_CASE_REFERENCE,
      caseListPage,
      caseSearchPage,
    );

    await expect
      .poll(() => caseDetailsRequestSeen, { timeout: 20_000 })
      .toBe(true);
    await expect(page).not.toHaveURL(/\/cases\/case-details\//);
    await expect
      .poll(() => page.url(), { timeout: 20_000 })
      .toMatch(
        /\/(cases(?:[/?#]|$)|work\/my-work\/list(?:[/?#]|$)|search\/noresults(?:[/?#]|$))/,
      );
  });
});
