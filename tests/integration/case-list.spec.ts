import { expect, test } from "../../fixtures/test.ts";
import buildCaseListMock from "./mocks/caseList.mock.ts";

const CASE_LIST_USER = "SOLICITOR";

const getUserIfPresent = (
  userUtils: { getUserCredentials: (id: string) => { email: string; password: string } },
  id: string,
) => {
  try {
    return userUtils.getUserCredentials(id);
  } catch {
    return undefined;
  }
};

test.describe("@integration case list", () => {
  test.beforeEach(async ({ userUtils, loginAs }) => {
    if (!getUserIfPresent(userUtils, CASE_LIST_USER)) {
      throw new Error(`${CASE_LIST_USER} credentials are not configured`);
    }
    await loginAs(CASE_LIST_USER);
  });

  test("renders cases from mocked search response", async ({ caseListPage, tableUtils, page }) => {
    const caseListMockResponse = buildCaseListMock(124);

    await page.route("**/data/internal/searchCases*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(caseListMockResponse),
      });
    });

    await caseListPage.goto();
    await expect(caseListPage.exuiHeader.header).toBeVisible();
    // Trigger search to exercise the mocked response
    await caseListPage.exuiCaseListComponent.filters.applyFilterBtn.click();
    await caseListPage.exuiSpinnerComponent.wait();

    const summary = await page.locator('[data-test="search-result-summary__text"]').textContent();
    expect(summary).toContain(
      `Showing 1 to ${Math.min(caseListMockResponse.results.length, 25)} of ${caseListMockResponse.total} results`,
    );

    const table = await tableUtils.mapExuiTable(caseListPage.exuiCaseListComponent.caseListTable);
    expect(table.length).toBe(Math.min(caseListMockResponse.results.length, 25));

    // Only the first page (up to 25) is rendered; assert those entries.
    const expectedPage = caseListMockResponse.results.slice(0, table.length);
    for (let i = 0; i < table.length; i++) {
      const expectedFields = expectedPage[i].case_fields;
      expect(table[i]["Case reference"]).toBe(expectedFields["[CASE_REFERENCE]"]);
      expect(table[i]["Text Field 0"]).toBe(expectedFields["TextField0"]);
      expect(table[i]["Text Field 1"]).toBe(expectedFields["TextField1"]);
      expect(table[i]["Text Field 2"]).toBe(expectedFields["TextField2"]);
    }
    await expect(page.getByRole("link", { name: "Next" })).toBeVisible();
  });

  test("shows empty state when searchCases returns no data", async ({ caseListPage, page }) => {
    const emptyResponse = { columns: [], results: [], total: 0 };

    await page.route("**/data/internal/searchCases*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyResponse),
      });
    });

    await caseListPage.goto();
    await expect(caseListPage.exuiHeader.header).toBeVisible();
    await expect(caseListPage.jurisdictionSelect).toBeVisible();

    await expect(
      caseListPage.container.getByText("No cases found. Try using different filters.", {
        exact: false,
      }),
    ).toBeVisible();
  });
});
