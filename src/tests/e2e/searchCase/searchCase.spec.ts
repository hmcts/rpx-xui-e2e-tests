import { expect, test } from "../../../fixtures/ui";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import { ensureSessionCookies } from "../integration/utils/session.utils.js";

import {
  resolveCaseReferenceFromGlobalSearch,
  resolveNonExistentCaseReference,
} from "./case-reference.utils.js";
import {
  openHomeWithCapturedSession,
  PUBLIC_LAW_CASE_REFERENCE_OPTIONS,
} from "./searchCase.setup.js";

const userIdentifier = "FPL_GLOBAL_SEARCH";

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.describe("FPL global search user - 16-digit case search", () => {
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

  test("Search by 16-digit case reference", async ({
    caseDetailsPage,
    searchCasePage,
    page,
  }) => {
    const caseNumber = availableCaseReference;

    await test.step("Search using 16-digit case reference", async () => {
      await searchCasePage.searchWith16DigitCaseId(caseNumber);
    });

    await expect(page).toHaveURL(/\/cases\/case-details\//);
    const caseNumberFromUrl = await caseDetailsPage.getCaseNumberFromUrl();
    expect.soft(caseNumberFromUrl).toContain(caseNumber);
    await expect(caseDetailsPage.caseActionsDropdown).toBeVisible();
  });

  test("Search invalid 16-digit case reference shows no results", async ({
    searchCasePage,
    page,
  }) => {
    const invalidCaseReference = await resolveNonExistentCaseReference(page, {
      jurisdictionIds: ["PUBLICLAW"],
    });

    await test.step("Submit a non-existent 16 digit case reference", async () => {
      await searchCasePage.searchWith16DigitCaseId(invalidCaseReference);
    });

    await test.step("Search results not found content is shown", async () => {
      await expect(searchCasePage.noResultsHeading).toBeVisible();
      await expect(searchCasePage.backLink).toBeVisible();
    });
  });
});
