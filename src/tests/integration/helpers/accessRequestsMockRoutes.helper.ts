import type { Page } from "@playwright/test";

import {
  ACCESS_REQUEST_ASSIGNMENT_ID,
  ACCESS_REQUEST_CASE_ID,
  ACCESS_REQUEST_CASE_NAME,
  ACCESS_REQUEST_CASE_TYPE,
  ACCESS_REQUEST_JURISDICTION,
  ACCESS_REQUEST_REASON,
  ACCESS_REQUEST_REQUESTED_ROLE,
  ACCESS_REQUEST_REQUESTER_ID,
  ACCESS_REQUEST_SERVICE_NAME,
  ACCESS_REQUEST_TASK_ID,
  buildChallengedAccessCaseDetailsMock,
  buildReviewSpecificAccessTaskMock,
  buildSpecificAccessCaseDetailsMock,
  buildSpecificAccessCaseworkerMock,
  buildSpecificAccessRoleMock
} from "../mocks/accessRequests.mock.js";
import {
  buildHearingsEnvironmentConfigMock,
  buildHearingsUserDetailsMock
} from "../mocks/hearings.mock.js";

import { setupFastCaseRetrievalConfigRoute } from "./caseSearchMockRoutes.helper.js";
import { setupTaskListBootstrapRoutes } from "./taskListMockRoutes.helper.js";

export const ACCESS_REQUEST_REVIEW_PATH = `/role-access/${ACCESS_REQUEST_TASK_ID}/assignment/${ACCESS_REQUEST_ASSIGNMENT_ID}/specific-access`;
export const ACCESS_REQUEST_CASE_DETAILS_PATH = `/cases/case-details/${ACCESS_REQUEST_JURISDICTION}/${ACCESS_REQUEST_CASE_TYPE}/${ACCESS_REQUEST_CASE_ID}`;
export const SPECIFIC_ACCESS_PATH = `${ACCESS_REQUEST_CASE_DETAILS_PATH}/specific-access-request`;
export const CHALLENGED_ACCESS_PATH = `${ACCESS_REQUEST_CASE_DETAILS_PATH}/challenged-access-request`;

const DEFAULT_USER_ROLES = ["pui-case-manager"];

type AccessRequestUserConfig = {
  userRoles?: string[];
  jurisdiction?: string;
  caseTypeId?: string;
};

type ReviewSpecificAccessMockOptions = AccessRequestUserConfig & {
  taskId?: string;
  assignmentId?: string;
  taskStatus?: number;
  taskBody?: unknown;
  roleAccessStatus?: number;
  roleAccessBody?: unknown;
  supportedJurisdictions?: string[];
  caseworkersStatus?: number;
  caseworkersBody?: unknown;
  judicialUsersStatus?: number;
  judicialUsersBody?: unknown;
  approvalStatus?: number;
  approvalBody?: unknown;
  requestMoreInformationStatus?: number;
  requestMoreInformationBody?: unknown;
};

type ChallengedAccessMockOptions = AccessRequestUserConfig & {
  caseId?: string;
  caseDetailsStatus?: number;
  caseDetailsBody?: unknown;
  manageLabellingStatus?: number;
  manageLabellingBody?: unknown;
  challengedAccessStatus?: number;
  challengedAccessBody?: unknown;
  challengedAccessUpdateStatus?: number;
  challengedAccessUpdateBody?: unknown;
};

type SpecificAccessRequestMockOptions = AccessRequestUserConfig & {
  caseId?: string;
  caseDetailsStatus?: number;
  caseDetailsBody?: unknown;
  manageLabellingStatus?: number;
  manageLabellingBody?: unknown;
  specificAccessStatus?: number;
  specificAccessBody?: unknown;
  specificAccessUpdateStatus?: number;
  specificAccessUpdateBody?: unknown;
};

async function setupAccessRequestShellRoutes(
  page: Page,
  config: AccessRequestUserConfig = {}
): Promise<void> {
  const jurisdiction = config.jurisdiction ?? ACCESS_REQUEST_JURISDICTION;
  const caseTypeId = config.caseTypeId ?? ACCESS_REQUEST_CASE_TYPE;
  const userDetails = buildHearingsUserDetailsMock(config.userRoles ?? DEFAULT_USER_ROLES);
  const environmentConfig = buildHearingsEnvironmentConfigMock({
    enabledCaseVariations: [{ jurisdiction, caseType: caseTypeId }],
    amendmentCaseVariations: [{ jurisdiction, caseType: caseTypeId }]
  });

  await page.route("**/api/healthCheck*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ healthState: true })
    });
  });

  await page.addInitScript((seededUserInfo) => {
    window.sessionStorage.setItem("userDetails", JSON.stringify(seededUserInfo));
  }, userDetails.userInfo);

  await page.route("**/api/user/details*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(userDetails)
    });
  });

  await setupFastCaseRetrievalConfigRoute(page);
  await page.route(/\/external\/config\/ui(?:\/|\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(environmentConfig)
    });
  });

  await page.route("**/workallocation/region-location*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });

  await page.route("**/workallocation/full-location*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([])
    });
  });
}

