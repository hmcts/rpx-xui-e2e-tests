import { faker } from "@faker-js/faker";
import { createLogger } from "@hmcts/playwright-common";
import { Response } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import { expectCaseBanner } from "../../../utils/ui/index";
import { ensureAuthenticatedPage } from "../../../utils/ui/sessionCapture";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils";

import { TEST_DATA } from "./constants";

const logger = createLogger({
  serviceName: "document-upload-tests",
  format: "pretty",
});
const DOCUMENT_UPLOAD_SUBMIT_TIMEOUT_MS = 90_000;

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDependencyEnvironmentFailure(error: unknown): boolean {
  const message = asMessage(error);
  return (
    /returned HTTP 5\d\d/i.test(message) ||
    /returned HTTP 4\d\d/i.test(message) ||
    /status\s+5\d\d/i.test(message) ||
    /status\s+4\d\d/i.test(message) ||
    /critical backend dependency failure/i.test(message) ||
    /validation error after submit/i.test(message) ||
    /callback data failed validation/i.test(message) ||
    /No case type found/i.test(message) ||
    /aggregated\/caseworkers\/.*\/jurisdictions/i.test(message) ||
    /something went wrong page/i.test(message) ||
    /waitForFunction:\s*Timeout \d+ms exceeded/i.test(message) ||
    /did not become available/i.test(message) ||
    /Upload timed out after \d+ retries/i.test(message) ||
    /network timeout/i.test(message) ||
    /ECONNRESET|ETIMEDOUT/i.test(message) ||
    /Target page, context or browser has been closed/i.test(message) ||
    /Test timeout of \d+ms exceeded/i.test(message) ||
    /setup exceeded \d+ms/i.test(message)
  );
}

async function withTimeout<T>(
  action: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function isMissingEmploymentCreateCaseOption(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Option not found for "EMPLOYMENT"') ||
    message.includes('Option not found for "ET_EnglandWales"') ||
    message.includes(
      "Employment create-case flow unavailable: only 'Create draft claim' event is exposed.",
    )
  );
}

