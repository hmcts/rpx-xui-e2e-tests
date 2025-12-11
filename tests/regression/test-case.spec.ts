import type { TableUtils } from "@hmcts/playwright-common";
import type { Locator, Page, Response } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import type { CaseDetailsPage } from "../../page-objects/pages/exui/caseDetails.po";
import type { CaseListPage } from "../../page-objects/pages/exui/caseList.po";
import type { CreateCasePage } from "../../page-objects/pages/exui/createCase.po";

interface CaseTrigger {
  name?: string;
}

interface CaseTabField {
  label?: string;
  value?: unknown;
}

interface CaseTab {
  label?: string;
  fields?: CaseTabField[];
}

interface CaseDetailsPayload {
  triggers?: CaseTrigger[];
  tabs?: CaseTab[];
}

interface WorkbasketFieldType {
  type?: string;
  fixed_list_items?: { label?: string }[];
}

interface WorkbasketInput {
  field?: { id?: string; label?: string };
  field_type?: WorkbasketFieldType;
}

interface WorkbasketMetadata {
  workbasketInputs?: WorkbasketInput[];
}

const suiteEnabled = process.env.TEST_CASE_ENABLED !== "0";
const CASE_JURISDICTION = process.env.TEST_CASE_JURISDICTION ?? "Family Divorce";
const CASE_TYPE = process.env.TEST_CASE_TYPE ?? "XUI Case PoC";
const CASE_STATE = process.env.TEST_CASE_STATE ?? "Case created";
const WORKBASKET_CASE_TYPE =
  process.env.TEST_CASE_WORKBASKET_CASE_TYPE ?? "XUI Test Case type dev";
const EVENT_OPTION = process.env.TEST_CASE_EVENT_OPTION;
const hasSolicitorCreds =
  Boolean(process.env.SOLICITOR_USERNAME?.trim()) &&
  Boolean(process.env.SOLICITOR_PASSWORD?.trim());

test.describe("@regression @caselist Case list and details parity", () => {
  test.slow();
  test.setTimeout(60_000);

  if (!suiteEnabled) {
    test("suite disabled", async () => {
      throw new Error("TEST_CASE_ENABLED=0; enable to run this suite.");
    });
    return;
  }

  test.beforeEach(async ({ loginAs, caseListPage }) => {
    if (!hasSolicitorCreds) {
      throw new Error("Solicitor credentials are not configured");
    }
    await loginAs("SOLICITOR");
    await caseListPage.goto();
  });

  test("Next steps dropdown aligns with case triggers and tabs", async ({
    page,
    caseListPage,
    caseDetailsPage,
    createCasePage,
    tableUtils,
  }) => {
    await applyCaseFilters(caseListPage, { jurisdiction: CASE_JURISDICTION, caseType: CASE_TYPE });

    await ensureResultsOrCreateCase({
      page,
      caseListPage,
      caseDetailsPage,
      createCasePage,
      tableUtils,
      caseType: CASE_TYPE,
      jurisdiction: CASE_JURISDICTION,
    });

    const caseDetailsResponse = waitForCaseDetailsResponse(page);
    await openFirstCase(caseListPage, caseDetailsPage);
    const payload = await caseDetailsResponse;

    await expect(caseDetailsPage.exuiCaseDetailsComponent.caseHeader).toBeVisible();
    await assertNextStepsMatchTriggers(page, payload.triggers ?? []);
    await assertTabsMatchApi(page, payload.tabs ?? []);
  });

  test("Workbasket filters mirror metadata from case type API", async ({
    page,
    caseListPage,
  }) => {
    const workbasketResponse = waitForWorkbasketMetadata(page);
    await applyCaseFilters(caseListPage, {
      jurisdiction: CASE_JURISDICTION,
      caseType: WORKBASKET_CASE_TYPE,
      state: CASE_STATE,
    });
    await expect(caseListPage.exuiCaseListComponent.filters.applyFilterBtn).toBeVisible();
    const metadata = await workbasketResponse;
    const inputs = metadata.workbasketInputs ?? [];
    await assertWorkbasketInputs(page, inputs);
    await assertWorkbasketComplexValues(page, inputs);
  });

  test("Create case wizard surfaces validation errors for invalid data", async ({
    page,
    createCasePage,
  }) => {
    await createCasePage.createCaseButton.click();
    await selectOptionOrSkip(createCasePage.jurisdictionSelect, "DIVORCE", "Create case jurisdiction");
    await waitForEnabled(createCasePage.caseTypeSelect);
    await selectOptionOrSkip(createCasePage.caseTypeSelect, "xuiTestCaseType_dev", "Create case type");
    await createCasePage.startButton.click();

    await page.getByRole("heading", { name: "Page 1 header" }).waitFor({ state: "visible" });
    await page.getByRole("textbox", { name: "Text Field" }).fill("test");
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("textbox", { name: "Email" }).fill("1@2.c");
    await page.getByRole("textbox", { name: "Phone UK" }).fill("012345678");

    const dateGroup = page.getByRole("group", { name: "Date", exact: true });
    await dateGroup.getByLabel("Day").fill("34");
    await dateGroup.getByLabel("Month").fill("12");
    await dateGroup.getByLabel("Year").fill("2024");

    const dateTimeGroup = page.getByRole("group", { name: "Date Time" });
    await dateTimeGroup.getByLabel("Day").fill("36");
    await dateTimeGroup.getByLabel("Month").fill("12");
    await dateTimeGroup.getByLabel("Year").fill("2024");

    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("textbox", { name: "Money GBP" }).fill("12");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: /could not be created/i })).toBeVisible();
    await expect(page.getByText(/not valid/i)).toBeVisible();
  });
});

