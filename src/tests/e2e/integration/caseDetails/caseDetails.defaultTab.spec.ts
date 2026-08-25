import type { Page } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import { setupCaseForJourney } from "../../utils/test-setup/caseSetup.js";
import { buildCasePayloadFromTemplate } from "../../utils/test-setup/payloads/registry.js";
import { ensureUiSession, openHomeWithCapturedSession } from "../../utils/ui-session.utils.js";

const userIdentifier = "SEARCH_EMPLOYMENT_CASE";
const jurisdiction = "EMPLOYMENT";
const caseType = "ET_EnglandWales";
test.use({ storageState: { cookies: [], origins: [] } });
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

test.describe("@EXUI-3895 Case details default tab selection", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    await ensureUiSession(userIdentifier);
  });

  test("@EXUI-3895 Summary tab remains default when opening case details", async ({
    caseDetailsPage,
    caseSearchPage,
    createCasePage,
    page
  }, testInfo) => {
    await installTabSelectionTracker(page);
    await openHomeWithCapturedSession(page, userIdentifier);

    const setup = await setupCaseForJourney({
      scenario: "case-details-default-tab-employment",
      jurisdiction,
      caseType,
      apiEventId: "initiateCase",
      mode: "api-required",
      apiPayload: buildCasePayloadFromTemplate("employment.et-england-wales.initiate-case"),
      uiCreate: async () => {
        await createCasePage.createCaseEmployment(jurisdiction, caseType, "");
      },
      page,
      createCasePage,
      caseDetailsPage,
      testInfo
    });

    const caseReference = setup.caseNumber;
    await caseDetailsPage.waitForReady();
    await assertSummaryTabIsDefault(page, "Case setup navigation");

    await test.step("Open case details via Find Case", async () => {
      await resetTabSelectionTracker(page);
      await caseSearchPage.goto();
      await caseSearchPage.waitForReady();
      await caseSearchPage.ensureFiltersVisible();
      await caseSearchPage.selectJurisdiction(jurisdiction);
      await caseSearchPage.selectCaseType(caseType);
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
