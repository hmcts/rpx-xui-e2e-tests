import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

const STAFF_ADMIN = "STAFF_ADMIN";

const DEFAULT_SEARCH_TERM = "xui";

const STAFF_URL_TEXT = "User list";

const staffSearchEnabled = process.env.STAFF_SEARCH_ENABLED !== "false";

const describeOrSkip = staffSearchEnabled ? test.describe : test.describe.skip;
describeOrSkip("@smoke @staff Staff search", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs(STAFF_ADMIN);
  });

  test("Simplified search shows single result", async ({ page, config }) => {
    await navigateToStaff(page, config.urls.manageCaseBaseUrl);
    await runSimpleSearch(page);
    await expect(page.locator("exui-staff-user-list")).toContainText("Showing 1");
  });

  test("Simplified search displays table headers", async ({ page, axeUtils, config }) => {
    await navigateToStaff(page, config.urls.manageCaseBaseUrl);
    await runSimpleSearch(page);
    await expect(page.getByRole("columnheader", { name: "Job title" })).toBeVisible();
    await expect(page.locator("exui-staff-user-list")).toContainText("Showing 1");
    await axeUtils.audit();
  });

  test("Toggle between simple and advanced search", async ({ page, config }) => {
    await navigateToStaff(page, config.urls.manageCaseBaseUrl);
    await page.locator("#content").getByRole("textbox").fill(DEFAULT_SEARCH_TERM);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: "Advanced search" }).click();
    await page.locator("#select_user-job-title").selectOption("2");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("Showing")).toBeVisible();
    await page.getByRole("button", { name: "Hide advanced search" }).click();
    await expect(page.locator("#content").getByRole("textbox")).toBeVisible();
    await page.getByText("User search Search for a user").click();
    await page.getByRole("button", { name: "Advanced search" }).click();
    await expect(page.locator("#select_user-job-title")).toBeVisible();
  });

  test("Advanced search by service and location", async ({ page, axeUtils, config }) => {
    await navigateToStaff(page, config.urls.manageCaseBaseUrl);
    await page.locator("#content").getByRole("textbox").fill(DEFAULT_SEARCH_TERM);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator("exui-staff-user-list")).toContainText("Showing 1");

    await page.getByRole("button", { name: "Advanced search" }).click();
    await expect(page.getByText("Search for a service by name")).toBeVisible();
    await page.locator("#inputServiceSearch").fill("Damages");
    await page.getByRole("option", { name: "Damages" }).locator("span").click();
    await page.getByRole("link", { name: "Add service" }).click();
    await page.locator("#inputLocationSearch").fill("Bir");
    await page.getByRole("option", { name: "Birmingham" }).locator("span").click();
    await page.getByRole("link", { name: "Add location" }).click();
    await page.locator("#select_user-type").selectOption("3");
    await page.getByLabel("Case allocator").check();
    await page.locator("#select_user-job-title").selectOption("2");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator("#user-list-no-results")).toContainText("No results found");
    await axeUtils.audit();
  });
});

async function navigateToStaff(page: Page, baseUrl: string): Promise<void> {
  const staffLink = page.getByRole("link", { name: "Staff" });
  const visible = await staffLink
    .isVisible()
    .catch(() => false);

  if (visible) {
    await retry(async () => {
      await staffLink.click();
      await page.waitForSelector(`text=${STAFF_URL_TEXT}`, { state: "visible", timeout: 2_000 });
    });
    return;
  }

  await page.goto(`${baseUrl}/staff/user-search`);
  await page.waitForSelector(`text=${STAFF_URL_TEXT}`, { state: "visible", timeout: 5_000 });
}

async function runSimpleSearch(page: Page): Promise<void> {
  await page.locator("#content").getByRole("textbox").fill(DEFAULT_SEARCH_TERM);
  await page.getByRole("button", { name: "Search", exact: true }).click();
}

async function retry(action: () => Promise<void>, attempts = 5): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await action();
      return;
    } catch (error) {
      if (i === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}