async function applyCaseFilters(
  caseListPage: CaseListPage,
  options: { jurisdiction: string; caseType: string; state?: string },
): Promise<void> {
  await selectOptionOrSkip(caseListPage.jurisdictionSelect, options.jurisdiction, "Jurisdiction option missing");
  await selectOptionOrSkip(caseListPage.caseTypeSelect, options.caseType, "Case type option missing");
  if (options.state) {
    await selectOptionOrSkip(
      caseListPage.exuiCaseListComponent.filters.caseStateFilter,
      options.state,
      "Case state option missing",
    );
  }
  await caseListPage.exuiCaseListComponent.filters.applyFilterBtn.click();
  await caseListPage.exuiSpinnerComponent.wait();
  await expect(caseListPage.container).toBeVisible();
}

async function ensureResultsOrCreateCase({
  page,
  caseListPage,
  caseDetailsPage,
  createCasePage,
  tableUtils,
  caseType,
  jurisdiction,
}: {
  page: Page;
  caseListPage: CaseListPage;
  caseDetailsPage: CaseDetailsPage;
  createCasePage: CreateCasePage;
  tableUtils: TableUtils;
  caseType: string;
  jurisdiction: string;
}): Promise<void> {
  const hasRows = await caseListHasRows(caseListPage, tableUtils);
  if (hasRows) return;

  const uniqueMarker = `auto-${Date.now()}`;
  await createCasePage.createDivorceCase("DIVORCE", caseType, uniqueMarker);
  await expect(createCasePage.exuiCaseDetailsComponent.caseHeader).toBeVisible();
  await createCasePage.exuiCaseDetailsComponent.returnToCaseList();
  await applyCaseFilters(caseListPage, { jurisdiction, caseType });
}

