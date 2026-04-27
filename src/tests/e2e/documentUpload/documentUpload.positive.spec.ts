import { faker } from "@faker-js/faker";
import type { Response } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import { caseBannerMatches } from "../utils/banner.utils.js";
import { setupCaseForJourney } from "../utils/test-setup/caseSetup.js";
import {
  createEmploymentCase,
  uploadEmploymentDraftDocument
} from "../utils/test-setup/journeys/employmentJourneys.js";
import { buildCasePayloadFromTemplate } from "../utils/test-setup/payloads/registry.js";
import { retryOnTransientFailure } from "../utils/transient-failure.utils.js";
import { ensureUiSession, openHomeWithCapturedSession } from "../utils/ui-session.utils.js";

import { TEST_DATA } from "./constants.js";

const DOCUMENT_UPLOAD_SUBMIT_TIMEOUT_MS = 60_000;
const DOCUMENT_UPLOAD_V1_TIMEOUT_MS = 300_000;

type UpdateEventCounter = { count: number };

function recordSuccessfulUpdateEventPost(
  counter: UpdateEventCounter,
  updateEventEndpointPattern: RegExp,
  response: Response
): void {
  const isMatchingUpdateEventPost =
    response.request().method() === "POST" &&
    updateEventEndpointPattern.test(response.url()) &&
    response.status() < 400;
  if (isMatchingUpdateEventPost) {
    counter.count += 1;
  }
}

