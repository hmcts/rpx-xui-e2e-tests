import { expect } from "@playwright/test";

import { test } from "../../fixtures/test";
import {
  simulateRetainHiddenValue,
  type HiddenFieldScenario,
} from "../helpers/ccd-mock";

const scenarios: HiddenFieldScenario[] = [
  { fieldType: "Text", showField: false, retainHidden: true },
  { fieldType: "Text", showField: false, retainHidden: false },
  { fieldType: "Text", showField: false, retainHidden: null },
  { fieldType: "Text", showField: true, retainHidden: false },
  { fieldType: "AddressUK", showField: false, retainHidden: true },
  { fieldType: "AddressUK", showField: false, retainHidden: false },
  { fieldType: "AddressUK", showField: true, retainHidden: false },
  { fieldType: "FixedList", showField: false, retainHidden: true },
  { fieldType: "FixedList", showField: false, retainHidden: false },
  { fieldType: "FixedList", showField: true, retainHidden: false },
  { fieldType: "Collection", showField: false, retainHidden: true },
  { fieldType: "Collection", showField: false, retainHidden: false },
  { fieldType: "Collection", showField: true, retainHidden: false },
];

test.describe("@regression @ccd-hidden CCD retain hidden field behaviour", () => {
  for (const scenario of scenarios) {
    const retainLabel =
      scenario.retainHidden === null ? "null" : scenario.retainHidden ? "true" : "false";
    test(`Field ${scenario.fieldType} show=${scenario.showField} retain_hidden=${retainLabel}`, async () => {
      const result = simulateRetainHiddenValue(scenario);

      if (scenario.showField) {
        expect(result.hasField).toBeTruthy();
        expect(result.value).not.toBeNull();
      } else if (scenario.retainHidden === true) {
        expect(result.hasField).toBeFalsy();
        expect(result.value).toBeUndefined();
      } else {
        expect(result.hasField).toBeTruthy();
        // For some field types (e.g., Address) we nullify subfields instead of the whole object
        if (scenario.fieldType === "AddressUK") {
          const values = Object.values(result.value as Record<string, unknown>);
          expect(values.every((v) => v === null)).toBeTruthy();
        } else {
          expect(result.value).toBeNull();
        }
      }
    });
  }
});
