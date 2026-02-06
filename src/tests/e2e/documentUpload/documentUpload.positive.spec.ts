import { faker } from "@faker-js/faker";
import { createLogger } from "@hmcts/playwright-common";
import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import { expectCaseBanner } from "../../../utils/ui/banner.utils.js";
import { UserUtils } from "../../../utils/ui/user.utils.js";
import {
  applyCookiesToPage,
  ensureSessionCookies,
} from "../integration/utils/session.utils.js";

import { TEST_DATA } from "./constants.js";

const logger = createLogger({
  serviceName: "document-upload-tests",
  format: "pretty",
});

const userUtils = new UserUtils();
const requiredUsers = ["SOLICITOR", "SEARCH_EMPLOYMENT_CASE"];
const missingUsers = requiredUsers.filter(
  (user) => !userUtils.hasUserCredentials(user),
);
const shouldRunDocumentUpload = missingUsers.length === 0;

if (shouldRunDocumentUpload) {
  test.describe("Document upload V2", () => {
    test.describe.configure({ timeout: 120_000 });

    let testValue = "";
    let caseNumber = "";
    let solicitorCookies: Cookie[] = [];

    test.beforeAll(async () => {
      faker.seed(12_345);
      const session = await ensureSessionCookies("SOLICITOR", { strict: true });
      solicitorCookies = session.cookies;
    });

    test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
      testValue = `${faker.person.firstName()}-${Date.now()}-w${process.env.TEST_WORKER_INDEX || "0"}`;
      logger.info("Generated test value", {
        testValue,
        worker: process.env.TEST_WORKER_INDEX,
      });

      await applyCookiesToPage(page, solicitorCookies);
      await page.goto("/");
      await createCasePage.createDivorceCase(
        TEST_DATA.V2.JURISDICTION,
        TEST_DATA.V2.CASE_TYPE,
        testValue,
      );
      caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
      logger.info("Created divorce case", { caseNumber, testValue });
    });

    test("Check the documentV2 upload works as expected", async ({
      createCasePage,
      caseDetailsPage,
    }) => {
      await test.step("Verify case details tab does not contain an uploaded file", async () => {
        await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME);
        const caseViewerTable = caseDetailsPage.page.getByRole("table", {
          name: "case viewer table",
        });
        await caseViewerTable.waitFor({ state: "visible" });
        const textFieldRow = caseViewerTable.getByRole("row", {
          name: TEST_DATA.V2.TEXT_FIELD_LABEL,
        });
        await expect(textFieldRow).toContainText(testValue);
      });

      await test.step("Upload a document to the case", async () => {
        await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME);
        await caseDetailsPage.selectCaseAction(TEST_DATA.V2.ACTION);
        await createCasePage.uploadFile(
          TEST_DATA.V2.FILE_NAME,
          TEST_DATA.V2.FILE_TYPE,
          TEST_DATA.V2.FILE_CONTENT,
        );
        await createCasePage.clickContinueMultipleTimes(4);
        await createCasePage.submitButton.click();
        await caseDetailsPage.exuiSpinnerComponent.wait();
        await expect(caseDetailsPage.caseAlertSuccessMessage).toBeVisible();
      });

      await test.step("Verify the document upload was successful", async () => {
        const bannerText =
          await caseDetailsPage.caseAlertSuccessMessage.innerText();
        expectCaseBanner(
          bannerText,
          caseNumber,
          `has been updated with event: ${TEST_DATA.V2.ACTION}`,
        );

        await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME);
        const caseViewerTable = caseDetailsPage.page.getByRole("table", {
          name: "case viewer table",
        });
        await caseViewerTable.waitFor({ state: "visible" });

        const textFieldRow = caseViewerTable.getByRole("row", {
          name: TEST_DATA.V2.TEXT_FIELD_LABEL,
        });
        await expect(textFieldRow).toContainText(testValue);

        const documentRow = caseViewerTable.getByRole("row", {
          name: TEST_DATA.V2.DOCUMENT_FIELD_LABEL,
        });
        await expect(documentRow).toContainText(TEST_DATA.V2.FILE_NAME);
      });
    });
  });

  test.describe("Document upload V1", () => {
    test.describe.configure({ timeout: 120_000 });

    let testValue = "";
    let testFileName = "";
    let caseNumber = "";
    let employmentCookies: Cookie[] = [];

    test.beforeAll(async () => {
      faker.seed(67_890);
      const session = await ensureSessionCookies("SEARCH_EMPLOYMENT_CASE", {
        strict: true,
      });
      employmentCookies = session.cookies;
    });

    test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
      testValue = `${faker.person.firstName()}-${Date.now()}-w${process.env.TEST_WORKER_INDEX || "0"}`;
      testFileName = `${faker.string.alphanumeric(8)}-${Date.now()}.pdf`;
      logger.info("Generated test values", {
        testValue,
        testFileName,
        worker: process.env.TEST_WORKER_INDEX,
      });

      await applyCookiesToPage(page, employmentCookies);
      await page.goto("/");
      await createCasePage.createCaseEmployment(
        TEST_DATA.V1.JURISDICTION,
        TEST_DATA.V1.CASE_TYPE,
      );
      expect(
        await createCasePage.checkForErrorMessage(),
        "Error message seen after creating employment case",
      ).toBe(false);
      caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
      logger.info("Created employment case", { caseNumber, testValue });
    });

    test("Check the documentV1 upload works as expected", async ({
      createCasePage,
      caseDetailsPage,
      tableUtils,
    }) => {
      await test.step("Start document upload process", async () => {
        await caseDetailsPage.selectCaseDetailsEvent(TEST_DATA.V1.ACTION);
      });

      await test.step("Upload a document to the case", async () => {
        await createCasePage.uploadEmploymentFile(
          testFileName,
          TEST_DATA.V1.FILE_TYPE,
          TEST_DATA.V1.FILE_CONTENT,
        );
      });

      await test.step("Verify document was uploaded successfully", async () => {
        await caseDetailsPage.selectCaseDetailsTab("Documents");
        await caseDetailsPage.caseActionGoButton.waitFor({ state: "visible" });

        const table = await caseDetailsPage.getDocumentsList();
        expect(
          table.length,
          "Documents table should contain at least 1 row",
        ).toBeGreaterThan(0);
        expect(table[0]).toMatchObject({
          Number: "1",
          Document: testFileName,
          "Document Category": "Misc",
          "Type of Document": "Other",
        });

        const documentsTable = caseDetailsPage.caseDocumentsTable.first();
        const parsedRows = await tableUtils.mapExuiTable(documentsTable);
        const hasUploadedDocument = parsedRows.some(
          (row: Record<string, string>) => row.Document === testFileName,
        );
        expect(
          hasUploadedDocument,
          "TableUtils should find the uploaded document row",
        ).toBe(true);
      });
    });
  });
}
