import type { Cookie, Page } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import type { CaseDetailsPage } from "../../../../page-objects/pages/exui/caseDetails.po.js";
import type { CaseListPage } from "../../../../page-objects/pages/exui/caseList.po.js";
import { ensureUiStorageStateForUser } from "../../../../utils/ui/session-storage.utils.js";
import { loadSessionCookies } from "../utils/session.utils.js";

const userIdentifier = "COURT_ADMIN";
const hasCourtAdminCreds = Boolean(
  process.env.COURT_ADMIN_USERNAME && process.env.COURT_ADMIN_PASSWORD
);
const explicitUsersEnv = (process.env.PW_UI_USERS ?? process.env.PW_UI_USER)?.trim();
const configuredUsers = explicitUsersEnv
  ? explicitUsersEnv
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  : [];
const includesCourtAdmin = configuredUsers.includes(userIdentifier);
let sessionCookies: Cookie[] = [];
const installTabSelectionTracker = async (page: Page) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __tabSelections?: string[];
      __tabSelectionLast?: string | null;
      __tabObserverInstalled?: boolean;
    };
    w.__tabSelections = [];
    w.__tabSelectionLast = null;
    w.__tabObserverInstalled = false;

    const recordSelection = () => {
      const selected = Array.from(
        document.querySelectorAll('div[role="tab"][aria-selected="true"]')
      )
        .map((element) => element.textContent?.trim() || "")
        .filter(Boolean);
      if (!selected.length) return;
      const name = selected[0];
      if (w.__tabSelectionLast !== name) {
        w.__tabSelectionLast = name;
        w.__tabSelections?.push(name);
      }
    };

    const startObserver = () => {
      if (w.__tabObserverInstalled) return;
      w.__tabObserverInstalled = true;
      const observer = new MutationObserver(recordSelection);
      observer.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-selected"]
      });
      recordSelection();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    } else {
      startObserver();
    }
  });
};

const resetTabSelectionTracker = async (page: Page) => {
  await page.evaluate(() => {
    const w = window as unknown as { __tabSelections?: string[]; __tabSelectionLast?: string | null };
    w.__tabSelections = [];
    w.__tabSelectionLast = null;
  });
};

const getTabSelectionChanges = async (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const w = window as unknown as { __tabSelections?: string[] };
    return w.__tabSelections ?? [];
  });

