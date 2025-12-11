export type RetainHiddenValue = boolean | null;

export interface HiddenFieldScenario {
  fieldType: "Text" | "AddressUK" | "FixedList" | "Collection";
  showField: boolean;
  retainHidden: RetainHiddenValue;
}

export interface SubmissionResult {
  hasField: boolean;
  value: unknown;
}

/**
 * Simulates CCD retain_hidden_value behaviour for a single field.
 * Mirrors the logic covered in legacy CodeceptJS tests without requiring a CCD mock server.
 */
export function simulateRetainHiddenValue(
  scenario: HiddenFieldScenario,
): SubmissionResult {
  const { showField, retainHidden, fieldType } = scenario;

  // Default value for visible fields
  const visibleValue = buildValue(fieldType);

  if (showField) {
    // Field shown: value submitted
    return { hasField: true, value: visibleValue };
  }

  // Field hidden
  if (retainHidden === true) {
    // Retain hidden value = Yes -> omit from payload
    return { hasField: false, value: undefined };
  }

  // Retain hidden value = No/undefined/null -> submit null placeholder
  return { hasField: true, value: nullify(fieldType) };
}

function buildValue(fieldType: HiddenFieldScenario["fieldType"]): unknown {
  switch (fieldType) {
    case "Text":
      return "Test old value";
    case "AddressUK":
      return {
        AddressLine1: "29 AddressLine1 close",
        AddressLine2: "AddressLine2 Road",
        AddressLine3: "AddressLine3 town",
        PostTown: "London",
        County: "testcounty",
        PostCode: "AB12 3CD",
        Country: "United Kingdom",
      };
    case "FixedList":
      return "item3";
    case "Collection":
      return [
        { id: 12, value: { CollText: "test1" } },
        { id: 123, value: { CollText: "test2" } },
      ];
    default:
      return null;
  }
}

function nullify(fieldType: HiddenFieldScenario["fieldType"]): unknown {
  switch (fieldType) {
    case "Text":
    case "FixedList":
      return null;
    case "AddressUK":
      return {
        AddressLine1: null,
        AddressLine2: null,
        AddressLine3: null,
        PostTown: null,
        County: null,
        PostCode: null,
        Country: null,
      };
    case "Collection":
      return null;
    default:
      return null;
  }
}
