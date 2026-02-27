import { test, expect } from "../../../fixtures/ui";
import { ensureAuthenticatedPage } from "../../../utils/ui/sessionCapture";
import { provisionDynamicSolicitorForAlias } from "../_helpers/dynamicSolicitorSession";

test("@smoke case list loads for authenticated session", async ({
  page,
  caseListPage,
  professionalUserUtils,
}, testInfo) => {
  const dynamicHandle = await provisionDynamicSolicitorForAlias({
    alias: "SOLICITOR",
    professionalUserUtils,
    roleContext: {
      jurisdiction: "divorce",
      testType: "case-create",
    },
    testInfo,
  });

  try {
    await ensureAuthenticatedPage(page, "SOLICITOR", {
      waitForSelector: "exui-header",
    });
    await caseListPage.navigateTo();
    await caseListPage.acceptAnalyticsCookies();
    await caseListPage.waitForReady();
    await expect(caseListPage.page).toHaveURL(/\/cases/i);
    await expect(caseListPage.container).toBeVisible();
    await expect(caseListPage.jurisdictionSelect).toBeVisible();
  } finally {
    await dynamicHandle.cleanup();
  }
});
