import type { APIResponse, Page } from "@playwright/test";

export type ResolveCaseReferenceOptions = {
  caseTypeIds?: string[];
  jurisdictionIds?: string[];
  preferredStates?: string[];
  caseReferencePattern?: string;
  maxReturnRecordCount?: number;
};

type GlobalSearchResult = {
  caseReference?: string;
  stateId?: string;
};

type GlobalSearchResponse = {
  results?: GlobalSearchResult[];
};

type GlobalSearchRequestBody = {
  searchCriteria: {
    CCDCaseTypeIds: string[] | null;
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

type SearchRequestContext = Pick<Page, "waitForTimeout"> & {
  request: {
    get(url: string, options?: { failOnStatusCode?: boolean }): Promise<APIResponse>;
    post(
      url: string,
      options: { data: GlobalSearchRequestBody; failOnStatusCode?: boolean }
    ): Promise<APIResponse>;
  };
};

const CASE_REFERENCE_REGEX = /^\d{16}$/;
const TRANSIENT_GLOBAL_SEARCH_STATUSES = new Set([429, 502, 503, 504]);
const HTML_CASE_REFERENCE_REGEX = /\/cases\/case-details\/[^/\s]+\/[^/\s]+\/(\d{16})/g;
const DEFAULT_HTML_FALLBACK_PATHS = ["/work/my-work/list", "/work/all-work/tasks", "/cases"];

const waitForBackoff = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

export function buildGlobalSearchRequestBody(
  caseReferencePattern: string,
  caseTypeIds: string[] | null,
  jurisdictionIds: string[] | null,
  maxReturnRecordCount: number
): GlobalSearchRequestBody {
  return {
    searchCriteria: {
      CCDCaseTypeIds: caseTypeIds,
      CCDJurisdictionIds: jurisdictionIds,
      caseManagementBaseLocationIds: null,
      caseManagementRegionIds: null,
      caseReferences: [caseReferencePattern],
      otherReferences: null,
      parties: [],
      stateIds: null
    },
    sortCriteria: null,
    maxReturnRecordCount,
    startRecordNumber: 1
  };
}

export function normalizeCaseReference(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const digitsOnly = value.replace(/\D/g, "");
  return CASE_REFERENCE_REGEX.test(digitsOnly) ? digitsOnly : undefined;
}

export function extractCaseReferencesFromHtml(html: string): string[] {
  const references = new Set<string>();
  const matcher = new RegExp(HTML_CASE_REFERENCE_REGEX);
  let match = matcher.exec(html);

  while (match) {
    references.add(match[1]);
    match = matcher.exec(html);
  }

  return Array.from(references);
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replaceAll(/[\s_-]/g, "");
}

function stateMatchesPreference(stateId: string, preferredStates: string[]): boolean {
  const normalizedState = normalizeToken(stateId);
  return preferredStates.some((preferredState) =>
    normalizedState.includes(normalizeToken(preferredState))
  );
}

export function selectCaseReferenceFromResults(
  results: GlobalSearchResult[],
  preferredStates: string[] = []
): string | undefined {
  const matchingResults =
    preferredStates.length > 0
      ? results.filter(
          (result) => result.stateId && stateMatchesPreference(result.stateId, preferredStates)
        )
      : results;

  const matchingReference = matchingResults
    .map((result) => normalizeCaseReference(result.caseReference))
    .find(Boolean);
  if (matchingReference) {
    return matchingReference;
  }

  return results.map((result) => normalizeCaseReference(result.caseReference)).find(Boolean);
}

function collectCandidateCaseReferences(
  results: GlobalSearchResult[],
  preferredStates: string[] = []
): string[] {
  const matchingResults =
    preferredStates.length > 0
      ? results.filter(
          (result) => result.stateId && stateMatchesPreference(result.stateId, preferredStates)
        )
      : [];
  const orderedCandidates = [...matchingResults, ...results]
    .map((result) => normalizeCaseReference(result.caseReference))
    .filter((candidate): candidate is string => Boolean(candidate));

  return Array.from(new Set(orderedCandidates));
}

async function executeGlobalSearchRequest(
  page: SearchRequestContext,
  caseReferencePattern: string,
  caseTypeIds: string[] | null,
  jurisdictionIds: string[] | null,
  maxReturnRecordCount: number
): Promise<APIResponse> {
  return page.request.post("/api/globalsearch/results", {
    data: buildGlobalSearchRequestBody(caseReferencePattern, caseTypeIds, jurisdictionIds, maxReturnRecordCount),
    failOnStatusCode: false
  });
}

async function resolveCaseReferenceFromHtmlPages(page: SearchRequestContext): Promise<string | null> {
  for (const candidatePath of DEFAULT_HTML_FALLBACK_PATHS) {
    const response = await page.request.get(candidatePath, { failOnStatusCode: false });
    if (response.status() !== 200) {
      continue;
    }

    const html = await response.text();
    const [firstReference] = extractCaseReferencesFromHtml(html);
    if (firstReference) {
      return firstReference;
    }
  }

  return null;
}

async function verifySearchableCaseReference(
  page: SearchRequestContext,
  caseReference: string,
  caseTypeIds: string[] | null,
  jurisdictionIds: string[] | null
): Promise<boolean> {
  const maxAttempts = Number.parseInt(process.env.CASE_REFERENCE_RESOLVE_API_ATTEMPTS || "3", 10);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await executeGlobalSearchRequest(page, caseReference, caseTypeIds, jurisdictionIds, 10);
    const status = response.status();

    if (status === 200) {
      const payload = (await response.json()) as GlobalSearchResponse;
      const results = Array.isArray(payload.results) ? payload.results : [];
      return results.some(
        (result) => normalizeCaseReference(result.caseReference) === caseReference
      );
    }

    if (TRANSIENT_GLOBAL_SEARCH_STATUSES.has(status) && attempt < maxAttempts) {
      await waitForBackoff(attempt * 1_000);
      continue;
    }

    return false;
  }

  return false;
}

export async function resolveCaseReferenceFromGlobalSearch(
  page: SearchRequestContext,
  options: ResolveCaseReferenceOptions = {}
): Promise<string> {
  const {
    caseTypeIds,
    jurisdictionIds,
    preferredStates = [],
    caseReferencePattern = "*",
    maxReturnRecordCount = 50
  } = options;
  const maxAttempts = Number.parseInt(process.env.CASE_REFERENCE_RESOLVE_API_ATTEMPTS || "3", 10);

  let results: GlobalSearchResult[] = [];
  let lastStatus = 0;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    const response = await executeGlobalSearchRequest(
      page,
      caseReferencePattern,
      caseTypeIds ?? null,
      jurisdictionIds ?? null,
      maxReturnRecordCount
    );

    lastStatus = response.status();
    if (lastStatus === 200) {
      const payload = (await response.json()) as GlobalSearchResponse;
      results = Array.isArray(payload.results) ? payload.results : [];
      break;
    }

    if (TRANSIENT_GLOBAL_SEARCH_STATUSES.has(lastStatus) && attempt < maxAttempts) {
      await waitForBackoff(attempt * 1_000);
      continue;
    }

    break;
  }

  if (lastStatus !== 200) {
    const htmlFallbackCaseReference = await resolveCaseReferenceFromHtmlPages(page);
    if (htmlFallbackCaseReference) {
      return htmlFallbackCaseReference;
    }
    throw new Error(
      `Global search API returned status ${lastStatus} when resolving case reference after ${attempts}/${maxAttempts} attempts`
    );
  }

  const candidateCaseReferences = collectCandidateCaseReferences(results, preferredStates);
  for (const candidateCaseReference of candidateCaseReferences) {
    if (
      await verifySearchableCaseReference(
        page,
        candidateCaseReference,
        caseTypeIds ?? null,
        jurisdictionIds ?? null
      )
    ) {
      return candidateCaseReference;
    }
  }

  const htmlFallbackCaseReference = await resolveCaseReferenceFromHtmlPages(page);
  if (
    htmlFallbackCaseReference &&
    (await verifySearchableCaseReference(
      page,
      htmlFallbackCaseReference,
      caseTypeIds ?? null,
      jurisdictionIds ?? null
    ))
  ) {
    return htmlFallbackCaseReference;
  }

  throw new Error("No searchable 16-digit case references returned by global search API");
}

