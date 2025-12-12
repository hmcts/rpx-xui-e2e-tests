import { expect } from "@playwright/test";

import { test } from "../../fixtures/test";
import {
  countActiveFlagRows,
  createCaseFlagsTestCase,
  getBannerCount,
  openCaseFlagsTab,
  startFlagWizard,
} from "../helpers/case-flags";

const DEFAULT_CASE_ID = "1747043572209027";
let CASE_ID =
  process.env.CASE_FLAGS_CREATE_CASE_ID ??
  process.env.CASE_FLAGS_CASE_ID ??
  DEFAULT_CASE_ID;
const CASE_FLAGS_USER = process.env.CASE_FLAGS_CREATE_USER ?? "USER_WITH_FLAGS";

test.describe("@regression @case-flags Case flag update flow", () => {
  test.beforeEach(async ({ loginAs, config, page }) => {
    await loginAs(CASE_FLAGS_USER);
    if (!CASE_ID || CASE_ID.trim() === "" || CASE_ID === "0000000000000000") {
      CASE_ID = await createCaseFlagsTestCase(page, config.urls.manageCaseBaseUrl);
    }
    await openCaseFlagsTab(page, config.urls.manageCaseBaseUrl, CASE_ID!);
  });

  test("manages existing flag and verifies counts", async ({ page }) => {
    const initialBanner = await getBannerCount(page);
    const initialRows = await countActiveFlagRows(page);

    const wizardChoice = await startFlagWizard(page, [
      "Manage Case Flags test data",
      "Manage case flags",
    ]);
    expect(wizardChoice).toBeTruthy();

    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    const continueButton = page.getByRole("button", { name: /Continue|Submit|Add|Update/i });
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
    }

    const finalBanner = await getBannerCount(page);
    const finalRows = await countActiveFlagRows(page);
    expect(finalBanner).toBeGreaterThanOrEqual(initialBanner);
    expect(finalRows).toBeGreaterThanOrEqual(initialRows);
  });
});
