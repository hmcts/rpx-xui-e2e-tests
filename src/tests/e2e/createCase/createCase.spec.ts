import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";
import { ensureSessionCookies } from "../../../utils/integration/session.utils.js";
import { normalizeCaseNumber } from "../../../utils/ui/banner.utils.js";
import { resolveUiStoragePathForUser } from "../../../utils/ui/storage-state.utils.js";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils.js";

const jurisdiction = "DIVORCE";
const caseType = "XUI Case PoC";
const userIdentifier = "SOLICITOR";

test.use({ storageState: resolveUiStoragePathForUser(userIdentifier) });

test.describe("Verify creating cases works as expected", () => {
  test.beforeAll(async () => {
    await ensureSessionCookies(userIdentifier, { strict: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Verify creating a case in the divorce jurisdiction works as expected", async ({
    page,
    validatorUtils,
    createCasePage,
    caseDetailsPage,
    caseListPage,
    tableUtils,
  }) => {
    test.setTimeout(360_000);
    let caseNumber = "";
    const testField = `${faker.lorem.word()}${new Date().toLocaleTimeString()}`;

    await test.step("Create a case and validate the case details", async () => {
      await retryOnTransientFailure(
        async () => {
          await createCasePage.createDivorceCase(
            jurisdiction,
            caseType,
            testField,
          );
          caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
          expect(caseNumber).toMatch(validatorUtils.DIVORCE_CASE_NUMBER_REGEX);
          expect(page.url()).toContain(`/${jurisdiction}/xuiTestJurisdiction/`);
        },
        {
          maxAttempts: 3,
          onRetry: async () => {
            if (page.isClosed()) {
              return;
            }
            await page.goto("/cases/case-filter").catch(() => undefined);
          },
        },
      );
    });

    await test.step("Validate the created case summary and history", async () => {
      const caseViewerTable = page
        .getByRole("table", { name: "case viewer table" })
        .first();
      await expect(caseViewerTable).toBeVisible();
      await expect(caseViewerTable).toContainText("Text Field 0");
      await expect(caseViewerTable).toContainText(testField);

      await caseDetailsPage.selectCaseDetailsTab("History");
      const historyRows = await caseDetailsPage.mapHistoryTable();
      const createCaseRow = historyRows.find(
        (row) => row.Event === "Create a case",
      );

      expect
        .soft(createCaseRow, "Create a case row should be present")
        .toBeTruthy();
      expect
        .soft(createCaseRow?.Author, "Create a case author should be present")
        .not.toBe("");

      const historyDetails = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.historyDetailsTable,
      );
      expect(historyDetails).toMatchObject({
        Date: createCaseRow?.Date ?? "",
        Author: createCaseRow?.Author ?? "",
        "End state": "Case created",
        Event: "Create a case",
      });
    });

    await test.step("Find the created case in the case list", async () => {
      await caseListPage.goto();
      await caseListPage.searchByJurisdiction("Family Divorce");
      await caseListPage.searchByCaseType("XUI Case PoC");
      await caseListPage.searchByTextField0(testField);
      await caseListPage.exuiCaseListComponent.searchByCaseState(
        "Case created",
      );
      await caseListPage.applyFilters();
    });

    await test.step("Confirm the created case is in the search results", async () => {
      const table = await tableUtils.mapExuiTable(
        caseListPage.exuiCaseListComponent.caseListTable,
      );
      const found = table.some(
        (row: Record<string, string>) =>
          normalizeCaseNumber(String(row["Case reference"] ?? "")) ===
          caseNumber,
      );
      expect(found).toBeTruthy();
    });
  });
});