test.describe("Document upload V2", () => {
  test.describe.configure({ timeout: 180_000 });
  let testValue: string;
  let caseNumber: string;

  test.beforeAll(async () => {
    // Set deterministic seed once per suite
    faker.seed(12345);
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
    // Generate fresh value per test for retry safety
    testValue = `${faker.person.firstName()}-${Date.now()}-w${process.env.TEST_WORKER_INDEX || "0"}`;
    logger.info("Generated test value", {
      testValue,
      worker: process.env.TEST_WORKER_INDEX,
    });

    try {
      await retryOnTransientFailure(
        async () => {
          await withTimeout(
            (async () => {
              await ensureAuthenticatedPage(page, "SOLICITOR", {
                waitForSelector: "exui-header",
              });
              await createCasePage.createDivorceCase(
                TEST_DATA.V2.JURISDICTION,
                TEST_DATA.V2.CASE_TYPE,
                testValue,
              );
              caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
              logger.info("Created divorce case", { caseNumber, testValue });
            })(),
            180_000,
            "Document upload V2 setup exceeded 180000ms while creating a case",
          );
        },
        {
          maxAttempts: 2,
          onRetry: async () => {
            if (page.isClosed()) {
              return;
            }
            await page.goto("/").catch(() => undefined);
          },
        },
      );
    } catch (error) {
      if (isDependencyEnvironmentFailure(error)) {
        throw new Error(
          `Document-upload V2 setup failed due to dependency environment instability: ${asMessage(error)}`,
        );
      }
      throw error;
    }
  });

  test("Check the documentV2 upload works as expected", async ({
    createCasePage,
    caseDetailsPage,
  }) => {
    let caseDetailsUrl = "";

    await test.step("Verify case details tab does not contain an uploaded file", async () => {
      caseDetailsUrl = await caseDetailsPage.getCurrentPageUrl();
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
      let successfulUpdateEventPosts = 0;
      const updateEventEndpointPattern = new RegExp(
        String.raw`/data/cases/${caseNumber}/events(?:\?|$)`,
      );
      const onResponse = (response: Response) => {
        // eslint-disable-next-line playwright/no-conditional-in-test -- response filter in network listener; not a test assertion
        if (response.request().method() !== "POST") {
          return;
        }
        // eslint-disable-next-line playwright/no-conditional-in-test -- URL filter in network listener; not a test assertion
        if (!updateEventEndpointPattern.test(response.url())) {
          return;
        }
        // eslint-disable-next-line playwright/no-conditional-in-test -- status counter in network listener; not a test assertion
        if (response.status() < 400) {
          successfulUpdateEventPosts += 1;
        }
      };
      caseDetailsPage.page.on("response", onResponse);
      try {
        await retryOnTransientFailure(
          async () => {
            const callbackErrorVisible = await caseDetailsPage.page
              .getByText(
                /The callback data failed validation|No case type found/i,
              )
              .first()
              .isVisible()
              .catch(() => false);
            if (callbackErrorVisible) {
              throw new Error(
                "Upload blocked by callback validation error: No case type found",
              );
            }
            await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME);
            await caseDetailsPage.selectCaseAction(TEST_DATA.V2.ACTION);
            await createCasePage.uploadFile(
              TEST_DATA.V2.FILE_NAME,
              TEST_DATA.V2.FILE_TYPE,
              TEST_DATA.V2.FILE_CONTENT,
            );
            await createCasePage.clickContinueMultipleTimes(4, {
              timeoutMs: DOCUMENT_UPLOAD_SUBMIT_TIMEOUT_MS,
            });
            await createCasePage.clickSubmitAndWait(
              "after uploading V2 document",
              {
                timeoutMs: DOCUMENT_UPLOAD_SUBMIT_TIMEOUT_MS,
                maxAutoAdvanceAttempts: 3,
              },
            );
            await expect(caseDetailsPage.caseAlertSuccessMessage).toBeVisible({
              timeout: 30_000,
            });
          },
          {
            maxAttempts: 2,
            onRetry: async () => {
              try {
                await caseDetailsPage.reopenCaseDetails(caseDetailsUrl);
              } catch (reopenError) {
                logger.warn(
                  "Failed to reopen case details during V2 document upload retry; trying direct goto",
                  {
                    reopenError,
                    caseDetailsUrl,
                  },
                );
                await caseDetailsPage.page.goto(caseDetailsUrl);
              }
            },
          },
        );
      } catch (error) {
        if (isDependencyEnvironmentFailure(error)) {
          throw new Error(
            `Document-upload V2 submit failed due to dependency environment instability: ${asMessage(error)}`,
          );
        }
        throw error;
      } finally {
        caseDetailsPage.page.off("response", onResponse);
      }
      expect(successfulUpdateEventPosts).toBe(1);
    });

    await test.step("Verify the document upload was successful", async () => {
      await expect
        .poll(
          async () => {
            const bannerVisible = await caseDetailsPage.caseAlertSuccessMessage
              .isVisible()
              .catch(() => false);
            if (bannerVisible) {
              const bannerText = await caseDetailsPage.caseAlertSuccessMessage
                .innerText()
                .catch(() => "");
              if (
                bannerText.includes(caseNumber) &&
                bannerText.includes(
                  `has been updated with event: ${TEST_DATA.V2.ACTION}`,
                )
              ) {
                return true;
              }
            }

            await caseDetailsPage
              .selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME)
              .catch(() => undefined);
            const caseViewerTable = caseDetailsPage.page.getByRole("table", {
              name: "case viewer table",
            });
            const tableVisible = await caseViewerTable
              .isVisible()
              .catch(() => false);
            if (!tableVisible) {
              return false;
            }
            const documentRow = caseViewerTable.getByRole("row", {
              name: TEST_DATA.V2.DOCUMENT_FIELD_LABEL,
            });
            const documentText = await documentRow.innerText().catch(() => "");
            return documentText.includes(TEST_DATA.V2.FILE_NAME);
          },
          { timeout: 45_000, intervals: [1_000, 2_000, 3_000] },
        )
        .toBe(true);

      const bannerVisible = await caseDetailsPage.caseAlertSuccessMessage
        .isVisible()
        .catch(() => false);
      // eslint-disable-next-line playwright/no-conditional-in-test -- banner assertion is optional; banner may not render in all environments
      if (bannerVisible) {
        const bannerText =
          await caseDetailsPage.caseAlertSuccessMessage.innerText();
        expectCaseBanner(
          bannerText,
          caseNumber,
          `has been updated with event: ${TEST_DATA.V2.ACTION}`,
        );
      }

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
  test.describe.configure({ timeout: 240_000 });
  let testValue: string;
  let testFileName: string;
  let caseNumber: string;

  test.beforeAll(async () => {
    // Set deterministic seed once per suite
    faker.seed(67890);
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
    // Generate fresh values per test for retry safety
    testValue = `${faker.person.firstName()}-${Date.now()}-w${process.env.TEST_WORKER_INDEX || "0"}`;
    testFileName = `${faker.string.alphanumeric(8)}-${Date.now()}.pdf`;
    logger.info("Generated test values", {
      testValue,
      testFileName,
      worker: process.env.TEST_WORKER_INDEX,
    });

    try {
      await retryOnTransientFailure(
        async () => {
          await ensureAuthenticatedPage(page, "SEARCH_EMPLOYMENT_CASE", {
            waitForSelector: "exui-header",
            timeoutMs: 45_000,
          });
          await createCasePage.createCaseEmployment(
            TEST_DATA.V1.JURISDICTION,
            TEST_DATA.V1.CASE_TYPE,
          );
          caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
        },
        {
          maxAttempts: 2,
          onRetry: async () => {
            if (page.isClosed()) {
              return;
            }
            await page.goto("/").catch(() => undefined);
          },
        },
      );
    } catch (error) {
      if (isMissingEmploymentCreateCaseOption(error)) {
        throw new Error(
          "Document-upload V1 setup failed: EMPLOYMENT/ET_EnglandWales is not available in this environment.",
        );
      }
      if (isDependencyEnvironmentFailure(error)) {
        throw new Error(
          `Document-upload V1 setup failed due to dependency environment instability: ${asMessage(error)}`,
        );
      }
      throw error;
    }
    expect(
      await createCasePage.checkForErrorMessage(),
      "Error message seen after creating employment case",
    ).toBe(false);
    logger.info("Created employment case", { caseNumber, testValue });
  });

  test("Check the documentV1 upload works as expected", async ({
    createCasePage,
    caseDetailsPage,
    tableUtils,
  }) => {
    await test.step("Start document upload process", async () => {
      await caseDetailsPage.selectCaseAction(TEST_DATA.V1.ACTION, {
        expectedLocator: createCasePage.page.locator(
          "#documentCollection button",
        ),
      });
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
      const parsedRows = await tableUtils.parseDataTable(
        documentsTable,
        caseDetailsPage.page,
      );
      const hasUploadedDocument = parsedRows.some(
        (row) => row.Document === testFileName,
      );
      expect(
        hasUploadedDocument,
        "TableUtils should find the uploaded document row",
      ).toBe(true);
    });
  });
});
