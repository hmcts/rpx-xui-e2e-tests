import { expect, type Page } from "@playwright/test";

import type { AccessRequestPage } from "../../../page-objects/pages/exui/accessRequest.po.js";

type ChallengedAccessPayload = {
  requestedRoles?: Array<{
    attributes?: {
      accessReason?: string;
    };
  }>;
};

export type ChallengedAccessReasonDetails = Record<string, unknown>;

export type ChallengedAccessConditionalFields = {
  caseReferenceVisible: boolean;
  otherReasonVisible: boolean;
};

export function summaryRow(page: Page, label: string) {
  return page.locator(".govuk-summary-list__row").filter({
    has: page.locator(".govuk-summary-list__key", { hasText: label })
  });
}

export function getChallengedAccessReasonDetails(
  payload: ChallengedAccessPayload
): ChallengedAccessReasonDetails {
  return JSON.parse(
    payload.requestedRoles?.[0]?.attributes?.accessReason ?? "{}"
  ) as ChallengedAccessReasonDetails;
}

export async function expectChallengedAccessConditionalFields(
  accessRequestPage: AccessRequestPage,
  options: ChallengedAccessConditionalFields
): Promise<void> {
  if (options.caseReferenceVisible) {
    await expect(accessRequestPage.challengedCaseReferenceInput).toBeVisible();
  } else {
    await expect(accessRequestPage.challengedCaseReferenceInput).toHaveCount(0);
  }

  if (options.otherReasonVisible) {
    await expect(accessRequestPage.challengedOtherReasonInput).toBeVisible();
  } else {
    await expect(accessRequestPage.challengedOtherReasonInput).toHaveCount(0);
  }
}
