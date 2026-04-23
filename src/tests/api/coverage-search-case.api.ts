import { expect, test, type Request, type Route } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv";
import { UserUtils } from "../../utils/ui/user.utils";
import {
  parseGlobalSearchRequestPayload,
  parseSearchResultsRouteRequest
} from "../integration/helpers/caseSearchMockRoutes.helper";
import {
  createFindCaseSearchResultsRouteHandler,
  createGlobalSearchResultsRouteHandler
} from "../integration/helpers/caseSearchRouteHandlers.helper";
import {
  buildFindCaseEmptySearchResultsMock,
  buildFindCaseSearchResultsMock,
  getCaseReferenceFromFindCaseSearchPayload
} from "../integration/mocks/findCase.mock";
import {
  buildGlobalSearchNoResultsMock,
  buildGlobalSearchResultsMock,
  VALID_SEARCH_CASE_REFERENCE
} from "../integration/mocks/search.mock";
import { TEST_CASE_REFERENCES } from "../integration/testData/index.js";

type FakeFulfillPayload = {
  status: number;
  contentType?: string;
  body?: string;
};

type FakeRoute = Pick<Route, "request" | "fulfill">;

const buildFakeRoute = (url: string, postData?: string | null) => {
  let fulfillPayload: FakeFulfillPayload | undefined;
  const route: FakeRoute = {
    request: () =>
      ({
        url: () => url,
        postData: () => postData ?? null
      }) as unknown as Request,
    fulfill: async (payload: FakeFulfillPayload) => {
      fulfillPayload = payload;
    }
  };

  return {
    route,
    lastFulfill: () => fulfillPayload
  };
};

