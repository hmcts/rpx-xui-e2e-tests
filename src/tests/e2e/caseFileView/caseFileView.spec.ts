import { readFileSync } from "node:fs";
import path from "node:path";

import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";
import { setupCaseForJourney } from "../utils/test-setup/caseSetup.js";
import { uploadEmploymentDraftDocumentViaApi } from "../utils/test-setup/journeys/employmentJourneys.js";
import { buildCasePayloadFromTemplate } from "../utils/test-setup/payloads/registry.js";
import { ensureUiSession, openHomeWithCapturedSession } from "../utils/ui-session.utils.js";

const DESIRED_JURISDICTION = "EMPLOYMENT";
const DESIRED_CASE_TYPE = "ET_EnglandWales";
const DOCUMENT_CATEGORY_FOLDER = "Miscellaneous";
const DOCUMENT_FILE_FOLDER_PATH = "Miscellaneous.Other";
const DOCUMENT_MIME_TYPE = "application/pdf";
const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "src/tests/integration/testData/documents/case-file-view-document-delivery.pdf"
);
const FIXTURE_CONTENT = readFileSync(FIXTURE_PATH, "latin1");
const FIXTURE_VIEWER_TEXT = "Case File View - Document Delivery Fixture";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Case file view", { tag: ["@e2e", "@e2e-case-file-view"] }, () => {
  test.beforeAll(async () => {
    await ensureUiSession("SEARCH_EMPLOYMENT_CASE");
  });

  test("shows the uploaded file in the case file view and opens it in the viewer", async ({
    page,
    caseDetailsPage,
    caseFileViewPage,
    createCasePage
  }, testInfo) => {
    faker.seed(testInfo.retry + 1);
    const uniqueSuffix = `${Date.now()}-w${testInfo.workerIndex}-r${testInfo.retry}`;
    const documentFileName = `case-file-view-${uniqueSuffix}.pdf`;
    let caseDetailsUrl = "";

    await test.step("Open the app with the captured employment search session", async () => {
      await openHomeWithCapturedSession(page, "SEARCH_EMPLOYMENT_CASE");
      await expect(page.locator("exui-header")).toBeVisible();
    });

    await test.step("Create an employment case for this test run", async () => {
      const setup = await setupCaseForJourney({
        scenario: "case-file-view-employment",
        jurisdiction: DESIRED_JURISDICTION,
        caseType: DESIRED_CASE_TYPE,
        apiEventId: "initiateCase",
        mode: "api-required",
        apiPayload: buildCasePayloadFromTemplate("employment.et-england-wales.initiate-case"),
        uiCreate: async () => {
          await createCasePage.createCaseEmployment(DESIRED_JURISDICTION, DESIRED_CASE_TYPE, "");
        },
        page,
        createCasePage,
        caseDetailsPage,
        testInfo
      });
      caseDetailsUrl = await caseDetailsPage.getCurrentPageUrl();
      await uploadEmploymentDraftDocumentViaApi({
        page,
        caseNumber: setup.caseNumber,
        fileName: documentFileName,
        mimeType: DOCUMENT_MIME_TYPE,
        fileContent: FIXTURE_CONTENT,
        topLevelDocuments: "Misc",
        miscDocuments: "Other"
      });
    });

    await test.step("Open the case file view and confirm the file tree is present", async () => {
      await caseDetailsPage.reopenCaseDetails(caseDetailsUrl);
      await caseDetailsPage.selectCaseDetailsTab("Case File View");
      await caseFileViewPage.waitForReady();

      await expect(caseFileViewPage.treeContainer).toBeVisible();
      await expect(caseFileViewPage.mediaViewerContainer).toBeVisible();
      await expect(caseFileViewPage.documentHeader).toContainText("Documents (1)");
    });

    await test.step("Check the expected folder, file and document count", async () => {
      const folderNode = await caseFileViewPage.getFolderNode(DOCUMENT_CATEGORY_FOLDER);
      await expect(caseFileViewPage.getFolderName(folderNode)).toContainText(DOCUMENT_CATEGORY_FOLDER);
      await expect(caseFileViewPage.getFolderCount(folderNode)).toHaveText("1");
      await expect
        .poll(() => caseFileViewPage.getVisibleFileNamesUnderFolder(DOCUMENT_FILE_FOLDER_PATH))
        .toEqual([documentFileName]);
    });

    await test.step("Open the uploaded document and verify the viewer content", async () => {
      await caseFileViewPage.clickFile(DOCUMENT_FILE_FOLDER_PATH, documentFileName);
      await caseFileViewPage.mediaViewPanel.waitFor({ state: "visible" });
      await expect
        .poll(async () => (await caseFileViewPage.mediaViewPanel.textContent()) ?? "")
        .toContain(FIXTURE_VIEWER_TEXT);
    });
  });
});
