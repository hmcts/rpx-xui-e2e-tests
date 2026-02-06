export const TEST_DATA = {
  V2: {
    JURISDICTION: "DIVORCE",
    CASE_TYPE: "xuiTestCaseType",
    TAB_NAME: "Tab 1",
    TAB_CLASS: "tab1",
    ACTION: "Update case",
    FILE_NAME: "test.doc",
    FILE_TYPE: "application/msword",
    FILE_CONTENT: "Test Word document content",
    TEXT_FIELD_LABEL: "Text Field",
    DOCUMENT_FIELD_LABEL: "Document 1",
  },
  V1: {
    JURISDICTION: "EMPLOYMENT",
    CASE_TYPE: "ET_EnglandWales",
    TAB_NAME: "Documents",
    ACTION: "Upload Document",
    FILE_TYPE: "application/pdf",
    FILE_CONTENT: "Test PDF document content",
  },
} as const;

export const TIMEOUTS = {
  TABLE_VISIBLE: 10_000,
  ALERT_VISIBLE: 10_000,
  TAB_LOAD: 5_000,
} as const;
