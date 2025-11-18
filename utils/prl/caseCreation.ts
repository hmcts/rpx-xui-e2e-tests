import type { Page } from "@playwright/test";

import { prlConfig } from "./config";

const JSON_HEADERS = {
  Accept:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-case-trigger.v2+json;charset=UTF-8",
  Experimental: "true",
  "Content-type": "application/json; charset=UTF-8",
};

const SUBMIT_HEADERS = {
  Accept:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.create-case.v2+json;charset=UTF-8",
  Experimental: "true",
  "Content-type": "application/json; charset=UTF-8",
};

export async function createDummySolicitorCase(
  page: Page,
  caseType: "C100" | "FL401" = "C100",
): Promise<string> {
  // ensure we are on the correct origin so fetch shares session cookies
  await page.goto(`${prlConfig.manageCasesBaseUrl}/cases/case-list`);

  const startUrl = `${prlConfig.manageCasesBaseUrl}/data/internal/case-types/PRLAPPS/event-triggers/testingSupportDummySolicitorCreate?ignore-warning=false`;
  const eventToken = await page.evaluate(
    async ({ url, headers }) => {
      const res = await fetch(url, {
        method: "GET",
        headers,
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error(`Failed to start case creation: ${res.status}`);
      }
      const json = await res.json();
      return json.event_token as string;
    },
    { url: startUrl, headers: JSON_HEADERS },
  );

  const submitUrl = `${prlConfig.manageCasesBaseUrl}/data/case-types/PRLAPPS/cases?ignore-warning=false`;
  const payload = {
    data: {
      caseTypeOfApplication: caseType,
      applicantOrganisationPolicy: null,
      applicantCaseName: "Automation",
    },
    draft_id: null,
    event: {
      id: "testingSupportDummySolicitorCreate",
      summary: "",
      description: "",
    },
    event_token: eventToken,
    ignore_warning: false,
  };

  const caseId = await page.evaluate(
    async ({ url, headers, body }) => {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        credentials: "same-origin",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to submit dummy case: ${res.status} ${text}`);
      }
      const json = await res.json();
      return json.id as string;
    },
    { url: submitUrl, headers: SUBMIT_HEADERS, body: JSON.stringify(payload) },
  );

  return caseId.replace(/-/g, "");
}
