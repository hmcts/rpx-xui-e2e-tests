import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import { buildCaseListMock } from "../mocks/caseList.mock.js";
import { loadSessionCookies } from "../utils/session.utils.js";

const userIdentifier = "SOLICITOR";
let sessionCookies: Cookie[] = [];
const caseListMockResponse = buildCaseListMock(124);

test.beforeAll(() => {
  const { cookies } = loadSessionCookies(userIdentifier);
  sessionCookies = cookies;
});

test.beforeEach(async ({ page }) => {
  if (sessionCookies.length) {
    await page.context().addCookies(sessionCookies);
  }
});

test.describe(`Case List as ${userIdentifier}`, () => {
  test(`User ${userIdentifier} can view cases on the case list page`, async ({
    caseListPage,
    tableUtils,
    page
  }) => {
    await test.step("Intercept searchCases endpoint and fulfill with mock body", async () => {
      await page.route("**/data/internal/searchCases*", async (route) => {
        const body = JSON.stringify(caseListMockResponse);
        await route.fulfill({ status: 200, contentType: "application/json", body });
      });
    });

    await test.step("Navigate to the search page", async () => {
      await caseListPage.navigateTo();
      await caseListPage.waitForReady();
    });

    await test.step("Verify user can see a list shows the expected layout given the mock response", async () => {
      await expect(caseListPage.caseListResultsAmount).toHaveText(
        `Showing 1 to ${Math.min(caseListMockResponse.results.length, 25)} of ${caseListMockResponse.total} results`
      );
      const table = await tableUtils.mapExuiTable(caseListPage.exuiCaseListComponent.caseListTable);
      expect(table.length).toBe(caseListMockResponse.results.length);
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
    await test.step("Intercept searchCases endpoint and fulfill with empty mock body", async () => {
      await page.route("**/data/internal/searchCases*", async (route) => {
        const body = JSON.stringify({
          columns: [],
          results: [],
          total: 0
        });
        await route.fulfill({ status: 200, contentType: "application/json", body });
      });
    });

    await test.step("Navigate to the search page", async () => {
      await caseListPage.navigateTo();
      await caseListPage.waitForReady();
    });

    await test.step("Verify user sees empty case list UI", async () => {
      await expect(caseListPage.jurisdictionSelect).toBeVisible();
      expect(await caseListPage.caseSearchResultsMessage.textContent()).toContain(
        "No cases found. Try using different filters."
      );
    });
  });
});
