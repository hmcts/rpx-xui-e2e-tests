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

    await test.step("Find the created case in the case list", async () => {
      await retryOnTransientFailure(
        async () => {
          await caseListPage.goto();
          await caseListPage.searchByJurisdiction("Family Divorce");
          await caseListPage.searchByCaseType("XUI Case PoC");
          await caseListPage.searchByTextField0(testField);
          await caseListPage.exuiCaseListComponent.searchByCaseState(
            "Case created",
          );
          await caseListPage.applyFilters();
        },
        {
          maxAttempts: 3,
          onRetry: async () => {
            if (page.isClosed()) {
              return;
            }
            await page
              .reload({ waitUntil: "domcontentloaded" })
              .catch(() => undefined);
          },
        },
      );
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