async function assertCaseUpdateBannerIfPresent(
  caseDetailsPage: {
    caseAlertSuccessMessage: {
      isVisible(): Promise<boolean>;
      innerText(): Promise<string>;
    };
  },
  caseNumber: string,
  expectedEventSuffix: string
): Promise<void> {
  const bannerVisible = await caseDetailsPage.caseAlertSuccessMessage.isVisible().catch(() => false);
  if (!bannerVisible) {
    return;
  }

  const bannerText = await caseDetailsPage.caseAlertSuccessMessage.innerText();
  expect.soft(caseBannerMatches(bannerText, caseNumber, expectedEventSuffix)).toBe(true);
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Document upload V2", { tag: ["@e2e", "@e2e-document-upload"] }, () => {
  test.describe.configure({ timeout: 120_000 });
  let testValue = "";
  let caseNumber = "";
  let caseDetailsUrl = "";

  test.beforeAll(async () => {
    faker.seed(12_345);
    await ensureUiSession("SOLICITOR");
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }, testInfo) => {
    await test.step("Open the app with the captured solicitor session", async () => {
      await openHomeWithCapturedSession(page, "SOLICITOR");
      await createCasePage.acceptAnalyticsCookies();
      await createCasePage.waitForUiIdleState();
      await expect(page.locator("exui-header")).toBeVisible();
    });

    testValue = `${faker.person.firstName()}-${Date.now()}-w${testInfo.workerIndex}-r${testInfo.retry}`;
    const setup = await retryOnTransientFailure(
      async () =>
        setupCaseForJourney({
          scenario: "document-upload-v2-divorce",
          jurisdiction: TEST_DATA.V2.JURISDICTION,
          caseType: TEST_DATA.V2.CASE_TYPE,
          apiEventId: "createCase",
          mode: "api-required",
          apiPayload: buildCasePayloadFromTemplate("divorce.xui-test-case-type.create-case", {
            overrides: {
              TextField: testValue
            }
          }),
          uiCreate: async () => {
            await createCasePage.createDivorceCase(
              TEST_DATA.V2.JURISDICTION,
              TEST_DATA.V2.CASE_TYPE,
              testValue
            );
          },
          page,
          createCasePage,
          caseDetailsPage,
          testInfo
        }),
      {
        maxAttempts: 2,
        onRetry: async () => {
          if (!page.isClosed()) {
            await page.goto("/").catch(() => undefined);
          }
        }
      }
    );
    caseNumber = setup.caseNumber;
    caseDetailsUrl = await caseDetailsPage.getCurrentPageUrl();
  });

  test("Check the documentV2 upload works as expected", async ({
    page,
    createCasePage,
    caseDetailsPage
  }) => {

    await test.step("Verify case details do not contain the uploaded document yet", async () => {
      await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME);
      await expect(caseDetailsPage.caseViewerTable).toBeVisible();
      await expect(
        caseDetailsPage.caseViewerTable.getByRole("row", { name: TEST_DATA.V2.TEXT_FIELD_LABEL })
      ).toContainText(testValue);
    });

    await test.step("Upload a document to the case", async () => {
      const successfulUpdateEventPosts: UpdateEventCounter = { count: 0 };
      const updateEventEndpointPattern = new RegExp(`/data/cases/${caseNumber}/events(?:\\?|$)`);
      const onResponse = (response: Response) =>
        recordSuccessfulUpdateEventPost(successfulUpdateEventPosts, updateEventEndpointPattern, response);

      caseDetailsPage.page.on("response", onResponse);
      try {
        await retryOnTransientFailure(
          async () => {
            await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME);
            await caseDetailsPage.selectCaseAction(TEST_DATA.V2.ACTION);
            await createCasePage.uploadFile(
              TEST_DATA.V2.FILE_NAME,
              TEST_DATA.V2.FILE_TYPE,
              TEST_DATA.V2.FILE_CONTENT
            );
            await createCasePage.clickContinueMultipleTimes(3);
            await createCasePage.uploadFile(
              "complex-type-required-document.pdf",
              "application/pdf",
              "%PDF-1.4\n%test\n%%EOF",
              createCasePage.complexType3FileUploadInput
            );
            await createCasePage.clickSubmitAndWait("after uploading V2 document", {
              timeoutMs: DOCUMENT_UPLOAD_SUBMIT_TIMEOUT_MS,
              maxAutoAdvanceAttempts: 3
            });
            await expect(caseDetailsPage.caseAlertSuccessMessage).toBeVisible({ timeout: 30_000 });
          },
          {
            maxAttempts: 2,
            onRetry: async () => {
              if (page.isClosed()) {
                throw new Error('Page closed before document upload retry recovery.');
              }
              await caseDetailsPage.reopenCaseDetails(caseDetailsUrl).catch(async () => {
                await page.goto(caseDetailsUrl);
              });
            }
          }
        );
      } finally {
        caseDetailsPage.page.off("response", onResponse);
      }

      expect(successfulUpdateEventPosts.count).toBe(1);
    });

    await test.step("Verify the document upload was successful", async () => {
      await expect
        .poll(
          async () => {
            await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V2.TAB_NAME).catch(() => undefined);
            const tableVisible = await caseDetailsPage.caseViewerTable.isVisible().catch(() => false);
            if (!tableVisible) {
              return false;
            }

            const textFieldRow = caseDetailsPage.caseViewerTable.getByRole("row", {
              name: TEST_DATA.V2.TEXT_FIELD_LABEL
            });
            const textFieldValue = await textFieldRow.innerText().catch(() => "");
            if (!textFieldValue.includes(testValue)) {
              return false;
            }

            const documentRow = caseDetailsPage.caseViewerTable.getByRole("row", {
              name: TEST_DATA.V2.DOCUMENT_FIELD_LABEL
            });
            const documentText = await documentRow.innerText().catch(() => "");
            return documentText.includes(TEST_DATA.V2.FILE_NAME);
          },
          { timeout: 45_000, intervals: [1_000, 2_000, 3_000] }
        )
        .toBe(true);

      await assertCaseUpdateBannerIfPresent(
        caseDetailsPage,
        caseNumber,
        `has been updated with event: ${TEST_DATA.V2.ACTION}`
      );
    });
  });
});

