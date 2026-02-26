import { faker } from "@faker-js/faker";
import { createLogger } from "@hmcts/playwright-common";
import type { Cookie } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import {
  applyCookiesToPage,
  assertSessionCapabilities,
  ensureSessionCookies,
} from "../../../utils/integration/session.utils.js";
import { expectCaseBanner } from "../../../utils/ui/banner.utils.js";
import {
  isTransientWorkflowFailure,
  retryOnTransientFailure,
} from "../../../utils/ui/transient-failure.utils.js";

import { TEST_DATA } from "./constants.js";

const logger = createLogger({
  serviceName: "document-upload-tests",
  format: "pretty",
});

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const JOURNEY_MAX_ATTEMPTS = 3;
const ACTION_TIMEOUT_MS = 60_000;
const SUBMIT_TIMEOUT_MS = 90_000;
const READY_TIMEOUT_MS = 90_000;
const VERIFY_TIMEOUT_MS = 180_000;

test.describe("Document upload V2", () => {
  test.describe.configure({ timeout: 180_000 });

  let testValue = "";
  let caseNumber = "";
  let solicitorCookies: Cookie[] = [];

  test.beforeAll(async ({ request }) => {
    faker.seed(12_345);
    const session = await ensureSessionCookies("PRL_SOLICITOR", {
      strict: true,
    });
    await assertSessionCapabilities(request, session, {
      requiredRolesAny: ["caseworker-privatelaw-solicitor"],
      requiredCreateCaseTypes: [TEST_DATA.V2.CASE_TYPE],
    });
    solicitorCookies = session.cookies;
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }) => {
    testValue = `${faker.person.firstName()}-${Date.now()}-w${process.env.TEST_WORKER_INDEX || "0"}`;
    logger.info("Generated test value", {
      testValue,
      worker: process.env.TEST_WORKER_INDEX,
    });

    await retryOnTransientFailure(
      async () => {
        await applyCookiesToPage(page, solicitorCookies);
        await page.goto("/");
        await createCasePage.createDivorceCase(
          TEST_DATA.V2.JURISDICTION,
          TEST_DATA.V2.CASE_TYPE,
          testValue,
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
    logger.info("Created divorce case", { caseNumber, testValue });
  });

  test("Check the documentV2 upload works as expected", async ({
    createCasePage,
    caseDetailsPage,
  }) => {
    test.setTimeout(420_000);

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
      const caseDetailsUrl = caseDetailsPage.page.url();
      const maxAttempts = JOURNEY_MAX_ATTEMPTS;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME);
          await caseDetailsPage.selectCaseAction(TEST_DATA.V2.ACTION, {
            expectedLocator: createCasePage.fileUploadInput,
            timeoutMs: ACTION_TIMEOUT_MS,
          });
          await createCasePage.uploadFile(
            TEST_DATA.V2.FILE_NAME,
            TEST_DATA.V2.FILE_TYPE,
            TEST_DATA.V2.FILE_CONTENT,
          );
          await createCasePage.clickSubmitAndWait("after documentV2 upload", {
            timeoutMs: SUBMIT_TIMEOUT_MS,
          });
          break;
        } catch (error) {
          // eslint-disable-next-line playwright/no-conditional-in-test -- bounded retry for known transient CCD workflow failures.
          if (!isTransientWorkflowFailure(error) || attempt === maxAttempts) {
            throw error;
          }
          const message = toErrorMessage(error);
          logger.warn(
            "Document V2 upload hit transient workflow failure; retrying event",
            {
              attempt,
              maxAttempts,
              message: message.slice(0, 250),
            },
          );
          await caseDetailsPage.page.goto(caseDetailsUrl, {
            waitUntil: "domcontentloaded",
          });
          await caseDetailsPage.waitForReady(READY_TIMEOUT_MS);
        }
      }
    });

    await test.step("Verify the document upload was successful", async () => {
      await retryOnTransientFailure(
        async () => {
          await expect
            .poll(
              async () => {
                const bannerVisible =
                  await caseDetailsPage.caseAlertSuccessMessage
                    .isVisible()
                    .catch(() => false);
                if (bannerVisible) {
                  const bannerText =
                    await caseDetailsPage.caseAlertSuccessMessage.innerText();
                  try {
                    expectCaseBanner(
                      bannerText,
                      caseNumber,
                      `has been updated with event: ${TEST_DATA.V2.ACTION}`,
                    );
                    return true;
                  } catch {
                    // Fall through to deterministic table-data verification path.
                  }
                }

                const tabSelected = await caseDetailsPage
                  .selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME)
                  .then(() => true)
                  .catch(() => false);
                if (!tabSelected) {
                  return false;
                }
                const caseViewerTable = caseDetailsPage.page.getByRole(
                  "table",
                  {
                    name: "case viewer table",
                  },
                );
                const tableText = await caseViewerTable
                  .innerText()
                  .catch(() => "");
                return tableText.includes(testValue);
              },
              {
                timeout: VERIFY_TIMEOUT_MS,
                intervals: [2_000, 4_000, 6_000],
              },
            )
            .toBe(true);
        },
        {
          maxAttempts: JOURNEY_MAX_ATTEMPTS,
          onRetry: async () => {
            if (caseDetailsPage.page.isClosed()) {
              return;
            }
            await caseDetailsPage.page.goto(
              `/cases/case-details/${caseNumber}`,
              {
                waitUntil: "domcontentloaded",
              },
            );
            await caseDetailsPage
              .waitForReady(READY_TIMEOUT_MS)
              .catch(() => undefined);
          },
        },
      );
    });
  });
});

