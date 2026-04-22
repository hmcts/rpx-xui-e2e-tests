import { TEST_CASE_REFERENCES } from "../testData/index.js";

export const GLOBAL_SEARCH_CASE_REFERENCE = TEST_CASE_REFERENCES.GLOBAL_SEARCH_VALID;
export const GLOBAL_SEARCH_NON_EXISTENT_CASE_REFERENCE =
  TEST_CASE_REFERENCES.GLOBAL_SEARCH_NON_EXISTENT;
export const GLOBAL_SEARCH_CASE_NAME = "Care Proceedings - Child A";

export function buildGlobalSearchServicesMock() {
  return [
    {
      serviceId: "PUBLICLAW",
      serviceName: "Public Law"
    }
  ];
}

export function buildGlobalSearchJurisdictionsMock() {
  return [
    {
      id: "PUBLICLAW",
      name: "Public Law",
      caseTypes: [
        {
          id: "PRLAPPS",
          name: "Public Law Applications",
          states: [
            {
              id: "Submitted",
              name: "Submitted"
            }
          ]
        }
      ]
    }
  ];
}

export function buildGlobalSearchMenuResultsMock() {
  return {
    resultInfo: {
      casesReturned: 1,
      moreResultsToGo: false
    },
    results: [
      {
        CCDCaseTypeId: "PRLAPPS",
        CCDCaseTypeName: "Public Law Applications",
        CCDJurisdictionId: "PUBLICLAW",
        CCDJurisdictionName: "Public Law",
        HMCTSServiceId: "ABA5",
        HMCTSServiceShortDescription: "Public Law",
        baseLocationId: "231596",
        baseLocationName: "Taylor House",
        caseManagementCategoryId: null,
        caseManagementCategoryName: null,
        caseNameHmctsInternal: GLOBAL_SEARCH_CASE_NAME,
        caseReference: GLOBAL_SEARCH_CASE_REFERENCE,
        otherReferences: [],
        processForAccess: "NONE",
        regionId: null,
        regionName: null,
        stateId: "Submitted"
      }
    ]
  };
}

export function buildGlobalSearchNoResultsMock() {
  return {
    resultInfo: {
      casesReturned: 0,
      moreResultsToGo: false
    },
    results: []
  };
}

export function buildGlobalSearchCaseDetailsMock(
  caseReference: string = GLOBAL_SEARCH_CASE_REFERENCE
) {
  return {
    _links: {
      self: {
        href: `http://localhost:3000/data/internal/cases/${caseReference}`
      }
    },
    case_id: caseReference,
    case_type: {
      id: "PRLAPPS",
      name: "Public Law Applications",
      description: "Public law applications case type for integration tests",
      jurisdiction: {
        id: "PUBLICLAW",
        name: "Public Law",
        description: "Public law jurisdiction"
      },
      printEnabled: false
    },
    state: {
      id: "Submitted",
      name: "Submitted",
      description: "Submitted case",
      title_display: "# ${[CASE_REFERENCE]}"
    },
    metadataFields: [
      {
        id: "[CASE_REFERENCE]",
        label: "Case Reference",
        value: Number(caseReference),
        metadata: true,
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
      },
      {
        id: "[JURISDICTION]",
        label: "Jurisdiction",
        value: "PUBLICLAW",
        metadata: true,
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
      },
      {
        id: "[CASE_TYPE]",
        label: "Case Type",
        value: "PRLAPPS",
        metadata: true,
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
      }
    ],
    tabs: [
      {
        id: "caseSummary",
        label: "Case summary",
        order: 1,
        fields: [
          {
            id: "caseSummaryTabHeading",
            label: "Case information",
            value: "Case information",
            metadata: false,
            field_type: {
              id: "Label",
              type: "Label",
              fixed_list_items: [],
              complex_fields: [],
              collection_field_type: null,
              min: null,
              max: null,
              regular_expression: null
            }
          }
        ]
      }
    ],
    triggers: [
      {
        id: "updateCase",
        name: "Update case",
        description: "Update case details",
        order: 1
      }
    ]
  };
}
