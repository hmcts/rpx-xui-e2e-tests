import { expect, test } from "../../../fixtures/ui";
import { resolveCaseReferenceFromGlobalSearch } from "../utils/case-reference.utils.js";

import {
  ensureSearchCaseSession,
  openHomeWithCapturedSession,
  PUBLIC_LAW_CASE_REFERENCE_OPTIONS
} from "./searchCase.setup.js";

const FIND_CASE_JURISDICTION = "Public Law";
const FIND_CASE_CASE_TYPE = "Public Law Applications";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("FPL global search user - find case", { tag: ["@e2e", "@e2e-search-case"] }, () => {
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

  test("Find case using Public Law jurisdiction", async ({
    caseSearchPage,
    caseDetailsPage,
    tableUtils,
    page
  }) => {
    await test.step("Start Find case journey", async () => {
      await caseSearchPage.startFindCaseJourney(
        availableCaseReference,
        FIND_CASE_CASE_TYPE,
        FIND_CASE_JURISDICTION
      );
    });

    await test.step("Verify that case searched for appears under 'Your cases'", async () => {
      await caseSearchPage.searchResultsDataTable.waitFor({ state: "visible", timeout: 30_000 });
      const searchTable = await tableUtils.parseDataTable(caseSearchPage.searchResultsDataTable);

      expect(searchTable.length).toBeGreaterThan(0);
      expect(searchTable[0]).toMatchObject({
        "Case name": expect.any(String),
        "Date submitted": expect.any(String),
        "FamilyMan case number": expect.any(String),
        "Local authority": expect.any(String),
        State: expect.any(String)
      });

      await caseSearchPage.openCaseDetailsFor(availableCaseReference);
      await expect(page).toHaveURL(/\/cases\/case-details\//);
    });

    await test.step("Verify case details page displays correct case", async () => {
      await expect(caseDetailsPage.caseActionsDropdown).toBeVisible();
      await expect(caseDetailsPage.caseActionGoButton).toBeVisible();
      expect(await caseDetailsPage.getCaseNumberFromUrl()).toContain(availableCaseReference);
    });
  });

  test("Find case is accessible from main menu navigation", async ({
    caseSearchPage,
    page
  }) => {
    await caseSearchPage.openFromMainMenu();
    await expect(page).toHaveURL(/\/cases\/case-search/);
    await expect(caseSearchPage.pageHeading).toHaveText("Search");
  });
});

test.describe("Solicitor navigation to Find case (top-right)", { tag: ["@e2e", "@e2e-search-case"] }, () => {
  test.beforeAll(async () => {
    await ensureSearchCaseSession("SOLICITOR");
  });

  test.beforeEach(async ({ page }) => {
    await openHomeWithCapturedSession(page, "SOLICITOR");
  });

  test("Find case link appears on top-right and opens Find case page", async ({
    caseSearchPage,
    page
  }) => {
    await caseSearchPage.openFromTopRight();
    await expect(page).toHaveURL(/\/cases\/case-search/);
    await expect(caseSearchPage.pageHeading).toHaveText("Search");
  });
});
