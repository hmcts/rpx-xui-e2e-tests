import { expect, test } from "../../../fixtures/ui";
import {
  applySearchCaseSessionCookies,
  createGlobalSearchResultsRouteHandler,
  ensureSearchCaseSessionAccess,
  setupFastCaseRetrievalConfigRoute,
  setupGlobalSearchMockRoutes,
  setupRestrictedAccessMocks,
  submitHeaderQuickSearch
} from "../helpers/index.js";
import { DEFAULT_ROLE_ACCESS_USERS_JUDICIAL } from "../helpers/restrictedAccessMockRoutes.helper.js";
import {
  buildGlobalSearchNoResultsMock,
  buildGlobalSearchResultsMock,
  buildGlobalSearchServicesMock,
  buildSearchCaseJurisdictionsMock,
  VALID_SEARCH_CASE_REFERENCE
} from "../mocks/search.mock.js";

const searchCaseJurisdictionsMock = buildSearchCaseJurisdictionsMock();
const globalSearchServicesMock = buildGlobalSearchServicesMock();
const globalSearchResultsHandler = createGlobalSearchResultsRouteHandler({
  matchingCaseReference: VALID_SEARCH_CASE_REFERENCE,
  successResponse: buildGlobalSearchResultsMock(VALID_SEARCH_CASE_REFERENCE),
  noResultsResponse: buildGlobalSearchNoResultsMock()
});
const RESTRICTED_ACCESS_MESSAGE =
  "This case is restricted. The details of the users with access are provided below.";
const RESTRICTED_ACCESS_FAILURE_STATUSES = [400, 403, 500] as const;

const formatCaseNumberWithDashes = (caseReference: string) =>
  caseReference.replace(/^(\d{4})(\d{4})(\d{4})(\d{4})$/, "$1-$2-$3-$4");

test.beforeAll(async ({}, testInfo) => {
  await ensureSearchCaseSessionAccess(testInfo);
});

test.beforeEach(async ({ page }, testInfo) => {
  await applySearchCaseSessionCookies(page, testInfo);
  await setupFastCaseRetrievalConfigRoute(page);

  await setupGlobalSearchMockRoutes(page, {
    jurisdictions: searchCaseJurisdictionsMock,
    services: globalSearchServicesMock,
    searchResultsHandler: globalSearchResultsHandler
  });

  await page.route("**/data/internal/cases/**", async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Restricted case access" })
    });
  });
});

