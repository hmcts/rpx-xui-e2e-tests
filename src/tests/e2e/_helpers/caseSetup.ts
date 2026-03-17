import { createLogger } from "@hmcts/playwright-common";
import type { Page, TestInfo } from "@playwright/test";

import type { CaseDetailsPage } from "../../../page-objects/pages/exui/caseDetails.po";
import type { CreateCasePage } from "../../../page-objects/pages/exui/createCase.po";

type SetupMode = "api-required" | "api-first" | "ui-only";

type SetupCaseRequest = {
  scenario: string;
  jurisdiction: string;
  caseType: string;
  apiEventId?: string;
  mode?: SetupMode;
  allowUiFallback?: boolean;
  apiPayload?: Record<string, unknown>;
  uiCreate: () => Promise<void>;
  page: Page;
  createCasePage: CreateCasePage;
  caseDetailsPage: CaseDetailsPage;
  testInfo?: TestInfo;
};

type SetupCaseResult = {
  caseNumber: string;
  mode: "api" | "ui";
};

const logger = createLogger({
  serviceName: "e2e-case-setup",
  format: "pretty",
});

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);
const DEFAULT_CASE_SETUP_TIMEOUT_MS = 60_000;
const DEFAULT_EVENT_ID = "initiateCase";
const DEFAULT_CREATE_RETRY_ATTEMPTS = 2;
const TRANSIENT_CREATE_STATUS_CODES = new Set([429, 502, 503, 504]);

function isTruthy(value: string | undefined): boolean {
  return TRUTHY_VALUES.has((value ?? "").trim().toLowerCase());
}

function resolveSetupMode(mode: SetupMode | undefined): SetupMode {
  if (mode) {
    return mode;
  }
  const configured = process.env.PW_E2E_CASE_SETUP_MODE?.trim().toLowerCase();
  if (configured === "api-required") {
    return "api-required";
  }
  if (configured === "ui-only") {
    return "ui-only";
  }
  return "api-first";
}

function resolveUiFallbackFlag(value: boolean | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return isTruthy(process.env.PW_E2E_CASE_SETUP_ALLOW_UI_FALLBACK);
}

function resolveCreateRetryAttempts(): number {
  const parsed = Number.parseInt(
    process.env.PW_E2E_CASE_SETUP_CREATE_RETRY_ATTEMPTS ?? "",
    10,
  );
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_CREATE_RETRY_ATTEMPTS;
  }
  return parsed;
}

async function createCaseViaApi(
  request: SetupCaseRequest,
): Promise<string | undefined> {
  return createCaseViaDirectCcdApi(request);
}

type UserDetailsResponse = {
  userInfo?: {
    uid?: string;
    id?: string;
  };
};

type EventTokenResponse = {
  token?: string;
};

type DirectCaseCreateResponse = {
  id?: string | number;
  case_id?: string | number;
  case_reference?: string | number;
  caseReference?: string | number;
};

