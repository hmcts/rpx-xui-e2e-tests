import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

const CASE_OFFICER = "IAC_CaseOfficer_R2";

const CASE_ID_AAT = "1746778909032144";
const CASE_ID_DEMO = "1662020492250902";

const NON_EXISTENT_CASE_ID = () => {
  const base = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  return base.slice(-16).padStart(16, "9");
};

test.describe("@smoke @search Global search", () => {
  test.beforeEach(async ({ loginAs }) => {
    await loginAs(CASE_OFFICER);
  });

  test("Search from home page find control", async ({ page, axeUtils }) => {
    const caseId = selectCaseId();
    await waitForDashboard(page);
    const caseReference = page.getByRole("textbox", { name: /16-digit case reference/i });
    await expect(caseReference).toBeVisible();
    await caseReference.fill(caseId);
    await retry(async () => {
      await page.locator('//button[contains(text(), "Find")]').click();
      await expect(
        page.getByRole("heading", { name: "Current progress of the case" }),
      ).toBeVisible();
    });
    await axeUtils.audit();

    await expect(page.getByRole("heading", { name: "Do this next" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Case details" })).toBeVisible();
    await expect(page.getByText("Home Office UAN or GWF reference")).toBeVisible();
  });

  test("Search via Search cases screen", async ({ page, axeUtils }) => {
    await openMainMenu(page, "Search", "Search cases");
    await expect(page.getByRole("heading", { name: "Search cases" })).toBeVisible();
    await expect(page.locator("span").filter({ hasText: "-digit case reference" })).toBeVisible();

    await page.getByLabel("16-digit case reference", { exact: true }).fill(NON_EXISTENT_CASE_ID());
    await page.getByRole("button", { name: "Search" }).click();
    const message = page.locator("text=/No results found|Something went wrong/");
    await expect(message).toBeVisible({ timeout: 30_000 });
    await axeUtils.audit();
  });
});

function selectCaseId(): string {
  return process.env.APP_BASE_URL?.includes("demo") ? CASE_ID_DEMO : CASE_ID_AAT;
}

async function waitForDashboard(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByLabel(/16-?digit case reference/i)).toBeVisible({ timeout: 15_000 });
}

async function openMainMenu(page: Page, item: string, waitForText: string): Promise<void> {
  await retry(async () => {
    await page.getByRole("link", { name: item }).click();
    await page.waitForSelector(`text=${waitForText}`, { state: "visible", timeout: 10_000 });
  });
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
