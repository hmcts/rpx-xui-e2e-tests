import { expect, test } from "../../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";
import {
  overrideFindCaseSearchResultsRoute,
  setupFindCaseMockRoutes,
  startFindCaseJourney,
} from "../helpers/index.js";
import {
  buildFindCaseEmptySearchResultsMock,
  buildFindCaseJurisdictionsMock,
  buildFindCaseWorkBasketInputsMock,
  FIND_CASE_CASE_TYPE_LABEL,
  FIND_CASE_JURISDICTION_LABEL,
} from "../mocks/findCase.mock.js";
import {
  SEARCH_CASE_ERROR_STATUS_CODES,
  SEARCH_CASE_MALFORMED_JSON_BODY,
  TEST_CASE_REFERENCES,
  TEST_USERS,
} from "../testData/index.js";
import { ensureSessionCookies } from "../utils/session.utils.js";

const userIdentifier = TEST_USERS.SOLICITOR;
const existingCaseReference = TEST_CASE_REFERENCES.FIND_CASE_EXISTING;
const jurisdictionMock = buildFindCaseJurisdictionsMock();
const workBasketInputsMock = buildFindCaseWorkBasketInputsMock();

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.beforeAll(async () => {
  await ensureSessionCookies(userIdentifier, { strict: true });
});

test.beforeEach(async ({ page }) => {
  await setupFindCaseMockRoutes(page, {
    jurisdictions: jurisdictionMock,
    workBasketInputs: workBasketInputsMock,
    searchResultsHandler: async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildFindCaseEmptySearchResultsMock()),
      });
    },
  });
});

test.describe(`Find Case negative flows as ${userIdentifier}`, () => {
  for (const status of SEARCH_CASE_ERROR_STATUS_CODES) {
    test(`does not navigate to case details when searchCases returns HTTP ${status}`, async ({
      caseSearchPage,
      page,
    }) => {
      let searchRequestSeen = false;
      await overrideFindCaseSearchResultsRoute(page, async (route) => {
        searchRequestSeen = true;
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ message: `Forced failure ${status}` }),
        });
      });

      await startFindCaseJourney(
        existingCaseReference,
        FIND_CASE_CASE_TYPE_LABEL,
        FIND_CASE_JURISDICTION_LABEL,
        caseSearchPage,
      );

      expect(searchRequestSeen).toBeTruthy();
      await expect(page).not.toHaveURL(/\/cases\/case-details\//);
      await expect(caseSearchPage.resultsTable).toBeHidden();
      await expect(
        page.locator(
          '#search-result a.govuk-link[href*="/cases/case-details/"]',
        ),
      ).toHaveCount(0);
    });
  }

  test("does not navigate to case details when searchCases response is malformed JSON", async ({
    caseSearchPage,
    page,
  }) => {
    let searchRequestSeen = false;
    await overrideFindCaseSearchResultsRoute(page, async (route) => {
      searchRequestSeen = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: SEARCH_CASE_MALFORMED_JSON_BODY,
      });
    });

    await startFindCaseJourney(
      existingCaseReference,
      FIND_CASE_CASE_TYPE_LABEL,
      FIND_CASE_JURISDICTION_LABEL,
      caseSearchPage,
    );

    expect(searchRequestSeen).toBeTruthy();
    await expect(page).not.toHaveURL(/\/cases\/case-details\//);
    await expect(caseSearchPage.resultsTable).toBeHidden();
    await expect(
      page.locator('#search-result a.govuk-link[href*="/cases/case-details/"]'),
    ).toHaveCount(0);
  });

  test("does not navigate to case details when searchCases request times out", async ({
    caseSearchPage,
    page,
  }) => {
    let searchRequestSeen = false;
    await overrideFindCaseSearchResultsRoute(page, async (route) => {
      searchRequestSeen = true;
      await route.abort("timedout");
    });

    await startFindCaseJourney(
      existingCaseReference,
      FIND_CASE_CASE_TYPE_LABEL,
      FIND_CASE_JURISDICTION_LABEL,
      caseSearchPage,
    );

    expect(searchRequestSeen).toBeTruthy();
    await expect(page).not.toHaveURL(/\/cases\/case-details\//);
    await expect(caseSearchPage.resultsTable).toBeHidden();
    await expect(
      page.locator('#search-result a.govuk-link[href*="/cases/case-details/"]'),
    ).toHaveCount(0);
  });
});
