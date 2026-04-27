import { expect, test } from "../../../fixtures/ui";
import {
  ACCESS_REQUEST_CASE_DETAILS_PATH,
  ACCESS_REQUEST_CASE_ID,
  ACCESS_REQUEST_SERVICE_NAME,
  SPECIFIC_ACCESS_PATH,
  applySessionCookies,
  setupSpecificAccessRequestMockRoutes,
  summaryRow
} from "../helpers/index.js";

const userIdentifier = "STAFF_ADMIN";
const specificAccessReason = "Urgent linked case review required.";

function getSpecificAccessRequestPayloadDetails(payload: Record<string, unknown>) {
  const requestedRoles = Array.isArray(payload.requestedRoles)
    ? (payload.requestedRoles as Array<Record<string, unknown>>)
    : [];
  const requestedRole = requestedRoles[0] ?? {};
  const requestedNotes = Array.isArray(requestedRole.notes)
    ? (requestedRole.notes as Array<Record<string, unknown>>)
    : [];

  return {
    requestedRole,
    requestedNotes
  };
}

test.beforeEach(async ({ page }) => {
  await applySessionCookies(page, userIdentifier);
});

test.describe(
  `Specific Access Request as ${userIdentifier}`,
  { tag: ["@integration", "@integration-access-requests"] },
  () => {
    test("User can open Specific Access Request from case details", async ({
      accessRequestPage,
      caseDetailsPage,
      page
    }) => {
      await setupSpecificAccessRequestMockRoutes(page);

      await page.goto(ACCESS_REQUEST_CASE_DETAILS_PATH, { waitUntil: "domcontentloaded" });
      await caseDetailsPage.waitForCaseDetailsPage();

      await expect(page.getByText("Authorisation is needed to access this case")).toBeVisible();
      await expect(summaryRow(page, "Service")).toContainText(ACCESS_REQUEST_SERVICE_NAME);
      await expect(summaryRow(page, "Access")).toContainText("Specific");
      await expect(accessRequestPage.requestAccessButton).toBeVisible();

      await accessRequestPage.requestAccessButton.click();

      await expect(page).toHaveURL(new RegExp(`${SPECIFIC_ACCESS_PATH}$`));
      await accessRequestPage.waitForSpecificAccessPage();
      await expect(accessRequestPage.specificAccessReasonInput).toBeVisible();
    });

    test("User can submit a specific access request and reach the success page", async ({
      accessRequestPage,
      page
    }) => {
      await setupSpecificAccessRequestMockRoutes(page);
      await page.goto(SPECIFIC_ACCESS_PATH, { waitUntil: "domcontentloaded" });
      await accessRequestPage.waitForSpecificAccessPage();

      const payload = await accessRequestPage.submitSpecificAccessRequest(specificAccessReason);
      const { requestedRole, requestedNotes } = getSpecificAccessRequestPayloadDetails(payload);

      await expect(accessRequestPage.specificAccessSuccessContainer).toBeVisible();
      await expect(page.getByText(ACCESS_REQUEST_CASE_ID)).toBeVisible();
      expect(payload.roleRequest).toMatchObject({ process: "specific-access" });
      expect(requestedRole.roleName).toBe("specific-access-requested");
      expect((requestedRole.attributes as Record<string, unknown>)?.caseId).toBe(
        ACCESS_REQUEST_CASE_ID
      );
      expect((requestedNotes[0] ?? {}).comment).toEqual(expect.stringContaining(specificAccessReason));
    });
  }
);
