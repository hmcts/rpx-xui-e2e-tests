export enum HMCStatus {
  HEARING_REQUESTED = 'HEARING_REQUESTED',
  AWAITING_LISTING = 'AWAITING_LISTING',
  LISTED = 'LISTED',
  UPDATE_REQUESTED = 'UPDATE_REQUESTED',
  UPDATE_SUBMITTED = 'UPDATE_SUBMITTED',
  EXCEPTION = 'EXCEPTION',
  CANCELLATION_REQUESTED = 'CANCELLATION_REQUESTED',
  CANCELLATION_SUBMITTED = 'CANCELLATION_SUBMITTED',
  CANCELLED = 'CANCELLED',
  VACATED = 'VACATED',
  AWAITING_ACTUALS = 'AWAITING_ACTUALS',
  COMPLETED = 'COMPLETED',
  ADJOURNED = 'ADJOURNED',
}

export enum EXUISectionStatusEnum {
  UPCOMING = 'Current and upcoming',
  PAST_OR_CANCELLED = 'Past or cancelled',
}

type HearingStatusMapping = {
  hmcStatus: HMCStatus;
  exuiSectionStatus: EXUISectionStatusEnum;
  exuiDisplayStatus: string;
};

export const hearingStatusMappings: HearingStatusMapping[] = [
  {
    hmcStatus: HMCStatus.HEARING_REQUESTED,
    exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
    exuiDisplayStatus: 'WAITING TO BE LISTED',
  },
  {
    hmcStatus: HMCStatus.AWAITING_LISTING,
    exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
    exuiDisplayStatus: 'WAITING TO BE LISTED',
  },
  {
    hmcStatus: HMCStatus.LISTED,
    exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
    exuiDisplayStatus: 'LISTED',
  },
  {
    hmcStatus: HMCStatus.UPDATE_REQUESTED,
    exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
    exuiDisplayStatus: 'UPDATE REQUESTED',
  },
  {
    hmcStatus: HMCStatus.UPDATE_SUBMITTED,
    exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
    exuiDisplayStatus: 'UPDATE REQUESTED',
  },
  {
    hmcStatus: HMCStatus.EXCEPTION,
    exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
    exuiDisplayStatus: 'REQUEST FAILURE',
  },
  {
    hmcStatus: HMCStatus.CANCELLATION_REQUESTED,
    exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
    exuiDisplayStatus: 'CANCELLATION REQUESTED',
  },
  {
    hmcStatus: HMCStatus.CANCELLATION_SUBMITTED,
    exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
    exuiDisplayStatus: 'CANCELLATION REQUESTED',
  },
  {
    hmcStatus: HMCStatus.AWAITING_ACTUALS,
    exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
    exuiDisplayStatus: 'AWAITING HEARING DETAILS',
  },
  {
    hmcStatus: HMCStatus.CANCELLED,
    exuiSectionStatus: EXUISectionStatusEnum.PAST_OR_CANCELLED,
    exuiDisplayStatus: 'CANCELLED',
  },
  {
    hmcStatus: HMCStatus.COMPLETED,
    exuiSectionStatus: EXUISectionStatusEnum.PAST_OR_CANCELLED,
    exuiDisplayStatus: 'COMPLETED',
  },
  {
    hmcStatus: HMCStatus.ADJOURNED,
    exuiSectionStatus: EXUISectionStatusEnum.PAST_OR_CANCELLED,
    exuiDisplayStatus: 'ADJOURNED',
  },
];

export const hearingStageRefData = [
  {
    key: 'initial',
    value_en: 'Initial',
    value_cy: '',
  },
  {
    key: 'final',
    value_en: 'Final',
    value_cy: '',
  },
  {
    key: 'substantial',
    value_en: 'Substantial',
    value_cy: '',
  },
  {
    key: 'case-management',
    value_en: 'Case management',
    value_cy: '',
  },
];

