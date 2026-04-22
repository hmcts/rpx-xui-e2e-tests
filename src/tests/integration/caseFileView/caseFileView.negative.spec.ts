import { expect, test } from "../../../fixtures/ui";
import { loadSessionCookies } from "../../e2e/integration/utils/session.utils.js";
import { setupCaseFileViewMockRoutes } from "../helpers/index.js";
import { ensureUiSessionAccess } from "../helpers/uiSessionAccess.helper.js";
import { buildEmptyCaseFileViewCategoriesMock } from "../mocks/caseFileView.mock.js";

const caseId = "1690807693531270";
const userIdentifier = "SOLICITOR";

test.beforeAll(async ({}, testInfo) => {
  await ensureUiSessionAccess(userIdentifier, testInfo);
});

test.describe(`Case file view negative with ${userIdentifier}`, { tag: ["@integration", "@integration-case-file-view"] }, () => {
  test.beforeEach(async ({ page }) => {
    const { cookies } = loadSessionCookies(userIdentifier);
    if (cookies.length) {
      await page.context().addCookies(cookies);
    }
  });

  test("Empty categories response shows an empty case file view state", async ({
    caseDetailsPage,
    caseFileViewPage,
    page
  }) => {
    await test.step("Set up case file view mocks with no categories", async () => {
      await setupCaseFileViewMockRoutes(page, caseId, {
        categoriesMock: buildEmptyCaseFileViewCategoriesMock()
      });
    });

    await test.step("Open the Case File View tab", async () => {
      await page.goto(`/cases/case-details/PRIVATELAW/PRLAPPS/${caseId}`);
      await caseDetailsPage.selectCaseDetailsTab("Case File View");
      await caseFileViewPage.waitForReady();
    });

    await test.step("Show the empty state without crashing", async () => {
      await expect(caseFileViewPage.documentHeader).toContainText("Documents (0)");
      await expect(caseFileViewPage.treeContainer).toContainText("No results found");
      await expect(caseFileViewPage.mediaViewerContainer).toBeVisible();
    });
  });

  test("Document binary failure keeps the case file view stable", async ({
    caseDetailsPage,
    caseFileViewPage,
    page
  }) => {
    let failedBinaryRequest = false;

    await test.step("Set up case file view mocks with a failing binary endpoint", async () => {
      await setupCaseFileViewMockRoutes(page, caseId);
      await page.route("**/documentsv2/*/binary", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "forced document binary failure" })
        });
      });
      await page.route("**/documents/*/binary", async (route) => {
        failedBinaryRequest = true;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "forced document binary failure" })
        });
      });
    });

    await test.step("Open the Case File View tab", async () => {
      await page.goto(`/cases/case-details/PRIVATELAW/PRLAPPS/${caseId}`);
      await caseDetailsPage.selectCaseDetailsTab("Case File View");
      await caseFileViewPage.waitForReady();
    });

    await test.step("Keep the page shell visible after a document load failure", async () => {
      await caseFileViewPage.clickFile("Evidence", "Alpha evidence.pdf");
      await expect.poll(() => failedBinaryRequest).toBe(true);
      await expect(caseFileViewPage.documentHeader).toContainText("Documents (6)");
      await expect(caseFileViewPage.treeContainer).toContainText("Evidence");
      await expect(caseFileViewPage.mediaViewerToolbar).toBeHidden();
      await expect(caseFileViewPage.mediaViewPanel).toBeHidden();
    });
  });
});
