import type { CreateCaseSelection } from "../../../page-objects/pages/exui/createCase.po.js";

const formatOptions = (options: Array<{ label: string; value: string }>): string =>
  options.length
    ? options
        .map((option) => `${option.label || "(blank)"}${option.value ? ` [${option.value}]` : ""}`)
        .join(", ")
    : "none";

export const requireCreateCaseSelection = (
  selection: CreateCaseSelection,
  desiredJurisdiction: string,
  desiredCaseType: string
) => {
  if (!selection.selectedJurisdiction || !selection.selectedCaseType) {
    const availableJurisdictions = formatOptions(selection.availableJurisdictions);
    const availableCaseTypes = formatOptions(selection.availableCaseTypes);
    throw new Error(
      `Create case requires jurisdiction "${desiredJurisdiction}" and case type "${desiredCaseType}". ` +
        `Available jurisdictions: ${availableJurisdictions}. Available case types: ${availableCaseTypes}.`
    );
  }

  return {
    jurisdictionValue: selection.selectedJurisdiction!.value || selection.selectedJurisdiction!.label,
    jurisdictionLabel: selection.selectedJurisdiction!.label || selection.selectedJurisdiction!.value,
    caseTypeValue: selection.selectedCaseType!.value || selection.selectedCaseType!.label,
    caseTypeLabel: selection.selectedCaseType!.label || selection.selectedCaseType!.value
  };
};
