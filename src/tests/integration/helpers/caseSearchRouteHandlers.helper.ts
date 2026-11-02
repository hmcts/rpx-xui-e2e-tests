import type { Route } from "@playwright/test";

import {
  parseGlobalSearchRequestPayload,
  parseSearchResultsRouteRequest
} from "./caseSearchMockRoutes.helper.js";

export interface GlobalSearchResultsRouteHandlerOptions {
  matchingCaseReference: string;
  successResponse: unknown;
  noResultsResponse: unknown;
}

export function createGlobalSearchResultsRouteHandler(
  options: GlobalSearchResultsRouteHandlerOptions
): (route: Route) => Promise<void> {
  const { matchingCaseReference, successResponse, noResultsResponse } = options;

  return async (route: Route) => {
    const { rawPostData } = parseSearchResultsRouteRequest(route);
    const payload = parseGlobalSearchRequestPayload(rawPostData);
    const searchedCaseReferences = payload?.searchCriteria?.caseReferences ?? [];
    const responseBody = searchedCaseReferences.includes(matchingCaseReference)
      ? successResponse
      : noResultsResponse;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseBody)
    });
  };
}