test.describe(
  "Restricted case access negative flows with prewarmed search session",
  { tag: ["@integration", "@integration-restricted-case"] },
  () => {
    test("renders empty table when no users have access", async ({
      caseDetailsPage,
      caseSearchPage,
      page,
      tableUtils
    }) => {
      await setupRestrictedAccessMocks(page, { roleAccessBody: [], caseworkersBody: [] });

      await submitHeaderQuickSearch(VALID_SEARCH_CASE_REFERENCE, caseSearchPage);

      await expect(page).toHaveURL(
        new RegExp(`/cases/restricted-case-access/${VALID_SEARCH_CASE_REFERENCE}`)
      );
      await expect(caseDetailsPage.exuiBodyComponent.message).toContainText(
        RESTRICTED_ACCESS_MESSAGE
      );
      await expect(caseDetailsPage.exuiBodyComponent.mainHeading).toContainText(
        formatCaseNumberWithDashes(VALID_SEARCH_CASE_REFERENCE)
      );
      await expect(caseDetailsPage.restrictedAccessContainer).toBeVisible();

      await expect(caseDetailsPage.exuiBodyComponent.tableHeaders).toHaveCount(3);
      const table = await tableUtils.parseDataTable(caseDetailsPage.exuiBodyComponent.table);
      expect(table).toEqual([]);
    });

    for (const status of RESTRICTED_ACCESS_FAILURE_STATUSES) {
      test(`handles failed role-access call with HTTP ${status} by showing restricted access shell`, async ({
        caseDetailsPage,
        caseSearchPage,
        page,
        tableUtils
      }) => {
        await setupRestrictedAccessMocks(page, {
          roleAccessStatus: status,
          roleAccessBody: { message: "error" }
        });

        await submitHeaderQuickSearch(VALID_SEARCH_CASE_REFERENCE, caseSearchPage);

        await expect(page).toHaveURL(
          new RegExp(`/cases/restricted-case-access/${VALID_SEARCH_CASE_REFERENCE}`)
        );
        await expect(caseDetailsPage.exuiBodyComponent.message).toContainText(
          RESTRICTED_ACCESS_MESSAGE
        );
        await expect(caseDetailsPage.restrictedAccessContainer).toBeVisible();
        const table = await tableUtils.parseDataTable(caseDetailsPage.exuiBodyComponent.table);
        expect(table).toEqual([]);
      });

      test(`handles failed caseworker lookup with HTTP ${status} by showing restricted access shell`, async ({
        caseDetailsPage,
        caseSearchPage,
        page,
        tableUtils
      }) => {
        await setupRestrictedAccessMocks(page, {
          caseworkersStatus: status,
          caseworkersBody: { message: "error" }
        });

        await submitHeaderQuickSearch(VALID_SEARCH_CASE_REFERENCE, caseSearchPage);

        await expect(page).toHaveURL(
          new RegExp(`/cases/restricted-case-access/${VALID_SEARCH_CASE_REFERENCE}`)
        );
        await expect(caseDetailsPage.exuiBodyComponent.message).toContainText(
          RESTRICTED_ACCESS_MESSAGE
        );
        await expect(caseDetailsPage.restrictedAccessContainer).toBeVisible();
        const table = await tableUtils.parseDataTable(caseDetailsPage.exuiBodyComponent.table);
        expect(table).toEqual([]);
      });

      test(`handles failed supported-jurisdiction lookup with HTTP ${status} by showing restricted access shell`, async ({
        caseDetailsPage,
        caseSearchPage,
        page,
        tableUtils
      }) => {
        await setupRestrictedAccessMocks(page, {
          supportedJurisdictionsStatus: status,
          supportedJurisdictions: { message: "error" }
        });

        await submitHeaderQuickSearch(VALID_SEARCH_CASE_REFERENCE, caseSearchPage);

        await expect(page).toHaveURL(
          new RegExp(`/cases/restricted-case-access/${VALID_SEARCH_CASE_REFERENCE}`)
        );
        await expect(caseDetailsPage.exuiBodyComponent.message).toContainText(
          RESTRICTED_ACCESS_MESSAGE
        );
        await expect(caseDetailsPage.restrictedAccessContainer).toBeVisible();
        const table = await tableUtils.parseDataTable(caseDetailsPage.exuiBodyComponent.table);
        expect(table).toEqual([]);
      });

      test(`handles failed judicial lookup with HTTP ${status} by showing restricted access shell`, async ({
        caseDetailsPage,
        caseSearchPage,
        page,
        tableUtils
      }) => {
        await setupRestrictedAccessMocks(page, {
          roleAccessBody: DEFAULT_ROLE_ACCESS_USERS_JUDICIAL,
          caseworkersBody: [],
          judicialUsersStatus: status,
          judicialUsersBody: { message: "error" }
        });

        await submitHeaderQuickSearch(VALID_SEARCH_CASE_REFERENCE, caseSearchPage);

        await expect(page).toHaveURL(
          new RegExp(`/cases/restricted-case-access/${VALID_SEARCH_CASE_REFERENCE}`)
        );
        await expect(caseDetailsPage.exuiBodyComponent.message).toContainText(
          RESTRICTED_ACCESS_MESSAGE
        );
        await expect(caseDetailsPage.restrictedAccessContainer).toBeVisible();
        const table = await tableUtils.parseDataTable(caseDetailsPage.exuiBodyComponent.table);
        expect(table).toEqual([]);
      });
    }
  }
);
