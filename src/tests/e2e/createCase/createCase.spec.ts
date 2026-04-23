import { faker } from "@faker-js/faker";
import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import { ensureUiStorageStateForUser } from "../../../utils/ui/session-storage.utils.js";
import { loadSessionCookies } from "../integration/utils/session.utils.js";
import { requireCreateCaseSelection } from "../utils/create-case-selection.utils.js";

test.describe("Verify creating cases works as expected", () => {
  const userIdentifier = "SOLICITOR";
  let sessionCookies: Cookie[] = [];
  test.use({ storageState: { cookies: [], origins: [] } });
  test.setTimeout(360_000);

  test.beforeAll(async () => {
    await ensureUiStorageStateForUser(userIdentifier, { strict: true });
    const { cookies } = loadSessionCookies(userIdentifier);
    sessionCookies = cookies;
  });

  test.beforeEach(async ({ caseListPage, config, page }) => {
    if (sessionCookies.length) {
      await page.context().addCookies(sessionCookies);
    }
    await caseListPage.page.goto(config.urls.manageCaseBaseUrl);
    await caseListPage.acceptAnalyticsCookies();
  });

  test("Verify creating a case works as expected", async ({
    validatorUtils,
    createCasePage,
    caseListPage,
    tableUtils
  }) => {
    let caseNumber = "";
    const textField0 = faker.lorem.word();
    const desiredJurisdiction = "DIVORCE";
    const desiredCaseType = "XUI Case PoC";
    const selection = await createCasePage.resolveCreateCaseSelection(
      desiredJurisdiction,
      desiredCaseType
    );
    const {
      jurisdictionValue,
      jurisdictionLabel,
      caseTypeValue,
      caseTypeLabel
    } = requireCreateCaseSelection(selection, desiredJurisdiction, desiredCaseType);

    await test.step("Create a case and validate the case number", async () => {
      await createCasePage.createDivorceCase(jurisdictionValue, caseTypeValue, textField0);
      await expect(createCasePage.exuiCaseDetailsComponent.caseHeader).toBeVisible();
      caseNumber = await createCasePage.exuiCaseDetailsComponent.caseHeader.innerText();
      validatorUtils.validateDivorceCaseNumber(caseNumber);
    });

    await test.step("Find the created case in the case list", async () => {
      await caseListPage.goto();
      await caseListPage.searchByJurisdiction(jurisdictionLabel);
      await caseListPage.searchByCaseType(caseTypeLabel);
      await caseListPage.searchByTextField0(textField0);
      await caseListPage.exuiCaseListComponent.searchByCaseState("Case created");
      await caseListPage.applyFilters();
    });

    await test.step("Confirm the created case is in the search results", async () => {
      const table = await tableUtils.mapExuiTable(
        caseListPage.exuiCaseListComponent.caseListTable
      );
      const found = table.some((row) => row["Case reference"] === caseNumber.slice(1));
      expect(found).toBeTruthy();
    });
  });
});