function toTrimmedCaseRef(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function resolveCaseNumberFromCreateResponse(
  response: DirectCaseCreateResponse,
): string | undefined {
  return (
    toTrimmedCaseRef(response.caseReference) ||
    toTrimmedCaseRef(response.case_reference) ||
    toTrimmedCaseRef(response.id) ||
    toTrimmedCaseRef(response.case_id)
  );
}

const CCD_API_JSON_HEADERS = {
  experimental: "true",
  Accept: "application/json",
  "Content-Type": "application/json",
} as const;

async function createCaseViaDirectCcdApi(
  request: SetupCaseRequest,
): Promise<string | undefined> {
  const timeoutMs = Number.parseInt(
    process.env.PW_E2E_CASE_SETUP_TIMEOUT_MS ?? "",
    10,
  );
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_CASE_SETUP_TIMEOUT_MS;

  const userResponse = await request.page.request.get("api/user/details", {
    failOnStatusCode: false,
    timeout: effectiveTimeoutMs,
  });
  if (userResponse.status() < 200 || userResponse.status() >= 300) {
    throw new Error(
      `Failed to resolve user details for direct CCD setup (HTTP ${userResponse.status()}) in '${request.scenario}'.`,
    );
  }
  const userDetails = (await userResponse.json()) as UserDetailsResponse;
  const userId = userDetails.userInfo?.uid ?? userDetails.userInfo?.id;
  if (!userId?.trim()) {
    throw new Error(
      `User details response did not include userInfo.uid/id for '${request.scenario}'.`,
    );
  }

  const eventId =
    request.apiEventId?.trim() ||
    process.env.PW_E2E_CASE_SETUP_EVENT_ID?.trim() ||
    DEFAULT_EVENT_ID;
  const tokenPath = `data/caseworkers/${encodeURIComponent(
    userId,
  )}/jurisdictions/${encodeURIComponent(
    request.jurisdiction,
  )}/case-types/${encodeURIComponent(
    request.caseType,
  )}/event-triggers/${encodeURIComponent(eventId)}/token?ignore-warning=false`;
  let tokenResponse = await request.page.request.get(tokenPath, {
    failOnStatusCode: false,
    timeout: effectiveTimeoutMs,
    headers: CCD_API_JSON_HEADERS,
  });

  if (tokenResponse.status() === 415) {
    tokenResponse = await request.page.request.post(tokenPath, {
      data: {},
      failOnStatusCode: false,
      timeout: effectiveTimeoutMs,
      headers: CCD_API_JSON_HEADERS,
    });
  }

  if (tokenResponse.status() < 200 || tokenResponse.status() >= 300) {
    throw new Error(
      `Failed to fetch direct CCD event token (HTTP ${tokenResponse.status()}) for '${request.scenario}'.`,
    );
  }
  const eventTokenPayload = (await tokenResponse.json()) as EventTokenResponse;
  const eventToken = eventTokenPayload.token?.trim();
  if (!eventToken) {
    throw new Error(
      `Direct CCD event token response did not include token for '${request.scenario}'.`,
    );
  }

  const fieldValues =
    typeof request.apiPayload?.fieldValues === "object" &&
    request.apiPayload?.fieldValues !== null
      ? (request.apiPayload.fieldValues as Record<string, unknown>)
      : {};

  const createCaseBody = {
    data: fieldValues,
    event: {
      id: eventId,
      summary: `Create case for ${request.scenario}`,
      description: "Created via Playwright direct CCD API setup",
    },
    event_token: eventToken,
    ignore_warning: false,
    draft_id: null,
  };

  const createPath = `data/caseworkers/${encodeURIComponent(
    userId,
  )}/jurisdictions/${encodeURIComponent(
    request.jurisdiction,
  )}/case-types/${encodeURIComponent(
    request.caseType,
  )}/cases?ignore-warning=false`;
  const createRetryAttempts = resolveCreateRetryAttempts();
  let createResponse = await request.page.request.post(createPath, {
    data: createCaseBody,
    failOnStatusCode: false,
    timeout: effectiveTimeoutMs,
    headers: CCD_API_JSON_HEADERS,
  });
  for (let attempt = 1; attempt < createRetryAttempts; attempt += 1) {
    if (!TRANSIENT_CREATE_STATUS_CODES.has(createResponse.status())) {
      break;
    }
    logger.warn("Transient direct CCD create failure, retrying", {
      scenario: request.scenario,
      status: createResponse.status(),
      attempt: attempt + 1,
      maxAttempts: createRetryAttempts,
      jurisdiction: request.jurisdiction,
      caseType: request.caseType,
    });
    createResponse = await request.page.request.post(createPath, {
      data: createCaseBody,
      failOnStatusCode: false,
      timeout: effectiveTimeoutMs,
      headers: CCD_API_JSON_HEADERS,
    });
  }
  if (createResponse.status() < 200 || createResponse.status() >= 300) {
    throw new Error(
      `Direct CCD case create failed with HTTP ${createResponse.status()} for '${request.scenario}'.`,
    );
  }

  const created = (await createResponse.json()) as DirectCaseCreateResponse;
  const caseNumber = resolveCaseNumberFromCreateResponse(created);
  if (!caseNumber) {
    throw new Error(
      `Direct CCD case create returned HTTP ${createResponse.status()} but no case identifier for '${request.scenario}'.`,
    );
  }

  await request.page.goto(
    `/cases/case-details/${request.jurisdiction}/${request.caseType}/${caseNumber}`,
  );
  await request.caseDetailsPage.exuiSpinnerComponent.wait();
  return request.caseDetailsPage.getCaseNumberFromUrl();
}

export async function setupCaseForJourney(
  request: SetupCaseRequest,
): Promise<SetupCaseResult> {
  const mode = resolveSetupMode(request.mode);
  const allowUiFallback = resolveUiFallbackFlag(request.allowUiFallback);

  if (mode !== "ui-only") {
    try {
      const apiCaseNumber = await createCaseViaApi(request);
      if (apiCaseNumber) {
        logger.info("Case setup created via API", {
          scenario: request.scenario,
          caseNumber: apiCaseNumber,
          jurisdiction: request.jurisdiction,
          caseType: request.caseType,
        });
        return {
          caseNumber: apiCaseNumber,
          mode: "api",
        };
      }
      if (mode === "api-required") {
        throw new Error(
          `Direct CCD API case setup did not return a case number for '${request.scenario}'.`,
        );
      }
    } catch (error) {
      if (mode === "api-required" || !allowUiFallback) {
        throw error;
      }
      logger.warn("Falling back to UI case setup after API setup failure", {
        scenario: request.scenario,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await request.uiCreate();
  const uiCaseNumber = await request.caseDetailsPage.getCaseNumberFromUrl();
  logger.info("Case setup created via UI fallback", {
    scenario: request.scenario,
    caseNumber: uiCaseNumber,
    jurisdiction: request.jurisdiction,
    caseType: request.caseType,
  });
  return {
    caseNumber: uiCaseNumber,
    mode: "ui",
  };
}
