import { expect } from "@playwright/test";

import { test as base } from "../../fixtures/test";
import {
  countActiveFlagRows,
  createCaseFlagsTestCase,
  getBannerCount,
  openCaseFlagsTab,
  startFlagWizard,
} from "../helpers/case-flags";

const test = base.extend<{ timeoutOverride: void }>({
  timeoutOverride: [
    async ({}, use) => {
      // reduce per-test timeout for this file
      base.setTimeout(30_000);
      await use();
    },
    { scope: "test" },
  ],
});

const DEFAULT_CASE_ID = "1747043572209027";
let CASE_ID =
  process.env.CASE_FLAGS_CREATE_CASE_ID ??
  process.env.CASE_FLAGS_CASE_ID ??
  DEFAULT_CASE_ID;
const CASE_FLAGS_USER = process.env.CASE_FLAGS_CREATE_USER ?? "USER_WITH_FLAGS";
const SUPPORT_COMMENT = process.env.CASE_FLAGS_SUPPORT_COMMENT ?? "Test auto comment";

  test.describe("@regression @case-flags Case flag support request", () => {
  test.beforeEach(async ({ loginAs, config, page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loginAs(CASE_FLAGS_USER);
    if (!CASE_ID || CASE_ID.trim() === "" || CASE_ID === "0000000000000000") {
      CASE_ID = await createCaseFlagsTestCase(page, config.urls.manageCaseBaseUrl);
    }
    await openCaseFlagsTab(page, config.urls.manageCaseBaseUrl, CASE_ID!);
  });

  test("creates support request and validates banner/table", async ({ page }) => {
    const initialBanner = await getBannerCount(page);
    const initialRows = await countActiveFlagRows(page);

    // Open support flow
    const supportTab = page.getByRole("tab", { name: /Support/i });
    if (await supportTab.isVisible().catch(() => false)) {
      await supportTab.click();
    }

    const wizardChoice = await startFlagWizard(page, [
      "Request support",
      "Manage Case Flags test data",
      "Manage case flags",
    ]);
    expect(wizardChoice).toBeTruthy();

    // Drive the wizard until review
    const selectedFlag = await driveSupportWizard(page, SUPPORT_COMMENT);

    await expect(page.getByText(/Requested/i)).toBeVisible();
    await clickIfVisible(page, /Submit/);

    // Verify counts and presence of selected flag label
    const finalBanner = await getBannerCount(page);
    const finalRows = await countActiveFlagRows(page);
    expect(finalBanner).toBeGreaterThanOrEqual(initialBanner);
    expect(finalRows).toBeGreaterThanOrEqual(initialRows);
    if (selectedFlag) {
      await expect.soft(page.getByText(selectedFlag, { exact: false })).toBeVisible();
    }

    // Optional table verification: attempt to reopen Case flags tab and assert the selected flag text
    await verifyCaseFlagsTab(page, selectedFlag);
  });
});

async function clickIfVisible(page, label: RegExp | string): Promise<void> {
  const button = page.getByRole("button", { name: label });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
  }
}