test.describe("Search-case support coverage", () => {
  test("FPL global search credentials fall back to the source-compatible AAT account when env vars are absent", async () => {
    await withEnv(
      {
        FPL_GLOBAL_SEARCH_USERNAME: undefined,
        FPL_GLOBAL_SEARCH_PASSWORD: undefined,
        TEST_ENV: "aat"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("FPL_GLOBAL_SEARCH")).toEqual({
          email: "fpl-ctsc-admin@justice.gov.uk",
          password: "Password12"
        });
      }
    );
  });

  test("FPL global search credentials keep the source-compatible baseline even when env vars are present", async () => {
    await withEnv(
      {
        FPL_GLOBAL_SEARCH_USERNAME: "search-user@example.com",
        FPL_GLOBAL_SEARCH_PASSWORD: "search-pass",
        CASEWORKER_R1_USERNAME: "caseworker-r1@example.com",
        CASEWORKER_R1_PASSWORD: "caseworker-pass"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("FPL_GLOBAL_SEARCH")).toEqual({
          email: "fpl-ctsc-admin@justice.gov.uk",
          password: "Password12"
        });
      }
    );
  });

  test("search-case alias users resolve from Jenkins-style env vars", async () => {
    await withEnv(
      {
        CASEWORKER_GLOBALSEARCH_USERNAME: "caseworker-globalsearch@example.com",
        CASEWORKER_GLOBALSEARCH_PASSWORD: "caseworker-globalsearch-pass",
        WA2_GLOBAL_SEARCH_USERNAME: "wa2-globalsearch@example.com",
        WA2_GLOBAL_SEARCH_PASSWORD: "wa2-globalsearch-pass"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("CASEWORKER_GLOBALSEARCH")).toEqual({
          email: "caseworker-globalsearch@example.com",
          password: "caseworker-globalsearch-pass"
        });
        expect(userUtils.getUserCredentials("WA2_GLOBAL_SEARCH")).toEqual({
          email: "wa2-globalsearch@example.com",
          password: "wa2-globalsearch-pass"
        });
      }
    );
  });

  test("SOLICITOR resolves from the source-compatible default account when env vars are absent", async () => {
    await withEnv(
      {
        SOLICITOR_USERNAME: undefined,
        SOLICITOR_PASSWORD: undefined,
        TEST_ENV: "aat"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("SOLICITOR")).toEqual({
          email: "xui_auto_test_user_solicitor@mailinator.com",
          password: "Monday01"
        });
      }
    );
  });

  test("search route request parsing decodes URLs and preserves raw post data", () => {
    const encodedUrl =
      "https://example.test/api/globalSearch/results?caseReference=1234%205678%209012%203456";
    const rawPostData = JSON.stringify({
      searchCriteria: { caseReferences: [VALID_SEARCH_CASE_REFERENCE] }
    });
    const fakeRoute = buildFakeRoute(encodedUrl, rawPostData);

    expect(parseSearchResultsRouteRequest(fakeRoute.route)).toEqual({
      decodedUrl:
        "https://example.test/api/globalSearch/results?caseReference=1234 5678 9012 3456",
      rawPostData
    });
    expect(parseGlobalSearchRequestPayload(rawPostData)).toEqual({
      searchCriteria: { caseReferences: [VALID_SEARCH_CASE_REFERENCE] }
    });
    expect(parseGlobalSearchRequestPayload("{bad-json")).toBeUndefined();
    expect(parseGlobalSearchRequestPayload(undefined)).toBeUndefined();
  });

  test("global search route handler chooses success or no-results from the submitted case reference", async () => {
    const handler = createGlobalSearchResultsRouteHandler({
      matchingCaseReference: VALID_SEARCH_CASE_REFERENCE,
      successResponse: buildGlobalSearchResultsMock(VALID_SEARCH_CASE_REFERENCE),
      noResultsResponse: buildGlobalSearchNoResultsMock()
    });

    const matchingRoute = buildFakeRoute(
      "https://example.test/api/globalSearch/results",
      JSON.stringify({
        searchCriteria: { caseReferences: [VALID_SEARCH_CASE_REFERENCE] }
      })
    );
    await handler(matchingRoute.route as Route);
    expect(JSON.parse(matchingRoute.lastFulfill()?.body ?? "{}")).toEqual(
      buildGlobalSearchResultsMock(VALID_SEARCH_CASE_REFERENCE)
    );

    const noMatchRoute = buildFakeRoute(
      "https://example.test/api/globalSearch/results",
      JSON.stringify({
        searchCriteria: { caseReferences: ["9999888877776666"] }
      })
    );
    await handler(noMatchRoute.route as Route);
    expect(JSON.parse(noMatchRoute.lastFulfill()?.body ?? "{}")).toEqual(
      buildGlobalSearchNoResultsMock()
    );
  });

  test("find-case route handler chooses the matching response from payload-derived case references", async () => {
    const existingCaseReference = TEST_CASE_REFERENCES.FIND_CASE_EXISTING;
    const handler = createFindCaseSearchResultsRouteHandler({
      existingCaseReference,
      matchingResponse: buildFindCaseSearchResultsMock(existingCaseReference),
      noMatchResponse: buildFindCaseEmptySearchResultsMock(),
      getCaseReferenceFromPayload: getCaseReferenceFromFindCaseSearchPayload
    });

    const matchingRoute = buildFakeRoute(
      "https://example.test/data/internal/searchCases",
      JSON.stringify({
        caseReference: existingCaseReference
      })
    );
    await handler(matchingRoute.route as Route);
    expect(JSON.parse(matchingRoute.lastFulfill()?.body ?? "{}")).toEqual(
      buildFindCaseSearchResultsMock(existingCaseReference)
    );

    const noMatchRoute = buildFakeRoute(
      "https://example.test/data/internal/searchCases",
      JSON.stringify({
        caseReference: TEST_CASE_REFERENCES.FIND_CASE_NON_EXISTENT
      })
    );
    await handler(noMatchRoute.route as Route);
    expect(JSON.parse(noMatchRoute.lastFulfill()?.body ?? "{}")).toEqual(
      buildFindCaseEmptySearchResultsMock()
    );
  });
});
