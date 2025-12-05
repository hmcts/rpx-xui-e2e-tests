import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

const CASE_FLAGS_USER = "USER_WITH_FLAGS";
const CASE_FLAGS_CASE_ID = process.env.CASE_FLAGS_CASE_ID ?? "1747043572209027";

test.describe("@smoke @case-flags Case flags", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs(CASE_FLAGS_USER);
  });

  test("Case flags | Banner count matches table entries", async ({ page, config }) => {
    await gotoCaseDetails(page, config.urls.manageCaseBaseUrl);

    const bannerCount = await getActiveBannerCount(page);
    await expect(page.getByText(new RegExp(`There are ${bannerCount} active flags`))).toBeVisible();

    await page.getByText("Case flags", { exact: true }).click();

    const activeRows = await countActiveFlagRows(page);
    expect(activeRows).toBe(bannerCount);
  });
});

async function gotoCaseDetails(page: Page, casesBaseUrl: string): Promise<void> {
  const url = `${casesBaseUrl}/case-details/${CASE_FLAGS_CASE_ID}`;
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("text=Case flags", { timeout: 15_000 }).catch(() => undefined);
}

async function getActiveBannerCount(page: Page): Promise<number> {
  const banner = page.getByLabel("Important");
  const text = await banner.innerText();
  const match = /(\d+)/.exec(text);
  return match ? Number.parseInt(match[0], 10) : 0;
}

async function countActiveFlagRows(page: Page): Promise<number> {
  const statusCells = page.locator("ccd-case-flag-table tbody tr td.cell-flag-status");
  const rowCount = await statusCells.count();
  let activeCount = 0;
  for (let index = 0; index < rowCount; index += 1) {
    const value = await statusCells.nth(index).innerText();
    if (value.trim().toLowerCase() === "active") {
      activeCount += 1;
    }
  }
  return activeCount;
}
