import { Page } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import {
  resolveCaseReferenceFromGlobalSearch,
  resolveNonExistentCaseReference,
} from "../../../utils/ui/case-reference.utils";
import { ensureSession } from "../../../utils/ui/sessionCapture";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils";

import {
  openHomeWithCapturedSession,
  PUBLIC_LAW_CASE_REFERENCE_OPTIONS,
} from "./searchCase.setup";

async function ensureCaseDetailsNavigation(
  page: Page,
  caseReference: string,
): Promise<void> {
  try {
    await expect(page).toHaveURL(/\/cases\/case-details\//, {
      timeout: 20_000,
    });
  } catch {
    const currentUrl = page.url();
    if (!/\/cases(?:\/|\?|$)/.test(currentUrl)) {
      throw new Error(
        `Search did not navigate to case details (current URL: ${currentUrl})`,
      );
    }
    const directCaseLink = page
      .locator('a[href*="/cases/case-details/"]')
      .first();
    await expect(directCaseLink).toBeVisible({ timeout: 10_000 });
    await Promise.all([
      page.waitForURL(/\/cases\/case-details\//, { timeout: 20_000 }),
      directCaseLink.click(),
    ]);
  }
  expect(page.url()).toContain(caseReference);
}

test.describe("FPL global search user - 16-digit case search", () => {
  let availableCaseReference = "";
  test.beforeAll(async () => {
    await ensureSession("FPL_GLOBAL_SEARCH");
  });

  test.beforeEach(async ({ page }) => {
    await openHomeWithCapturedSession(page, "FPL_GLOBAL_SEARCH");
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
      await retryOnTransientFailure(
        async () => {
          await searchCasePage.searchWith16DigitCaseId(caseNumber);
          await ensureCaseDetailsNavigation(page, caseNumber);
        },
        {
          maxAttempts: 2,
          onRetry: async () => {
            if (page.isClosed()) {
              return;
            }
            await openHomeWithCapturedSession(page, "FPL_GLOBAL_SEARCH");
          },
        },
      );
    });

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
