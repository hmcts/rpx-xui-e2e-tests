import { expect, test } from "../../../fixtures/ui";
import { CCD_CASE_REFERENCE_LENGTH } from "../../../page-objects/pages/exui/exui-timeouts.js";
import { resolveCaseReferenceFromGlobalSearch } from "../utils/case-reference.utils.js";

import {
  ensureSearchCaseSession,
  openHomeWithCapturedSession,
  PUBLIC_LAW_CASE_REFERENCE_OPTIONS
} from "./searchCase.setup.js";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("IDAM login using credentials for Global Search", { tag: ["@e2e", "@e2e-search-case"] }, () => {
  let availableCaseReference = "";

  test.beforeAll(async () => {
    await ensureSearchCaseSession("FPL_GLOBAL_SEARCH");
  });

  test.beforeEach(async ({ page }) => {
    await openHomeWithCapturedSession(page, "FPL_GLOBAL_SEARCH");
    availableCaseReference = await resolveCaseReferenceFromGlobalSearch(
      page,
      PUBLIC_LAW_CASE_REFERENCE_OPTIONS
    );
  });

  test("Global Search - using case id and FPL jurisdiction", async ({
    globalSearchPage,
    caseDetailsPage,
    tableUtils,
    page
  }) => {
    await globalSearchPage.performGlobalSearchWithCase(availableCaseReference, "PUBLICLAW");
    const searchResultsTable = await tableUtils.parseDataTable(globalSearchPage.searchResultsTable);

    expect(searchResultsTable.length).toBeGreaterThan(0);
    const matchingCaseRow = searchResultsTable.find((row) =>
      (row.Case ?? "").includes(availableCaseReference)
    );
    expect(matchingCaseRow).toBeDefined();
    expect(matchingCaseRow).toMatchObject({
      Case: expect.stringContaining(availableCaseReference),
      Service: "Public Law",
      State: expect.any(String),
      Location: expect.any(String)
    });

    await globalSearchPage.viewCaseDetails(availableCaseReference);
    await expect(page).toHaveURL(/\/cases\/case-details\//);
    expect(await caseDetailsPage.getCaseNumberFromUrl()).toBe(availableCaseReference);
    await expect(caseDetailsPage.caseSummaryHeading).toHaveText("Case information");
    await expect(caseDetailsPage.caseActionsDropdown).toBeVisible();
    await expect(caseDetailsPage.caseActionGoButton).toBeVisible();
  });

  test("Global Search (Partial) - using '*' wildcard on case number", async ({
    globalSearchPage,
    tableUtils
  }) => {
    const wildcardCaseReference = `${availableCaseReference.slice(0, 5)}*`;
    const wildcardPrefix = wildcardCaseReference.replace("*", "");

    await globalSearchPage.performGlobalSearchWithRetry(wildcardCaseReference, "PUBLICLAW");
    await expect(globalSearchPage.searchResultsHeader).toHaveText("Search results");
    await expect(globalSearchPage.changeSearchLink.filter({ hasText: "Change search" })).toBeVisible();
    await expect(globalSearchPage.viewLink).toBeVisible();

    const table = await tableUtils.parseDataTable(globalSearchPage.searchResultsTable);
    expect(table.length).toBeGreaterThan(0);

    for (const row of table) {
      const digitsOnly = (row.Case ?? "").replaceAll(/\D/g, "");
      const normalizedCaseReference = digitsOnly.slice(-CCD_CASE_REFERENCE_LENGTH);
      expect(
        normalizedCaseReference,
        `Expected "${row.Case}" to contain a ${CCD_CASE_REFERENCE_LENGTH}-digit case reference`
      ).toHaveLength(CCD_CASE_REFERENCE_LENGTH);
      expect(
        normalizedCaseReference.startsWith(wildcardPrefix),
        `Expected "${row.Case}" to match wildcard prefix ${wildcardPrefix}*`
      ).toBeTruthy();
      expect(row).toMatchObject({
        Case: expect.any(String),
        Service: "Public Law",
        State: expect.any(String),
        Location: expect.any(String)
      });
    }
  });
});
