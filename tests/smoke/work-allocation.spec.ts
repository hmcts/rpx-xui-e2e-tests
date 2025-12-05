import type { Page } from "@playwright/test";

import { test, expect } from "../../fixtures/test";

const CASE_WORKER = "IAC_CaseOfficer_R2";
const workAllocationEnabled =
  process.env.WORK_ALLOCATION_ENABLED === undefined ||
  process.env.WORK_ALLOCATION_ENABLED === "true";

const runSuite = () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs(CASE_WORKER);
  });

  test("All work tabs show expected headers", async ({ page }) => {
    await navigateToMyWork(page);
    await expect(page.getByRole("link", { name: "All work" })).toBeVisible();
    await page.getByRole("link", { name: "All work" }).click();
    await expect(page.getByText("View and manage all tasks")).toBeVisible();
    await expect(page.getByRole("link", { name: "Tasks" })).toBeVisible();
    await assertTaskTableColumns(page, { showPerson: true, showHearingDate: false });
  });

  test("My work tabs cycle through all sub-tabs", async ({ page, axeUtils }) => {
    await navigateToMyWork(page);
    await assertTaskTableColumns(page, { showPerson: false, showHearingDate: true });
    await expect(page.getByRole("link", { name: "Available tasks" })).toBeVisible();
    await axeUtils.audit();

    await page.getByRole("link", { name: "Available tasks" }).click();
    await expect(page.locator('[data-test="search-result-summary__text"]')).toBeVisible();
    await assertTaskTableColumns(page, { showPerson: false, showHearingDate: true });
    await expect(page.getByRole("link", { name: "My cases" })).toBeVisible();
    await axeUtils.audit();

    await page.getByRole("link", { name: "My cases" }).click();
    await expect(page.getByText("Showing 0 results")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Case name" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Service", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Case category" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Case role" })).toBeVisible();
    await expect(page.getByRole("button", { name: "▼ Hearing date ▲" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "End" })).toBeVisible();
    await axeUtils.audit();
  });

  test("Primary navigation covers My work, All work, Create case, Case list", async ({
    page,
    axeUtils,
  }) => {
    await navigateToMyWork(page);
    await assertPrimaryNav(page);

    await page.getByRole("link", { name: "All work" }).click();
    await expect(page.getByRole("heading", { name: "All work" })).toBeVisible();
    await assertPrimaryNav(page);

    await page.getByRole("link", { name: "Create case" }).click();
    await expect(page.getByRole("heading", { name: "Create Case" })).toBeVisible();
    await assertPrimaryNav(page);

    await page.getByRole("link", { name: "My work" }).click();
    await expect(page.locator('[data-test="search-result-summary__text"]')).toBeVisible();
    await assertTaskTableColumns(page, { showPerson: false, showHearingDate: true });
    const caseCategorySort = page.getByRole("button", { name: /Case category/ }).first();
    await expect(caseCategorySort).toBeVisible();
    await caseCategorySort.click();

    await page.getByRole("link", { name: "Case list" }).click();
    await expect(page.getByRole("heading", { name: "Case list" })).toBeVisible();
    await assertPrimaryNav(page);
    await axeUtils.audit();
  });
};

if (workAllocationEnabled) {
  test.describe("@smoke @wa Work allocation navigation", runSuite);
} else {
  // eslint-disable-next-line playwright/no-skipped-test
  test.describe.skip("@smoke @wa Work allocation navigation", runSuite);
}

async function assertPrimaryNav(page: Page) {
  await expect(page.getByRole("link", { name: "My work" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Case list" })).toBeVisible();
  await expect(page.getByRole("link", { name: "All work" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create case" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Search" })).toBeVisible();
}

async function assertTaskTableColumns(
  page: Page,
  options: { showPerson: boolean; showHearingDate: boolean },
) {
  await expect(page.getByRole("button", { name: "▼ Case name ▲" })).toBeVisible();
  await expect(page.getByRole("button", { name: "▼ Case category ▲" })).toBeVisible();
  await expect(page.getByRole("button", { name: "▼ Location ▲" })).toBeVisible();
  await expect(page.getByRole("button", { name: "▼ Task ▲" })).toBeVisible();
  if (options.showPerson) {
    await expect(page.getByRole("heading", { name: "Person" })).toBeVisible();
  }
  if (options.showHearingDate) {
    await expect(page.getByRole("button", { name: "▼ Hearing date ▲" })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "▼ Due date ▲" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Priority" })).toBeVisible();
  await expect(page.getByRole("button", { name: "▼ Task created ▲" })).not.toBeVisible();
}

async function navigateToMyWork(page: Page) {
  await page.getByRole("link", { name: "My work" }).click();
  if (await isNotAuthorised(page)) {
    throw new Error(
      "Work allocation user is not authorised in this environment. Verify role setup or set WORK_ALLOCATION_ENABLED=false to disable this suite.",
    );
  }
  await expect(page.getByRole("heading", { name: "My work" })).toBeVisible();
  await expect(page.getByText("Use the work filter to show")).toBeVisible();
  await expect(page.locator('[data-test="search-result-summary__text"]')).toBeVisible();
}

async function isNotAuthorised(page: Page): Promise<boolean> {
  try {
    await page
      .getByRole("heading", { name: /not authoris/i })
      .waitFor({ state: "visible", timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}