async function caseListHasRows(
  caseListPage: CaseListPage,
  tableUtils: TableUtils,
): Promise<boolean> {
  try {
    const rows = await tableUtils.mapExuiTable(caseListPage.exuiCaseListComponent.caseListTable);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function openFirstCase(
  caseListPage: CaseListPage,
  caseDetailsPage: CaseDetailsPage,
): Promise<void> {
  const firstLink = caseListPage.exuiCaseListComponent.resultLinks.first();
  await expect(firstLink).toBeVisible();
  await firstLink.click();
  await caseListPage.exuiSpinnerComponent.wait();
  await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
}

async function waitForCaseDetailsResponse(page: Page): Promise<CaseDetailsPayload> {
  const response = await page.waitForResponse(
    (res) => res.request().method() === "GET" && res.url().includes("/data/internal/cases/"),
    { timeout: 20_000 },
  );
  return (await safeJson<CaseDetailsPayload>(response)) ?? {};
}

async function waitForWorkbasketMetadata(page: Page): Promise<WorkbasketMetadata> {
  const response = await page.waitForResponse(
    (res) =>
      res.request().method() === "GET" &&
      res.url().includes("/data/internal/case-types/"),
    { timeout: 20_000 },
  );
  return (await safeJson<WorkbasketMetadata>(response)) ?? {};
}

async function safeJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

async function assertNextStepsMatchTriggers(page: Page, triggers: CaseTrigger[]): Promise<void> {
  expect(triggers.length).toBeGreaterThan(0);
  const dropdown = page.getByLabel("Next step");
  await expect(dropdown).toBeVisible();
  const options = (await dropdown.locator("option").allInnerTexts())
    .map((text) => text.trim())
    .filter(Boolean);
  const expected = triggers
    .map((trigger) => trigger.name?.trim())
    .filter(Boolean)
    .filter((name, index, arr) => arr.indexOf(name) === index);
  expected.forEach((eventName) => expect(options).toContain(eventName));

  if (EVENT_OPTION) {
    await dropdown.selectOption({ label: EVENT_OPTION });
    await page.getByRole("button", { name: /^Go$/ }).click();
    await expect(page.getByRole("heading", { name: /Update case/i })).toBeVisible({ timeout: 15_000 });
  }
}

async function assertTabsMatchApi(page: Page, tabs: CaseTab[]): Promise<void> {
  expect(tabs.length).toBeGreaterThan(0);
  const tabLocators = page.getByRole("tab");
  const tabCount = await tabLocators.count();
  const tabLabels = await Promise.all(
    Array.from({ length: tabCount }, (_, index) => tabLocators.nth(index).innerText().then((t) => t.trim())),
  );
  const expectedLabels = tabs
    .map((tab) => tab.label?.trim())
    .filter(Boolean)
    .filter((label, index, arr) => arr.indexOf(label) === index);
  expectedLabels.forEach((label) => expect(tabLabels).toContain(label));
}

async function assertWorkbasketInputs(page: Page, inputs: WorkbasketInput[]): Promise<void> {
  expect(inputs.length).toBeGreaterThan(0);
  for (const input of inputs) {
    const fieldId = input.field?.id;
    if (!fieldId) continue;
    const fieldLocator = page.locator(`[id="${fieldId}"]`);
    await expect(fieldLocator).toBeVisible();
  }
}

async function assertWorkbasketComplexValues(page: Page, inputs: WorkbasketInput[]): Promise<void> {
  for (const input of inputs) {
    if (input.field_type?.type !== "FixedRadioList") continue;
    const options = input.field_type.fixed_list_items ?? [];
    for (const option of options) {
      if (!option.label) continue;
      await expect.soft(page.getByText(option.label, { exact: false })).toBeVisible();
    }
  }
}

async function selectOptionOrSkip(select: Locator, label: string, reason: string): Promise<void> {
  await select.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {
    throw new Error(`Select not visible: ${reason}`);
  });

  // Wait for the control to be enabled and options to load
  const options = await waitForOptions(select);
  const fallback = options.find((option) => option.length > 0 && option !== "Please select");
  const target = options.includes(label) ? label : fallback;
  if (!target) {
    throw new Error(reason);
  }
  await waitForEnabled(select);
  await select.selectOption({ label: target });
}

async function waitForOptions(select: Locator): Promise<string[]> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const options = (await select.locator("option").allInnerTexts()).map((text) => text.trim());
    if (options.length > 1) {
      return options;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return (await select.locator("option").allInnerTexts()).map((text) => text.trim());
}

async function waitForEnabled(select: Locator): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const enabled = await select.isEnabled().catch(() => false);
    if (enabled) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const labels = await select.locator("option").allInnerTexts().catch(() => []);
  throw new Error(
    `Select stayed disabled after waiting 30s. Options seen: ${labels.map((l) => l.trim()).join(", ")}`,
  );
}
