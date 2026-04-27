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

async function openHomeAndResolvePublicLawCaseReference(page: Parameters<typeof openHomeWithCapturedSession>[0]): Promise<string> {
  await openHomeWithCapturedSession(page, "FPL_GLOBAL_SEARCH");
  return resolveCaseReferenceFromGlobalSearch(
    page,
    PUBLIC_LAW_CASE_REFERENCE_OPTIONS
  );
}

test.describe("FPL global search user - 16-digit case search", { tag: ["@e2e", "@e2e-search-case"] }, () => {
  test.beforeAll(async () => {
    await ensureSearchCaseSession("FPL_GLOBAL_SEARCH");
  });

  test("Search by 16-digit case reference", async ({
    caseDetailsPage,
    caseSearchPage,
    page
  }) => {
    const availableCaseReference = await openHomeAndResolvePublicLawCaseReference(page);

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
    await openHomeWithCapturedSession(page, "FPL_GLOBAL_SEARCH");
    const invalidCaseReference = await resolveNonExistentCaseReference(page, {
      jurisdictionIds: ["PUBLICLAW"]
    });

    await test.step("Submit a non-existent 16-digit case reference", async () => {
      await caseSearchPage.searchWith16DigitCaseId(invalidCaseReference);
    });

    await test.step("Search results not found content is shown", async () => {
      await expect(page).not.toHaveURL(/\/cases\/case-details\//);
      await expect(caseSearchPage.noResultsHeading).toBeVisible();
      await expect(caseSearchPage.backLink).toBeVisible();
    });
  });
});
