import { test, expect } from "../../fixtures/test.ts";

test.describe("@regression create case", () => {
  test.beforeEach(async ({ idamPage, determinePage, userUtils, config }) => {
    if (!config.users.solicitor?.username || !config.users.solicitor?.password) {
      // eslint-disable-next-line playwright/no-skipped-test
      test.skip("Solicitor credentials are not configured");
    }

    await determinePage.goto(config.urls.manageCaseBaseUrl);
    const { email, password } = userUtils.getUserCredentials("SOLICITOR");
    await idamPage.login({ username: email, password });
  });

  test("creates a case and surfaces it in search results", async ({
    validatorUtils,
    createCasePage,
    caseListPage,
    tableUtils,
  }) => {
    let caseNumber = "";
    const textField0 = `auto-${Date.now()}`;

    await test.step("Create a case and capture the case number", async () => {
      await createCasePage.createDivorceCase("DIVORCE", "XUI Case PoC", textField0);
      await expect(createCasePage.exuiCaseDetailsComponent.caseHeader).toBeInViewport();
      caseNumber = await createCasePage.exuiCaseDetailsComponent.caseHeader.innerText();
      validatorUtils.validateDivorceCaseNumber(caseNumber);
    });

    await test.step("Filter the case list by jurisdiction, type and marker", async () => {
      await caseListPage.goto();
      await caseListPage.searchByJurisdiction("Family Divorce");
      await caseListPage.searchByCaseType("XUI Case PoC");
      await caseListPage.searchByTextField0(textField0);
    });

    await test.step("Verify the created case appears in results", async () => {
      await caseListPage.exuiCaseListComponent.searchByCaseState("Case created");
      const table = await tableUtils.mapExuiTable(caseListPage.exuiCaseListComponent.caseListTable);
      expect(table[0]["Case reference"]).toBe(`${caseNumber.slice(1)}`);
    });
  });
});
