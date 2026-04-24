import { type Page, type Route } from "@playwright/test";

import type { CreateCasePage } from "../../../page-objects/pages/exui/createCase.po.js";
import { divorcePocCaseData } from "../mocks/createCase.mock.js";
import { navigateWithTransientGatewayRetry } from "../utils/transientGatewayPage.utils.js";

import { setupNgIntegrationBaseRoutes } from "./ngIntegrationMockRoutes.helper.js";

const DEFAULT_CREATED_CASE_ID = "1234123412341234";

export async function setupCreateCaseBaseRoutes(page: Page): Promise<void> {
  await setupNgIntegrationBaseRoutes(page, {
    userDetails: {
      roles: ["caseworker-divorce-solicitor", "caseworker-divorce", "caseworker-privatelaw"]
    }
  });

  await page.route("**/data/case-types/xuiTestJurisdiction/validate*", async (route) => {
    const requestBody = (route.request().postDataJSON?.() as { data?: unknown } | undefined) ?? {};

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: requestBody.data ?? {},
        _links: {
          self: {
            href: route.request().url()
          }
        }
      })
    });
  });

  await page.route("**/data/internal/case-types/xuiTestJurisdiction/event-triggers/createCase*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(divorcePocCaseData())
    });
  });

  await page.route("**/aggregated/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "DIVORCE",
          name: "DIVORCE",
          caseTypes: [
            {
              id: "xuiTestJurisdiction",
              name: "xuiTestJurisdiction",
              states: [
                {
                  id: "CaseCreated",
                  name: "Case created"
                }
              ]
            }
          ]
        }
      ])
    });
  });
}

export async function routeCaseCreationFlow(
  page: Page,
  options: {
    createdCaseId?: string;
    createdCaseStateId?: string;
    createdCaseStateName?: string;
  } = {}
): Promise<unknown> {
  const createdCaseId = options.createdCaseId ?? DEFAULT_CREATED_CASE_ID;
  let resolveInterceptedRequest: (body: unknown) => void = () => undefined;
  const interceptedRequestPromise = new Promise<unknown>((resolve) => {
    resolveInterceptedRequest = resolve;
  });

  await page.route("**/data/case-types/xuiTestJurisdiction/cases?ignore-warning=false*", async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST") {
      try {
        resolveInterceptedRequest(request.postDataJSON());
      } catch {
        resolveInterceptedRequest(null);
      }
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: createdCaseId })
    });
  });

  await page.route(`**/data/internal/cases/${createdCaseId}*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        case_id: createdCaseId,
        case_type: {
          id: "xuiTestJurisdiction",
          name: "xuiTestJurisdiction",
          jurisdiction: {
            id: "DIVORCE",
            name: "DIVORCE"
          }
        },
        state: {
          id: options.createdCaseStateId ?? "CaseCreated",
          name: options.createdCaseStateName ?? "Case created"
        },
        metadataFields: [
          {
            id: "[CASE_REFERENCE]",
            value: Number(createdCaseId)
          },
          {
            id: "[JURISDICTION]",
            value: "DIVORCE"
          },
          {
            id: "[CASE_TYPE]",
            value: "xuiTestJurisdiction"
          }
        ],
        tabs: [
          {
            id: "caseSummary",
            label: "Case summary",
            fields: []
          }
        ],
        triggers: [
          {
            id: "updateCase",
            name: "Update case"
          }
        ]
      })
    });
  });

  await page.route("**/aggregated/caseworkers/**/jurisdictions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "DIVORCE",
          name: "DIVORCE",
          caseTypes: [
            {
              id: "xuiTestJurisdiction",
              name: "xuiTestJurisdiction",
              states: [
                {
                  id: "CaseCreated",
                  name: "Case created"
                }
              ]
            }
          ]
        }
      ])
    });
  });

  return interceptedRequestPromise;
}

export async function submitCaseAndCaptureRequest(
  page: Page,
  createCasePage: Pick<CreateCasePage, "testSubmitButton">
): Promise<unknown> {
  const interceptedCreateCaseRequestBodyPromise = routeCaseCreationFlow(page);
  await Promise.all([interceptedCreateCaseRequestBodyPromise, createCasePage.testSubmitButton.click()]);
  return interceptedCreateCaseRequestBodyPromise;
}

export async function openCreateCaseJourney(
  page: Page,
  createCasePage: Pick<CreateCasePage, "waitForDivorcePocPersonalDetailsReady">,
  options: {
    jurisdiction?: string;
    caseType?: string;
    maxAttempts?: number;
  } = {}
): Promise<void> {
  const jurisdiction = options.jurisdiction ?? "DIVORCE";
  const caseType = options.caseType ?? "xuiTestJurisdiction";

  await navigateWithTransientGatewayRetry(page, `/cases/case-create/${jurisdiction}/${caseType}/createCase/`, {
    maxAttempts: options.maxAttempts,
    contextLabel: "create case",
    afterNavigation: async () => {
      await createCasePage.waitForDivorcePocPersonalDetailsReady();
    }
  });
}
