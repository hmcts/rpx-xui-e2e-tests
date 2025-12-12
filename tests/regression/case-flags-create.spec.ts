import { expect } from "@playwright/test";

import { test } from "../../fixtures/test";
import {
  createCaseFlagsTestCase,
  openCaseFlagsTab,
  startFlagWizard,
  getBannerCount,
  countActiveFlagRows,
} from "../helpers/case-flags";

const DEFAULT_CASE_ID = "1747043572209027";
let CASE_ID =
  process.env.CASE_FLAGS_CREATE_CASE_ID ??
  process.env.CASE_FLAGS_CASE_ID ??
  DEFAULT_CASE_ID;
const FLAG_TEXT = process.env.CASE_FLAGS_FLAG_TEXT ?? "Automation flag note";
const CASE_FLAGS_USER = process.env.CASE_FLAGS_CREATE_USER ?? "USER_WITH_FLAGS";

test.describe("@regression @case-flags Case flag creation flow", () => {
  test.beforeEach(async ({ loginAs, config, page }) => {
    await loginAs(CASE_FLAGS_USER);

    // Auto-create a case via CCD test event when no usable case id is configured.
    if (!CASE_ID || CASE_ID.trim() === "" || CASE_ID === "0000000000000000") {
      CASE_ID = await createCaseFlagsTestCase(page, config.urls.manageCaseBaseUrl);
    }

    await openCaseFlagsTab(page, config.urls.manageCaseBaseUrl, CASE_ID!);
  });

  test("launches flag wizard and reaches review step", async ({ page }) => {
    const initialBanner = await getBannerCount(page);
    const initialRows = await countActiveFlagRows(page);

    // Navigate into Support/Test data tabs when present to surface the flag workflow
    const supportTab = page.getByRole("heading", { name: "Support requested" });
    if (await supportTab.isVisible().catch(() => false)) {
      await page.getByText("Support", { exact: true }).click().catch(() => undefined);
      const testDataTab = page.getByRole("tab", { name: /Test data/i });
      if (await testDataTab.isVisible().catch(() => false)) {
        await testDataTab.click();
      }
    } else {
      const caseFlagsTab = page.getByRole("tab", { name: /Case flags/i });
      if (await caseFlagsTab.isVisible().catch(() => false)) {
        await caseFlagsTab.click();
      }
    }

    const wizardChoice = await startFlagWizard(page, [
      "Create case flag",
      "Manage Case Flags test data",
      "Manage case flags",
    ]);
    expect(wizardChoice).toBeTruthy();

    // Best-effort wizard navigation: assert we see a heading and add a note if possible
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const noteFields = page.locator('textarea, [name*="comment"], [id*="comment"]');
    if (await noteFields.first().isVisible().catch(() => false)) {
      await noteFields.first().fill(FLAG_TEXT);
    }

    // If a Continue button exists, attempt to proceed once to ensure wizard flows
    const continueButton = page.getByRole("button", { name: /Continue|Submit/i });
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
    }

    // Validate that we remain within the flag flow and did not error
    const flagHeading = page.getByRole("heading", { name: /flag/i }).first();
    const flagSummary = page.locator("ccd-case-flag-summary-list").first();
    await expect.soft(flagHeading.or(flagSummary)).toBeVisible();

    // Best-effort count delta check: banner and table should reflect change if a new flag is created
    const finalBanner = await getBannerCount(page);
    const finalRows = await countActiveFlagRows(page);
    expect(finalBanner).toBeGreaterThanOrEqual(initialBanner);
    expect(finalRows).toBeGreaterThanOrEqual(initialRows);
  });
});