test.describe("Document upload V1", { tag: ["@e2e", "@e2e-document-upload"] }, () => {
  test.describe.configure({ timeout: DOCUMENT_UPLOAD_V1_TIMEOUT_MS });
  let testFileName = "";
  let caseDetailsUrl = "";

  test.beforeAll(async () => {
    faker.seed(67_890);
    await ensureUiSession("SEARCH_EMPLOYMENT_CASE");
  });

  test.beforeEach(async ({ page, createCasePage, caseDetailsPage }, testInfo) => {
    await test.step("Open the app with the captured employment search session", async () => {
      await openHomeWithCapturedSession(page, "SEARCH_EMPLOYMENT_CASE");
      await createCasePage.acceptAnalyticsCookies();
      await createCasePage.waitForUiIdleState();
      await expect(page.locator("exui-header")).toBeVisible();
    });

    testFileName = `${faker.string.alphanumeric(8)}-${Date.now()}-w${testInfo.workerIndex}-r${testInfo.retry}.pdf`;
    await retryOnTransientFailure(
      async () =>
        setupCaseForJourney({
          scenario: "document-upload-v1-employment",
          jurisdiction: TEST_DATA.V1.JURISDICTION,
          caseType: TEST_DATA.V1.CASE_TYPE,
          apiEventId: "initiateCase",
          mode: "api-required",
          apiPayload: buildCasePayloadFromTemplate("employment.et-england-wales.initiate-case"),
          uiCreate: async () => {
            await createEmploymentCase(
              createCasePage,
              TEST_DATA.V1.JURISDICTION,
              TEST_DATA.V1.CASE_TYPE,
              {
                allowDraftClaimFallback: true
              }
            );
            expect(
              await createCasePage.checkForErrorMessage(),
              "Error message seen after creating employment case"
            ).toBe(false);
          },
          page,
          createCasePage,
          caseDetailsPage,
          testInfo
        }),
      {
        maxAttempts: 2,
        onRetry: async () => {
          if (!page.isClosed()) {
            await page.goto("/").catch(() => undefined);
          }
        }
      }
    );
    caseDetailsUrl = await caseDetailsPage.getCurrentPageUrl();
  });

  test("Check the documentV1 upload works as expected", async ({
    createCasePage,
    caseDetailsPage
  }) => {
    await test.step("Start document upload process", async () => {
      await caseDetailsPage.selectCaseAction(TEST_DATA.V1.ACTION, {
        expectedLocator: createCasePage.page.locator("#documentCollection button")
      });
    });

    await test.step("Upload a document to the case", async () => {
      await retryOnTransientFailure(
        async () => {
          await uploadEmploymentDraftDocument(
            createCasePage,
            testFileName,
            TEST_DATA.V1.FILE_TYPE,
            TEST_DATA.V1.FILE_CONTENT
          );
          await createCasePage.assertNoEventCreationError(
            "after uploading employment document"
          );
          await caseDetailsPage.waitForReady();
        },
        {
          maxAttempts: 2,
          onRetry: async (_attempt, error) => {
            if (createCasePage.page.isClosed()) {
              throw error;
            }
            await caseDetailsPage.reopenCaseDetails(caseDetailsUrl).catch(async () => {
              await createCasePage.page.goto(caseDetailsUrl);
              await caseDetailsPage.waitForReady();
            });
            await caseDetailsPage.selectCaseAction(TEST_DATA.V1.ACTION, {
              expectedLocator: createCasePage.page.locator("#documentCollection button")
            });
          }
        }
      );
    });

    await test.step("Verify document was uploaded successfully", async () => {
      await caseDetailsPage.selectCaseDetailsTab(TEST_DATA.V1.TAB_NAME);
      await expect(caseDetailsPage.caseViewerTable).toBeVisible();

      await expect
        .poll(
          async () =>
            caseDetailsPage.caseViewerTable
              .getByRole("row")
              .filter({ hasText: testFileName })
              .count(),
          { timeout: 30_000, intervals: [1_000, 2_000, 3_000] }
        )
        .toBeGreaterThan(0);

      const uploadedDocumentRow = caseDetailsPage.caseViewerTable
        .getByRole("row")
        .filter({ hasText: testFileName })
        .first();
      await expect(uploadedDocumentRow).toContainText("Misc");
      await expect(uploadedDocumentRow).toContainText("Other");
    });
  });
});
