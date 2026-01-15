import type { Cookie, Page } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import type { CreateCasePage } from "../../../../page-objects/pages/exui/createCase.po.js";
import { loadSessionCookies } from "../utils/session.utils.js";

const userIdentifier = "SOLICITOR";
const jurisdiction = "DIVORCE";
const caseType = "xuiTestJurisdiction";
let sessionCookies: Cookie[] = [];

const assertSubmitCaseBlocked = async (
  page: Page,
  createCasePage: CreateCasePage,
  responseStatus?: number
): Promise<void> => {
  const blockedStatuses = new Set([401, 403, 404]);
  if (responseStatus !== undefined && blockedStatuses.has(responseStatus)) {
    return;
  }

  const accessDeniedHeading = page.getByRole("heading", { name: /access denied/i });
  const createCaseHeading = page.getByRole("heading", { name: /create a case|the data on this page/i });
  const loginUsernameInput = page.locator('input#username, input[name="username"], input[type="email"]');
  const loginPasswordInput = page.locator('input#password, input[name="password"], input[type="password"]');

  const readVisibility = async () => {
    const [accessDeniedVisible, bannerVisible, headerVisible, createHeadingVisible] =
      await Promise.all([
        accessDeniedHeading.isVisible().catch(() => false),
        page.getByRole("banner").isVisible().catch(() => false),
        createCasePage.exuiHeader.header.isVisible().catch(() => false),
        createCaseHeading.isVisible().catch(() => false)
      ]);
    const [usernameVisible, passwordVisible] = await Promise.all([
      loginUsernameInput.first().isVisible().catch(() => false),
      loginPasswordInput.first().isVisible().catch(() => false)
    ]);
    const loginVisible = usernameVisible || passwordVisible;
    return {
      accessDeniedVisible,
      bannerVisible,
      headerVisible,
      createHeadingVisible,
      loginVisible
    };
  };

  await expect
    .poll(async () => {
      const visibility = await readVisibility();
      return (
        visibility.accessDeniedVisible ||
        visibility.bannerVisible ||
        visibility.headerVisible ||
        visibility.createHeadingVisible ||
        visibility.loginVisible
      );
    }, { timeout: 15_000 })
    .toBe(true);

  const visibility = await readVisibility();

  if (visibility.accessDeniedVisible || visibility.loginVisible) {
    return;
  }

  const refreshVisible = await createCasePage.refreshModal.isVisible().catch(() => false);
  if (refreshVisible) {
    await createCasePage.refreshModalConfirmButton.click();
  }

  await expect(page).not.toHaveURL(/\/submit\b/i);
  await expect(createCasePage.testSubmitButton).not.toBeInViewport();
};

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
    let submitResponseStatus: number | undefined;

    await test.step("Navigate to the submit case page without filling in case details", async () => {
      const response = await page.goto(`/cases/case-create/${jurisdiction}/${caseType}/createCase/submit`, {
        waitUntil: "domcontentloaded"
      });
      submitResponseStatus = response?.status();
    });

    await test.step("Check the submit case page is not displayed", async () => {
      await assertSubmitCaseBlocked(page, createCasePage, submitResponseStatus);
    });

    await test.step("Verify that the case is not created and the user is not taken to the case details page", async () => {
      await expect(createCasePage.exuiCaseDetailsComponent.caseHeader).toBeHidden();
      await expect(page).not.toHaveURL(/case-details/);
    });
  });
});
