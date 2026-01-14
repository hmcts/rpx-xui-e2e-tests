import { IdamPage } from "@hmcts/playwright-common";
import type { Browser, Cookie, Locator, Page } from "@playwright/test";

import { expect, test as baseTest } from "../../../../fixtures/ui";
import { CaseDetailsPage } from "../../../../page-objects/pages/exui/caseDetails.po.js";
import { CaseListPage } from "../../../../page-objects/pages/exui/caseList.po.js";
import { CaseSearchPage } from "../../../../page-objects/pages/exui/caseSearch.po.js";
import { loadSessionCookies } from "../utils/session.utils.js";

const test = baseTest.extend({
  autoAcceptAnalytics: async ({ page: _page }, use) => {
    await use(undefined);
  },
  attachUserContext: async ({ page: _page }, use) => {
    await use(undefined);
  }
});

const solicitorUserIdentifier = "CIVIL_SOLICITOR";
const hmctsUserIdentifier = "CIVIL_HMCTS_STAFF";
const hasSolicitorCreds = Boolean(
  process.env.CIVIL_SOLICITOR_USERNAME && process.env.CIVIL_SOLICITOR_PASSWORD
);
const hasHmctsCreds = Boolean(
  process.env.CIVIL_HMCTS_STAFF_USERNAME && process.env.CIVIL_HMCTS_STAFF_PASSWORD
);
const solicitorEmail = process.env.CIVIL_SOLICITOR_USERNAME ?? "";
const hmctsEmail = process.env.CIVIL_HMCTS_STAFF_USERNAME ?? "";

type QueryRow = {
  table: Locator;
  row: Locator;
};

const resolveExuiBaseUrl = (manageCaseBaseUrl: string): string =>
  manageCaseBaseUrl.replace(/\/cases\/?$/i, "");
type CaseMeta = {
  jurisdiction?: string;
  caseType?: string;
};

type CaseOverride = {
  caseReference: string;
  jurisdiction: string;
  caseType: string;
};

type CaseMetaHint = {
  jurisdiction?: string;
  caseType?: string;
};

const normalizeEnvValue = (value: string | undefined): string | undefined => {
  return value?.trim() || undefined;
};

const getCaseOverride = (): CaseOverride | null => {
  const caseReference = normalizeEnvValue(process.env.EXUI_3695_CASE_REFERENCE);
  const jurisdiction = normalizeEnvValue(process.env.EXUI_3695_CASE_JURISDICTION);
  const caseType = normalizeEnvValue(process.env.EXUI_3695_CASE_TYPE);
  if (!caseReference || !jurisdiction || !caseType) return null;
  return { caseReference, jurisdiction, caseType };
};

const getCaseMetaHint = (): CaseMetaHint => ({
  jurisdiction: normalizeEnvValue(process.env.EXUI_3695_CASE_JURISDICTION),
  caseType: normalizeEnvValue(process.env.EXUI_3695_CASE_TYPE)
});

const getCaseListIndex = (): number | null => {
  const raw = normalizeEnvValue(process.env.PW_UI_CASE_LIST_INDEX);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeEmail = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed || undefined;
};

const waitForLoginOrApp = async (page: Page, timeoutMs = 60_000): Promise<"login" | "app"> => {
  const loginInput = page.locator(
    'input#username, input[name="username"], input[type="email"], input#email, input[name="email"], input[name="emailAddress"], input[autocomplete="email"]'
  );
  const appReady = page.locator(
    "exui-app-header, exui-header, exui-case-home, exui-case-details-home"
  );
  const outcome = await Promise.race([
    loginInput.first().waitFor({ state: "visible", timeout: timeoutMs }).then(() => "login"),
    appReady.first().waitFor({ state: "visible", timeout: timeoutMs }).then(() => "app")
  ]).catch(() => null);
  if (!outcome) {
    throw new Error(`Login form not visible. URL=${page.url()}`);
  }
  return outcome as "login" | "app";
};

const normalizeHeader = (value: string): string =>
  value.replaceAll(/\s+/g, " ").trim().toLowerCase();

