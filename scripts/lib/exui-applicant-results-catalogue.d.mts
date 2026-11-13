export type ApplicantResultView = 'SEARCH' | 'WORKBASKET';
export interface ApplicantResultCatalogueRow {
  obligationId: string;
  proofId: string;
  mutationId: string;
  view: ApplicantResultView;
  field: string;
  sourcePath: string;
  sourceIndex: number;
  rowDigest: string;
  sourceRow: Record<string, unknown>;
  definition: {CaseFieldID: string; Label: string; DisplayOrder: number};
  fieldDependency: unknown;
}
export function applicantResultCatalogueContract(): ApplicantResultCatalogueRow[];
export function applicantResultCatalogueMutation(variant: string): ApplicantResultCatalogueRow;
export function applicantResultCatalogueObserved(view: ApplicantResultView, columns: Array<{case_field_id: string; label: string; order: number}>): Array<{
  obligationId: string;
  proofId: string;
  expected: {CaseFieldID: string; Label: string; DisplayOrder: number};
  observed: {CaseFieldID: string; Label: string; DisplayOrder: number} | null;
}>;
