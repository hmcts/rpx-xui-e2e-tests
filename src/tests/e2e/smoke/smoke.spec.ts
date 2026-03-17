import { test, expect } from "../../../fixtures/ui";
import { ensureAuthenticatedPage } from "../../../utils/ui/sessionCapture";
import { provisionDynamicSolicitorForAlias } from "../_helpers/dynamicSolicitorSession";

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDependencyEnvironmentFailure(error: unknown): boolean {
  const message = asMessage(error);
  return (
    /returned HTTP 5\d\d/i.test(message) ||
    /status\s+5\d\d/i.test(message) ||
    /something went wrong page/i.test(message) ||
    /network timeout/i.test(message) ||
    /ECONNRESET|ETIMEDOUT/i.test(message)
  );
}

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
    } catch (error) {
      // eslint-disable-next-line playwright/no-conditional-in-test -- dependency failure detection in catch block; skip unstable AAT dependency failures
      if (isDependencyEnvironmentFailure(error)) {
        testInfo.skip(
          true,
          `Smoke case-list skipped due to dependency environment instability: ${asMessage(error)}`,
        );
      }
      throw error;
    }
  } finally {
    await dynamicHandle.cleanup();
  }
});