const getQueriesNavigationCandidates = (page: Page): Locator[] => {
  // Depending on EXUI version/case type, Queries can be exposed as "Queries" or "Service Request(s)".
  // EXUI can also render this as a proper ARIA tab, or as a link/button depending on layout.
  // In responsive layouts the element may exist but not be visible (overflow).
  return [
    page.getByRole("tab", { name: /^queries(\b|\s|\()/i }),
    page.getByRole("tab", { name: /queries/i }),
    page.getByRole("tab", { name: /^service requests?(\b|\s|\()/i }),
    page.getByRole("tab", { name: /service requests?/i }),
    page.locator('[role="tab"]').filter({ hasText: /queries/i }),
    page.locator('[role="tab"]').filter({ hasText: /service requests?/i }),
    page.getByRole("link", { name: /queries/i }),
    page.getByRole("link", { name: /service requests?/i }),
    page.getByRole("button", { name: /queries/i }),
    page.getByRole("button", { name: /service requests?/i })
  ];
};

const getFirstExistingLocator = async (locators: Locator[]): Promise<Locator | null> => {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    if (count > 0) return locator.first();
  }
  return null;
};

const getTabNamesForDiagnostics = async (page: Page): Promise<string[]> => {
  const tabTexts = await page
    .locator('[role="tab"]')
    .allTextContents()
    .catch(() => [] as string[]);
  return tabTexts
    .map((t) => t.replaceAll(/\s+/g, " ").trim())
    .filter(Boolean);
};

const openTabOverflowMenuIfPresent = async (page: Page): Promise<boolean> => {
  const tablist = page.locator('[role="tablist"]').first();
  const tablistExists = await tablist.count().catch(() => 0);
  if (!tablistExists) return false;

  const candidates: Locator[] = [
    tablist.getByRole("button", { name: /^more$/i }),
    tablist.getByRole("button", { name: /more/i }),
    tablist.locator('button[aria-haspopup="menu"]'),
    tablist.locator('button[aria-label*="More"], button[aria-label*="more"], button[title*="More"], button[title*="more"]'),
  ];

  const trigger = await getFirstExistingLocator(candidates);
  if (!trigger) return false;

  const isVisible = await trigger.isVisible().catch(() => false);
  if (!isVisible) return false;

  await trigger.click();

  // Different UI libs use menu/listbox; don't hard-fail if the container role differs.
  const menuOrListbox = page.locator('[role="menu"], [role="listbox"]').first();
  await menuOrListbox.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
  return true;
};

type QueriesNav = { locator: Locator; kind: "tab" | "link" | "button" | "menuitem" };

const findQueriesNavigation = async (page: Page): Promise<QueriesNav | null> => {
  const direct = await getFirstExistingLocator(getQueriesNavigationCandidates(page));
  if (direct) {
    const role = (await direct.getAttribute("role").catch(() => null)) ?? "";
    if (role === "tab") return { locator: direct, kind: "tab" };
    return { locator: direct, kind: "link" };
  }

  const opened = await openTabOverflowMenuIfPresent(page);
  if (!opened) return null;

  const menuCandidate = await getFirstExistingLocator([
    page.getByRole("menuitem", { name: /queries|service requests?/i }),
    page.getByRole("menuitemcheckbox", { name: /queries|service requests?/i }),
    page.getByRole("option", { name: /queries|service requests?/i }),
    page.getByRole("link", { name: /queries|service requests?/i }),
    page.getByRole("button", { name: /queries|service requests?/i })
  ]);

  // Close the menu if we didn't find it (or after we found it but before returning, to avoid side effects).
  if (!menuCandidate) {
    await page.keyboard.press("Escape").catch(() => undefined);
    return null;
  }

  // Leave the menu open for the caller to click.
  return { locator: menuCandidate, kind: "menuitem" };
};

const ensureQueriesTabSelected = async (page: Page): Promise<void> => {
  await page.locator('[role="tablist"]').first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);

  const queriesNav = await findQueriesNavigation(page);
  if (!queriesNav) {
    throw new Error(
      "Queries / Service Request navigation not available for the selected case. " +
        "Try setting EXUI_3695_CASE_REFERENCE/EXUI_3695_CASE_JURISDICTION/EXUI_3695_CASE_TYPE to a known case that supports queries/service requests."
    );
  }

  // If it's a tab, only click if not already selected.
  const ariaSelected = await queriesNav.locator.getAttribute("aria-selected").catch(() => null);
  if (ariaSelected === "true") {
    await page.keyboard.press("Escape").catch(() => undefined);
    return;
  }

  await queriesNav.locator.scrollIntoViewIfNeeded().catch(() => undefined);
  const isVisible = await queriesNav.locator.isVisible().catch(() => false);
  if (isVisible) {
    await queriesNav.locator.click();
  } else {
    // Overflow/responsive layouts can keep the element in the DOM but not visible.
    // As a last resort, click with force; if that doesn't navigate, subsequent steps will fail with context.
    await queriesNav.locator.click({ force: true });
  }

  // If we opened a menu to reach Queries, close it.
  await page.keyboard.press("Escape").catch(() => undefined);
};

