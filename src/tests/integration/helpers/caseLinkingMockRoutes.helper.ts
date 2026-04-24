import type { Page, Route } from "@playwright/test";

import type { CaseDetailsPage } from "../../../page-objects/pages/exui/caseDetails.po.js";
import {
  buildCaseLinkingCaseDetailsMock,
  buildCaseLinkingEventTriggerMock,
  buildCaseLinkingLinkedCasesResponseMock,
  buildCaseLinkingReasonCodesMock,
  CASE_LINKING_CASE_REFERENCE,
  CASE_LINKING_CASE_TYPE,
  CASE_LINKING_JURISDICTION,
  CASE_LINKING_OTHER_REASON_CODE,
  CASE_LINKING_REASON_CODE,
  CASE_LINKING_RELATED_CASE_REFERENCE,
  CASE_LINKING_TRIGGER_ID,
  type CaseLinkingLinkedCase
} from "../mocks/caseLinking.mock.js";
import { navigateWithTransientGatewayRetry } from "../utils/transientGatewayPage.utils.js";

import { setupNgIntegrationBaseRoutes } from "./ngIntegrationMockRoutes.helper.js";
import { applySessionCookies } from "./sessionUser.helper.js";

type RouteAbortCode = Parameters<Route["abort"]>[0];

const DEFAULT_CASE_LINKING_USER_IDENTIFIER = "STAFF_ADMIN";
const DEFAULT_CASE_LINKING_USER_ROLES = ["hmcts-staff"];

interface CaseLinkingApiOverride {
  status?: number;
  body?: unknown;
  contentType?: string;
  abortErrorCode?: RouteAbortCode;
}

export interface CaseLinkingMockRoutesConfig {
  userIdentifier?: string;
  userRoles?: string[];
  submitCaseLinks?: CaseLinkingApiOverride;
  validateCaseLinks?: CaseLinkingApiOverride;
  initialLinkedCases?: CaseLinkingLinkedCase[];
}

function resolveRouteBody(override: CaseLinkingApiOverride | undefined, fallbackBody: unknown): string {
  if (!override || override.body === undefined) {
    return JSON.stringify(fallbackBody);
  }
  if (typeof override.body === "string") {
    return override.body;
  }
  return JSON.stringify(override.body);
}

async function fulfillRoute(
  route: Route,
  override: CaseLinkingApiOverride | undefined,
  fallbackBody: unknown,
  fallbackStatus = 200
): Promise<void> {
  if (override?.abortErrorCode) {
    await route.abort(override.abortErrorCode);
    return;
  }

  await route.fulfill({
    status: override?.status ?? fallbackStatus,
    contentType: override?.contentType ?? "application/json",
    body: resolveRouteBody(override, fallbackBody)
  });
}

function resolveSubmittedCaseLinkData(route: Route) {
  const payload = route.request().postDataJSON() as { data?: Record<string, unknown> } | null;
  const linkedCaseReference =
    typeof payload?.data?.LinkedCaseReference === "string"
      ? payload.data.LinkedCaseReference
      : CASE_LINKING_RELATED_CASE_REFERENCE;
  const reasonCode =
    typeof payload?.data?.CaseLinkReasonCode === "string"
      ? payload.data.CaseLinkReasonCode
      : CASE_LINKING_REASON_CODE;
  const otherDescription =
    reasonCode === CASE_LINKING_OTHER_REASON_CODE && typeof payload?.data?.OtherDescription === "string"
      ? payload.data.OtherDescription
      : "";

  return { linkedCaseReference, reasonCode, otherDescription };
}

function buildValidationResponse(route: Route): Record<string, unknown> {
  const payload = route.request().postDataJSON() as { data?: Record<string, unknown> } | null;
  const pageId = new URL(route.request().url()).searchParams.get("pageId") ?? "";

  return {
    data: payload?.data ?? {},
    errors: [],
    _links: {
      self: {
        href: `/data/case-types/${CASE_LINKING_CASE_TYPE}/validate?pageId=${pageId}`
      }
    }
  };
}