export async function setupReviewSpecificAccessMockRoutes(
  page: Page,
  options: ReviewSpecificAccessMockOptions = {}
): Promise<void> {
  const jurisdiction = options.jurisdiction ?? ACCESS_REQUEST_JURISDICTION;
  const caseTypeId = options.caseTypeId ?? ACCESS_REQUEST_CASE_TYPE;
  const taskId = options.taskId ?? ACCESS_REQUEST_TASK_ID;
  const supportedJurisdictions = options.supportedJurisdictions ?? [jurisdiction];

  await setupAccessRequestShellRoutes(page, options);
  await setupTaskListBootstrapRoutes(
    page,
    supportedJurisdictions,
    supportedJurisdictions.map((serviceId) => ({ serviceId, serviceName: serviceId }))
  );

  await page.route(`**/workallocation/task/${taskId}*`, async (route) => {
    await route.fulfill({
      status: options.taskStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(
        options.taskBody ??
          buildReviewSpecificAccessTaskMock({
            jurisdiction,
            case_type_id: caseTypeId
          })
      )
    });
  });

  await page.route("**/api/role-access/roles/access-get*", async (route) => {
    await route.fulfill({
      status: options.roleAccessStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.roleAccessBody ?? [buildSpecificAccessRoleMock()])
    });
  });

  await page.route("**/api/wa-supported-jurisdiction/get*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(supportedJurisdictions)
    });
  });

  await page.route("**/api/wa-supported-jurisdiction/detail*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        supportedJurisdictions.map((serviceId) => ({
          serviceId,
          serviceName: serviceId === jurisdiction ? ACCESS_REQUEST_SERVICE_NAME : serviceId
        }))
      )
    });
  });

  await page.route("**/aggregated/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        supportedJurisdictions.map((serviceId) => ({
          id: serviceId,
          name: serviceId === jurisdiction ? ACCESS_REQUEST_SERVICE_NAME : serviceId
        }))
      )
    });
  });

  await page.route("**/workallocation/caseworker/getUsersByServiceName*", async (route) => {
    await route.fulfill({
      status: options.caseworkersStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(
        options.caseworkersBody ??
          [buildSpecificAccessCaseworkerMock({ service: ACCESS_REQUEST_SERVICE_NAME })]
      )
    });
  });

  await page.route("**/api/role-access/roles/getJudicialUsers*", async (route) => {
    await route.fulfill({
      status: options.judicialUsersStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.judicialUsersBody ?? [])
    });
  });

  await page.route("**/api/am/specific-access-approval*", async (route) => {
    await route.fulfill({
      status: options.approvalStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.approvalBody ?? {})
    });
  });

  await page.route("**/api/specific-access-request/request-more-information*", async (route) => {
    await route.fulfill({
      status: options.requestMoreInformationStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.requestMoreInformationBody ?? {})
    });
  });

  await page.route("**/api/specific-access-request/update-attributes*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({})
    });
  });
}

export async function setupChallengedAccessMockRoutes(
  page: Page,
  options: ChallengedAccessMockOptions = {}
): Promise<void> {
  const jurisdiction = options.jurisdiction ?? ACCESS_REQUEST_JURISDICTION;
  const caseId = options.caseId ?? ACCESS_REQUEST_CASE_ID;

  await setupAccessRequestShellRoutes(page, options);
  await setupTaskListBootstrapRoutes(page, [jurisdiction], [{ serviceId: jurisdiction, serviceName: jurisdiction }]);

  await page.route(`**/data/internal/cases/${caseId}*`, async (route) => {
    await route.fulfill({
      status: options.caseDetailsStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(
        options.caseDetailsBody ?? buildChallengedAccessCaseDetailsMock()
      )
    });
  });

  await page.route(`**/api/role-access/roles/manageLabellingRoleAssignment/${caseId}*`, async (route) => {
    await route.fulfill({
      status: options.manageLabellingStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.manageLabellingBody ?? {})
    });
  });

  await page.route("**/api/challenged-access-request/update-attributes*", async (route) => {
    await route.fulfill({
      status: options.challengedAccessUpdateStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.challengedAccessUpdateBody ?? {})
    });
  });

  await page.route("**/api/challenged-access-request*", async (route) => {
    await route.fulfill({
      status: options.challengedAccessStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.challengedAccessBody ?? {})
    });
  });
}

export async function setupSpecificAccessRequestMockRoutes(
  page: Page,
  options: SpecificAccessRequestMockOptions = {}
): Promise<void> {
  const jurisdiction = options.jurisdiction ?? ACCESS_REQUEST_JURISDICTION;
  const caseId = options.caseId ?? ACCESS_REQUEST_CASE_ID;

  await setupAccessRequestShellRoutes(page, options);
  await setupTaskListBootstrapRoutes(page, [jurisdiction], [{ serviceId: jurisdiction, serviceName: jurisdiction }]);

  await page.route(`**/data/internal/cases/${caseId}*`, async (route) => {
    await route.fulfill({
      status: options.caseDetailsStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(
        options.caseDetailsBody ?? buildSpecificAccessCaseDetailsMock()
      )
    });
  });

  await page.route(`**/api/role-access/roles/manageLabellingRoleAssignment/${caseId}*`, async (route) => {
    await route.fulfill({
      status: options.manageLabellingStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.manageLabellingBody ?? {})
    });
  });

  await page.route("**/api/specific-access-request/update-attributes*", async (route) => {
    await route.fulfill({
      status: options.specificAccessUpdateStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.specificAccessUpdateBody ?? {})
    });
  });

  await page.route("**/api/specific-access-request*", async (route) => {
    await route.fulfill({
      status: options.specificAccessStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.specificAccessBody ?? {})
    });
  });
}

export {
  ACCESS_REQUEST_CASE_ID,
  ACCESS_REQUEST_CASE_NAME,
  ACCESS_REQUEST_REASON,
  ACCESS_REQUEST_REQUESTED_ROLE,
  ACCESS_REQUEST_REQUESTER_ID,
  ACCESS_REQUEST_SERVICE_NAME,
  ACCESS_REQUEST_TASK_ID
};
