import { IdamPage } from "@hmcts/playwright-common";
import type { Browser, Cookie, Locator, Page, Response } from "@playwright/test";

import { expect, test as baseTest } from "../../../../fixtures/ui";
import { CaseDetailsPage } from "../../../../page-objects/pages/exui/caseDetails.po.js";
import { CaseListPage } from "../../../../page-objects/pages/exui/caseList.po.js";
import { CaseSearchPage } from "../../../../page-objects/pages/exui/caseSearch.po.js";
import { loadSessionCookies } from "../utils/session.utils.js";

const test = baseTest.extend({
  autoAcceptAnalytics: async ({ page }, use) => {
    void page;
    await use(undefined);
  },
  attachUserContext: async ({ page }, use) => {
    void page;
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

const normalizeEmail = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
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
  value.replace(/\s+/g, " ").trim().toLowerCase();

const ensureQueriesTabSelected = async (page: Page): Promise<void> => {
  const queriesTab = page.getByRole("tab", { name: /queries/i });
  await queriesTab.waitFor({ state: "visible" });
  const selected = await queriesTab.getAttribute("aria-selected");
  if (selected !== "true") {
    await queriesTab.click();
  }
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
    senderName: normalized.findIndex((header) => header === "sender name"),
    lastSubmittedBy: normalized.findIndex((header) => header === "last submitted by")
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
  while (Date.now() < deadline) {
    const count = await caseListPage.exuiCaseListComponent.resultLinks.count();
    if (count > 0) {
      return count;
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

const pickRandomCaseId = async (
  page: Page,
  caseListPage: CaseListPage,
  caseDetailsPage: CaseDetailsPage
): Promise<{ caseId: string; caseReference: string; caseMeta: CaseMeta }> => {
  if (page.isClosed()) {
    throw new Error("Case list page closed before selecting a case.");
  }
  let caseDetailsResponse: Promise<Response> | null = null;
  try {
    caseDetailsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" && response.url().includes("/internal/cases/"),
      { timeout: 45_000 }
    );
  } catch {
    caseDetailsResponse = null;
  }

  const total = await waitForCaseListResults(caseListPage, 60_000);
  const index = Math.floor(Math.random() * total);
  await caseListPage.exuiCaseListComponent.selectCaseByIndex(index);
  await caseDetailsPage.exuiCaseDetailsComponent.waitForSelectionOutcome();
  await caseDetailsPage.waitForReady();

  const response = caseDetailsResponse ? await caseDetailsResponse.catch(() => null) : null;
  let caseMeta: CaseMeta = {};
  if (response) {
    const data = await response.json().catch(() => null);
    caseMeta = {
      jurisdiction: data?.case_type?.jurisdiction?.name ?? undefined,
      caseType: data?.case_type?.name ?? undefined
    };
  }
  const caseReference = await caseDetailsPage.exuiCaseDetailsComponent.getCaseNumber();
  const cleaned = caseReference.replace(/[^0-9]/g, "");
  if (!cleaned) {
    throw new Error(`Unable to resolve case id from "${caseReference}".`);
  }
  return { caseId: cleaned, caseReference, caseMeta };
};

const openRaiseQueryFlow = async (page: Page): Promise<void> => {
  const link = page.getByRole("link", { name: /raise a new query|raise a query/i }).first();
  if (await link.isVisible().catch(() => false)) {
    await link.click();
    return;
  }
  const button = page.getByRole("button", { name: /raise a new query|raise a query/i }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return;
  }
  throw new Error("Raise a new query action not available from the Queries tab.");
};

const openRespondToQueryFlow = async (page: Page): Promise<void> => {
  const responseBody = page.locator("#body");
  if (await responseBody.isVisible().catch(() => false)) {
    return;
  }
  const respondLink = page.getByRole("link", { name: /respond to a query/i }).first();
  if (await respondLink.isVisible().catch(() => false)) {
    await respondLink.click();
    return;
  }
  const respondButton = page.getByRole("button", { name: /respond to a query/i }).first();
  if (await respondButton.isVisible().catch(() => false)) {
    await respondButton.click();
    return;
  }
  throw new Error("Respond to a query action not available from the Query details view.");
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

  test.beforeAll(async ({ browser }, testInfo) => {
    void browser;
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
    const querySubject = `EXUI-3695 HMCTS ${Date.now()}`;
    const queryBody = `EXUI-3695 suffix check ${Date.now()}`;
    const responseBody = `EXUI-3695 response ${Date.now()}`;

    let caseReference = "";
    let caseMeta: CaseMeta = {};

    await test.step("Pick a random case and raise a non-hearing query as solicitor", async () => {
      const { context, page, caseDetailsPage, caseListPage } = await createContextForUser(
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
        const selection = await pickRandomCaseId(page, caseListPage, caseDetailsPage);
        caseReference = selection.caseReference;
        caseMeta = selection.caseMeta;

        await ensureQueriesTabSelected(page);
        await openRaiseQueryFlow(page);
        await caseDetailsPage.acceptAnalyticsCookies();
        await page.getByRole("radio", { name: /raise a new query/i }).check();
        await page.getByRole("button", { name: /^continue$/i }).click();
        await page.locator("#subject").waitFor({ state: "visible" });
        await page.locator("#subject").fill(querySubject);
        await page.locator("#body").fill(queryBody);
        await page.locator("#isHearingRelated-no").check();
        await page.getByRole("button", { name: /^continue$/i }).click();
        await expect(page.getByRole("heading", { name: /review query details/i })).toBeVisible();
        await page.getByRole("button", { name: /^submit$/i }).click();
        await expect(page.getByRole("heading", { name: /query submitted/i })).toBeVisible();
        await page.getByRole("link", { name: /go back to the case/i }).click();
        await caseDetailsPage.waitForReady();
        await ensureQueriesTabSelected(page);
        await findQueryRow(page, querySubject, 60_000);
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
        if (!caseMeta.jurisdiction || !caseMeta.caseType) {
          throw new Error("Case metadata missing for Find case search.");
        }

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

        await ensureQueriesTabSelected(page);
        const responseQueryRow = await findQueryRow(page, querySubject, 60_000);
        await openQueryDetailsFromRow(responseQueryRow.row, querySubject);

        await openRespondToQueryFlow(page);
        await page.locator("#body").fill(responseBody);
        await page.getByRole("button", { name: /^continue$/i }).click();
        await expect(
          page.getByRole("heading", { name: /review query response details/i })
        ).toBeVisible();
        await page.getByRole("button", { name: /^submit$/i }).click();
        await expect(page.getByRole("heading", { name: /query response submitted/i })).toBeVisible();

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
