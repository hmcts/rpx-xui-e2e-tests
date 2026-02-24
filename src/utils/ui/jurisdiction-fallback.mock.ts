type JurisdictionState = {
  id: string;
  name: string;
};

type JurisdictionCaseType = {
  id: string;
  name: string;
  states: JurisdictionState[];
};

type JurisdictionBootstrapEntry = {
  id: string;
  name: string;
  caseTypes: JurisdictionCaseType[];
};

export const buildJurisdictionBootstrapFallbackMock =
  (): JurisdictionBootstrapEntry[] => [
    {
      id: "DIVORCE",
      name: "Divorce",
      caseTypes: [
        {
          id: "xuiTestJurisdiction",
          name: "xuiTestJurisdiction",
          states: [
            {
              id: "CaseCreated",
              name: "Case created",
            },
          ],
        },
      ],
    },
    {
      id: "EMPLOYMENT",
      name: "Employment",
      caseTypes: [
        {
          id: "ET_EnglandWales",
          name: "ET EnglandWales",
          states: [
            {
              id: "Accepted",
              name: "Accepted",
            },
          ],
        },
      ],
    },
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
              name: "Submitted",
            },
          ],
        },
      ],
    },
  ];
