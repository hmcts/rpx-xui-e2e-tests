import { expect, test } from "../../../fixtures/ui";
import {
  applySessionCookies,
  setupCaseListBaseRoutes,
  setupCaseListSearchRoute
} from "../helpers";
import { buildCaseListJurisdictionsMock, buildCaseListMock } from "../mocks/caseList.mock";
import { CASE_LIST_ERROR_STATUS_CODES, CASE_LIST_MALFORMED_JSON_BODY } from "../testData";

const userIdentifier = "SOLICITOR";
const caseListJurisdictionsMock = buildCaseListJurisdictionsMock();
const caseListMockResponse = buildCaseListMock(15);

test.beforeEach(async ({ page }) => {
  await applySessionCookies(page, userIdentifier);
  await setupCaseListBaseRoutes(page, caseListJurisdictionsMock);
});

test.describe(
  `Error codes returned on /searchCases call for ${userIdentifier}`,
  { tag: ["@integration", "@integration-case-list"] },
  () => {
    for (const errorCode of CASE_LIST_ERROR_STATUS_CODES) {
      test(`User ${userIdentifier} encounters a HTTP response ${errorCode} error on the case list page`, async ({
        caseListPage,
        page
      }) => {
        await setupCaseListSearchRoute(page, async (route) => {
          await route.fulfill({
            status: errorCode,
            contentType: "application/json",
            body: JSON.stringify({})
          });
        });

        await caseListPage.navigateTo();

        await expect(caseListPage.jurisdictionSelect).toBeVisible();
        await expect(caseListPage.exuiHeader.header).toBeVisible();
        await expect(caseListPage.caseSearchResultsMessage).not.toContainText("No cases found");
      });
    }
  }
);

test.describe(
  `Slow response handling on /searchCases for ${userIdentifier}`,
  { tag: ["@integration", "@integration-case-list"] },
  () => {
    test(`User ${userIdentifier} encounters a slow response time on load of the case list page`, async ({
      caseListPage,
      tableUtils,
      page
    }) => {
      await setupCaseListSearchRoute(page, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(caseListMockResponse)
        });
      });

      await caseListPage.navigateTo();

      await expect(caseListPage.jurisdictionSelect).toBeVisible();
      await expect(caseListPage.caseListResultsAmount).toHaveText(
        `Showing 1 to ${Math.min(caseListMockResponse.results.length, 25)} of ${caseListMockResponse.total} results`
      );
      const table = await tableUtils.mapExuiTable(caseListPage.exuiCaseListComponent.caseListTable);
      expect(table).toHaveLength(caseListMockResponse.results.length);
      await expect(caseListPage.pagination).toBeHidden();
    });
  }
);

test.describe(
  `Malformed and timeout searchCases handling for ${userIdentifier}`,
  { tag: ["@integration", "@integration-case-list"] },
  () => {
    test(`User ${userIdentifier} encounters a malformed response on /searchCases`, async ({
      caseListPage,
      page
    }) => {
      await setupCaseListSearchRoute(page, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: CASE_LIST_MALFORMED_JSON_BODY
        });
      });

      await caseListPage.navigateTo();

      await expect(caseListPage.jurisdictionSelect).toBeVisible();
      await expect(caseListPage.exuiHeader.header).toBeVisible();
      await expect(caseListPage.caseSearchResultsMessage).not.toContainText("No cases found");
    });

    test(`User ${userIdentifier} encounters a timeout on /searchCases`, async ({ caseListPage, page }) => {
      await setupCaseListSearchRoute(page, async (route) => {
        await route.abort("timedout");
      });

      await caseListPage.navigateTo();

      await expect(caseListPage.jurisdictionSelect).toBeVisible();
      await expect(caseListPage.exuiHeader.header).toBeVisible();
      await expect(caseListPage.caseSearchResultsMessage).not.toContainText("No cases found");
    });
  }
);
