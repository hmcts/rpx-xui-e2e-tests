type JurisdictionAcl = {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
  role: string;
};

type JurisdictionEvent = {
  id: string;
  name: string;
  description: string;
  order: number | null;
  case_fields: unknown[];
  pre_states: string[];
  post_states: string[];
  callback_url_about_to_start_event: string | null;
  retries_timeout_about_to_start_event: number[] | null;
  callback_url_about_to_submit_event: string | null;
  retries_timeout_url_about_to_submit_event: number[] | null;
  callback_url_submitted_event: string | null;
  retries_timeout_url_submitted_event: number[] | null;
  security_classification: string | null;
  show_summary: boolean | null;
  show_event_notes: boolean | null;
  end_button_label: string | null;
  can_save_draft: boolean | null;
  publish: boolean | null;
  acls: JurisdictionAcl[];
  event_enabling_condition: string | null;
  ttl_increment: number | null;
};

type JurisdictionState = {
  id: string;
  name: string;
  description: string;
  order: number;
  title_display: string | null;
  acls: JurisdictionAcl[];
};

type JurisdictionCaseType = {
  id: string;
  description: string;
  version: number | null;
  name: string;
  events: JurisdictionEvent[];
  states: JurisdictionState[];
  searchAliasFields: unknown[];
  searchParties: unknown[];
  searchCriterias: unknown[];
  categories: unknown[];
  jurisdiction: string | null;
  security_classification: string | null;
  case_fields: unknown[];
  printable_document_url: string | null;
  acls: JurisdictionAcl[];
  callback_get_case_url: string | null;
  retries_get_case_url: number[];
  roleToAccessProfiles: unknown[];
  accessTypes: unknown[];
  accessTypeRoles: unknown[];
};

type JurisdictionBootstrapEntry = {
  id: string;
  name: string;
  description: string;
  caseTypes: JurisdictionCaseType[];
};

const permissiveCaseAcls: JurisdictionAcl[] = [
  {
    create: true,
    read: true,
    update: true,
    delete: true,
    role: "caseworker-divorce-solicitor",
  },
  {
    create: true,
    read: true,
    update: true,
    delete: true,
    role: "caseworker",
  },
  {
    create: true,
    read: true,
    update: true,
    delete: true,
    role: "pui-caa",
  },
];

const buildEvent = (id: string, name: string): JurisdictionEvent => ({
  id,
  name,
  description: name,
  order: null,
  case_fields: [],
  pre_states: [],
  post_states: [],
  callback_url_about_to_start_event: null,
  retries_timeout_about_to_start_event: null,
  callback_url_about_to_submit_event: null,
  retries_timeout_url_about_to_submit_event: null,
  callback_url_submitted_event: null,
  retries_timeout_url_submitted_event: null,
  security_classification: null,
  show_summary: null,
  show_event_notes: null,
  end_button_label: null,
  can_save_draft: null,
  publish: null,
  acls: permissiveCaseAcls,
  event_enabling_condition: null,
  ttl_increment: null,
});

const buildState = (
  id: string,
  name: string,
  order = 1,
): JurisdictionState => ({
  id,
  name,
  description: name,
  order,
  title_display: null,
  acls: permissiveCaseAcls,
});

const buildCaseType = (
  id: string,
  name: string,
  events: JurisdictionEvent[],
): JurisdictionCaseType => ({
  id,
  description: name,
  version: null,
  name,
  events,
  states: [buildState("CaseCreated", "Case created", 1)],
  searchAliasFields: [],
  searchParties: [],
  searchCriterias: [],
  categories: [],
  jurisdiction: null,
  security_classification: null,
  case_fields: [],
  printable_document_url: null,
  acls: permissiveCaseAcls,
  callback_get_case_url: null,
  retries_get_case_url: [],
  roleToAccessProfiles: [],
  accessTypes: [],
  accessTypeRoles: [],
});

export const buildJurisdictionBootstrapFallbackMock =
  (): JurisdictionBootstrapEntry[] => [
    {
      id: "DIVORCE",
      name: "Divorce",
      description: "Divorce",
      caseTypes: [
        buildCaseType("xuiTestJurisdiction", "xuiTestJurisdiction", [
          buildEvent("createCase", "Create a case"),
          buildEvent("updateCase", "Update case"),
        ]),
        buildCaseType("xuiTestCaseType", "xuiTestCaseType", [
          buildEvent("createCase", "Create a case"),
          buildEvent("updateCase", "Update case"),
        ]),
        buildCaseType("xuiTestCaseType_dev", "xuiTestCaseType_dev", [
          buildEvent("createCase", "Create a case"),
          buildEvent("updateCase", "Update case"),
        ]),
        buildCaseType("xuiCaseFlagsV1", "xuiCaseFlagsV1", [
          buildEvent("createCase", "Create a case"),
          buildEvent("createCaseFlag", "Create case flag"),
        ]),
        buildCaseType("xuiCaseFlags2.1", "xuiCaseFlags2.1", [
          buildEvent("createCase", "Create a case"),
          buildEvent("createCaseFlag", "Create case flag"),
        ]),
        buildCaseType("XUI Case PoC", "XUI Case PoC", [
          buildEvent("createCase", "Create a case"),
          buildEvent("updateCase", "Update case"),
        ]),
      ],
    },
    {
      id: "EMPLOYMENT",
      name: "Employment",
      description: "Employment",
      caseTypes: [
        buildCaseType("ET_EnglandWales", "ET EnglandWales", [
          buildEvent("initiateCase", "Start"),
        ]),
      ],
    },
    {
      id: "PUBLICLAW",
      name: "Public Law",
      description: "Public Law",
      caseTypes: [
        buildCaseType("PRLAPPS", "Public Law Applications", [
          buildEvent("solicitorCreate", "Solicitor application"),
        ]),
      ],
    },
  ];
