import { expect, test } from "../../../fixtures/ui";
import { setupCaseListBaseRoutes, setupCaseListSearchRoute, applySessionCookies } from "../helpers";
import { buildCaseListJurisdictionsMock, buildCaseListMock } from "../mocks/caseList.mock";

const userIdentifier = "SOLICITOR";
const caseListMockResponse = buildCaseListMock(124);
const caseListJurisdictionsMock = buildCaseListJurisdictionsMock();

test.beforeEach(async ({ page }) => {
  await applySessionCookies(page, userIdentifier);
  await setupCaseListBaseRoutes(page, caseListJurisdictionsMock);
});

test.describe(`Case List as ${userIdentifier}`, { tag: ["@integration", "@integration-case-list"] }, () => {
  test(`User ${userIdentifier} can view cases on the case list page`, async ({ caseListPage, tableUtils, page }) => {
    await setupCaseListSearchRoute(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(caseListMockResponse)
      });
    });

    await test.step("Navigate to the search page", async () => {
      await caseListPage.navigateTo();
    });

    await test.step("Verify the user can see the expected case list layout and data", async () => {
      await expect(caseListPage.caseListResultsAmount).toHaveText(
        `Showing 1 to ${Math.min(caseListMockResponse.results.length, 25)} of ${caseListMockResponse.total} results`
      );
      const table = await tableUtils.mapExuiTable(caseListPage.exuiCaseListComponent.caseListTable);
      expect(table).toHaveLength(caseListMockResponse.results.length);
      for (let i = 0; i < caseListMockResponse.results.length; i++) {
        const expectedFields = caseListMockResponse.results[i].case_fields;
        expect(table[i]["Case reference"]).toBe(expectedFields["[CASE_REFERENCE]"]);
        expect(table[i]["Text Field 0"]).toBe(expectedFields.TextField0);
        expect(table[i]["Text Field 1"]).toBe(expectedFields.TextField1);
        expect(table[i]["Text Field 2"]).toBe(expectedFields.TextField2);
      }
      await expect(caseListPage.pagination).toBeVisible();
      expect(await caseListPage.getPaginationFinalItem()).toBe("Next");
    });
  });

  test(`User ${userIdentifier} sees empty case list message when searchCases returns empty response`, async ({
    caseListPage,
    page
  }) => {
    await setupCaseListSearchRoute(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          columns: [],
          results: [],
          total: 0
        })
      });
    });

    await test.step("Navigate to the search page", async () => {
      await caseListPage.navigateTo();
      await expect(caseListPage.exuiHeader.header).toBeVisible();
    });

    await test.step("Verify the empty state is rendered", async () => {
      await expect(caseListPage.jurisdictionSelect).toBeVisible();
      await expect(caseListPage.caseSearchResultsMessage).toContainText(
        "No cases found. Try using different filters."
      );
    });
  });
});
