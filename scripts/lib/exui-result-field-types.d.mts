export interface ResultFieldType {
  id: string;
  type: 'Text' | 'Date' | 'DateTime' | 'FixedList';
  fixed_list_items: Array<{code: string; label: string; order: number | null}>;
}
export function expectedResultFieldType(fieldId: string): ResultFieldType;
export function validateResultFieldType(fieldId: string, observed: unknown): ResultFieldType;
export function validateResultCandidateColumns(body: unknown, expectedColumns: unknown[]): void;
