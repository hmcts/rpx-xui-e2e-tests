type UnknownRecord = Record<string, unknown>;

export const ACCESS_REQUEST_CASE_ID = "1111222233334444";
export const ACCESS_REQUEST_TASK_ID = "task-review-specific-access";
export const ACCESS_REQUEST_ASSIGNMENT_ID = "assignment-review-specific-access";
export const ACCESS_REQUEST_JURISDICTION = "PUBLICLAW";
export const ACCESS_REQUEST_CASE_TYPE = "CARE_SUPERVISION_EPO";
export const ACCESS_REQUEST_CASE_NAME = "Test Access Request Case";
export const ACCESS_REQUEST_SERVICE_NAME = "Immigration & Asylum";
export const ACCESS_REQUEST_REQUESTER_ID = "caseworker-123";
export const ACCESS_REQUEST_REASON = "Need to review linked proceedings";
export const ACCESS_REQUEST_REQUESTED_ROLE = "specific-access-legal-ops";

type MockCaseworker = {
  email: string;
  firstName: string;
  idamId: string;
  lastName: string;
  location: {
    id: number;
    locationName: string;
  };
  roleCategory: string;
  service: string;
};

function buildTextField(id: string, label: string, value: string | number, metadata = false) {
  return {
    id,
    label,
    value,
    metadata,
    field_type: {
      id: "Text",
      type: "Text",
      fixed_list_items: [],
      complex_fields: [],
      collection_field_type: null,
      min: null,
      max: null,
      regular_expression: null
    }
  };
}

function buildSummaryField(id: string, label: string, value: string) {
  return {
    ...buildTextField(id, label, value, false),
    value_class: "",
    display_context: "READONLY",
    show_condition: null,
    hint_text: null
  };
}

export function buildReviewSpecificAccessTaskMock(
  overrides: Partial<Record<string, unknown>> = {}
) {
  const taskId = (overrides.id as string) ?? ACCESS_REQUEST_TASK_ID;
  const caseId = (overrides.case_id as string) ?? ACCESS_REQUEST_CASE_ID;
  const jurisdiction = (overrides.jurisdiction as string) ?? ACCESS_REQUEST_JURISDICTION;
  const caseTypeId = (overrides.case_type_id as string) ?? ACCESS_REQUEST_CASE_TYPE;
  const caseName = (overrides.case_name as string) ?? ACCESS_REQUEST_CASE_NAME;

  return {
    task: {
      id: taskId,
      case_id: caseId,
      jurisdiction,
      case_type_id: caseTypeId,
      case_name: caseName,
      state: "assigned",
      ...overrides
    }
  };
}

export function buildSpecificAccessRoleMock(
  overrides: Partial<Record<string, unknown>> = {}
) {
  return {
    id: ACCESS_REQUEST_ASSIGNMENT_ID,
    actorId: ACCESS_REQUEST_REQUESTER_ID,
    roleCategory: "LEGAL_OPERATIONS",
    roleName: "Case role A",
    requestedRole: ACCESS_REQUEST_REQUESTED_ROLE,
    notes: ACCESS_REQUEST_REASON,
    created: "2025-03-11T10:30:00.000Z",
    start: "2025-03-11T10:30:00.000Z",
    end: null,
    location: "Taylor House",
    email: "alice@example.com",
    ...overrides
  };
}

export function buildSpecificAccessCaseworkerMock(
  overrides: Partial<MockCaseworker> = {}
): MockCaseworker {
  return {
    email: "alice@example.com",
    firstName: "Alice",
    idamId: ACCESS_REQUEST_REQUESTER_ID,
    lastName: "Example",
    location: {
      id: 227101,
      locationName: "Taylor House"
    },
    roleCategory: "LEGAL_OPERATIONS",
    service: ACCESS_REQUEST_SERVICE_NAME,
    ...overrides
  };
}

function buildAccessRequestCaseDetailsMock(
  accessProcess: "CHALLENGED" | "SPECIFIC",
  overrides: Partial<Record<string, unknown>> = {}
): UnknownRecord {
  const caseId = (overrides.case_id as string) ?? ACCESS_REQUEST_CASE_ID;
  const jurisdiction =
    (overrides.case_type as { jurisdiction?: { id?: string } })?.jurisdiction?.id ??
    ACCESS_REQUEST_JURISDICTION;
  const jurisdictionName =
    (overrides.case_type as { jurisdiction?: { name?: string } })?.jurisdiction?.name ??
    ACCESS_REQUEST_SERVICE_NAME;
  const caseTypeId =
    (overrides.case_type as { id?: string })?.id ?? ACCESS_REQUEST_CASE_TYPE;
  const caseName =
    (overrides.basicFields as { caseNameHmctsInternal?: string })?.caseNameHmctsInternal ??
    ACCESS_REQUEST_CASE_NAME;

  return {
    _links: {
      self: {
        href: `http://localhost:3000/data/internal/cases/${caseId}`
      }
    },
    case_id: caseId,
    case_type: {
      id: caseTypeId,
      name: caseTypeId,
      description: `${caseTypeId} integration case type`,
      jurisdiction: {
        id: jurisdiction,
        name: jurisdictionName,
        description: `${jurisdiction} jurisdiction`
      },
      printEnabled: false
    },
    basicFields: {
      caseNameHmctsInternal: caseName
    },
    tabs: [
      {
        id: "caseSummary",
        label: "Case summary",
        order: 1,
        fields: [buildSummaryField("caseNameHmctsInternal", "Case name", caseName)]
      }
    ],
    metadataFields: [
      buildTextField("[CASE_REFERENCE]", "Case Reference", Number(caseId), true),
      buildTextField("[JURISDICTION]", "Jurisdiction", jurisdiction, true),
      buildTextField("[CASE_TYPE]", "Case Type", caseTypeId, true),
      buildTextField("[ACCESS_PROCESS]", "Access Process", accessProcess, true),
      buildTextField("[ACCESS_GRANTED]", "Access Granted", "BASIC", true)
    ],
    state: {
      id: "Open",
      name: "Open",
      description: "Open case",
      title_display: "# ${[CASE_REFERENCE]}"
    },
    triggers: [
      {
        id: "updateCase",
        name: "Update case",
        description: "Update case details",
        order: 1
      }
    ],
    events: [],
    channels: [],
    ...overrides
  };
}

export function buildChallengedAccessCaseDetailsMock(
  overrides: Partial<Record<string, unknown>> = {}
): UnknownRecord {
  return buildAccessRequestCaseDetailsMock("CHALLENGED", overrides);
}

export function buildSpecificAccessCaseDetailsMock(
  overrides: Partial<Record<string, unknown>> = {}
): UnknownRecord {
  return buildAccessRequestCaseDetailsMock("SPECIFIC", overrides);
}