const ensureQueriesContext = async (page: Page): Promise<void> => {
  // Some EXUI variants navigate to query-management pages where the original tablist
  // is no longer present. Treat those as already in the Queries context.
  if (/\/query-management\//i.test(page.url())) return;

  const queryTable = page
    .locator("table")
    .filter({ has: page.getByRole("columnheader", { name: /query subject/i }) })
    .first();
  if ((await queryTable.count().catch(() => 0)) > 0) {
    const visible = await queryTable.isVisible().catch(() => false);
    if (visible) return;
  }

  await ensureQueriesTabSelected(page);
};

const returnToCaseDetails = async (
  page: Page,
  caseDetailsPage: CaseDetailsPage,
  baseUrl: string,
  caseId: string
): Promise<void> => {
  const back = page.getByRole("link", { name: /go back to the case/i }).first();
  if (await back.isVisible().catch(() => false)) {
    await back.click();
    await caseDetailsPage.waitForReady().catch(() => undefined);
    return;
  }

  // Fallback: the query-management banner pages may not have a back link.
  for (let i = 0; i < 2; i += 1) {
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    const looksLikeCaseDetails = /\/cases\/case-details\//i.test(page.url());
    if (looksLikeCaseDetails) {
      await caseDetailsPage.waitForReady().catch(() => undefined);
      return;
    }
  }

  // Last resort: direct navigation to case details.
  const directUrl = new URL(`/cases/case-details/${caseId}`, baseUrl).toString();
  await page.goto(directUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await caseDetailsPage.waitForReady().catch(() => undefined);
};

const hasQueriesNavigation = async (page: Page): Promise<boolean> => {
  await page.locator('[role="tablist"]').first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
  const found = await findQueriesNavigation(page);
  if (found?.kind === "menuitem") {
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  return Boolean(found);
};

const returnToCaseListSafely = async (
  page: Page,
  caseDetailsPage: CaseDetailsPage,
  caseListPage: CaseListPage,
  manageCasesUrl: string
): Promise<void> => {
  // Prefer in-app navigation to avoid expensive full reloads.
  const goBackToCase = page.getByRole("link", { name: /go back to the case/i }).first();
  if (await goBackToCase.isVisible().catch(() => false)) {
    await goBackToCase.click();
    await caseDetailsPage.waitForReady().catch(() => undefined);
  }

  try {
    await caseDetailsPage.exuiCaseDetailsComponent.returnToCaseList();
    await caseListPage.waitForReady();
    return;
  } catch {
    // Fall through to a hard reset.
  }

  await page.goto(manageCasesUrl, { waitUntil: "domcontentloaded" });
  await caseListPage.waitForReady();
};

const ensureCaseListFiltersVisible = async (caseListPage: CaseListPage): Promise<void> => {
  const toggle = caseListPage.page.getByRole("button", { name: /show filter|hide filter/i });
  if (!(await toggle.isVisible().catch(() => false))) return;
  const label = (await toggle.textContent().catch(() => ""))?.toLowerCase() ?? "";
  if (label.includes("show")) {
    await toggle.click();
  }
};

const pickOptionByLabel = (
  options: Array<{ value: string; label: string }>,
  predicate: (label: string) => boolean
): { value: string; label: string } | undefined =>
  options.find((o) => o.value && predicate(o.label));

const tryApplyCivilCaseListFilters = async (caseListPage: CaseListPage): Promise<void> => {
  const page = caseListPage.page;
  const hint = getCaseMetaHint();
  await ensureCaseListFiltersVisible(caseListPage);

  const jurisdictionSelect = await getFirstExistingLocator([
    page.locator("#wb-jurisdiction"),
    page.getByLabel(/jurisdiction/i),
    page.locator("select[name='jurisdiction']"),
    page.locator("select[formcontrolname='jurisdiction']")
  ]);

  if (jurisdictionSelect && (await jurisdictionSelect.isVisible().catch(() => false))) {
    const options = await jurisdictionSelect
      .locator("option")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          value: node.getAttribute("value") ?? "",
          label: (node.textContent ?? "").replaceAll(/\s+/g, " ").trim()
        }))
      )
      .catch(() => [] as Array<{ value: string; label: string }>);

    const preferred =
      (hint.jurisdiction
        ? pickOptionByLabel(options, (l) => l.toLowerCase() === hint.jurisdiction!.toLowerCase())
        : undefined) ??
      pickOptionByLabel(options, (l) => /civil/i.test(l));

    if (preferred) {
      await jurisdictionSelect.selectOption({ value: preferred.value });
      await caseListPage.waitForUiIdleStateLenient(15_000);
    }
  }

  const caseTypeSelect = await getFirstExistingLocator([
    page.locator("#wb-case-type"),
    page.getByLabel(/case type/i),
    page.locator("select[name='caseType']"),
    page.locator("select[formcontrolname='caseType']")
  ]);

  if (caseTypeSelect && (await caseTypeSelect.isVisible().catch(() => false))) {
    const options = await caseTypeSelect
      .locator("option")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          value: node.getAttribute("value") ?? "",
          label: (node.textContent ?? "").replaceAll(/\s+/g, " ").trim()
        }))
      )
      .catch(() => [] as Array<{ value: string; label: string }>);

    const preferred =
      (hint.caseType
        ? pickOptionByLabel(options, (l) => l.toLowerCase() === hint.caseType!.toLowerCase())
        : undefined) ??
      pickOptionByLabel(options, (l) => /civil/i.test(l));

    if (preferred) {
      await caseTypeSelect.selectOption({ value: preferred.value });
      await caseListPage.waitForUiIdleStateLenient(15_000);
    }
  }

  const apply = caseListPage.exuiCaseListComponent.filters.applyFilterBtn;
  if (await apply.isVisible().catch(() => false)) {
    await apply.click();
    await caseListPage.waitForUiIdleStateLenient(30_000);
  }
};

const tryApplyNonPaymentCaseStateFilter = async (caseListPage: CaseListPage): Promise<void> => {
  // Civil case lists often contain many cases blocked on payment; try to narrow to a case state
  // that is more likely to allow raising a query. If no such filter exists, this is a no-op.
  const page = caseListPage.page;
  await ensureCaseListFiltersVisible(caseListPage);

  const select = await getFirstExistingLocator([
    page.locator("#wb-case-state"),
    page.getByLabel(/case state/i),
    page.locator("select[name='caseState']"),
    page.locator("select[formcontrolname='state']"),
    page.locator("select[formcontrolname*='state']")
  ]);

  if (!select) return;
  if (!(await select.isVisible().catch(() => false))) return;

  const options = await select
    .locator("option")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        value: node.getAttribute("value") ?? "",
        label: (node.textContent ?? "").replaceAll(/\s+/g, " ").trim()
      }))
    )
    .catch(() => [] as Array<{ value: string; label: string }>);

  if (!options.length) return;

  const byLabel = (label: string) =>
    options.find((o) => o.label.toLowerCase() === label.toLowerCase());

  const preferred =
    byLabel("Case created") ??
    options.find(
      (o) =>
        o.value &&
        o.label &&
        !/payment|pending|draft|incomplete/i.test(o.label) &&
        !/all|any|select/i.test(o.label)
    );

  if (!preferred) return;

  await select.selectOption({ value: preferred.value });
  const apply = caseListPage.exuiCaseListComponent.filters.applyFilterBtn;
  if (await apply.isVisible().catch(() => false)) {
    await apply.click();
    await caseListPage.waitForUiIdleStateLenient(30_000);
  }

  const results = await caseListPage.exuiCaseListComponent.resultLinks.count().catch(() => 0);
  if (results > 0) return;

  // If we over-filtered (no results), reset and continue with the unfiltered list.
  const resetLink = page.getByRole("link", { name: /reset case selection/i });
  if (await resetLink.isVisible().catch(() => false)) {
    await resetLink.click();
    await caseListPage.waitForUiIdleStateLenient(30_000);
  }
};

