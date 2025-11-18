import { test } from "../../../fixtures/test";
import { PrlCaseTabsPage } from "../../../page-objects/prl/manage-cases/caseTabs.page";
import { createDummySolicitorCase } from "../../../utils/prl/caseCreation";
import { prlConfig, validatePrlConfig } from "../../../utils/prl/config";
import { PrlManageCasesSession } from "../../../utils/prl/manageCasesSession";

test.describe("@prl @manage-cases Case tabs", () => {
  test.beforeAll(() => {
    validatePrlConfig();
  });

  test("Solicitor can view Manage Cases tabs", async ({ page }) => {
    const session = new PrlManageCasesSession(page);
    await session.loginAsSolicitor();
    const caseRef =
      prlConfig.caseTabsCaseId ?? (await createDummySolicitorCase(page));
    await session.openCaseDetails(caseRef);

    const caseTabs = new PrlCaseTabsPage(page);
    await caseTabs.expectNavigationVisible();
    await caseTabs.expectTabCount(3);
  });

  test("Tab list includes key sections", async ({ page }) => {
    const session = new PrlManageCasesSession(page);
    await session.loginAsSolicitor();
    const caseRef = await createDummySolicitorCase(page);
    await session.openCaseDetails(caseRef);

    const caseTabs = new PrlCaseTabsPage(page);
    await caseTabs.expectNavigationVisible();
    await caseTabs.expectTabsInclude(["Tasks", "Application", "Service Request"]);
  });
});
