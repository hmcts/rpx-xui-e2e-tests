import { TEST_CASE_REFERENCES } from "../testData/index.js";

export const VALID_SEARCH_CASE_REFERENCE = TEST_CASE_REFERENCES.QUICK_SEARCH_VALID;
export function buildSearchCaseJurisdictionsMock() {
  return [
    {
      id: "PUBLICLAW",
      name: "Public Law",
      caseTypes: [
        {
          id: "CARE_SUPERVISION_EPO",
          name: "Care and supervision",
          states: [
            {
              id: "Open",
              name: "Open"
            }
          ]
        }
      ]
    }
  ];
}

export function buildGlobalSearchServicesMock() {
  return [
    {
      serviceId: "PUBLICLAW",
      serviceName: "Public Law"
    }
  ];
}

export function buildGlobalSearchResultsMock(caseReference: string = VALID_SEARCH_CASE_REFERENCE) {
  return {
    resultInfo: {
      caseStartRecord: 1,
      casesReturned: 1,
      moreResultsToGo: false
    },
    results: [
      {
        CCDCaseTypeId: "CARE_SUPERVISION_EPO",
        CCDCaseTypeName: "Care and supervision",
        CCDJurisdictionId: "PUBLICLAW",
        CCDJurisdictionName: "Public Law",
        HMCTSServiceId: "PUBLICLAW",
        HMCTSServiceShortDescription: "Public Law",
        baseLocationId: "765324",
        baseLocationName: "Taylor House",
        caseManagementCategoryId: null,
        caseManagementCategoryName: null,
        caseNameHmctsInternal: "Case Name Example",
        caseReference,
        otherReferences: null,
        processForAccess: null,
        regionId: "1",
        regionName: "London",
        stateId: "Open"
      }
    ]
  };
}

export function buildGlobalSearchNoResultsMock() {
  return {
    resultInfo: {
      caseStartRecord: 1,
      casesReturned: 0,
      moreResultsToGo: false
    },
    results: []
  };
}
