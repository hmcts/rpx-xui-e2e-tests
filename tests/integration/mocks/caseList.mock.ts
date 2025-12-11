interface CaseFieldType {
  id: string;
  type: string;
  min: number | null;
  max: number | null;
  regular_expression: string | null;
  fixed_list_items: unknown[];
  complex_fields: unknown[];
  collection_field_type: unknown | null;
}

interface CaseListColumn {
  label: string;
  order: number;
  metadata: boolean;
  case_field_id: string;
  case_field_type: CaseFieldType;
  display_context_parameter: string | null;
}

interface CaseListResult {
  case_id: string;
  supplementary_data: null;
  case_fields: Record<string, string>;
}

export interface CaseListResponse {
  columns: CaseListColumn[];
  results: CaseListResult[];
  total: number;
}

const textFieldColumns: CaseListColumn[] = [
  {
    label: "Case reference",
    order: 1,
    metadata: true,
    case_field_id: "[CASE_REFERENCE]",
    case_field_type: {
      id: "Text",
      type: "Text",
      min: null,
      max: null,
      regular_expression: null,
      fixed_list_items: [],
      complex_fields: [],
      collection_field_type: null,
    },
    display_context_parameter: null,
  },
  {
    label: "Text Field 0",
    order: 2,
    metadata: false,
    case_field_id: "TextField0",
    case_field_type: {
      id: "Text",
      type: "Text",
      min: null,
      max: null,
      regular_expression: null,
      fixed_list_items: [],
      complex_fields: [],
      collection_field_type: null,
    },
    display_context_parameter: null,
  },
  {
    label: "Text Field 1",
    order: 3,
    metadata: false,
    case_field_id: "TextField1",
    case_field_type: {
      id: "Text",
      type: "Text",
      min: null,
      max: null,
      regular_expression: null,
      fixed_list_items: [],
      complex_fields: [],
      collection_field_type: null,
    },
    display_context_parameter: null,
  },
  {
    label: "Text Field 2",
    order: 4,
    metadata: false,
    case_field_id: "TextField2",
    case_field_type: {
      id: "Text",
      type: "Text",
      min: null,
      max: null,
      regular_expression: null,
      fixed_list_items: [],
      complex_fields: [],
      collection_field_type: null,
    },
    display_context_parameter: null,
  },
];

const baseDate = new Date("2024-01-01T09:00:00Z");
const isoDate = (offsetDays: number) =>
  new Date(baseDate.getTime() + offsetDays * 86_400_000).toISOString();

/**
 * Deterministic case list mock matching the XUI case list API shape.
 * Capped at 25 results to mirror UI pagination behaviour.
 */
export function buildCaseListMock(rowCount = 2): CaseListResponse {
  const maxResults = 25;
  const results = Array.from({ length: Math.min(rowCount, maxResults) }, (_, i) => {
    const idx = i + 1;
    const caseReference = `#1000-2000-3000-${String(9000 + idx).padStart(4, "0")}`;
    return {
      case_id: caseReference,
      supplementary_data: null,
      case_fields: {
        TextField0: `text-0-${idx}`,
        "[STATE]": "CaseCreated",
        "[SECURITY_CLASSIFICATION]": "PUBLIC",
        "[JURISDICTION]": "DIVORCE",
        "[LAST_STATE_MODIFIED_DATE]": isoDate(idx + 1),
        "[CREATED_DATE]": isoDate(idx),
        TextField2: `text-2-${idx}`,
        "[CASE_TYPE]": "xuiTestJurisdiction",
        TextField1: `text-1-${idx}`,
        "[CASE_REFERENCE]": caseReference,
        "[LAST_MODIFIED_DATE]": isoDate(idx + 2),
      },
    };
  });

  return {
    columns: textFieldColumns,
    results,
    total: rowCount,
  };
}

export default buildCaseListMock;
