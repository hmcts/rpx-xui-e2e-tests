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

export interface FindCaseSearchResultsHandlerOptions {
  existingCaseReference: string;
  matchingResponse: unknown;
  noMatchResponse: unknown;
  getCaseReferenceFromPayload: (payload: unknown) => string | undefined;
}

export function createFindCaseSearchResultsRouteHandler(
  options: FindCaseSearchResultsHandlerOptions
): (route: Route) => Promise<void> {
  const {
    existingCaseReference,
    matchingResponse,
    noMatchResponse,
    getCaseReferenceFromPayload
  } = options;

  return async (route: Route) => {
    const { decodedUrl, rawPostData } = parseSearchResultsRouteRequest(route);
    let searchPayload: unknown;
    if (rawPostData) {
      try {
        searchPayload = JSON.parse(rawPostData) as unknown;
      } catch {
        searchPayload = undefined;
      }
    }

    const requestedCaseReference = getCaseReferenceFromPayload(searchPayload);
    const caseReferenceFromUrl = /\d{16}/.exec(decodedUrl)?.[0];
    const isMatch =
      requestedCaseReference === existingCaseReference ||
      Boolean(rawPostData?.includes(existingCaseReference)) ||
      caseReferenceFromUrl === existingCaseReference ||
      decodedUrl.includes(existingCaseReference);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(isMatch ? matchingResponse : noMatchResponse)
    });
  };
}
