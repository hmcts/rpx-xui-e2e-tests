import { expect, test } from "../../../fixtures/ui";
import {
  resolveCaseReferenceFromGlobalSearch,
  resolveNonExistentCaseReference
} from "../utils/case-reference.utils.js";

import {
  ensureSearchCaseSession,
  openHomeWithCapturedSession,
  PUBLIC_LAW_CASE_REFERENCE_OPTIONS
} from "./searchCase.setup.js";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("FPL global search user - 16-digit case search", { tag: ["@e2e", "@e2e-search-case"] }, () => {
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

  test("Search by 16-digit case reference", async ({
    caseDetailsPage,
    caseSearchPage,
    page
  }) => {
    await test.step("Search using 16-digit case reference", async () => {
      await caseSearchPage.searchWith16DigitCaseId(availableCaseReference);
    });

    await expect(page).toHaveURL(/\/cases\/case-details\//);
    await expect(caseDetailsPage.caseActionsDropdown).toBeVisible();
    expect(await caseDetailsPage.getCaseNumberFromUrl()).toBe(availableCaseReference);
  });

  test("Search invalid 16-digit case reference shows no results", async ({
    caseSearchPage,
    page
  }) => {
    const invalidCaseReference = await resolveNonExistentCaseReference(page, {
      jurisdictionIds: ["PUBLICLAW"]
    });

    await test.step("Submit a non-existent 16-digit case reference", async () => {
      await caseSearchPage.searchWith16DigitCaseId(invalidCaseReference);
    });

    await expect(page).not.toHaveURL(/\/cases\/case-details\//);
    await expect(page).toHaveURL(/\/cases(?:[/?#]|$)/);
    await expect(caseSearchPage.noResultsHeading).toBeVisible();
    await expect(caseSearchPage.backLink).toBeVisible();
  });
});