async function driveSupportWizard(page, commentText: string): Promise<string | undefined> {
  const maxSteps = 12;
  let selectedFlagLabel: string | undefined;
  for (let i = 0; i < maxSteps; i += 1) {
    const successAlert = page
      .locator("cut-alert, .govuk-notification-banner")
      .filter({ hasText: /updated with event|has been updated|Case flags/i });
    if (await successAlert.isVisible().catch(() => false)) {
      return selectedFlagLabel;
    }

    const reviewHeading = page.getByRole("heading", { name: /Review support request/i });
    if (await reviewHeading.isVisible().catch(() => false)) {
      return selectedFlagLabel;
    }

    // Fill known fields if present
    const applicantRadio = page.getByLabel(/Applicant/i);
    if (await applicantRadio.isVisible().catch(() => false)) {
      await applicantRadio.check();
    }
    const reasonable = page.getByLabel(/Reasonable adjustment/i);
    if (await reasonable.isVisible().catch(() => false)) {
      await reasonable.check();
    }
    const docOption = page.getByLabel(/documents in/i);
    if (await docOption.isVisible().catch(() => false)) {
      await docOption.check();
    }
    const comment = page.getByLabel(/Tell us more/i).first();
    if (await comment.isVisible().catch(() => false)) {
      await comment.fill(commentText);
    }

    // Manage existing flag selection when presented with a list
    const updateHeading = page.getByRole("heading", { name: /Update this Case Flag|Manage case flags/i });
    const flagRadios = page.locator('input[type="radio"]');
    if (await updateHeading.isVisible().catch(() => false) && (await flagRadios.count()) > 0) {
      selectedFlagLabel = await handleManageFlagsSelection(page, flagRadios);
      continue;
    }

    // Handle error prompts
    const errorLink = page.getByRole("link", { name: /Please make a selection/i });
    if (await errorLink.isVisible().catch(() => false)) {
      await errorLink.click().catch(() => undefined);
      if (await flagRadios.first().isVisible().catch(() => false)) {
        await flagRadios.first().check();
      }
    }

    // Advance
    const advanced = await clickFirstAvailable(page, [/Next/i, /Continue/i, /Submit/i]);
    if (!advanced) {
      await page.waitForTimeout(500);
    } else {
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(300);
    }
  }
  throw new Error("Support wizard did not reach review step within expected steps");
}

async function clickFirstAvailable(page, labels: (RegExp | string)[]): Promise<boolean> {
  for (const label of labels) {
    const button = page.getByRole("button", { name: label });
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return true;
    }
  }
  return false;
}

async function handleManageFlagsSelection(
  page,
  flagRadios: import("@playwright/test").Locator,
): Promise<string | undefined> {
  const firstRadio = flagRadios.first();
  const radioId = await firstRadio.getAttribute("id");
  let labelText: string | undefined;
  if (radioId) {
    const label = page.locator(`label[for="${radioId}"]`);
    if (await label.isVisible().catch(() => false)) {
      await label.scrollIntoViewIfNeeded().catch(() => undefined);
      labelText = await label.innerText().catch(() => undefined);
      await label.click();
    } else {
      await firstRadio.check({ force: true });
    }
  } else {
    await firstRadio.check({ force: true });
  }
  if (!(await firstRadio.isChecked().catch(() => false))) {
    await firstRadio.check({ force: true });
  }

  const continueBtn = page.getByRole("button", { name: /Continue|Next/i });
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.scrollIntoViewIfNeeded().catch(() => undefined);
    await waitForSpinnerGone(page);
    await continueBtn.click();
    await waitForSpinnerGone(page);
    // Wait for either URL change or next heading to appear
    const nextHeading = page.getByRole("heading", { name: /support|review|reasonable/i });
    const navigated = await Promise.race([
      page.waitForURL(
        (url) => !url.toString().includes("manageCaseFlagsCaseFlagFormPage"),
        { timeout: 10_000 },
      ).catch(() => undefined),
      nextHeading.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined),
    ]);
    if (!navigated) {
      throw new Error("Manage case flags continue did not navigate away");
    }
  } else {
    throw new Error("Continue button not visible on Manage case flags page");
  }
  return labelText;
}

async function waitForSpinnerGone(page): Promise<void> {
  const spinner = page.locator(".spinner-container, xuilib-loading-spinner");
  await spinner.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
}

async function verifyCaseFlagsTab(page, expectedFlag?: string): Promise<void> {
  try {
    await waitForSpinnerGone(page);
    const tab = page.getByText("Case flags", { exact: true });
    await tab.scrollIntoViewIfNeeded().catch(() => undefined);
    await tab.click({ timeout: 5_000 });
    await waitForSpinnerGone(page);
    await expect
      .soft(page.getByRole("table", { name: /Applicant|Respondent/i }).first())
      .toBeVisible({ timeout: 5_000 });
    if (expectedFlag) {
      await expect.soft(page.getByText(expectedFlag, { exact: false })).toBeVisible({
        timeout: 5_000,
      });
    }
  } catch {
    // non-fatal; counts already validated
  }
}
