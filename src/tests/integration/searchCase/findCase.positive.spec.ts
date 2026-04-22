import { expect, test } from "../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import {
  createFindCaseSearchResultsRouteHandler,
  ensureUiSessionAccess,
  setupFindCaseMockRoutes
} from "../helpers/index.js";
import {
  buildFindCaseCaseDetailsMock,
  buildFindCaseEmptySearchResultsMock,
  buildFindCaseJurisdictionsMock,
  buildFindCaseSearchResultsMock,
  buildFindCaseWorkBasketInputsMock,
  FIND_CASE_CASE_TYPE_LABEL,
  FIND_CASE_JURISDICTION_LABEL,
  getCaseReferenceFromFindCaseSearchPayload
} from "../mocks/findCase.mock.js";
import { TEST_CASE_REFERENCES, TEST_USERS } from "../testData/index.js";

const userIdentifier = TEST_USERS.SEARCH_CASE;
const existingCaseReference = TEST_CASE_REFERENCES.FIND_CASE_EXISTING;
const nonExistentCaseReference = TEST_CASE_REFERENCES.FIND_CASE_NON_EXISTENT;
const jurisdictionMock = buildFindCaseJurisdictionsMock();
const workBasketInputsMock = buildFindCaseWorkBasketInputsMock();

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.beforeAll(async ({ browser }, testInfo) => {
  void browser;
  await ensureUiSessionAccess(userIdentifier, testInfo);
});

test.beforeEach(async ({ page }) => {
  await setupFindCaseMockRoutes(page, {
    jurisdictions: jurisdictionMock,
    workBasketInputs: workBasketInputsMock,
    searchResultsHandler: createFindCaseSearchResultsRouteHandler({
      existingCaseReference,
      matchingResponse: buildFindCaseSearchResultsMock(existingCaseReference),
      noMatchResponse: buildFindCaseEmptySearchResultsMock(),
      getCaseReferenceFromPayload: getCaseReferenceFromFindCaseSearchPayload
    }),
    caseDetailsHandler: async (route) => {
      const requestUrl = route.request().url();
      const caseReference = requestUrl.split("/").pop() ?? existingCaseReference;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildFindCaseCaseDetailsMock(caseReference))
      });
    }
  });
});

test.describe(`Find Case as ${userIdentifier}`, () => {
  test("User can find an existing case from Find case filters", async ({
    caseListPage,
    caseSearchPage,
    page
  }) => {
    await caseListPage.navigateTo();
    await caseSearchPage.startFindCaseJourney(
      existingCaseReference,
      FIND_CASE_CASE_TYPE_LABEL,
      FIND_CASE_JURISDICTION_LABEL
    );

    const searchResultsSummary = page.locator("#search-result .pagination-top");
    await caseSearchPage.resultsTable.waitFor({ state: "visible" });
    await expect(searchResultsSummary).toContainText(/\b1\b/);
    await expect(caseSearchPage.resultLinks.first()).toBeVisible();
    await expect(caseSearchPage.resultLinks).toHaveCount(1);
    const firstResultText = (await caseSearchPage.resultLinks.first().textContent()) ?? "";
    expect(firstResultText.replaceAll(/\D/g, "")).toContain(existingCaseReference);
    await expect(page).toHaveURL(/\/cases\/case-search/);
  });

  test("User sees no cases found message for non-existent 16-digit case reference", async ({
    caseListPage,
    caseSearchPage,
    page
  }) => {
    await caseListPage.navigateTo();
    await caseSearchPage.startFindCaseJourney(
      nonExistentCaseReference,
      FIND_CASE_CASE_TYPE_LABEL,
      FIND_CASE_JURISDICTION_LABEL
    );

    const searchResult = page.locator("#search-result");
    await expect(searchResult).toBeVisible();
    const resultsText = (await searchResult.textContent()) ?? "";
    expect(resultsText).toMatch(/No cases found|There are no cases that match your selection/i);
    await expect(page.locator('#search-result a.govuk-link[href*="/cases/case-details/"]')).toHaveCount(0);
  });
});
