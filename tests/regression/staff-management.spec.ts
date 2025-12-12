import { expect } from "@playwright/test";

import { test } from "../../fixtures/test";
import { navigateToStaff, runSimpleStaffSearch } from "../helpers/staff";

const STAFF_ADMIN = "STAFF_ADMIN";
const staffSearchEnabled =
  process.env.STAFF_SEARCH_ENABLED === undefined || process.env.STAFF_SEARCH_ENABLED === "true";

const SEARCH_TERM = process.env.STAFF_REGRESSION_SEARCH_TERM ?? "xui";

const runStaffRegression = () => {
  test.beforeEach(async ({ loginAs, config, page }) => {
    await loginAs(STAFF_ADMIN);
    await navigateToStaff(page, config.urls.manageCaseBaseUrl);
    await runSimpleStaffSearch(page, SEARCH_TERM);
  });

  test("Staff user details show core profile metadata", async ({ page }) => {
    const firstUserLink = page.locator("exui-staff-user-list a").first();
    await expect(firstUserLink).toBeVisible();
    const userName = await firstUserLink.innerText();
    const userLink = firstUserLink;
    await userLink.click();

    await expect(page.getByRole("heading", { name: "User details" })).toBeVisible();
    await expect(page.getByText("Name")).toBeVisible();
    await expect(page.getByText("Email address")).toBeVisible();
    await expect(page.getByText("Service", { exact: true })).toBeVisible();
    await expect(page.getByText("User type")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.locator("dl")).toContainText(userName.split(" ")[0]);
  });

  test("Add new user wizard enforces validation errors", async ({ page }) => {
    await page.getByRole("button", { name: "Add new user" }).click();
    await expect(page.getByRole("heading", { name: "Add user" })).toBeVisible();

    await page.locator("#first_name").fill("firstName1");
    await page.locator("#last_name").fill("LastName1");
    await page.locator("#email_id").fill("firstName1LastName1test@justice.co.uk");
    await page.locator("#region_id").selectOption("1");
    await page.getByLabel("Specified Money Claims").check();
    await page.getByLabel("Damages").check();
    await page.getByLabel("Family Public Law").check();
    await page.getByLabel("Family Private Law").check();
    await page.getByLabel("Enter a location name").fill("Lo");
    await page.getByText("East London").click();
    await page.getByRole("link", { name: "Add primary location" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("link", { name: "Select a user type" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Select at least one job title" })).toBeVisible();

    await page.locator("#user_type").selectOption("Legal office");
    await page.getByLabel("CICA Caseworker").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: /Check your answers/i })).toBeVisible();

    await page.getByRole("link", { name: "Change name" }).click();
    await page.locator("#first_name").fill("FirstName2");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("heading", { name: "User search" })).toBeVisible();
  });
};

test.describe("@regression @staff Staff management journeys", () => {
  test.slow();
  test.setTimeout(60_000);

  if (!staffSearchEnabled) {
    test("staff search disabled", async () => {
      throw new Error("STAFF_SEARCH_ENABLED=false; enable to run staff management journeys.");
    });
    return;
  }
  runStaffRegression();
});