const pickCaseFromListWithQueries = async (
  page: Page,
  caseListPage: CaseListPage,
  caseDetailsPage: CaseDetailsPage,
  manageCasesUrl: string,
  maxAttempts = 6
): Promise<{ caseId: string; caseReference: string; caseMeta: CaseMeta; existingQuerySubject?: string }> => {
  await tryApplyNonPaymentCaseStateFilter(caseListPage).catch(() => undefined);

  const total = await waitForCaseListResults(caseListPage, 60_000);
  const attempts = Math.min(total, maxAttempts);
  const preferredIndex = getCaseListIndex();
  const startIndex =
    preferredIndex === null ? 0 : Math.min(preferredIndex, total - 1);

  const diagnostics: string[] = [];

  for (let offset = 0; offset < attempts; offset += 1) {
    const index = Math.min(startIndex + offset, total - 1);
    const selection = await pickCaseFromList(page, caseListPage, caseDetailsPage, index);

    try {
      const hasQueries = await hasQueriesNavigation(page);
      if (!hasQueries) {
        const tabNames = await getTabNamesForDiagnostics(page);
        diagnostics.push(
          `index=${index} caseId=${selection.caseId} tabs=[${tabNames.join(" | ") || "(none)"}] url=${page.url()}`
        );
        await returnToCaseListSafely(page, caseDetailsPage, caseListPage, manageCasesUrl);
        continue;
      }
      // Prefer a case that already has a query row available (many Civil cases are blocked on payment
      // and cannot raise new queries until a service request is completed).
      await ensureQueriesContext(page);
      const existing = await getFirstQuerySubjectFromList(page);
      if (!existing) {
        diagnostics.push(
          `index=${index} caseId=${selection.caseId} url=${page.url()} note=no existing queries found`
        );
        await returnToCaseListSafely(page, caseDetailsPage, caseListPage, manageCasesUrl);
        continue;
      }

      return { ...selection, existingQuerySubject: existing };
    } catch (error) {
      const heading = await page
        .getByRole("heading")
        .first()
        .innerText()
        .catch(() => "(no heading)");
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(
        `index=${index} caseId=${selection.caseId} url=${page.url()} heading=${heading.replaceAll(/\s+/g, " ").trim()} error=${message}`
      );

      // Reset to the case list for the next attempt.
      if (!page.isClosed()) {
        await returnToCaseListSafely(page, caseDetailsPage, caseListPage, manageCasesUrl);
      }
    }
  }

  throw new Error(
    `Unable to find a case with Queries / Service Requests navigation after ${attempts} attempts. ` +
      "Provide EXUI_3695_CASE_REFERENCE/EXUI_3695_CASE_JURISDICTION/EXUI_3695_CASE_TYPE to override. " +
      (diagnostics.length ? `Attempt details: ${diagnostics.join("; ")}` : "")
  );
};

const getFirstQuerySubjectFromList = async (page: Page): Promise<string | null> => {
  const table = page
    .locator("table")
    .filter({ has: page.getByRole("columnheader", { name: /query subject/i }) })
    .first();

  const tableExists = await table.count().catch(() => 0);
  if (!tableExists) return null;

  const rows = table.getByRole("row");
  const rowCount = await rows.count().catch(() => 0);
  if (rowCount <= 1) return null;

  // Skip header row.
  for (let i = 1; i < Math.min(rowCount, 6); i += 1) {
    const row = rows.nth(i);
    const link = row.getByRole("link").first();
    if (await link.isVisible().catch(() => false)) {
      const text = (await link.innerText().catch(() => "")).replaceAll(/\s+/g, " ").trim();
      if (text) return text;
    }
    const button = row.getByRole("button").first();
    if (await button.isVisible().catch(() => false)) {
      const text = (await button.innerText().catch(() => "")).replaceAll(/\s+/g, " ").trim();
      if (text) return text;
    }
  }

  return null;
};

const findQueryRow = async (
  page: Page,
  subject: string,
  timeoutMs = 30_000
): Promise<QueryRow> => {
  const table = page
    .locator("table")
    .filter({ has: page.getByRole("columnheader", { name: /query subject/i }) })
    .first();
  await expect(table).toBeVisible({ timeout: timeoutMs });

  const linkRow = table
    .getByRole("row")
    .filter({ has: table.getByRole("link", { name: subject }) })
    .first();
  if (await linkRow.count()) {
    await expect(linkRow).toBeVisible({ timeout: timeoutMs });
    return { table, row: linkRow };
  }

  const buttonRow = table
    .getByRole("row")
    .filter({ has: table.getByRole("button", { name: subject }) })
    .first();
  await expect(buttonRow).toBeVisible({ timeout: timeoutMs });
  return { table, row: buttonRow };
};

const getQueryColumnIndexes = async (table: Locator) => {
  const headers = await table.getByRole("columnheader").allTextContents();
  const normalized = headers.map(normalizeHeader);
  return {
    senderName: normalized.indexOf("sender name"),
    lastSubmittedBy: normalized.indexOf("last submitted by")
  };
};

const getDetailsValueCell = async (page: Page, label: string): Promise<Locator> => {
  const table = page
    .locator("table")
    .filter({ has: page.getByRole("rowheader", { name: label }) })
    .first();
  const row = table
    .locator("tr")
    .filter({ has: table.getByRole("rowheader", { name: label }) })
    .first();
  await expect(row).toBeVisible();
  return row.locator("td").first();
};

const createContext = async (browser: Browser) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const caseDetailsPage = new CaseDetailsPage(page);
  const caseListPage = new CaseListPage(page);
  const caseSearchPage = new CaseSearchPage(page);
  return { context, page, caseDetailsPage, caseListPage, caseSearchPage };
};

const waitForCaseListResults = async (
  caseListPage: CaseListPage,
  timeoutMs = 60_000
): Promise<number> => {
  const deadline = Date.now() + timeoutMs;
  let attemptedApply = false;
  let attemptedReset = false;
  let attemptedPopulate = false;
  while (Date.now() < deadline) {
    const count = await caseListPage.exuiCaseListComponent.resultLinks.count();
    if (count > 0) {
      return count;
    }
    if (!attemptedPopulate) {
      attemptedPopulate = true;
      await tryApplyCivilCaseListFilters(caseListPage).catch(() => undefined);
      continue;
    }
    if (!attemptedReset) {
      const resetLink = caseListPage.page.getByRole("link", {
        name: /reset case selection/i
      });
      if (await resetLink.isVisible().catch(() => false)) {
        attemptedReset = true;
        await resetLink.click();
        await caseListPage.waitForUiIdleStateLenient(30_000);
        continue;
      }
    }
    if (!attemptedApply) {
      const apply = caseListPage.exuiCaseListComponent.filters.applyFilterBtn;
      if (await apply.isVisible().catch(() => false)) {
        attemptedApply = true;
        await apply.click();
        await caseListPage.waitForUiIdleStateLenient(30_000);
        continue;
      }
    }
    await caseListPage.waitForUiIdleStateLenient(10_000);
    await caseListPage.page.waitForTimeout(1_000);
  }
  throw new Error("No case list results available to select.");
};

