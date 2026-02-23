import type { Page } from "@playwright/test";

type GlobalSearchResult = {
  caseReference?: string;
  stateId?: string;
};

type GlobalSearchResponse = {
  results?: GlobalSearchResult[];
};

export type ResolveCaseReferenceOptions = {
  jurisdictionIds?: string[];
  preferredStates?: string[];
  caseReferencePattern?: string;
  maxReturnRecordCount?: number;
};

const CASE_REFERENCE_REGEX = /^\d{16}$/;
const TRANSIENT_GLOBAL_SEARCH_STATUSES = new Set([429, 502, 503, 504]);

type GlobalSearchRequestBody = {
  searchCriteria: {
    CCDCaseTypeIds: null;
    CCDJurisdictionIds: string[] | null;
    caseManagementBaseLocationIds: null;
    caseManagementRegionIds: null;
    caseReferences: string[];
    otherReferences: null;
    parties: [];
    stateIds: null;
  };
  sortCriteria: null;
  maxReturnRecordCount: number;
  startRecordNumber: 1;
};

function buildGlobalSearchRequestBody(
  caseReferencePattern: string,
  jurisdictionIds: string[] | null,
  maxReturnRecordCount: number,
): GlobalSearchRequestBody {
  return {
    searchCriteria: {
      CCDCaseTypeIds: null,
      CCDJurisdictionIds: jurisdictionIds,
      caseManagementBaseLocationIds: null,
      caseManagementRegionIds: null,
      caseReferences: [caseReferencePattern],
      otherReferences: null,
      parties: [],
      stateIds: null,
    },
    sortCriteria: null,
    maxReturnRecordCount,
    startRecordNumber: 1,
  };
}

async function executeGlobalSearchRequest(
  page: Page,
  caseReferencePattern: string,
  jurisdictionIds: string[] | null,
  maxReturnRecordCount = 10,
) {
  return page.request.post("/api/globalsearch/results", {
    data: buildGlobalSearchRequestBody(
      caseReferencePattern,
      jurisdictionIds,
      maxReturnRecordCount,
    ),
    failOnStatusCode: false,
  });
}

function randomDigitString(length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += Math.floor(Math.random() * 10).toString();
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalize(value: string): string {
  return value.toLowerCase().replaceAll(/[\s_-]/g, "");
}

function stateMatchesPreference(
  stateId: string,
  preferredStates: string[],
): boolean {
  const normalizedState = normalize(stateId);
  return preferredStates.some((preferredState) =>
    normalizedState.includes(normalize(preferredState)),
  );
}

export async function resolveCaseReferenceFromGlobalSearch(
  page: Page,
  options: ResolveCaseReferenceOptions = {},
): Promise<string> {
  const {
    jurisdictionIds,
    preferredStates = [],
    caseReferencePattern = "*",
    maxReturnRecordCount = 50,
  } = options;
  const maxAttempts = Number.parseInt(
    process.env.CASE_REFERENCE_RESOLVE_API_ATTEMPTS || "3",
    10,
  );
  let results: GlobalSearchResult[] = [];
  let lastStatus = 0;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    const response = await executeGlobalSearchRequest(
      page,
      caseReferencePattern,
      jurisdictionIds ?? null,
      maxReturnRecordCount,
    );

    lastStatus = response.status();
    if (lastStatus === 200) {
      const payload = (await response.json()) as GlobalSearchResponse;
      results = Array.isArray(payload.results) ? payload.results : [];
      break;
    }

    if (
      TRANSIENT_GLOBAL_SEARCH_STATUSES.has(lastStatus) &&
      attempt < maxAttempts
    ) {
      await sleep(attempt * 1000);
      continue;
    }

    break;
  }

  if (lastStatus !== 200) {
    const htmlFallbackCaseReference =
      await resolveCaseReferenceFromHtmlPages(page);
    if (htmlFallbackCaseReference) {
      return htmlFallbackCaseReference;
    }
    throw new Error(
      `Global search API returned status ${lastStatus} when resolving case reference after ${attempts}/${maxAttempts} attempts`,
    );
  }

  const eligibleResults =
    preferredStates.length > 0
      ? results.filter(
          (result) =>
            result.stateId &&
            stateMatchesPreference(result.stateId, preferredStates),
        )
      : results;

  const selectedResult = eligibleResults.find(
    (result) =>
      result.caseReference && CASE_REFERENCE_REGEX.test(result.caseReference),
  );
  if (selectedResult?.caseReference) {
    return selectedResult.caseReference;
  }

  const fallbackResult = results.find(
    (result) =>
      result.caseReference && CASE_REFERENCE_REGEX.test(result.caseReference),
  );
  if (fallbackResult?.caseReference) {
    return fallbackResult.caseReference;
  }

  const htmlFallbackCaseReference =
    await resolveCaseReferenceFromHtmlPages(page);
  if (htmlFallbackCaseReference) {
    return htmlFallbackCaseReference;
  }

  throw new Error("No 16-digit case references returned by global search API");
}

