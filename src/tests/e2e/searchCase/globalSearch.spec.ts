import { expect, test } from "../../../fixtures/ui";
import { CCD_CASE_REFERENCE_LENGTH } from "../../../page-objects/pages/exui/exui-timeouts.js";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import { ensureSessionCookies } from "../integration/utils/session.utils.js";

import { resolveCaseReferenceFromGlobalSearch } from "./case-reference.utils.js";
import {
  openHomeWithCapturedSession,
  PUBLIC_LAW_CASE_REFERENCE_OPTIONS,
} from "./searchCase.setup.js";

const userIdentifier = "FPL_GLOBAL_SEARCH";

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.describe("IDAM login using credentials for Global Search", () => {
  let availableCaseReference = "";

  test.beforeAll(async () => {
    await ensureSessionCookies(userIdentifier, { strict: true });
  });

  test.beforeEach(async ({ page }) => {
    await openHomeWithCapturedSession(page);
    availableCaseReference = await resolveCaseReferenceFromGlobalSearch(
      page,
      PUBLIC_LAW_CASE_REFERENCE_OPTIONS,
    );
  });

  test("Global Search - using case id and FPL jurisdiction", async ({
    globalSearchPage,
    caseDetailsPage,
    tableUtils,
    page,
  }) => {
    const caseNumber = availableCaseReference;

    await test.step("Initiate Global Search", async () => {
      await globalSearchPage.performGlobalSearchWithCase(
        caseNumber,
        "PUBLICLAW",
      );
      const searchResultsTable = await tableUtils.mapExuiTable(
        globalSearchPage.searchResultTable,
      );

      expect(searchResultsTable.length).toBeGreaterThan(0);
      const matchingCaseRow = searchResultsTable.find((row) =>
        row.Case.includes(caseNumber),
      );
      expect(matchingCaseRow).toBeDefined();
      expect(matchingCaseRow).toMatchObject({
        Case: expect.stringContaining(caseNumber),
        Service: "Public Law",
        State: expect.any(String),
        Location: expect.any(String),
      });
    });

    await test.step("Verify case details page navigation and elements", async () => {
      await globalSearchPage.viewCaseDetails(caseNumber);
      await expect(page).toHaveURL(/\/cases\/case-details\//);
      const caseNumberFromUrl = await caseDetailsPage.getCaseNumberFromUrl();
      expect.soft(caseNumberFromUrl).toContain(caseNumber);
      await expect
        .soft(caseDetailsPage.caseSummaryHeading)
        .toHaveText("Case information");

      await caseDetailsPage.caseActionsDropdown.waitFor();
      await caseDetailsPage.caseActionGoButton.waitFor();
      await expect.soft(caseDetailsPage.caseActionsDropdown).toBeVisible();
      await expect.soft(caseDetailsPage.caseActionGoButton).toBeVisible();
    });
  });

  test("Global Search (Partial) - using '*' wildcard on case number", async ({
    globalSearchPage,
    tableUtils,
  }) => {
    const wildcardCaseReference = `${availableCaseReference.substring(0, 5)}*`;
    const wildcardPrefix = wildcardCaseReference.replace("*", "");

    await test.step("Initiate wildcard Global Search", async () => {
      await globalSearchPage.performGlobalSearchWithRetry(
        wildcardCaseReference,
        "PUBLICLAW",
      );
    });

    await test.step("Verify wildcard (*) search results", async () => {
      await expect(globalSearchPage.searchResultsHeader).toHaveText(
        "Search results",
      );
      await expect(
        globalSearchPage.changeSearchLink.filter({
          hasText: "Change search",
        }),
      ).toBeVisible();
      await expect(globalSearchPage.viewLink).toBeVisible();

      const table = await tableUtils.mapExuiTable(
        globalSearchPage.searchResultsTable,
      );

      expect(table.length).toBeGreaterThan(0);

      for (const eachRow of table) {
        const digitsOnly = eachRow.Case.replaceAll(/\D/g, "");
        const normalizedCaseReference = digitsOnly.slice(
          -CCD_CASE_REFERENCE_LENGTH,
        );
        expect(
          normalizedCaseReference.length,
          `Expected "${eachRow.Case}" to contain a ${CCD_CASE_REFERENCE_LENGTH}-digit case reference`,
        ).toBe(CCD_CASE_REFERENCE_LENGTH);
        expect(
          normalizedCaseReference.startsWith(wildcardPrefix),
          `Expected "${eachRow.Case}" to match wildcard prefix ${wildcardPrefix}*`,
        ).toBeTruthy();
        expect(eachRow).toMatchObject({
          Case: expect.any(String),
          Service: "Public Law",
          State: expect.stringMatching(
            /Submitted|Case management|Gatekeeping|Closed/,
          ),
          Location: expect.any(String),
        });
      }
    });
  });
});