export const hearingActualsMainModel = {
  hearingActuals: {
    hearingOutcome: {
      hearingFinalFlag: false,
      hearingResult: 'CANCELLED',
      hearingResultDate: '2019-01-01',
      hearingResultReasonType: 'unable',
      hearingType: 'Pre-hearing review',
    },
    actualHearingDays: [
      {
        hearingDate: '2021-03-12',
        hearingStartTime: '2021-03-12T09:00:00.000Z',
        hearingEndTime: '2021-03-12T10:00:00.000Z',
        pauseDateTimes: [],
        notRequired: false,
        actualDayParties: [
          {
            actualPartyId: '1',
            individualDetails: {
              firstName: 'Bob',
              lastName: 'Jones',
            },
            actualOrganisationName: 'Company A',
            didNotAttendFlag: false,
            partyChannelSubType: 'inPerson',
            partyRole: 'appellant',
            representedParty: '',
          },
          {
            actualPartyId: '2',
            individualDetails: {
              firstName: 'Mary',
              lastName: 'Jones',
            },
            actualOrganisationName: 'Company B',
            didNotAttendFlag: false,
            partyChannelSubType: 'inPerson',
            partyRole: 'claimant',
            representedParty: '',
          },
        ],
      },
    ],
  },
  hearingPlanned: {
    plannedHearingType: 'final',
    plannedHearingDays: [
      {
        plannedStartTime: '2021-03-12T09:00:00.000Z',
        plannedEndTime: '2021-03-12T10:00:00.000Z',
        parties: [
          {
            individualDetails: {
              title: 'Miss',
              firstName: 'Bob',
              lastName: 'Jones',
            },
            organisationDetails: {
              cftOrganisationID: '54321',
              name: 'Company A',
            },
            partyID: '1',
            partyRole: 'interpreter',
            partyChannelSubType: 'appellant',
          },
        ],
      },
    ],
  },
  hmcStatus: HMCStatus.UPDATE_SUBMITTED,
  caseDetails: {
    hmctsServiceCode: 'BBA3',
    caseRef: '1584618195804035',
    requestTimeStamp: null,
    hearingID: 'h100001',
    externalCaseReference: null,
    caseDeepLink: null,
    hmctsInternalCaseName: 'Jane Smith vs DWP',
    publicCaseName: 'Jane Smith vs DWP',
    caseAdditionalSecurityFlag: false,
    caseInterpreterRequiredFlag: false,
    caseCategories: [
      {
        categoryType: 'caseType',
        categoryValue: 'BBA3-002',
      },
      {
        categoryType: 'caseSubType',
        categoryValue: 'BBA3-002CC',
        categoryParent: 'BBA3-002',
      },
    ],
    caseManagementLocationCode: null,
    caserestrictedFlag: false,
    caseSLAStartDate: '2021-11-23T09:00:00.000Z',
  },
};

export const hearingLinksState = {
  serviceLinkedCases: [
    {
      caseReference: '4652724902696213',
      caseName: 'Smith vs Peterson',
      reasonsForLink: ['Linked for a hearing'],
    },
    {
      caseReference: '5283819672542864',
      caseName: 'Smith vs Peterson',
      reasonsForLink: ['Linked for a hearing', 'Progressed as part of lead case'],
    },
    {
      caseReference: '8254902572336147',
      caseName: 'Smith vs Peterson',
      reasonsForLink: ['Familial', 'Guardian', 'Linked for a hearing'],
    },
  ],
  serviceLinkedCasesWithHearings: [
    {
      caseRef: '4652724902696213',
      caseName: 'Smith vs Peterson',
      reasonsForLink: ['Linked for a hearing'],
      caseHearings: [
        {
          hearingID: 'h100001',
          hearingType: 'Substantive',
          hearingRequestDateTime: '2021-09-01T16:00:00.000Z',
          lastResponseReceivedDateTime: '',
          exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
          exuiDisplayStatus: 'WAITING TO BE LISTED',
          hmcStatus: HMCStatus.HEARING_REQUESTED,
          responseVersion: 'rv1',
          hearingListingStatus: 'UPDATE REQUESTED',
          listAssistCaseStatus: '',
          hearingIsLinkedFlag: true,
          hearingGroupRequestId: null,
          hearingDaySchedule: [],
          isSelected: true,
        },
      ],
    },
    {
      caseRef: '8254902572336147',
      caseName: 'Smith vs Peterson',
      reasonsForLink: ['Familial', 'Guardian', 'Linked for a hearing'],
      caseHearings: [
        {
          hearingID: 'h100010',
          hearingType: 'Direction Hearings',
          hearingRequestDateTime: '2021-09-01T16:00:00.000Z',
          lastResponseReceivedDateTime: '',
          exuiSectionStatus: EXUISectionStatusEnum.UPCOMING,
          exuiDisplayStatus: 'WAITING TO BE LISTED',
          hmcStatus: HMCStatus.AWAITING_LISTING,
          responseVersion: 'rv1',
          hearingListingStatus: 'UPDATE REQUESTED',
          listAssistCaseStatus: '',
          hearingIsLinkedFlag: true,
          hearingGroupRequestId: null,
          hearingDaySchedule: [],
          isSelected: true,
        },
      ],
    },
  ],
  linkedHearingGroup: {
    groupDetails: {
      groupName: 'Group A',
      groupReason: 'Reason 1',
      groupLinkType: 'ORDERED',
      groupComments: 'Comment 1',
    },
    hearingsInGroup: [
      {
        hearingId: 'h1000001',
        hearingOrder: 1,
      },
      {
        hearingId: 'h1000003',
        hearingOrder: 2,
      },
      {
        hearingId: 'h1000005',
        hearingOrder: 3,
      },
    ],
  },
};
