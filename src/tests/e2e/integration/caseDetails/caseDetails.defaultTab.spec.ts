import type { Page } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import {
  ensureSearchCaseSession,
  openHomeWithCapturedSession,
  PUBLIC_LAW_CASE_REFERENCE_OPTIONS
} from "../../searchCase/searchCase.setup.js";
import { resolveCaseReferenceFromGlobalSearch } from "../../utils/case-reference.utils.js";

const userIdentifier = "FPL_GLOBAL_SEARCH";
const jurisdiction = "Public Law";
const caseType = "Public Law Applications";
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
  const decodeTarget = (value: string) => {
    try {
      return decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
      return value;
    }
  };
  try {
    const parsed = new URL(url);
    const hash = parsed.hash.replace(/^#/, "").trim();
    if (hash) return decodeTarget(hash);

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
      if (value?.trim()) return decodeTarget(value.trim());
    }
  } catch {
    const hashIndex = url.indexOf("#");
    if (hashIndex >= 0) {
      const fragment = url.slice(hashIndex + 1).trim();
      if (fragment) return decodeTarget(fragment);
    }
  }

  const pathMatch = url.match(/\/tab[s]?\/([^/?#]+)/i);
  return pathMatch?.[1] ? decodeTarget(pathMatch[1]) : null;
};

const assertNoExplicitTabOverride = (page: Page, label: string) => {
  const explicit = resolveExplicitTabTarget(page.url());
  if (explicit && !/^(summary|case details)$/i.test(explicit)) {
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
      currentSelected: expect.stringMatching(/^(summary|case details)$/i)
    });

  const selections = await getTabSelectionChanges(page);
  const normalized = selections.map((value) => value.toLowerCase());
  const defaultTabIndex = normalized.findIndex((value) => /^(summary|case details)$/i.test(value));
  if (defaultTabIndex >= 0) {
    const afterDefaultTab = normalized.slice(defaultTabIndex);
    const onlyDefaultTabAfter = afterDefaultTab.every((value) => /^(summary|case details)$/i.test(value));
    expect(onlyDefaultTabAfter, `${label}: default tab should remain selected once chosen`).toBe(true);
  }

  const currentSelected = (await selectedTabs.first().textContent())?.toLowerCase() ?? "";
  expect(currentSelected, `${label}: Summary/Case Details should be the selected tab`).toMatch(
    /^(summary|case details)$/i
  );
};

test.describe("@EXUI-3895 Case details default tab selection", () => {
  test.beforeAll(async () => {
    await ensureSearchCaseSession(userIdentifier);
  });

  test("@EXUI-3895 Summary tab remains default when opening case details", async ({
    caseDetailsPage,
    caseSearchPage,
    page
  }) => {
    await installTabSelectionTracker(page);
    await openHomeWithCapturedSession(page, userIdentifier);

    const caseReference = await resolveCaseReferenceFromGlobalSearch(
      page,
      PUBLIC_LAW_CASE_REFERENCE_OPTIONS
    );

    await test.step("Open case details via Find Case", async () => {
      await caseSearchPage.startFindCaseJourney(caseReference, caseType, jurisdiction);
      await resetTabSelectionTracker(page);
      await caseSearchPage.openCaseDetailsFor(caseReference);
      await caseDetailsPage.waitForReady();
    });

    await assertSummaryTabIsDefault(page, "Find Case navigation");
  });
});