const pickCaseFromList = async (
  page: Page,
  caseListPage: CaseListPage,
  caseDetailsPage: CaseDetailsPage,
  indexOverride?: number
): Promise<{ caseId: string; caseReference: string; caseMeta: CaseMeta }> => {
  if (page.isClosed()) {
    throw new Error("Case list page closed before selecting a case.");
  }
  const caseDetailsResponse = page
    .waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/internal/cases/"),
      { timeout: 45_000 }
    )
    .catch(() => null);

  const total = await waitForCaseListResults(caseListPage, 60_000);
  const preferredIndex = indexOverride ?? getCaseListIndex() ?? 0;
  const index = Math.min(preferredIndex, total - 1);
  await caseListPage.exuiCaseListComponent.selectCaseByIndex(index);
  await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
  await caseDetailsPage.waitForReady();

  const response = await caseDetailsResponse;
  let caseMeta: CaseMeta = {};
  let caseIdFromResponse: string | undefined;
  if (response) {
    const urlMatch = /\/internal\/cases\/(\d+)/.exec(response.url());
    caseIdFromResponse = urlMatch?.[1];
    const data = await response.json().catch(() => null);
    caseMeta = {
      jurisdiction: data?.case_type?.jurisdiction?.name ?? undefined,
      caseType: data?.case_type?.name ?? undefined
    };

    const idFromBody = data?.id;
    if (!caseIdFromResponse && (typeof idFromBody === "string" || typeof idFromBody === "number")) {
      const normalized = String(idFromBody).replaceAll(/\D/g, "");
      caseIdFromResponse = normalized || undefined;
    }
  }

  let caseReference = "";
  try {
    caseReference = await caseDetailsPage.exuiCaseDetailsComponent.getCaseNumber();
  } catch {
    // Some EXUI variants render the header with different spacing/labels.
    // Fall back to deriving the reference from the case details API response.
    caseReference = caseIdFromResponse ?? "";
  }

  const cleaned = caseReference.replaceAll(/\D/g, "");
  if (!cleaned) {
    throw new Error(
      "Unable to resolve case id after selecting from case list. " +
        "Set EXUI_3695_CASE_REFERENCE/EXUI_3695_CASE_JURISDICTION/EXUI_3695_CASE_TYPE to run deterministically."
    );
  }

  return { caseId: cleaned, caseReference: cleaned || caseReference, caseMeta };
};

type RaiseQueryNavigationOptions = {
  baseUrl?: string;
  caseId?: string;
};

const tryOpenRaiseQueryDirect = async (
  page: Page,
  options: RaiseQueryNavigationOptions
): Promise<{ opened: boolean; status?: number; url?: string }> => {
  const baseUrl = options.baseUrl;
  const caseId = options.caseId;
  if (!baseUrl || !caseId) return { opened: false };

  const directUrl = new URL(`/query-management/query/${caseId}/raiseAQuery`, baseUrl).toString();
  const response = await page.goto(directUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
  const status = response?.status();

  const subject = page.locator(
    '#subject, #querySubject, input[name="subject"], input[name="querySubject"], input[aria-label*="Subject"]'
  );
  const body = page.locator(
    '#body, #queryBody, textarea[name="body"], textarea[name="queryBody"], textarea[aria-label*="Body"]'
  );
  const subjectVisible = await subject.first().isVisible().catch(() => false);
  const bodyVisible = await body.first().isVisible().catch(() => false);

  if (subjectVisible && bodyVisible) {
    return { opened: true, status, url: directUrl };
  }

  return { opened: false, status, url: directUrl };
};

const tryClickRaiseQueryAction = async (page: Page): Promise<boolean> => {
  const patterns: RegExp[] = [
    /raise a new (query|service requests?)/i,
    /raise (a )?(query|service requests?)/i,
    /(create|add) (a )?(query|service requests?)/i
  ];

  for (const pattern of patterns) {
    const link = page.getByRole("link", { name: pattern }).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      return true;
    }
    const button = page.getByRole("button", { name: pattern }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return true;
    }
  }

  return false;
};

const tryOpenRaiseQueryViaNextStep = async (page: Page): Promise<boolean> => {
  const nextStep = page.locator("#next-step");
  const canUseNextStep = await nextStep.isVisible().catch(() => false);
  if (!canUseNextStep) return false;

  const options = await nextStep
    .locator("option")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const label = (node.textContent ?? "").trim();
        const value = node.getAttribute("value") ?? "";
        return { label, value };
      })
    )
    .catch(() => [] as Array<{ label: string; value: string }>);

  const match = options.find((o) =>
    /query|service request/i.test(o.label) && /raise|create|add/i.test(o.label)
  );
  if (!match) return false;

  if (match.value) {
    await nextStep.selectOption({ value: match.value });
  } else {
    await nextStep.selectOption({ label: match.label });
  }

  const go = page.getByRole("button", { name: /^go$/i });
  if (await go.isVisible().catch(() => false)) {
    await go.click();
  }

  await page.locator("#subject").waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
  return true;
};

