import { expect, test } from "../../../fixtures/ui";
import {
  ACCESS_REQUEST_CASE_ID,
  ACCESS_REQUEST_CASE_NAME,
  ACCESS_REQUEST_REASON,
  ACCESS_REQUEST_REQUESTED_ROLE,
  ACCESS_REQUEST_REQUESTER_ID,
  ACCESS_REQUEST_REVIEW_PATH,
  ACCESS_REQUEST_TASK_ID,
  applySessionCookies,
  setupReviewSpecificAccessMockRoutes
} from "../helpers/index.js";

const userIdentifier = "STAFF_ADMIN";

const formatCaseNumberWithDashes = (caseReference: string) =>
  caseReference.replace(/^(\d{4})(\d{4})(\d{4})(\d{4})$/, "$1-$2-$3-$4");

test.beforeEach(async ({ page }) => {
  await applySessionCookies(page, userIdentifier);
});

test.describe(
  `Review Specific Access Request as ${userIdentifier}`,
  { tag: ["@integration", "@integration-access-requests"] },
  () => {
    test("User can open Review Specific Access Request from a task and see request details", async ({
      accessRequestPage,
      page
    }) => {
      await setupReviewSpecificAccessMockRoutes(page);

      await page.goto(ACCESS_REQUEST_REVIEW_PATH, { waitUntil: "domcontentloaded" });

      await accessRequestPage.waitForReviewSpecificPage();
      await expect(page.getByText(ACCESS_REQUEST_CASE_NAME)).toBeVisible();
      await expect(page.getByText(formatCaseNumberWithDashes(ACCESS_REQUEST_CASE_ID))).toBeVisible();
      await expect(page.getByText("Alice Example")).toBeVisible();
      await expect(page.getByText(ACCESS_REQUEST_REASON)).toBeVisible();
    });

    test("User sees the correct fields for each access duration option", async ({
      accessRequestPage,
      page
    }) => {
      await setupReviewSpecificAccessMockRoutes(page);
      await page.goto(ACCESS_REQUEST_REVIEW_PATH, { waitUntil: "domcontentloaded" });
      await accessRequestPage.waitForReviewSpecificPage();

      await accessRequestPage.chooseApproveRequestAndContinueToDuration();

      await expect(accessRequestPage.reviewDurationHeading).toBeVisible();

      await accessRequestPage.chooseSevenDaysDuration();
      await expect(accessRequestPage.accessStartsLegend).toBeHidden();
      await expect(accessRequestPage.accessEndsText).toBeHidden();

      await accessRequestPage.chooseIndefiniteDuration();
      await expect(accessRequestPage.accessStartsLegend).toBeHidden();
      await expect(accessRequestPage.accessEndsText).toBeHidden();

      await accessRequestPage.chooseAnotherPeriodDuration();
      await expect(accessRequestPage.accessStartsLegend).toBeVisible();
      await expect(accessRequestPage.accessEndsText).toBeVisible();
    });

    test("User can approve a specific access request and reach the success page", async ({
      accessRequestPage,
      page
    }) => {
      await setupReviewSpecificAccessMockRoutes(page);
      await page.goto(ACCESS_REQUEST_REVIEW_PATH, { waitUntil: "domcontentloaded" });
      await accessRequestPage.waitForReviewSpecificPage();

      await accessRequestPage.chooseApproveRequestAndContinueToDuration();

      await expect(accessRequestPage.reviewDurationHeading).toBeVisible();
      await accessRequestPage.chooseSevenDaysDuration();

      const approvalRequestPromise = page.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.url().includes("/api/am/specific-access-approval")
      );

      await accessRequestPage.submitButton.click();

      const payload = (await approvalRequestPromise).postDataJSON() as {
        specificAccessStateData: Record<string, unknown>;
        period: Record<string, unknown>;
      };

      await expect(accessRequestPage.accessApprovedHeading).toBeVisible();
      expect(payload.specificAccessStateData.caseId).toBe(ACCESS_REQUEST_CASE_ID);
      expect(payload.specificAccessStateData.taskId).toBe(ACCESS_REQUEST_TASK_ID);
      expect(payload.specificAccessStateData.requestId).toBeDefined();
      expect(
        payload.specificAccessStateData.assigneeId ??
          payload.specificAccessStateData.actorId
      ).toBe(ACCESS_REQUEST_REQUESTER_ID);
      expect(payload.specificAccessStateData.requestedRole).toBe(
        ACCESS_REQUEST_REQUESTED_ROLE
      );
      expect(payload.period.startDate).toBeTruthy();
      expect(payload.period.endDate).toBeTruthy();
    });

    test("User can approve a specific access request for another period and submit the selected end date", async ({
      accessRequestPage,
      page
    }) => {
      await setupReviewSpecificAccessMockRoutes(page);
      await page.goto(ACCESS_REQUEST_REVIEW_PATH, { waitUntil: "domcontentloaded" });
      await accessRequestPage.waitForReviewSpecificPage();

      await accessRequestPage.chooseApproveRequestAndContinueToDuration();

      await expect(accessRequestPage.reviewDurationHeading).toBeVisible();
      await accessRequestPage.chooseAnotherPeriodDuration();
      await accessRequestPage.fillReviewPeriodEndDate("15", "7", "2035");
      await expect(accessRequestPage.invalidEndDateMessage).toBeHidden();

      const approvalRequestPromise = page.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.url().includes("/api/am/specific-access-approval")
      );

      await accessRequestPage.submitButton.click();

      const payload = (await approvalRequestPromise).postDataJSON() as {
        specificAccessStateData: Record<string, unknown>;
        period: { startDate: string; endDate: string };
      };
      const startDate = new Date(payload.period.startDate);
      const endDate = new Date(payload.period.endDate);

      await expect(accessRequestPage.accessApprovedHeading).toBeVisible();
      expect(payload.specificAccessStateData.caseId).toBe(ACCESS_REQUEST_CASE_ID);
      expect(payload.specificAccessStateData.taskId).toBe(ACCESS_REQUEST_TASK_ID);
      expect(payload.specificAccessStateData.requestedRole).toBe(
        ACCESS_REQUEST_REQUESTED_ROLE
      );
      expect(Number.isNaN(startDate.getTime())).toBe(false);
      expect(Number.isNaN(endDate.getTime())).toBe(false);
      expect(endDate.getUTCFullYear()).toBe(2035);
      expect(endDate.getUTCMonth()).toBe(6);
      expect(endDate.getUTCDate()).toBe(15);
      expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
    });

    test("User can choose Request more information and complete that path", async ({
      accessRequestPage,
      page
    }) => {
      await setupReviewSpecificAccessMockRoutes(page);
      await page.goto(ACCESS_REQUEST_REVIEW_PATH, { waitUntil: "domcontentloaded" });
      await accessRequestPage.waitForReviewSpecificPage();

      await accessRequestPage.chooseRequestMoreInformationAndContinue();

      await expect(accessRequestPage.requestMoreInformationHeading).toBeVisible();
      await accessRequestPage.reviewMoreDetailInput.fill(
        "Please provide the linked application details."
      );

      const requestMoreInformationPromise = page.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.url().includes("/api/specific-access-request/request-more-information")
      );

      await accessRequestPage.continueButton.click();

      const payload = (await requestMoreInformationPromise).postDataJSON() as Record<
        string,
        unknown
      >;
      await expect(accessRequestPage.requestDeniedHeading).toBeVisible();
      expect(payload.caseId).toBe(ACCESS_REQUEST_CASE_ID);
      expect(payload.taskId).toBe(ACCESS_REQUEST_TASK_ID);
      expect(payload.specificAccessReason).toBe(ACCESS_REQUEST_REASON);
      expect(payload.comment).toBe("Please provide the linked application details.");
    });
  }
);
