import { expect, test } from "../../fixtures/test";
import { navigateToStaff, runSimpleStaffSearch } from "../helpers/staff";

const STAFF_ADMIN = "STAFF_ADMIN";

const DEFAULT_SEARCH_TERM = process.env.STAFF_SEARCH_TERM ?? "xui";
const isA11yBlocking = process.env.A11Y_BLOCKING !== "0";

const staffSearchEnabled =
  process.env.STAFF_SEARCH_ENABLED === undefined || process.env.STAFF_SEARCH_ENABLED === "true";

test.describe("@smoke @staff Staff search", () => {
  /* eslint-disable playwright/no-skipped-test -- env/availability driven skips */
  test.skip(!staffSearchEnabled, "Staff search disabled for this environment");

  test.beforeEach(async ({ loginAs }) => {
    await loginAs(STAFF_ADMIN);
  });

  test("Staff search | Simplified search returns results", async ({ page, config }) => {
    await navigateToStaff(page, config.urls.manageCaseBaseUrl);
    await runSimpleStaffSearch(page, DEFAULT_SEARCH_TERM);
    await expect(page.locator("exui-staff-user-list")).toContainText("Showing");
  });

  test("Staff search | Simplified search displays table headers", async ({
    page,
    axeUtils,
    config,
  }) => {
    await navigateToStaff(page, config.urls.manageCaseBaseUrl);
    await runSimpleStaffSearch(page, DEFAULT_SEARCH_TERM);
    await expect(page.getByRole("columnheader", { name: "Job title" })).toBeVisible();
    await expect(page.locator("exui-staff-user-list")).toContainText("Showing");
    await axeUtils.audit({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
  });

  test("Staff search | Toggle between simple and advanced search", async ({ page, config }) => {
    await navigateToStaff(page, config.urls.manageCaseBaseUrl);
    await runSimpleStaffSearch(page, DEFAULT_SEARCH_TERM);
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

  test("Staff search | Advanced search by service and location", async ({
    page,
    axeUtils,
    config,
  }) => {
    await navigateToStaff(page, config.urls.manageCaseBaseUrl);
    await runSimpleStaffSearch(page, DEFAULT_SEARCH_TERM);
    await expect(page.locator("exui-staff-user-list")).toContainText("Showing");

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
    if (isA11yBlocking) {
      await axeUtils.audit({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    }
  });
  /* eslint-enable playwright/no-skipped-test */
});
