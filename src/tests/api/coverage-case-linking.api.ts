import { expect, test } from "@playwright/test";

import {
  buildCaseLinkingCaseDetailsMock,
  buildCaseLinkingLinkedCasesResponseMock,
  CASE_LINKING_REASON_CODE,
  CASE_LINKING_RELATED_CASE_REFERENCE,
  CASE_LINKING_SECONDARY_REASON_CODE,
  CASE_LINKING_SECOND_RELATED_CASE_REFERENCE
} from "../integration/mocks/caseLinking.mock.js";

function getCaseLinksField(mock: Record<string, unknown>): Record<string, unknown> | undefined {
  const tabs = Array.isArray(mock.tabs) ? mock.tabs : [];
  const linkedCasesTab = tabs.find(
    (tab): tab is Record<string, unknown> =>
      typeof tab === "object" && tab !== null && tab.id === "linked_cases_sscs"
  );
  const fields = Array.isArray(linkedCasesTab?.fields) ? linkedCasesTab.fields : [];
  return fields.find(
    (field): field is Record<string, unknown> =>
      typeof field === "object" && field !== null && field.id === "caseLinks"
  );
}

function getCollectionItemValue(item: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!item || typeof item.value !== "object" || item.value === null) {
    return undefined;
  }
  return item.value as Record<string, unknown>;
}

function getFieldValues(field: Record<string, unknown> | undefined): unknown[] {
  return Array.isArray(field?.value) ? field.value : [];
}

test.describe("case linking mock coverage", () => {
  test("buildCaseLinkingCaseDetailsMock returns collection items with CCD complex-field keys", () => {
    const mock = buildCaseLinkingCaseDetailsMock({
      linkedCases: [
        {
          linkedCaseReference: CASE_LINKING_RELATED_CASE_REFERENCE,
          reasonCode: CASE_LINKING_REASON_CODE
        }
      ]
    }) as Record<string, unknown>;

    const caseLinksField = getCaseLinksField(mock);
    const values = getFieldValues(caseLinksField);
    const firstItem = values[0] as Record<string, unknown> | undefined;
    const firstValue = getCollectionItemValue(firstItem);

    expect(firstItem?.id).toBe(CASE_LINKING_RELATED_CASE_REFERENCE);
    expect(firstValue).toMatchObject({
      CaseReference: CASE_LINKING_RELATED_CASE_REFERENCE,
      ModifiedDateTime: "2022-05-10",
      CaseType: "Benefit_SCSS"
    });
    expect(Array.isArray(firstValue?.Reasons)).toBeTruthy();
  });

  test("buildCaseLinkingLinkedCasesResponseMock preserves supplied linked-case order", () => {
    const response = buildCaseLinkingLinkedCasesResponseMock({
      linkedCases: [
        {
          linkedCaseReference: CASE_LINKING_RELATED_CASE_REFERENCE,
          reasonCode: CASE_LINKING_REASON_CODE
        },
        {
          linkedCaseReference: CASE_LINKING_SECOND_RELATED_CASE_REFERENCE,
          reasonCode: CASE_LINKING_SECONDARY_REASON_CODE
        }
      ]
    }) as { linkedCases?: Array<{ caseReference?: string }> };

    expect(response.linkedCases?.map((item) => item.caseReference)).toEqual([
      CASE_LINKING_RELATED_CASE_REFERENCE,
      CASE_LINKING_SECOND_RELATED_CASE_REFERENCE
    ]);
  });
});
