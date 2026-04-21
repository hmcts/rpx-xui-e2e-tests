import type { Page } from "@playwright/test";

import {
  EXUI_SERVICE_LABELS,
  normalizeServiceFamily,
} from "../../../../data/exui-central-assurance.js";
import { buildMyTaskListMock } from "../mocks/taskList.mock.js";

export const taskListRoutePattern = /\/workallocation\/task(?:\?.*)?$/;
export const manageTasksUserDetailsRoutePattern = "**/api/user/details*";
export const waSupportedJurisdictionsGetRoutePattern =
  "**/api/wa-supported-jurisdiction/get*";
export const waSupportedJurisdictionsDetailRoutePattern =
  "**/api/wa-supported-jurisdiction/detail*";

type ManageTasksUserDetails = {
  canShareCases: boolean;
  roleAssignmentInfo: Array<{
    baseLocation: string;
    jurisdiction: string;
    roleType: "ORGANISATION";
    substantive: "Y";
  }>;
  sessionTimeout: {
    idleModalDisplayTime: number;
    pattern: string;
    totalIdleTime: number;
  };
  userInfo: {
    active: true;
    email: string;
    forename: string;
    id: string;
    roleCategory: "LEGAL_OPERATIONS";
    roles: string[];
    surname: string;
    uid: string;
  };
};

export function buildManageTasksUserDetails(
  supportedJurisdictions: readonly string[],
  userId = "exui-central-assurance-user",
): ManageTasksUserDetails {
  const uniqueJurisdictions = Array.from(
    new Set(supportedJurisdictions.map(normalizeServiceFamily)),
  );

  return {
    canShareCases: false,
    roleAssignmentInfo: uniqueJurisdictions.map((jurisdiction) => ({
      baseLocation: "765324",
      jurisdiction,
      roleType: "ORGANISATION",
      substantive: "Y",
    })),
    sessionTimeout: {
      idleModalDisplayTime: 300,
      pattern: ".",
      totalIdleTime: 900,
    },
    userInfo: {
      active: true,
      email: "playwright.srt-poc@justice.gov.uk",
      forename: "Playwright",
      id: userId,
      roleCategory: "LEGAL_OPERATIONS",
      roles: ["caseworker"],
      surname: "SRT POC",
      uid: userId,
    },
  };
}

export function buildSupportedJurisdictionDetails(
  supportedJurisdictions: readonly string[],
): Array<{ serviceId: string; serviceName: string }> {
  return Array.from(new Set(supportedJurisdictions.map(normalizeServiceFamily))).map(
    (serviceId) => ({
      serviceId,
      serviceName: EXUI_SERVICE_LABELS[serviceId] ?? serviceId,
    }),
  );
}

export async function setupManageTasksUserDetailsRoute(
  page: Pick<Page, "addInitScript" | "route">,
  supportedJurisdictions: readonly string[],
  userId?: string,
): Promise<void> {
  const userDetails = buildManageTasksUserDetails(
    supportedJurisdictions,
    userId,
  );

  await page.addInitScript((seededUserInfo) => {
    window.sessionStorage.setItem("userDetails", JSON.stringify(seededUserInfo));
  }, userDetails.userInfo);

  await page.route(manageTasksUserDetailsRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(userDetails),
    });
  });
}

export async function setupAvailableTaskListRoutes(
  page: Page,
  supportedJurisdictions: readonly string[],
): Promise<void> {
  const taskListMockResponse = buildMyTaskListMock(3, "");
  const normalizedJurisdictions = Array.from(
    new Set(supportedJurisdictions.map(normalizeServiceFamily)),
  );

  await page.route(waSupportedJurisdictionsGetRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(normalizedJurisdictions),
    });
  });

  await page.route(waSupportedJurisdictionsDetailRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        buildSupportedJurisdictionDetails(normalizedJurisdictions),
      ),
    });
  });

  await page.route("**/workallocation/task/types-of-work*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { key: "applications", label: "Applications" },
        { key: "hearing_work", label: "Hearing work" },
        { key: "routine_work", label: "Routine work" },
      ]),
    });
  });

  await page.route("**/api/healthCheck*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ healthState: true }),
    });
  });

  await page.route("**/workallocation/region-location*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/workallocation/full-location*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(
    "**/workallocation/caseworker/getUsersByServiceName*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    },
  );

  await page.route(taskListRoutePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(taskListMockResponse),
    });
  });
}
