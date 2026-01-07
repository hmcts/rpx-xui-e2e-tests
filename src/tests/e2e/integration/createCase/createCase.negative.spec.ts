import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import { loadSessionCookies } from "../utils/session.utils.js";

const userIdentifier = "SOLICITOR";
const jurisdiction = "DIVORCE";
const caseType = "xuiTestJurisdiction";
let sessionCookies: Cookie[] = [];

test.beforeAll(() => {
  const { cookies } = loadSessionCookies(userIdentifier);
  sessionCookies = cookies;
});

test.beforeEach(async ({ page }) => {
  if (sessionCookies.length) {
    await page.context().addCookies(sessionCookies);
  }
});

test.describe(`Case List as ${userIdentifier}`, () => {
  test(`User ${userIdentifier} should not be able to submit a case without filling in required fields`, async ({
    createCasePage,
    page
  }) => {
    await test.step("Navigate to the submit case page without filling in case details", async () => {
      await page.goto(`/cases/case-create/${jurisdiction}/${caseType}/createCase/submit`, {
        waitUntil: "domcontentloaded"
      });
    });

    await test.step("Check the submit case page is not displayed", async () => {
      const accessDeniedHeading = page.getByRole("heading", { name: /access denied/i });
      if (await accessDeniedHeading.isVisible().catch(() => false)) {
        await expect(accessDeniedHeading).toBeVisible();
        return;
      }

      await expect(createCasePage.exuiHeader.header).toBeVisible();

      const refreshVisible = await createCasePage.refreshModal.isVisible().catch(() => false);
      if (refreshVisible) {
        await expect(createCasePage.refreshModalConfirmButton).toBeVisible();
        await createCasePage.refreshModalConfirmButton.click();
      }

      await expect(createCasePage.testSubmitButton).not.toBeInViewport();
    });

    await test.step("Verify that the case is not created and the user is not taken to the case details page", async () => {
      await expect(createCasePage.exuiCaseDetailsComponent.caseHeader).not.toBeVisible();
      await expect(page).not.toHaveURL(/case-details/);
    });
  });
});
