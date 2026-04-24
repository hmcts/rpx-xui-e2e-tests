import { expect, test } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv.js";
import {
  buildGlobalSearchRequestBody,
  extractCaseReferencesFromHtml,
  resolveCaseReferenceFromGlobalSearch,
  resolveNonExistentCaseReference,
  selectCaseReferenceFromResults
} from "../e2e/utils/case-reference.utils.js";

type FakeResponseInit = {
  status: number;
  json?: unknown;
  text?: string;
};

type FakeRequestLog = {
  method: "GET" | "POST";
  url: string;
  data?: unknown;
};

function buildFakeResponse(init: FakeResponseInit) {
  return {
    status: () => init.status,
    json: async () => init.json ?? {},
    text: async () => init.text ?? ""
  };
}

function buildFakePage(config: {
  postResponses: FakeResponseInit[];
  getResponses?: Record<string, FakeResponseInit>;
}) {
  const requests: FakeRequestLog[] = [];
  let postIndex = 0;

  return {
    page: {
      request: {
        post: async (url: string, options: { data: unknown }) => {
          requests.push({ method: "POST", url, data: options.data });
          const response = config.postResponses[postIndex] ?? config.postResponses.at(-1);
          postIndex += 1;
          return buildFakeResponse(response ?? { status: 500 });
        },
        get: async (url: string) => {
          requests.push({ method: "GET", url });
          return buildFakeResponse(config.getResponses?.[url] ?? { status: 404 });
        }
      },
      waitForTimeout: async () => undefined
    },
    requests
  };
}

test.describe("Case reference support coverage", () => {
  test("buildGlobalSearchRequestBody preserves case reference and jurisdiction filters", () => {
    expect(buildGlobalSearchRequestBody("*", ["PUBLICLAW"], 50)).toEqual({
      searchCriteria: {
        CCDCaseTypeIds: null,
        CCDJurisdictionIds: ["PUBLICLAW"],
        caseManagementBaseLocationIds: null,
        caseManagementRegionIds: null,
        caseReferences: ["*"],
        otherReferences: null,
        parties: [],
        stateIds: null
      },
      sortCriteria: null,
      maxReturnRecordCount: 50,
      startRecordNumber: 1
    });
  });

  test("selectCaseReferenceFromResults prefers matching states before general fallbacks", () => {
    expect(
      selectCaseReferenceFromResults(
        [
          { caseReference: "1234567890123456", stateId: "Submitted" },
          { caseReference: "2234567890123456", stateId: "Draft" }
        ],
        ["Submitted"]
      )
    ).toBe("1234567890123456");

    expect(
      selectCaseReferenceFromResults(
        [
          { caseReference: "bad-value", stateId: "Submitted" },
          { caseReference: "2234 5678 9012 3456", stateId: "Draft" }
        ],
        ["Closed"]
      )
    ).toBe("2234567890123456");
  });

  test("extractCaseReferencesFromHtml returns unique case references from shell links", () => {
    expect(
      extractCaseReferencesFromHtml(`
        <a href="/cases/case-details/PUBLICLAW/PRLAPPS/1234567890123456">one</a>
        <a href="/cases/case-details/PUBLICLAW/PRLAPPS/1234567890123456">dup</a>
        <a href="/cases/case-details/PUBLICLAW/PRLAPPS/2234567890123456">two</a>
      `)
    ).toEqual(["1234567890123456", "2234567890123456"]);
  });

  test("resolveCaseReferenceFromGlobalSearch retries transient failures and prefers matching state results", async () => {
    const fake = buildFakePage({
      postResponses: [
        { status: 502, text: "gateway timeout" },
        {
          status: 200,
          json: {
            results: [
              { caseReference: "2234567890123456", stateId: "Draft" },
              { caseReference: "1234567890123456", stateId: "Case management" }
            ]
          }
        },
        {
          status: 200,
          json: {
            results: [{ caseReference: "1234567890123456", stateId: "Case management" }]
          }
        }
      ]
    });

    await withEnv({ CASE_REFERENCE_RESOLVE_API_ATTEMPTS: "2" }, async () => {
      await expect(
        resolveCaseReferenceFromGlobalSearch(fake.page as never, {
          jurisdictionIds: ["PUBLICLAW"],
          preferredStates: ["Case management"]
        })
      ).resolves.toBe("1234567890123456");
    });

    expect(fake.requests.filter((request) => request.method === "POST")).toHaveLength(3);
  });

  test("resolveCaseReferenceFromGlobalSearch falls back to HTML pages when API remains unavailable", async () => {
    const fake = buildFakePage({
      postResponses: [{ status: 503, text: "service unavailable" }],
      getResponses: {
        "/work/my-work/list": {
          status: 200,
          text: '<a href="/cases/case-details/PUBLICLAW/PRLAPPS/1234567890123456">case</a>'
        }
      }
    });

    await withEnv({ CASE_REFERENCE_RESOLVE_API_ATTEMPTS: "1" }, async () => {
      await expect(resolveCaseReferenceFromGlobalSearch(fake.page as never)).resolves.toBe(
        "1234567890123456"
      );
    });
  });

  test("resolveCaseReferenceFromGlobalSearch skips stale candidates that fail exact lookup validation", async () => {
    const fake = buildFakePage({
      postResponses: [
        {
          status: 200,
          json: {
            results: [
              { caseReference: "1234567890123456", stateId: "Case management" },
              { caseReference: "2234567890123456", stateId: "Submitted" }
            ]
          }
        },
        {
          status: 200,
          json: {
            results: []
          }
        },
        {
          status: 200,
          json: {
            results: [{ caseReference: "2234567890123456", stateId: "Submitted" }]
          }
        }
      ]
    });

    await expect(
      resolveCaseReferenceFromGlobalSearch(fake.page as never, {
        jurisdictionIds: ["PUBLICLAW"],
        preferredStates: ["Case management", "Submitted"]
      })
    ).resolves.toBe("2234567890123456");
  });

  test("resolveNonExistentCaseReference returns a verified absent candidate", async () => {
    const fake = buildFakePage({
      postResponses: [{ status: 200, json: { results: [] } }]
    });
    const originalRandom = Math.random;
    Math.random = () => 0.1;

    try {
      await expect(resolveNonExistentCaseReference(fake.page as never, {}, 1)).resolves.toBe(
        "9111111111111111"
      );
    } finally {
      Math.random = originalRandom;
    }
  });
});