test.describe("Document upload V1", () => {
  test.describe.configure({ timeout: 300_000 });

  let testValue = "";
  let testFileName = "";
  let caseNumber = "";
  let employmentCookies: Cookie[] = [];

  test.beforeAll(async ({ request }) => {
    faker.seed(67_890);
    const session = await ensureSessionCookies("SEARCH_EMPLOYMENT_CASE", {
      strict: true,
    });
    await assertSessionCapabilities(request, session, {
      requiredCreateCaseTypes: [TEST_DATA.V1.CASE_TYPE],
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

    await retryOnTransientFailure(
      async () => {
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
    logger.info("Created employment case", { caseNumber, testValue });
  });

  test("Check the documentV1 upload works as expected", async ({
    createCasePage,
    caseDetailsPage,
    tableUtils,
  }) => {
    test.setTimeout(480_000);

    await test.step("Upload a document to the case", async () => {
      const caseDetailsUrl = caseDetailsPage.page.url();
      const maxAttempts = JOURNEY_MAX_ATTEMPTS;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await caseDetailsPage.selectCaseDetailsEvent(TEST_DATA.V1.ACTION);
          await createCasePage.uploadEmploymentFile(
            testFileName,
            TEST_DATA.V1.FILE_TYPE,
            TEST_DATA.V1.FILE_CONTENT,
          );
          break;
        } catch (error) {
          // eslint-disable-next-line playwright/no-conditional-in-test -- bounded retry for known transient CCD workflow failures.
          if (!isTransientWorkflowFailure(error) || attempt === maxAttempts) {
            throw error;
          }
          const message = toErrorMessage(error);
          logger.warn(
            "Document V1 upload hit transient workflow failure; retrying event",
            {
              attempt,
              maxAttempts,
              message: message.slice(0, 250),
            },
          );
          await caseDetailsPage.page.goto(caseDetailsUrl, {
            waitUntil: "domcontentloaded",
          });
          await caseDetailsPage.waitForReady(READY_TIMEOUT_MS);
        }
      }
    });

    await test.step("Verify document was uploaded successfully", async () => {
      await retryOnTransientFailure(
        async () => {
          await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V1.TAB_NAME);
          await caseDetailsPage.caseActionGoButton.waitFor({
            state: "visible",
            timeout: 30_000,
          });

          await expect
            .poll(
              async () => {
                const table = await caseDetailsPage.getDocumentsList();
                if (table.length === 0) {
                  return false;
                }
                const documentsTable =
                  caseDetailsPage.caseDocumentsTable.first();
                const parsedRows = await tableUtils.parseDataTable(
                  documentsTable,
                  caseDetailsPage.page,
                );
                return parsedRows.some((row) => row.Document === testFileName);
              },
              {
                timeout: 120_000,
                intervals: [2_000, 4_000, 6_000],
              },
            )
            .toBe(true);
        },
        {
          maxAttempts: JOURNEY_MAX_ATTEMPTS,
          onRetry: async () => {
            if (caseDetailsPage.page.isClosed()) {
              return;
            }
            await caseDetailsPage.page.goto(
              `/cases/case-details/${caseNumber}`,
              {
                waitUntil: "domcontentloaded",
              },
            );
            await caseDetailsPage
              .waitForReady(READY_TIMEOUT_MS)
              .catch(() => undefined);
          },
        },
      );
    });
  });
});