export async function resolveCaseReferenceWithFallback(
  page: Page,
  fallbackResolver: () => Promise<string>,
  options: ResolveCaseReferenceOptions = {},
): Promise<string> {
  try {
    return await resolveCaseReferenceFromGlobalSearch(page, options);
  } catch {
    return fallbackResolver();
  }
}

export async function resolveNonExistentCaseReference(
  page: Page,
  options: ResolveCaseReferenceOptions = {},
  maxAttempts = 12,
): Promise<string> {
  const { jurisdictionIds = ["PUBLICLAW"] } = options;
  const maxStatusAttempts = Number.parseInt(
    process.env.CASE_REFERENCE_RESOLVE_API_ATTEMPTS || "3",
    10,
  );

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidateReference = `9${randomDigitString(15)}`;
    let responsePayload: GlobalSearchResponse | null = null;
    let lastStatus = 0;
    let infraResponseBodySnippet = "";

    for (
      let statusAttempt = 1;
      statusAttempt <= maxStatusAttempts;
      statusAttempt += 1
    ) {
      const response = await executeGlobalSearchRequest(
        page,
        candidateReference,
        jurisdictionIds,
      );

      lastStatus = response.status();
      if (lastStatus === 200) {
        responsePayload = (await response.json()) as GlobalSearchResponse;
        break;
      }

      if (statusAttempt === maxStatusAttempts) {
        try {
          infraResponseBodySnippet = (await response.text())
            .replaceAll(/\s+/g, " ")
            .trim()
            .slice(0, 200);
        } catch {
          infraResponseBodySnippet = "";
        }
      }

      if (
        TRANSIENT_GLOBAL_SEARCH_STATUSES.has(lastStatus) &&
        statusAttempt < maxStatusAttempts
      ) {
        await sleep(statusAttempt * 1000);
        continue;
      }

      break;
    }

    if (!responsePayload) {
      const responseSnippet = infraResponseBodySnippet
        ? ` Response snippet: ${infraResponseBodySnippet}`
        : "";
      const errorMessage = `Infrastructure error while resolving non-existent case reference: expected 200 from /api/globalsearch/results but received ${lastStatus} after ${maxStatusAttempts} status attempt(s) on candidate attempt ${attempt + 1}/${maxAttempts} for candidate ${candidateReference}.${responseSnippet}`;
      throw new Error(errorMessage);
    }

    const results = Array.isArray(responsePayload.results)
      ? responsePayload.results
      : [];
    const exactMatchFound = results.some(
      (result) => result.caseReference === candidateReference,
    );
    if (!exactMatchFound) {
      return candidateReference;
    }
  }

  throw new Error(
    `Unable to generate a non-existent 16-digit case reference after ${maxAttempts} attempts`,
  );
}

async function resolveCaseReferenceFromHtmlPages(
  page: Page,
): Promise<string | null> {
  const candidatePaths = [
    "/work/my-work/list",
    "/work/all-work/tasks",
    "/cases",
  ];
  const references = new Set<string>();

  for (const routePath of candidatePaths) {
    const response = await page.request.get(routePath, {
      failOnStatusCode: false,
    });
    if (response.status() !== 200) {
      continue;
    }

    const html = await response.text();
    const caseReferenceRegex =
      /\/cases\/case-details\/[^/\s]+\/[^/\s]+\/(\d{16})/g;
    let match = caseReferenceRegex.exec(html);
    while (match) {
      references.add(match[1]);
      match = caseReferenceRegex.exec(html);
    }
  }

  const [firstReference] = Array.from(references);
  return firstReference ?? null;
}