const openRaiseQueryFlow = async (
  page: Page,
  options: RaiseQueryNavigationOptions = {}
): Promise<void> => {
  if (await tryClickRaiseQueryAction(page)) return;

  // Fallback: some EXUI case types expose this only as a case event in the "Next step" dropdown.
  if (await tryOpenRaiseQueryViaNextStep(page)) return;

  // Civil AAT often uses query-management with a dedicated route for raising a query.
  // If the UI doesn't expose a raise action (or it is flaky), try the direct route.
  const direct = await tryOpenRaiseQueryDirect(page, options);
  if (direct.opened) return;

  const visibleLinks = await page
    .getByRole("link")
    .allTextContents()
    .catch(() => [] as string[]);
  const visibleButtons = await page
    .getByRole("button")
    .allTextContents()
    .catch(() => [] as string[]);

  const summarize = (values: string[]) =>
    values
      .map((t) => t.replaceAll(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((t) => /raise|query|service request/i.test(t))
      .slice(0, 20)
      .join(" | ");

  throw new Error(
    "Raise query/service request action not available from the Queries / Service Request area. " +
      (direct.url
        ? `Direct raise URL attempted: ${direct.url} (status=${direct.status ?? "n/a"}). `
        : "") +
      `Links: [${summarize(visibleLinks) || "(none matching raise/query/service request)"}] ` +
      `Buttons: [${summarize(visibleButtons) || "(none matching raise/query/service request)"}]`
  );
};

const openRespondToQueryFlow = async (page: Page): Promise<void> => {
  const responseBody = page.locator("#body");
  if (await responseBody.isVisible().catch(() => false)) {
    return;
  }
  const patterns: RegExp[] = [
    /respond to (a )?(query|service requests?)/i,
    /(reply|respond)/i
  ];
  for (const pattern of patterns) {
    const respondLink = page.getByRole("link", { name: pattern }).first();
    if (await respondLink.isVisible().catch(() => false)) {
      await respondLink.click();
      return;
    }
    const respondButton = page.getByRole("button", { name: pattern }).first();
    if (await respondButton.isVisible().catch(() => false)) {
      await respondButton.click();
      return;
    }
  }
  throw new Error(
    "Respond action not available from the Query/Service Request details view."
  );
};

const getQuerySubjectLocator = (page: Page): Locator =>
  page.locator(
    '#subject, #querySubject, input[name="subject"], input[name="querySubject"], input[aria-label*="Subject"]'
  );

const getQueryBodyLocator = (page: Page): Locator =>
  page.locator(
    '#body, #queryBody, textarea[name="body"], textarea[name="queryBody"], textarea[aria-label*="Body"]'
  );

const advanceQueryWizardUntilDetailsVisible = async (
  page: Page,
  subject: Locator,
  body: Locator,
  maxSteps = 8
): Promise<void> => {
  const continueButton = page.getByRole("button", { name: /^continue$/i });

  const tryContinue = async (): Promise<boolean> => {
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
      return true;
    }
    return false;
  };

  const tryProgressWithPreferredRadios = async (): Promise<boolean> => {
    const preferredRadioPatterns: RegExp[] = [
      /raise a new (query|service request)/i,
      /^no$/i,
      /no/i
    ];
    for (const pattern of preferredRadioPatterns) {
      const radio = page.getByRole("radio", { name: pattern }).first();
      if (await radio.isVisible().catch(() => false)) {
        await radio.check();
        await tryContinue();
        return true;
      }
    }
    return false;
  };

  const tryProgressWithAnyRadio = async (): Promise<boolean> => {
    const anyRadio = page.getByRole("radio").first();
    if (await anyRadio.isVisible().catch(() => false)) {
      await anyRadio.check();
      await tryContinue();
      return true;
    }
    return false;
  };

  const tryProgressWithSelect = async (): Promise<boolean> => {
    const anySelect = page.locator("select").first();
    if (!(await anySelect.isVisible().catch(() => false))) return false;

    const options = await anySelect
      .locator("option")
      .evaluateAll((nodes) =>
        nodes
          .map((n) => ({
            value: n.getAttribute("value") ?? "",
            label: (n.textContent ?? "").trim()
          }))
          .filter((o) => o.value && !/select/i.test(o.label))
      )
      .catch(() => [] as Array<{ value: string; label: string }>);

    if (!options.length) return false;

    await anySelect.selectOption({ value: options[0].value });
    await tryContinue();
    return true;
  };

  for (let step = 0; step < maxSteps; step += 1) {
    const subjectVisible = await subject.first().isVisible().catch(() => false);
    const bodyVisible = await body.first().isVisible().catch(() => false);
    if (subjectVisible && bodyVisible) return;

    if (await tryProgressWithPreferredRadios()) continue;
    if (await tryProgressWithAnyRadio()) continue;
    if (await tryProgressWithSelect()) continue;

    // Can't progress further.
    break;
  }

  const heading = await page
    .getByRole("heading")
    .first()
    .innerText()
    .catch(() => "(no heading)");
  throw new Error(
    `Unable to reach query details form (subject/body). URL=${page.url()} Heading=${heading}`
  );
};

const ensureManageCasesReady = async (
  page: Page,
  caseListPage: CaseListPage,
  manageCasesUrl: string,
  credentials: { username: string; password: string },
  label: string
): Promise<void> => {
  await page.goto(manageCasesUrl, { waitUntil: "domcontentloaded" });
  const outcome = await waitForLoginOrApp(page);
  if (outcome === "login") {
    const idamPage = new IdamPage(page);
    await idamPage.usernameInput.waitFor({ state: "visible", timeout: 60_000 });
    await idamPage.login({ username: credentials.username, password: credentials.password });
    await page.goto(manageCasesUrl, { waitUntil: "domcontentloaded" });
    const afterLogin = await waitForLoginOrApp(page);
    if (afterLogin !== "app") {
      throw new Error(`${label} login did not reach Manage cases.`);
    }
  }
  await caseListPage.acceptAnalyticsCookies();
  await caseListPage.waitForReady();
};

const ensureCorrectUserSession = async (
  page: Page,
  caseListPage: CaseListPage,
  baseUrl: string,
  manageCasesUrl: string,
  credentials: { username: string; password: string },
  label: string
): Promise<void> => {
  await ensureManageCasesReady(page, caseListPage, manageCasesUrl, credentials, label);
  const expected = normalizeEmail(credentials.username);
  const actual = await getUserDetailsEmail(page, baseUrl);
  if (actual === expected) {
    return;
  }
  await page.context().clearCookies();
  await page.goto(new URL("/auth/login", baseUrl).toString(), {
    waitUntil: "domcontentloaded"
  });
  const outcome = await waitForLoginOrApp(page);
  if (outcome === "login") {
    const idamPage = new IdamPage(page);
    await idamPage.usernameInput.waitFor({ state: "visible", timeout: 60_000 });
    await idamPage.login({ username: credentials.username, password: credentials.password });
  }
  await ensureManageCasesReady(page, caseListPage, manageCasesUrl, credentials, label);
  await ensureExpectedUser(page, baseUrl, credentials.username, label);
};

type UserSession = {
  cookies: Cookie[];
  storageFile: string;
};

const createContextForUser = async (
  browser: Browser,
  baseUrl: string,
  manageCasesUrl: string,
  userSession: UserSession,
  credentials: { username: string; password: string },
  label: string
) => {
  const expectedEmail = normalizeEmail(credentials.username);
  if (!expectedEmail) {
    throw new Error(`${label} username is missing from the environment.`);
  }
  if (!credentials.password) {
    throw new Error(`${label} password is missing from the environment.`);
  }

  const fresh = await createContext(browser);
  if (userSession.cookies.length) {
    await fresh.context.addCookies(userSession.cookies);
  }
  await ensureCorrectUserSession(
    fresh.page,
    fresh.caseListPage,
    baseUrl,
    manageCasesUrl,
    credentials,
    label
  );
  userSession.cookies = await fresh.context.cookies();
  await fresh.context.storageState({ path: userSession.storageFile });
  return fresh;
};

const openQueryDetailsFromRow = async (row: Locator, subject: string): Promise<void> => {
  const subjectLink = row.getByRole("link", { name: subject }).first();
  if (await subjectLink.isVisible().catch(() => false)) {
    await subjectLink.click();
    return;
  }
  const subjectButton = row.getByRole("button", { name: subject }).first();
  if (await subjectButton.isVisible().catch(() => false)) {
    await subjectButton.click();
    return;
  }
  throw new Error(`Query subject "${subject}" is not available to open.`);
};

const ensureExpectedUser = async (
  page: Page,
  baseUrl: string,
  expectedEmail: string,
  label: string
): Promise<void> => {
  const expected = normalizeEmail(expectedEmail);
  if (!expected) {
    throw new Error(`${label} username is missing from the environment.`);
  }
  const actual = await getUserDetailsEmail(page, baseUrl);
  if (!actual) {
    throw new Error(`${label} user details not available after login.`);
  }
  if (actual !== expected) {
    throw new Error(`Logged in as ${actual}, expected ${expected}.`);
  }
};

const getUserDetailsEmail = async (page: Page, baseUrl: string): Promise<string | undefined> => {
  const response = await page.request.get(new URL("/api/user/details", baseUrl).toString(), {
    failOnStatusCode: false
  });
  if (!response.ok()) return undefined;
  const data = (await response.json().catch(() => null)) as { userInfo?: Record<string, unknown> } | null;
  const userInfo = data?.userInfo ?? {};

  const candidateEmail =
    (typeof userInfo.email === "string" ? userInfo.email.trim() : "") ||
    (typeof userInfo.uid === "string" ? userInfo.uid.trim() : "") ||
    (typeof userInfo.sub === "string" ? userInfo.sub.trim() : "");

  return normalizeEmail(candidateEmail || undefined);
};

test.describe("@EXUI-3695 HMCTS suffix on queries", () => {
  let solicitorSession: UserSession | null = null;
  let hmctsSession: UserSession | null = null;

  test.beforeAll(async ({ browser: _browser }, testInfo) => {
    if (!hasSolicitorCreds) {
      testInfo.skip(true, "CIVIL_SOLICITOR credentials not set");
      return;
    }
    if (!hasHmctsCreds) {
      testInfo.skip(true, "CIVIL_HMCTS_STAFF credentials not set");
      return;
    }
    const solicitor = loadSessionCookies(solicitorUserIdentifier);
    const hmcts = loadSessionCookies(hmctsUserIdentifier);
    solicitorSession = {
      cookies: solicitor.cookies,
      storageFile: solicitor.storageFile
    };
    hmctsSession = {
      cookies: hmcts.cookies,
      storageFile: hmcts.storageFile
    };
  });

  test("@EXUI-3695 HMCTS suffix appears for staff responders", async ({ browser, config }) => {
    const solicitor = solicitorSession;
    const hmcts = hmctsSession;
    if (!solicitor || !hmcts) {
      throw new Error("Session setup missing; verify CIVIL user credentials.");
    }

    const manageCasesUrl = config.urls.manageCaseBaseUrl;
    const baseUrl = resolveExuiBaseUrl(manageCasesUrl);
    let querySubject = `EXUI-3695 HMCTS ${Date.now()}`;
    const queryBody = `EXUI-3695 suffix check ${Date.now()}`;
    const responseBody = `EXUI-3695 response ${Date.now()}`;

    const caseOverride = getCaseOverride();
    let caseReference = "";
    let caseMeta: CaseMeta = {};
    let existingQuerySubject: string | undefined;

    await test.step("Select a case and raise a non-hearing query as solicitor", async () => {
      const { context, page, caseDetailsPage, caseListPage, caseSearchPage } = await createContextForUser(
        browser,
        baseUrl,
        manageCasesUrl,
        solicitor,
        {
          username: solicitorEmail,
          password: process.env.CIVIL_SOLICITOR_PASSWORD ?? ""
        },
        "Solicitor"
      );
      try {
        if (caseOverride) {
          caseReference = caseOverride.caseReference;
          caseMeta = { jurisdiction: caseOverride.jurisdiction, caseType: caseOverride.caseType };

          await caseSearchPage.goto();
          await caseSearchPage.waitForReady();
          await caseSearchPage.ensureFiltersVisible();
          await caseSearchPage.selectJurisdiction(caseOverride.jurisdiction);
          await caseSearchPage.selectCaseType(caseOverride.caseType);
          await caseSearchPage.waitForDynamicFilters();
          await caseSearchPage.fillCcdNumber(caseOverride.caseReference);
          await caseSearchPage.applyFilters();
          await caseSearchPage.openFirstResult();
          await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
          await caseDetailsPage.waitForReady();
        } else {
          const selection = await pickCaseFromListWithQueries(
            page,
            caseListPage,
            caseDetailsPage,
            manageCasesUrl
          );
          caseReference = selection.caseReference;
          caseMeta = selection.caseMeta;
          existingQuerySubject = selection.existingQuerySubject;
        }

        // Prefer raising a new query so the journey is fully exercised, but Civil cases can be
        // blocked on payment prerequisites. If raising is unavailable, fall back to an existing query.
        await ensureQueriesContext(page);
        let raisedNewQuery = false;
        try {
          await openRaiseQueryFlow(page, { baseUrl, caseId: caseReference });
          await caseDetailsPage.acceptAnalyticsCookies();
          const subject = getQuerySubjectLocator(page);
          const body = getQueryBodyLocator(page);

          const subjectAlreadyVisible = await subject.first().isVisible().catch(() => false);
          if (!subjectAlreadyVisible) {
            await advanceQueryWizardUntilDetailsVisible(page, subject, body);
          }

          await subject.first().waitFor({ state: "visible", timeout: 30_000 });
          await subject.first().fill(querySubject);
          await body.first().waitFor({ state: "visible", timeout: 30_000 });
          await body.first().fill(queryBody);

          const hearingNo = page.locator("#isHearingRelated-no");
          if (await hearingNo.isVisible().catch(() => false)) {
            await hearingNo.check();
          }
          await page.getByRole("button", { name: /^continue$/i }).click();
          await expect(
            page.getByRole("heading", { name: /review (query|service request) details/i })
          ).toBeVisible();
          await page.getByRole("button", { name: /^submit$/i }).click();
          await expect(
            page.getByRole("heading", { name: /(query|service request) submitted/i })
          ).toBeVisible();
          await page.getByRole("link", { name: /go back to the case/i }).click();
          await caseDetailsPage.waitForReady();
          await ensureQueriesContext(page);
          await findQueryRow(page, querySubject, 60_000);
          raisedNewQuery = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // Try to get back to the query list and use an existing query.
          await returnToCaseDetails(page, caseDetailsPage, baseUrl, caseReference);
          await ensureQueriesTabSelected(page);
          const existing = existingQuerySubject ?? (await getFirstQuerySubjectFromList(page));
          if (!existing) {
            throw new Error(
              "Unable to raise a new query/service request AND no existing queries were found for the selected case. " +
                "This often indicates the case is blocked by prerequisites (e.g. payment) or permissions. " +
                `Original error: ${message}`
            );
          }
          querySubject = existing;
        }

        if (!raisedNewQuery) {
          // Ensure the subject we will respond to exists in the list.
          await findQueryRow(page, querySubject, 60_000);
        }
      } finally {
        await context.close();
      }
    });

    await test.step("Respond as HMCTS staff and verify suffixes", async () => {
      const { context, page, caseDetailsPage, caseSearchPage } = await createContextForUser(
        browser,
        baseUrl,
        manageCasesUrl,
        hmcts,
        {
          username: hmctsEmail,
          password: process.env.CIVIL_HMCTS_STAFF_PASSWORD ?? ""
        },
        "HMCTS staff"
      );
      try {
        const jurisdiction = caseOverride?.jurisdiction ?? caseMeta.jurisdiction;
        const caseType = caseOverride?.caseType ?? caseMeta.caseType;
        const caseNumber = caseOverride?.caseReference ?? caseReference;

        if (!jurisdiction || !caseType) {
          throw new Error(
            "Case metadata missing for Find case search. Provide EXUI_3695_CASE_JURISDICTION and EXUI_3695_CASE_TYPE to override."
          );
        }
        if (!caseNumber) {
          throw new Error(
            "Case reference missing for Find case search. Provide EXUI_3695_CASE_REFERENCE to override."
          );
        }

        await caseSearchPage.goto();
        await caseSearchPage.waitForReady();
        await caseSearchPage.ensureFiltersVisible();
        await caseSearchPage.selectJurisdiction(jurisdiction);
        await caseSearchPage.selectCaseType(caseType);
        await caseSearchPage.waitForDynamicFilters();
        await caseSearchPage.fillCcdNumber(caseNumber);
        await caseSearchPage.applyFilters();
        await caseSearchPage.openFirstResult();
        await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
        await caseDetailsPage.waitForReady();

        await ensureQueriesTabSelected(page);
        const responseQueryRow = await findQueryRow(page, querySubject, 60_000);
        await openQueryDetailsFromRow(responseQueryRow.row, querySubject);

        await openRespondToQueryFlow(page);
        await page.locator("#body").fill(responseBody);
        await page.getByRole("button", { name: /^continue$/i }).click();
        await expect(
          page.getByRole("heading", { name: /review (query|service request) response details/i })
        ).toBeVisible();
        await page.getByRole("button", { name: /^submit$/i }).click();
        await expect(
          page.getByRole("heading", { name: /(query|service request) response submitted/i })
        ).toBeVisible();

        await page.getByRole("link", { name: /go back to the case/i }).click();
        await caseDetailsPage.waitForReady();
        await ensureQueriesTabSelected(page);

        const summaryQueryRow = await findQueryRow(page, querySubject, 60_000);
        const columns = await getQueryColumnIndexes(summaryQueryRow.table);
        expect(columns.senderName, "Sender name column should be present").toBeGreaterThanOrEqual(0);
        expect(columns.lastSubmittedBy, "Last submitted by column should be present").toBeGreaterThanOrEqual(0);

        await expect(summaryQueryRow.row.locator("td").nth(columns.senderName)).not.toContainText(/-HMCTS/i);
        await expect(summaryQueryRow.row.locator("td").nth(columns.lastSubmittedBy)).toContainText(/-HMCTS/i);

        await openQueryDetailsFromRow(summaryQueryRow.row, querySubject);
        const caseworkerNameCell = await getDetailsValueCell(page, "Caseworker name");
        await expect(caseworkerNameCell).toContainText(/-HMCTS/i);
      } finally {
        await context.close();
      }
    });
  });
});
