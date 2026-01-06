import type { Page } from "@playwright/test";

import { expect, test } from "../../../../fixtures/ui";
import { ensureUiStorageStateForUser } from "../../../../utils/ui/session-storage.utils.js";
import { resolveUiStoragePathForUser } from "../../../../utils/ui/storage-state.utils.js";

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
const shouldSkip =
  !hasCourtAdminCreds || (Boolean(explicitUsersEnv) && !includesCourtAdmin);

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
        w.__tabSelections.push(name);
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

const assertSummaryTabIsDefault = async (page: Page, label: string) => {
  await page.waitForSelector('div[role="tab"][aria-selected="true"]');
  await page.waitForTimeout(750);
  const selections = await getTabSelectionChanges(page);
  expect(selections.length, `${label}: no tab selections recorded`).toBeGreaterThan(0);
  expect(selections[0], `${label}: first selected tab should be Summary`).toMatch(/summary/i);
  const normalized = selections.map((value) => value.toLowerCase());
  const onlySummary = normalized.every((value) => value.includes("summary"));
  expect(onlySummary, `${label}: summary tab should remain selected`).toBe(true);
};

const findCaseByReference = async (page: Page, caseReference: string) => {
  let caseReferenceInput = page.getByLabel(/case reference/i);
  if (!(await caseReferenceInput.first().isVisible().catch(() => false))) {
    caseReferenceInput = page.locator(
      'input#caseReference, input[name="caseReference"], input[aria-label*="case reference" i], input[placeholder*="case reference" i]'
    );
  }

  await caseReferenceInput.first().fill(caseReference);

  let findButton = page.getByRole("button", { name: /find case/i });
  if (!(await findButton.first().isVisible().catch(() => false))) {
    findButton = page.getByRole("button", { name: /^find$/i });
  }
  await findButton.first().click();
};

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.describe("Case details default tab selection", () => {
  test.skip(!hasCourtAdminCreds, "COURT_ADMIN credentials not set");
  test.skip(
    Boolean(explicitUsersEnv) && !includesCourtAdmin,
    "PW_UI_USERS excludes COURT_ADMIN"
  );

  test.beforeAll(async () => {
    if (shouldSkip) {
      return;
    }
    await ensureUiStorageStateForUser(userIdentifier, { strict: true });
  });

  test("Summary tab remains default when opening case details", async ({
    caseListPage,
    caseDetailsPage,
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
      await caseListPage.exuiCaseListComponent.resultLinks.first().waitFor({ state: "visible" });
      await resetTabSelectionTracker(page);
      await caseListPage.exuiCaseListComponent.selectCaseByIndex(0);
      await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
      await caseDetailsPage.waitForReady();
    });

    const caseReference = await caseDetailsPage.exuiCaseDetailsComponent.getCaseNumber();
    await assertSummaryTabIsDefault(page, "Case list navigation");

    await test.step("Return to case list", async () => {
      await caseDetailsPage.exuiCaseDetailsComponent.returnToCaseList();
      await caseListPage.waitForReady();
    });

    await test.step("Open case details via Find Case", async () => {
      await resetTabSelectionTracker(page);
      await findCaseByReference(page, caseReference);
      await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
      await caseDetailsPage.waitForReady();
    });

    await assertSummaryTabIsDefault(page, "Find Case navigation");
  });
});
