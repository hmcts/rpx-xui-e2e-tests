import { test } from "../../../fixtures/test";
import { PrlCaseListPage } from "../../../page-objects/prl/manage-cases/caseList.page";
import { createDummySolicitorCase } from "../../../utils/prl/caseCreation";
import { PrlManageCasesSession } from "../../../utils/prl/manageCasesSession";

test.describe("@prl @manage-cases Case list", () => {
  test("Solicitor can view case list with existing cases", async ({ page }) => {
    const session = new PrlManageCasesSession(page);
    await session.loginAsSolicitor();
    await createDummySolicitorCase(page);

    const caseList = new PrlCaseListPage(page);
    await caseList.goto();
    await caseList.showAllCases();
    await caseList.expectFiltersVisible();
    await caseList.expectResults();
  });
});