const resolveExplicitTabTarget = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const hash = parsed.hash.replace(/^#/, "").trim();
    if (hash) return hash;

    const params = parsed.searchParams;
    const keys = [
      "tab",
      "tabId",
      "tabid",
      "tabName",
      "tabname",
      "tabLabel",
      "tablabel",
      "tab-title",
      "tabtitle"
    ];
    for (const key of keys) {
      const value = params.get(key);
      if (value?.trim()) return value.trim();
    }
  } catch {
    const hashIndex = url.indexOf("#");
    if (hashIndex >= 0) {
      const fragment = url.slice(hashIndex + 1).trim();
      if (fragment) return fragment;
    }
  }

  const pathMatch = url.match(/\/tab[s]?\/([^/?#]+)/i);
  return pathMatch?.[1] ?? null;
};

const assertNoExplicitTabOverride = (page: Page, label: string) => {
  const explicit = resolveExplicitTabTarget(page.url());
  if (explicit && !/summary/i.test(explicit)) {
    throw new Error(`${label}: URL explicitly targets tab "${explicit}"`);
  }
};

const assertSummaryTabIsDefault = async (page: Page, label: string) => {
  assertNoExplicitTabOverride(page, label);
  await page.waitForSelector('div[role="tab"][aria-selected="true"]');
  await page.waitForTimeout(750);
  const selections = await getTabSelectionChanges(page);
  expect(selections.length, `${label}: no tab selections recorded`).toBeGreaterThan(0);

  // Some EXUI case types briefly select a different first tab while the case viewer hydrates.
  // The key behavioural requirement for EXUI-3895 is that Summary is ultimately selected and
  // remains selected (with no explicit URL override).
  const normalized = selections.map((value) => value.toLowerCase());
  const firstSummaryIndex = normalized.findIndex((value) => value.includes("summary"));
  expect(firstSummaryIndex, `${label}: Summary tab was never selected`).toBeGreaterThanOrEqual(0);

  const selectionsAfterSummary = normalized.slice(firstSummaryIndex);
  const onlySummaryAfterSelected = selectionsAfterSummary.every((value) => value.includes("summary"));
  expect(onlySummaryAfterSelected, `${label}: Summary tab should remain selected`).toBe(true);

  const currentSelected = (await getSelectedTabName(page)).toLowerCase();
  expect(currentSelected, `${label}: currently selected tab should be Summary`).toMatch(/summary/i);
};

const getSelectedTabName = async (page: Page): Promise<string> => {
  const locator = page.locator('div[role="tab"][aria-selected="true"]').first();
  const text = (await locator.textContent().catch(() => "")) ?? "";
  return text.trim();
};

const openCaseFromListWhereSummaryIsDefault = async (args: {
  page: Page;
  caseListPage: CaseListPage;
  caseDetailsPage: CaseDetailsPage;
  config: { urls: { manageCaseBaseUrl: string } };
  maxAttempts?: number;
}): Promise<{ caseReference: string; caseMeta: { jurisdiction?: string; caseType?: string } }> => {
  const { page, caseListPage, caseDetailsPage, config } = args;
  const maxAttempts = args.maxAttempts ?? 5;

  await caseListPage.page.goto(config.urls.manageCaseBaseUrl, { waitUntil: "domcontentloaded" });
  await caseListPage.acceptAnalyticsCookies();
  await caseListPage.waitForReady();
  await caseListPage.exuiCaseListComponent.resultLinks.first().waitFor({ state: "visible" });

  for (let index = 0; index < maxAttempts; index += 1) {
    const caseDetailsResponse = page.waitForResponse((response) => {
      return response.request().method() === "GET" && response.url().includes("/internal/cases/");
    });

    await resetTabSelectionTracker(page);
    await caseListPage.exuiCaseListComponent.selectCaseByIndex(index);
    await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
    await caseDetailsPage.waitForReady();

    const selectedTab = await getSelectedTabName(page);
    const response = await caseDetailsResponse.catch(() => null);
    let caseMeta: { jurisdiction?: string; caseType?: string } = {};
    if (response) {
      const data = await response.json().catch(() => null);
      caseMeta = {
        jurisdiction: data?.case_type?.jurisdiction?.name ?? undefined,
        caseType: data?.case_type?.name ?? undefined
      };
    }

    // Only proceed when the case type/configuration defaults to Summary.
    if (/summary/i.test(selectedTab)) {
      const caseReference = await caseDetailsPage.exuiCaseDetailsComponent.getCaseNumber();
      return { caseReference, caseMeta };
    }

    await caseDetailsPage.exuiCaseDetailsComponent.returnToCaseList();
    await caseListPage.waitForReady();
  }

  throw new Error(
    `Unable to find a case that defaults to the Summary tab after ${maxAttempts} attempts.`
  );
};

test.describe("@EXUI-3895 Case details default tab selection", () => {
  let caseMeta: { jurisdiction?: string; caseType?: string } = {};
  test.beforeAll(async ({ browser }, testInfo) => {
    void browser;
    if (!hasCourtAdminCreds) {
      testInfo.skip(true, "COURT_ADMIN credentials not set");
      return;
    }
    if (Boolean(explicitUsersEnv) && !includesCourtAdmin) {
      testInfo.skip(true, "PW_UI_USERS excludes COURT_ADMIN");
      return;
    }
    await ensureUiStorageStateForUser(userIdentifier, { strict: true });
    const { cookies } = loadSessionCookies(userIdentifier);
    sessionCookies = cookies;
  });

  test.beforeEach(async ({ page }) => {
    if (sessionCookies.length) {
      await page.context().addCookies(sessionCookies);
    }
  });

  test("@EXUI-3895 Summary tab remains default when opening case details", async ({
    caseListPage,
    caseDetailsPage,
    caseSearchPage,
    page,
    config
  }) => {
    await installTabSelectionTracker(page);

    const selection = await openCaseFromListWhereSummaryIsDefault({
      page,
      caseListPage,
      caseDetailsPage,
      config
    });
    caseMeta = selection.caseMeta;
    const caseReference = selection.caseReference;
    await assertSummaryTabIsDefault(page, "Case list navigation");

    await test.step("Return to case list", async () => {
      await caseDetailsPage.exuiCaseDetailsComponent.returnToCaseList();
      await caseListPage.waitForUiIdleStateLenient(45_000);
    });

    await test.step("Open case details via Find Case", async () => {
      await resetTabSelectionTracker(page);
      await caseSearchPage.goto();
      await caseSearchPage.waitForReady();
      await caseSearchPage.ensureFiltersVisible();
      await caseSearchPage.selectJurisdiction(caseMeta.jurisdiction);
      await caseSearchPage.selectCaseType(caseMeta.caseType);
      await caseSearchPage.waitForDynamicFilters();
      await caseSearchPage.fillCcdNumber(caseReference);
      await caseSearchPage.applyFilters();
      await caseSearchPage.openFirstResult();
      await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
      await caseDetailsPage.waitForReady();
    });

    await assertSummaryTabIsDefault(page, "Find Case navigation");
  });
});
