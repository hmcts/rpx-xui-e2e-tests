import type { Cookie, Page, Response } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import { ensureUiStorageStateForUser } from "../../../../utils/ui/session-storage.utils.js";
import { loadSessionCookies } from "../utils/session.utils.js";

const userIdentifier = "COURT_ADMIN";
const hasCourtAdminCreds = Boolean(
  process.env.COURT_ADMIN_USERNAME && process.env.COURT_ADMIN_PASSWORD
);
test.use({ storageState: { cookies: [], origins: [] } });
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
  const selectedTabs = page.locator('div[role="tab"][aria-selected="true"]');
  await expect(selectedTabs.first()).toBeVisible();
  await expect
    .poll(
      async () => {
        const selections = await getTabSelectionChanges(page);
        const currentSelected = (await selectedTabs.first().textContent())?.toLowerCase() ?? "";
        const normalizedSelections = selections.map((value) => value.toLowerCase());
        return {
          currentSelected,
          normalizedSelections
        };
      },
      { timeout: 10_000 }
    )
    .toMatchObject({
      currentSelected: expect.stringContaining("summary")
    });

  const selections = await getTabSelectionChanges(page);
  const normalized = selections.map((value) => value.toLowerCase());
  const summaryIndex = normalized.findIndex((value) => value.includes("summary"));
  if (summaryIndex >= 0) {
    const afterSummary = normalized.slice(summaryIndex);
    const onlySummaryAfter = afterSummary.every((value) => value.includes("summary"));
    expect(onlySummaryAfter, `${label}: summary tab should remain selected once chosen`).toBe(true);
  }

  const currentSelected = (await selectedTabs.first().textContent())?.toLowerCase() ?? "";
  expect(currentSelected, `${label}: Summary should be the selected tab`).toContain("summary");
};

const extractCaseMeta = async (
  responsePromise: Promise<Response>
): Promise<{ jurisdiction?: string; caseType?: string }> => {
  try {
    const response = await responsePromise;
    const data = await response.json().catch(() => null);
    return {
      jurisdiction: data?.case_type?.jurisdiction?.name ?? undefined,
      caseType: data?.case_type?.name ?? undefined
    };
  } catch {
    return {};
  }
};

const ensureVisibleCaseListResult = async (
  page: Page,
  waitForVisible: () => Promise<void>
): Promise<void> => {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await waitForVisible();
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }
};

test.describe("@EXUI-3895 Case details default tab selection", () => {
  let caseMeta: { jurisdiction?: string; caseType?: string } = {};

  test.beforeAll(async ({ browser }) => {
    void browser;
    if (!hasCourtAdminCreds) {
      throw new Error("COURT_ADMIN credentials not set");
    }
    if (Boolean(explicitUsersEnv) && !includesCourtAdmin) {
      throw new Error("PW_UI_USERS excludes COURT_ADMIN");
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

    await test.step("Open case details from case list", async () => {
      await caseListPage.page.goto(config.urls.manageCaseBaseUrl, {
        waitUntil: "domcontentloaded"
      });
      await caseListPage.acceptAnalyticsCookies();
      await caseListPage.waitForReady();
      await ensureVisibleCaseListResult(page, async () => {
        await caseListPage.exuiCaseListComponent.resultLinks.first().waitFor({
          state: "visible",
          timeout: 30_000
        });
      });
      await resetTabSelectionTracker(page);
      const caseDetailsResponse = page.waitForResponse((response) => {
        return (
          response.request().method() === "GET" &&
          response.url().includes("/internal/cases/")
        );
      });
      await caseListPage.exuiCaseListComponent.selectCaseByIndex(0);
      await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
      await caseDetailsPage.waitForReady();

      caseMeta = await extractCaseMeta(caseDetailsResponse);
    });

    const caseReference = await caseDetailsPage.exuiCaseDetailsComponent.getCaseNumber();
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