export async function setupCaseLinkingMockRoutes(
  page: Page,
  config: CaseLinkingMockRoutesConfig = {}
): Promise<void> {
  await setupNgIntegrationBaseRoutes(page, {
    userDetails: {
      userId: "case-linking-user",
      forename: "Case",
      surname: "Linking",
      email: "case.linking@justice.gov.uk",
      roleCategory: "LEGAL_OPERATIONS",
      roles: config.userRoles ?? DEFAULT_CASE_LINKING_USER_ROLES
    }
  });

  const eventTrigger = buildCaseLinkingEventTriggerMock();
  const caseLinkReasonCodes = buildCaseLinkingReasonCodesMock();
  let currentLinkedCases = [...(config.initialLinkedCases ?? [])];
  let currentCaseDetails = buildCaseLinkingCaseDetailsMock({
    linkedCases: currentLinkedCases.length > 0 ? currentLinkedCases : null
  });
  let currentLinkedCasesResponse = buildCaseLinkingLinkedCasesResponseMock({
    linkedCases: currentLinkedCases
  });

  await page.route(`**/data/internal/cases/${CASE_LINKING_CASE_REFERENCE}*`, async (route) => {
    await fulfillRoute(route, undefined, currentCaseDetails);
  });

  await page.route(`**/getLinkedCases/${CASE_LINKING_CASE_REFERENCE}*`, async (route) => {
    await fulfillRoute(route, undefined, currentLinkedCasesResponse);
  });

  await page.route(
    `**/data/internal/cases/${CASE_LINKING_CASE_REFERENCE}/event-triggers/${CASE_LINKING_TRIGGER_ID}/validate*`,
    async (route) => {
      await fulfillRoute(route, undefined, eventTrigger);
    }
  );

  await page.route(`**/data/case-types/${CASE_LINKING_CASE_TYPE}/validate*`, async (route) => {
    await fulfillRoute(route, config.validateCaseLinks, buildValidationResponse(route));
  });

  await page.route(
    `**/data/internal/cases/${CASE_LINKING_CASE_REFERENCE}/event-triggers/${CASE_LINKING_TRIGGER_ID}*`,
    async (route) => {
      await fulfillRoute(route, undefined, eventTrigger);
    }
  );

  await page.route(`**/data/cases/${CASE_LINKING_CASE_REFERENCE}/events*`, async (route) => {
    const submitOverride = config.submitCaseLinks;
    const successfulSubmit =
      !submitOverride?.status || (submitOverride.status >= 200 && submitOverride.status < 300);

    if (successfulSubmit) {
      const submittedCaseLinkData = resolveSubmittedCaseLinkData(route);
      currentLinkedCases = [
        ...currentLinkedCases,
        {
          linkedCaseReference: submittedCaseLinkData.linkedCaseReference,
          reasonCode: submittedCaseLinkData.reasonCode,
          otherDescription: submittedCaseLinkData.otherDescription
        }
      ];
      currentCaseDetails = buildCaseLinkingCaseDetailsMock({
        linkedCases: currentLinkedCases
      });
      currentLinkedCasesResponse = buildCaseLinkingLinkedCasesResponseMock({
        linkedCases: currentLinkedCases
      });
    }

    await fulfillRoute(
      route,
      submitOverride,
      successfulSubmit ? currentCaseDetails : { message: "case-link-submit-failed" }
    );
  });

  await page.route("**/refdata/commondata/lov/categories/CaseLinkingReasonCode*", async (route) => {
    await fulfillRoute(route, undefined, caseLinkReasonCodes);
  });
}

export async function openCaseLinkingJourney(
  page: Page,
  caseDetailsPage: CaseDetailsPage,
  config: CaseLinkingMockRoutesConfig = {}
): Promise<void> {
  await applySessionCookies(page, config.userIdentifier ?? DEFAULT_CASE_LINKING_USER_IDENTIFIER);
  await setupCaseLinkingMockRoutes(page, config);
  await navigateWithTransientGatewayRetry(
    page,
    `/cases/case-details/${CASE_LINKING_JURISDICTION}/${CASE_LINKING_CASE_TYPE}/${CASE_LINKING_CASE_REFERENCE}`,
    {
      contextLabel: "case details for case linking"
    }
  );
  await caseDetailsPage.waitForReady();
}
