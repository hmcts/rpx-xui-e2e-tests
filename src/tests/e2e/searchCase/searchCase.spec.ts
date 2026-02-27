import { expect, test } from "../../../fixtures/ui";
import { ensureSession } from "../../../utils/ui/sessionCapture";
import {
  resolveCaseReferenceFromGlobalSearch,
  resolveNonExistentCaseReference,
} from "../../../utils/ui/case-reference.utils";
import {
  openHomeWithCapturedSession,
  PUBLIC_LAW_CASE_REFERENCE_OPTIONS,
} from "./searchCase.setup";

test.describe("FPL global search user - 16-digit case search", () => {
  let availableCaseReference = "";
  let caseReferenceResolutionError = "";
  let isQuickSearchHeaderAvailable = false;
  test.beforeAll(async () => {
    await ensureSession("FPL_GLOBAL_SEARCH");
  });

  test.beforeEach(async ({ page }) => {
    await openHomeWithCapturedSession(page, "FPL_GLOBAL_SEARCH");
    isQuickSearchHeaderAvailable = await page
      .locator("#exuiCaseReferenceSearch")
      .first()
      .isVisible()
      .catch(() => false);
    availableCaseReference = "";
    caseReferenceResolutionError = "";
    try {
      availableCaseReference = await resolveCaseReferenceFromGlobalSearch(
        page,
        PUBLIC_LAW_CASE_REFERENCE_OPTIONS,
      );
    } catch (error) {
      caseReferenceResolutionError =
        error instanceof Error ? error.message : String(error);
    }
  });

  test("Search by 16-digit case reference", async ({
    caseDetailsPage,
    searchCasePage,
    page,
  }) => {
    test.skip(
      !isQuickSearchHeaderAvailable,
      "Skipping: 16-digit quick search header is not available in this environment.",
    );
    test.skip(
      !availableCaseReference,
      `Skipping: no resolvable 16-digit Public Law case reference. ${caseReferenceResolutionError}`,
    );
    const caseNumber = availableCaseReference;

    await test.step("Search using 16-digit case reference", async () => {
      await searchCasePage.searchWith16DigitCaseId(caseNumber);
    });
    await expect(page).toHaveURL(/\/cases\/case-details\//);
    const caseNumberFromUrl = await caseDetailsPage.getCaseNumberFromUrl();
    expect.soft(caseNumberFromUrl).toContain(caseNumber);
    await expect(caseDetailsPage.caseActionsDropdown).toBeVisible();

    await test.step("Verify optional case details notifications and progress panel", async () => {
      // These elements are conditionally rendered based on case state and configuration
      // Notification banner appears when case has active flags
      if (await caseDetailsPage.caseNotificationBannerTitle.isVisible()) {
        await expect
          .soft(caseDetailsPage.caseNotificationBannerTitle)
          .toContainText("Important");
      }
      if (await caseDetailsPage.caseNotificationBannerBody.isVisible()) {
        await expect
          .soft(caseDetailsPage.caseNotificationBannerBody)
          .toContainText("active flags on this case");
      }
      // Progress panel displays when case has timeline tracking enabled
      if (await searchCasePage.caseProgressPanel.isVisible()) {
        await expect
          .soft(caseDetailsPage.caseProgressMessage)
          .toContainText("Current progress of the case");
      }
    });
  });

  test("Search invalid 16-digit case reference shows no results", async ({
    searchCasePage,
    page,
  }) => {
    test.skip(
      !isQuickSearchHeaderAvailable,
      "Skipping: 16-digit quick search header is not available in this environment.",
    );
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