export async function resolveCaseReferenceWithFallback(
  page: SearchRequestContext,
  fallbackResolver: () => Promise<string>,
  options: ResolveCaseReferenceOptions = {}
): Promise<string> {
  try {
    return await resolveCaseReferenceFromGlobalSearch(page, options);
  } catch {
    return fallbackResolver();
  }
}

function randomDigitString(length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += Math.floor(Math.random() * 10).toString();
  }
  return value;
}

export async function resolveNonExistentCaseReference(
  page: SearchRequestContext,
  options: ResolveCaseReferenceOptions = {},
  maxAttempts = 12
): Promise<string> {
  const { jurisdictionIds = ["PUBLICLAW"] } = options;
  const maxStatusAttempts = Number.parseInt(process.env.CASE_REFERENCE_RESOLVE_API_ATTEMPTS || "3", 10);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidateReference = `9${randomDigitString(15)}`;
    let responsePayload: GlobalSearchResponse | null = null;
    let lastStatus = 0;
    let infraResponseBodySnippet = "";

    for (let statusAttempt = 1; statusAttempt <= maxStatusAttempts; statusAttempt += 1) {
      const response = await executeGlobalSearchRequest(page, candidateReference, null, jurisdictionIds, 10);
      lastStatus = response.status();

      if (lastStatus === 200) {
        responsePayload = (await response.json()) as GlobalSearchResponse;
        break;
      }

      if (statusAttempt === maxStatusAttempts) {
        infraResponseBodySnippet = (await response.text().catch(() => ""))
          .replaceAll(/\s+/g, " ")
          .trim()
          .slice(0, 200);
      }

      if (TRANSIENT_GLOBAL_SEARCH_STATUSES.has(lastStatus) && statusAttempt < maxStatusAttempts) {
        await waitForBackoff(statusAttempt * 1_000);
        continue;
      }

      break;
    }

    if (!responsePayload) {
      const responseSnippet = infraResponseBodySnippet
        ? ` Response snippet: ${infraResponseBodySnippet}`
        : "";
      throw new Error(
        `Infrastructure error while resolving non-existent case reference: expected 200 from /api/globalsearch/results but received ${lastStatus} after ${maxStatusAttempts} status attempt(s) on candidate attempt ${attempt + 1}/${maxAttempts} for candidate ${candidateReference}.${responseSnippet}`
      );
    }

    const exactMatchFound = (responsePayload.results ?? []).some(
      (result) => normalizeCaseReference(result.caseReference) === candidateReference
    );
    if (!exactMatchFound) {
      return candidateReference;
    }
  }

  throw new Error(`Unable to generate a non-existent 16-digit case reference after ${maxAttempts} attempts`);
}
