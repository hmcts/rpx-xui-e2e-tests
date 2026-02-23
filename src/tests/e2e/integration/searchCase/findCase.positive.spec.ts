import { expect, test } from "../../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";
import {
  createFindCaseSearchResultsRouteHandler,
  setupFindCaseMockRoutes,
  startFindCaseJourney,
} from "../helpers/index.js";
import {
  buildFindCaseCaseDetailsMock,
  buildFindCaseEmptySearchResultsMock,
  buildFindCaseJurisdictionsMock,
  buildFindCaseSearchResultsMock,
  buildFindCaseWorkBasketInputsMock,
  FIND_CASE_CASE_TYPE_LABEL,
  FIND_CASE_JURISDICTION_LABEL,
  getCaseReferenceFromFindCaseSearchPayload,
} from "../mocks/findCase.mock.js";
import { TEST_CASE_REFERENCES, TEST_USERS } from "../testData/index.js";
import { ensureSessionCookies } from "../utils/session.utils.js";

const userIdentifier = TEST_USERS.SOLICITOR;
const existingCaseReference = TEST_CASE_REFERENCES.FIND_CASE_EXISTING;
const nonExistentCaseReference = TEST_CASE_REFERENCES.FIND_CASE_NON_EXISTENT;
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
    searchResultsHandler: createFindCaseSearchResultsRouteHandler({
      existingCaseReference,
      matchingResponse: buildFindCaseSearchResultsMock(existingCaseReference),
      noMatchResponse: buildFindCaseEmptySearchResultsMock(),
      getCaseReferenceFromPayload: getCaseReferenceFromFindCaseSearchPayload,
    }),
    caseDetailsHandler: async (route) => {
      const requestUrl = route.request().url();
      const caseReference =
        requestUrl.split("/").pop() ?? existingCaseReference;
      const body = JSON.stringify(buildFindCaseCaseDetailsMock(caseReference));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body,
      });
    },
  });
});

test.describe(`Find Case as ${userIdentifier}`, () => {
  test("User can find an existing case from Find case filters", async ({
    caseSearchPage,
    page,
  }) => {
    await test.step("Open Find case from main menu and apply filters with 16-digit reference", async () => {
      await startFindCaseJourney(
        existingCaseReference,
        FIND_CASE_CASE_TYPE_LABEL,
        FIND_CASE_JURISDICTION_LABEL,
        caseSearchPage,
      );
    });

    await test.step("Verify result row contains the searched case reference", async () => {
      const searchResultsSummary = page.locator(
        "#search-result .pagination-top",
      );
      await caseSearchPage.resultsTable.waitFor({ state: "visible" });
      await expect(searchResultsSummary).toContainText(/\b1\b/);
      await expect(caseSearchPage.resultLinks.first()).toBeVisible();
      await expect(caseSearchPage.resultLinks).toHaveCount(1);
      const firstResultText =
        (await caseSearchPage.resultLinks.first().textContent()) ?? "";
      expect(firstResultText.replaceAll(/\D/g, "")).toContain(
        existingCaseReference,
      );
    });

    await test.step("Verify results remain on Find case page after filtering", async () => {
      await expect(page).toHaveURL(/\/cases\/case-search/);
    });
  });

  test("User sees no cases found message for non-existent 16-digit case reference", async ({
    caseSearchPage,
    page,
  }) => {
    await test.step("Open Find case from main menu and search for a non-existent reference", async () => {
      await startFindCaseJourney(
        nonExistentCaseReference,
        FIND_CASE_CASE_TYPE_LABEL,
        FIND_CASE_JURISDICTION_LABEL,
        caseSearchPage,
      );
    });

    await test.step("Verify empty results message is displayed", async () => {
      const searchResult = page.locator("#search-result");
      await expect(searchResult).toBeVisible();
      const resultsText = (await searchResult.textContent()) ?? "";
      expect(resultsText).toMatch(
        /No cases found|There are no cases that match your selection/i,
      );
      await expect(
        page.locator(
          '#search-result a.govuk-link[href*="/cases/case-details/"]',
        ),
      ).toHaveCount(0);
    });
  });
});
