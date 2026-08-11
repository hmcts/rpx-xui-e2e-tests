import type { Page } from "@playwright/test";

import type { CaseDetailsPage } from "../../../page-objects/pages/exui/caseDetails.po.js";
import {
  buildCaseViewerMock,
  CASE_VIEWER_CASE_REFERENCE,
  CASE_VIEWER_CASE_TYPE,
  CASE_VIEWER_JURISDICTION,
  type CaseViewerVariant
} from "../mocks/caseViewer.mock.js";

import { setupNgIntegrationBaseRoutes } from "./ngIntegrationMockRoutes.helper.js";
import { setupCaseworkerJurisdictionsRoute } from "./caseworkerJurisdictionMockRoutes.helper.js";
import { applySessionCookies } from "./sessionUser.helper.js";

export async function setupCaseViewerMockRoutes(
  page: Page,
  variant: CaseViewerVariant = "populated",
  caseDetailsStatus = 200
): Promise<void> {
  await applySessionCookies(page, "STAFF_ADMIN");
  await setupNgIntegrationBaseRoutes(page, {
    userDetails: {
      roles: ["caseworker-sscs", "hmcts-staff"]
    }
  });
  await setupCaseworkerJurisdictionsRoute(page, [CASE_VIEWER_JURISDICTION]);

  await page.route(`**/data/internal/cases/${CASE_VIEWER_CASE_REFERENCE}*`, async (route) => {
    await route.fulfill({
      status: caseDetailsStatus,
      contentType: "application/json",
      body: JSON.stringify(
        caseDetailsStatus === 200 ? buildCaseViewerMock(variant) : { message: "case-viewer-load-failed" }
      )
    });
  });
}

export async function openCaseViewer(
  page: Page,
  caseDetailsPage: CaseDetailsPage,
  variant: CaseViewerVariant = "populated",
  caseDetailsStatus = 200
): Promise<void> {
  await setupCaseViewerMockRoutes(page, variant, caseDetailsStatus);
  await page.goto(
    `/cases/case-details/${CASE_VIEWER_JURISDICTION}/${CASE_VIEWER_CASE_TYPE}/${CASE_VIEWER_CASE_REFERENCE}`
  );
  await caseDetailsPage.waitForReady();
}
