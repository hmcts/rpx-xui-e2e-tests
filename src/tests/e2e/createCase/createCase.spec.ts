import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";

test.describe("Verify creating cases works as expected", () => {
  test.setTimeout(360_000);
  test.beforeEach(async ({ caseListPage, config }) => {
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

    await test.step("Create a case and validate the case number", async () => {
      await createCasePage.createDivorceCase("DIVORCE", "XUI Case PoC", textField0);
      await expect(createCasePage.exuiCaseDetailsComponent.caseHeader).toBeVisible();
      caseNumber = await createCasePage.exuiCaseDetailsComponent.caseHeader.innerText();
      validatorUtils.validateDivorceCaseNumber(caseNumber);
    });

    await test.step("Find the created case in the case list", async () => {
      await caseListPage.goto();
      await caseListPage.searchByJurisdiction("Family Divorce");
      await caseListPage.searchByCaseType("XUI Case PoC");
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
