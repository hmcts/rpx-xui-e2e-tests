import type { APIRequestContext } from "@playwright/test";

export type CaseCreationOptions = {
  apiContext: APIRequestContext;
  caseTypeId: string;
  eventId: string;
  data: Record<string, unknown>;
  ignoreWarning?: boolean;
  summary?: string;
  description?: string;
  headers?: Record<string, string>;
  draftId?: string | null;
};

export type CaseCreationResult = {
  caseId: string;
  caseReference?: string;
  raw: unknown;
};

export type EventTokenOptions = {
  apiContext: APIRequestContext;
  caseTypeId?: string;
  caseId?: string;
  eventId: string;
  ignoreWarning?: boolean;
  headers?: Record<string, string>;
};

const ensureNonEmpty = (value: string | undefined, label: string): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required ${label}.`);
  }
  return trimmed;
};

const DEFAULT_ACCEPT = {
  startCase:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-case-trigger.v2+json;charset=UTF-8",
  startEvent:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-event-trigger.v2+json;charset=UTF-8",
  createCase:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.create-case.v2+json;charset=UTF-8"
};

const buildHeaders = (
  headers?: Record<string, string>,
  accept?: string
): Record<string, string> => ({
  "Content-Type": "application/json",
  experimental: "true",
  ...(accept ? { Accept: accept } : {}),
  ...(headers ?? {})
});

const normaliseIgnoreWarning = (ignoreWarning?: boolean): string =>
  ignoreWarning ? "true" : "false";

const resolveEventToken = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as { event_token?: unknown; token?: unknown };
  const candidate = record.event_token ?? record.token;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate
    : undefined;
};

const resolveCaseReference = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const direct = record.case_reference ?? record.caseReference ?? record.reference;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  if (typeof direct === "number") {
    return String(direct);
  }
  const details = record.case_details as Record<string, unknown> | undefined;
  if (!details || typeof details !== "object") {
    return undefined;
  }
  const nested = details.case_reference ?? details.caseReference ?? details.reference;
  if (typeof nested === "string" && nested.trim().length > 0) {
    return nested.trim();
  }
  if (typeof nested === "number") {
    return String(nested);
  }
  return undefined;
};

export async function fetchEventToken(options: EventTokenOptions): Promise<string> {
  const eventId = ensureNonEmpty(options.eventId, "eventId");
  const ignoreWarning = normaliseIgnoreWarning(options.ignoreWarning);
  const accept = options.caseId ? DEFAULT_ACCEPT.startEvent : DEFAULT_ACCEPT.startCase;
  const headers = buildHeaders(options.headers, accept);

  let path: string;
  if (options.caseId) {
    const caseId = ensureNonEmpty(options.caseId, "caseId");
    path = `data/internal/cases/${caseId}/event-triggers/${eventId}?ignore-warning=${ignoreWarning}`;
  } else {
    const caseTypeId = ensureNonEmpty(options.caseTypeId, "caseTypeId");
    path = `data/internal/case-types/${caseTypeId}/event-triggers/${eventId}?ignore-warning=${ignoreWarning}`;
  }

  const response = await options.apiContext.get(path, {
    headers,
    failOnStatusCode: false
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `CCD event token request failed (${response.status()}): ${path}${body ? `: ${body}` : ""}`
    );
  }

  const payload = await response.json().catch(() => ({}));
  const token = resolveEventToken(payload);
  if (!token) {
    throw new Error(`CCD event token missing from response for ${eventId}.`);
  }

  return token;
}

export async function createCase(options: CaseCreationOptions): Promise<CaseCreationResult> {
  const caseTypeId = ensureNonEmpty(options.caseTypeId, "caseTypeId");
  const eventId = ensureNonEmpty(options.eventId, "eventId");
  if (!options.data || typeof options.data !== "object") {
    throw new Error("Missing case data payload.");
  }

  const ignoreWarning = normaliseIgnoreWarning(options.ignoreWarning);
  const eventToken = await fetchEventToken({
    apiContext: options.apiContext,
    caseTypeId,
    eventId,
    ignoreWarning: options.ignoreWarning,
    headers: options.headers
  });

  const payload = {
    data: options.data,
    event: {
      id: eventId,
      summary: options.summary ?? "",
      description: options.description ?? ""
    },
    event_token: eventToken,
    ignore_warning: options.ignoreWarning ?? false,
    draft_id: options.draftId ?? null
  };

  const path = `data/case-types/${caseTypeId}/cases?ignore-warning=${ignoreWarning}`;
  const response = await options.apiContext.post(path, {
    headers: buildHeaders(options.headers, DEFAULT_ACCEPT.createCase),
    data: payload,
    failOnStatusCode: false
  });

  if (![200, 201].includes(response.status())) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `CCD create case failed (${response.status()}): ${path}${body ? `: ${body}` : ""}`
    );
  }

  const body = await response.json().catch(() => ({}));
  const record = body as {
    id?: unknown;
    case_id?: unknown;
    case_details?: { id?: unknown };
  };
  const rawId = record.id ?? record.case_id;
  if (!rawId) {
    const nestedId = record.case_details?.id;
    if (!nestedId) {
      throw new Error("CCD create case did not return a case id.");
    }
    const fallbackReference = resolveCaseReference(body) ?? String(nestedId);
    return {
      caseId: String(nestedId),
      caseReference: fallbackReference,
      raw: body
    };
  }

  const caseReference = resolveCaseReference(body) ?? String(rawId);

  return {
    caseId: String(rawId),
    caseReference,
    raw: body
  };
}
