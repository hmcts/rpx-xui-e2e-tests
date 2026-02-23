import type { TestInfo } from "@playwright/test";

export type FailureType =
  | "DOWNSTREAM_API_5XX"
  | "DOWNSTREAM_API_4XX"
  | "SLOW_API_RESPONSE"
  | "NETWORK_TIMEOUT"
  | "TIMEOUT_NO_API_ACTIVITY"
  | "GLOBAL_TIMEOUT_UI_STALL"
  | "UI_ELEMENT_MISSING"
  | "ASSERTION_FAILURE"
  | "UNKNOWN";

export interface ApiErrorSignal {
  method: string;
  url: string;
  status: number;
}

export interface SlowCallSignal {
  method: string;
  url: string;
  durationMs: number;
}

export interface NetworkFailureSignal {
  method: string;
  url: string;
  reason: string;
}

export interface ExecutionSignals {
  lastMainFrameUrl?: string;
  mainFrameNavigationCount?: number;
  totalRequestsObserved?: number;
  backendRequestsObserved?: number;
}

interface FailureClassificationInput {
  errorMessage: string;
  serverErrors: ApiErrorSignal[];
  clientErrors: ApiErrorSignal[];
  slowCalls: SlowCallSignal[];
  networkFailures: NetworkFailureSignal[];
  testStatus?: TestInfo["status"];
  executionSignals?: ExecutionSignals;
}

export interface FailureDiagnosisInput {
  testTitle: string;
  errorMessage?: string;
  apiErrors: ApiErrorSignal[];
  slowCalls?: SlowCallSignal[];
  networkFailures?: NetworkFailureSignal[];
  slowThresholdMs?: number;
  testStatus?: TestInfo["status"];
  setupMarker?: string;
  executionSignals?: ExecutionSignals;
}

interface SlowCallAggregate {
  method: string;
  url: string;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

export interface FailureDiagnosis {
  failureType: FailureType;
  phaseMarker: string;
  backendWait: "yes" | "no";
  likelyRootCause: string;
  topSuspect: string;
  timeoutSuspects: string[];
  slowEndpointSummary: string[];
  errorMessage: string;
  summary: string;
  apiErrors: ApiErrorSignal[];
  serverErrors: ApiErrorSignal[];
  clientErrors: ApiErrorSignal[];
  slowCalls: SlowCallSignal[];
  networkFailures: NetworkFailureSignal[];
  networkTimeout: boolean;
  annotations: Array<{ type: string; description: string }>;
  text: string;
  data: Record<string, unknown>;
}

const BACKEND_API_PATH_HINTS = [
  "/api/",
  "/data/",
  "/auth/",
  "/workallocation/",
  "/aggregated/",
  "/caseworkers/",
];

const STATIC_ASSET_PATTERN =
  /\.(?:css|js|map|png|jpe?g|gif|svg|ico|woff2?|ttf|eot)(?:$|[?#])/i;
const TIMEOUT_PATTERN =
  /timeout|timed out|etimedout|econnreset|socket hang up|net::err_timed_out/i;
const UI_ELEMENT_PATTERN =
  /locator|element|waiting for|strict mode violation|toBeVisible|toBeEnabled|toContainText/i;
const ASSERTION_PATTERN =
  /\bexpect(?:ed)?\b|\breceived\b|\bassert(?:ion)?\b|toEqual|toBe|toContain/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const LONG_NUMERIC_ID_PATTERN = /\b\d{8,}\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2}\b/g;
const BEARER_TOKEN_PATTERN = /\b[Bb]earer\s+[A-Za-z0-9\-._~+/]+=*/g;
const SECRET_KEY_VALUE_PATTERN =
  /\b(password|passwd|secret|token|client_secret|code|state)\b\s*[:=]\s*[^,\s;]+/gi;
const QUERY_SECRET_PATTERN =
  /([?&](?:code|token|state|password|secret)=)[^&#\s]+/gi;

const PATH_UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATH_LONG_NUMERIC_SEGMENT_PATTERN = /^\d{8,}$/;
const PATH_LONG_TOKEN_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{24,}$/;
const PATH_EMAIL_SEGMENT_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

const DEFAULT_TEXT_LIMIT = 300;
const DEFAULT_ANNOTATION_LIMIT = 500;
const DEFAULT_ANNOTATION_ITEMS = 3;
const STRONG_SLOW_CALL_DURATION_MS = 15_000;
const STRONG_SLOW_CALL_COUNT = 3;

const normaliseMethod = (value: string): string =>
  value.trim() ? value.toUpperCase() : "UNKNOWN";

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;

const hasTimeoutSignal = (
  errorMessage: string,
  networkFailures: NetworkFailureSignal[],
): boolean =>
  TIMEOUT_PATTERN.test(errorMessage) ||
  networkFailures.some((failure) => TIMEOUT_PATTERN.test(failure.reason));

const toAnnotationText = (
  values: string[],
  maxItems = DEFAULT_ANNOTATION_ITEMS,
  maxLength = DEFAULT_ANNOTATION_LIMIT,
): string => truncate(values.slice(0, maxItems).join(" | "), maxLength);

const redactPathSegment = (segment: string): string => {
  if (
    PATH_UUID_SEGMENT_PATTERN.test(segment) ||
    PATH_LONG_NUMERIC_SEGMENT_PATTERN.test(segment) ||
    PATH_LONG_TOKEN_SEGMENT_PATTERN.test(segment) ||
    PATH_EMAIL_SEGMENT_PATTERN.test(segment)
  ) {
    return "[REDACTED]";
  }
  return segment;
};

const sanitizePathValue = (value: string): string =>
  value
    .split("/")
    .map((segment) => redactPathSegment(segment))
    .join("/");

const redactSensitiveText = (value: string): string =>
  value
    .replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]")
    .replace(SECRET_KEY_VALUE_PATTERN, "$1=[REDACTED]")
    .replace(QUERY_SECRET_PATTERN, "$1[REDACTED]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(UUID_PATTERN, "[REDACTED_UUID]")
    .replace(LONG_NUMERIC_ID_PATTERN, "[REDACTED_ID]");

export const sanitizeUrlForLogs = (urlValue: string): string => {
  try {
    const parsed = new URL(urlValue);
    return `${parsed.origin}${sanitizePathValue(parsed.pathname)}`;
  } catch {
    return sanitizePathValue(urlValue.replace(/[?#].*$/, ""));
  }
};

export const sanitizeErrorText = (
  value: string,
  maxLength = DEFAULT_TEXT_LIMIT,
): string =>
  truncate(
    redactSensitiveText(
      value.replace(/https?:\/\/[^\s)]+/gi, (urlMatch) =>
        sanitizeUrlForLogs(urlMatch),
      ),
    ),
    maxLength,
  );

export const isBackendApiUrl = (url: string): boolean => {
  const lower = url.toLowerCase();
  if (STATIC_ASSET_PATTERN.test(lower)) {
    return false;
  }
  return BACKEND_API_PATH_HINTS.some((fragment) => lower.includes(fragment));
};

export const isFailureStatus = (status: TestInfo["status"]): boolean =>
  status === "failed" || status === "timedOut";

const hasStrongSlowBackendSignal = (slowCalls: SlowCallSignal[]): boolean =>
  slowCalls.length >= STRONG_SLOW_CALL_COUNT ||
  slowCalls.some((call) => call.durationMs >= STRONG_SLOW_CALL_DURATION_MS);

const aggregateSlowCalls = (
  slowCalls: SlowCallSignal[],
): SlowCallAggregate[] => {
  const grouped = new Map<string, SlowCallAggregate>();
  for (const call of slowCalls) {
    const key = `${call.method}|${call.url}`;
    const current = grouped.get(key);
    if (current) {
      current.count += 1;
      current.totalDurationMs += call.durationMs;
      current.maxDurationMs = Math.max(current.maxDurationMs, call.durationMs);
      continue;
    }
    grouped.set(key, {
      method: call.method,
      url: call.url,
      count: 1,
      totalDurationMs: call.durationMs,
      maxDurationMs: call.durationMs,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    if (right.maxDurationMs !== left.maxDurationMs) {
      return right.maxDurationMs - left.maxDurationMs;
    }
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return right.totalDurationMs - left.totalDurationMs;
  });
};

const summarizeSlowEndpoint = (entry: SlowCallAggregate): string => {
  const avgMs = Math.round(entry.totalDurationMs / entry.count);
  return `${entry.method} ${entry.url} (count=${entry.count}, avg=${avgMs}ms, max=${Math.round(entry.maxDurationMs)}ms)`;
};

const buildTimeoutSuspects = (
  slowCalls: SlowCallSignal[],
  networkFailures: NetworkFailureSignal[],
): string[] => {
  const timeoutFailures = networkFailures.filter((failure) =>
    TIMEOUT_PATTERN.test(failure.reason),
  );
  const fromFailed = timeoutFailures.map(
    (failure) =>
      `${failure.method} ${failure.url} -> REQUEST_FAILED (${failure.reason})`,
  );
  const fromSlow = slowCalls.map(
    (call) =>
      `${call.method} ${call.url} -> SLOW (${Math.round(call.durationMs)}ms)`,
  );
  return [...fromFailed, ...fromSlow];
};

const summarizeApiErrors = (
  serverErrors: ApiErrorSignal[],
  clientErrors: ApiErrorSignal[],
  networkFailures: NetworkFailureSignal[],
): string[] => {
  const entries: string[] = [];
  serverErrors.forEach((signal) => {
    entries.push(`${signal.method} ${signal.url} -> HTTP ${signal.status}`);
  });
  clientErrors.forEach((signal) => {
    entries.push(`${signal.method} ${signal.url} -> HTTP ${signal.status}`);
  });
  networkFailures.forEach((signal) => {
    entries.push(
      `${signal.method} ${signal.url} -> REQUEST_FAILED (${signal.reason})`,
    );
  });
  return entries;
};

const deriveBackendWaitFlag = (
  failureType: FailureType,
  serverErrors: ApiErrorSignal[],
  clientErrors: ApiErrorSignal[],
  slowCalls: SlowCallSignal[],
  networkFailures: NetworkFailureSignal[],
): "yes" | "no" => {
  const hasFailureSignal =
    serverErrors.length > 0 ||
    clientErrors.length > 0 ||
    slowCalls.length > 0 ||
    networkFailures.length > 0;
  if (hasFailureSignal) {
    return "yes";
  }
  if (
    failureType === "NETWORK_TIMEOUT" ||
    failureType === "SLOW_API_RESPONSE"
  ) {
    return "yes";
  }
  return "no";
};

const derivePhaseMarker = (
  failureType: FailureType,
  backendWait: "yes" | "no",
): string => {
  if (failureType === "TIMEOUT_NO_API_ACTIVITY") {
    return "api-timeout-no-backend";
  }
  if (failureType === "GLOBAL_TIMEOUT_UI_STALL") {
    return backendWait === "yes"
      ? "api-timeout-post-backend"
      : "api-timeout-pre-backend";
  }
  if (
    failureType === "SLOW_API_RESPONSE" ||
    failureType === "NETWORK_TIMEOUT"
  ) {
    return backendWait === "yes"
      ? "backend-wait-timeout"
      : "timeout-unknown-wait";
  }
  if (failureType === "DOWNSTREAM_API_5XX") {
    return "backend-5xx";
  }
  if (failureType === "DOWNSTREAM_API_4XX") {
    return "backend-4xx";
  }
  if (failureType === "UI_ELEMENT_MISSING") {
    return backendWait === "yes"
      ? "ui-wait-post-backend"
      : "ui-wait-pre-backend";
  }
  if (failureType === "ASSERTION_FAILURE") {
    return backendWait === "yes"
      ? "assertion-post-backend"
      : "assertion-pre-backend";
  }
  return backendWait === "yes" ? "unknown-post-backend" : "unknown-pre-backend";
};

const buildTopSuspect = (
  failureType: FailureType,
  timeoutSuspects: string[],
  serverErrors: ApiErrorSignal[],
  clientErrors: ApiErrorSignal[],
  networkFailures: NetworkFailureSignal[],
  slowCalls: SlowCallSignal[],
): string => {
  if (failureType === "GLOBAL_TIMEOUT_UI_STALL") {
    return "No dominant backend/API suspect identified";
  }
  if (
    (failureType === "NETWORK_TIMEOUT" ||
      failureType === "SLOW_API_RESPONSE") &&
    timeoutSuspects.length > 0
  ) {
    return timeoutSuspects[0];
  }

  const apiCandidates = summarizeApiErrors(
    serverErrors,
    clientErrors,
    networkFailures,
  );
  if (apiCandidates.length > 0) {
    return apiCandidates[0];
  }

  if (slowCalls.length > 0) {
    const first = slowCalls[0];
    return `${first.method} ${first.url} -> SLOW (${Math.round(first.durationMs)}ms)`;
  }

  return "No backend/API suspect identified";
};

const deriveLikelyRootCause = (
  failureType: FailureType,
  dominantSlowEndpoint: SlowCallAggregate | null,
  timeoutSuspects: string[],
  topSuspect: string,
  executionSignals: ExecutionSignals,
): string => {
  const executionSummary =
    `requests=${executionSignals.totalRequestsObserved ?? 0},` +
    ` backendRequests=${executionSignals.backendRequestsObserved ?? 0},` +
    ` navigations=${executionSignals.mainFrameNavigationCount ?? 0}`;

  if (failureType === "TIMEOUT_NO_API_ACTIVITY") {
    return `Global timeout with no backend activity (${executionSummary}).`;
  }

  if (failureType === "GLOBAL_TIMEOUT_UI_STALL") {
    return `Global timeout during workflow with backend activity but no dominant backend failure signal (${executionSummary}).`;
  }

  if (
    (failureType === "SLOW_API_RESPONSE" ||
      failureType === "NETWORK_TIMEOUT") &&
    dominantSlowEndpoint
  ) {
    return `Backend dependency latency likely caused failure: ${summarizeSlowEndpoint(dominantSlowEndpoint)}`;
  }

  if (
    (failureType === "SLOW_API_RESPONSE" ||
      failureType === "NETWORK_TIMEOUT") &&
    timeoutSuspects.length > 0
  ) {
    return `Timeout-related failure with backend/network suspects: ${timeoutSuspects[0]}`;
  }

  if (failureType === "DOWNSTREAM_API_5XX") {
    return `Downstream 5xx response caused failure (${topSuspect})`;
  }
  if (failureType === "DOWNSTREAM_API_4XX") {
    return `Downstream 4xx response likely blocked workflow (${topSuspect})`;
  }
  if (topSuspect !== "No backend/API suspect identified") {
    return `Likely failure driver: ${topSuspect}`;
  }

  return "No dominant backend suspect identified; inspect stack and trace artifacts.";
};

export const classifyFailureType = ({
  errorMessage,
  serverErrors,
  clientErrors,
  slowCalls,
  networkFailures,
  testStatus,
  executionSignals = {},
}: FailureClassificationInput): FailureType => {
  const hasNetworkTimeoutFailure = networkFailures.some((failure) =>
    TIMEOUT_PATTERN.test(failure.reason),
  );
  const hasTimeoutKeyword = TIMEOUT_PATTERN.test(errorMessage);
  const hasLocatorSignal = UI_ELEMENT_PATTERN.test(errorMessage);
  const hasBackendFailureSignals =
    serverErrors.length +
      clientErrors.length +
      slowCalls.length +
      networkFailures.length >
    0;

  if (serverErrors.length > 0) {
    return "DOWNSTREAM_API_5XX";
  }
  if (clientErrors.length > 0) {
    return "DOWNSTREAM_API_4XX";
  }
  if (hasNetworkTimeoutFailure) {
    return slowCalls.length > 0 ? "SLOW_API_RESPONSE" : "NETWORK_TIMEOUT";
  }

  if (
    testStatus !== "timedOut" &&
    hasLocatorSignal &&
    !hasBackendFailureSignals
  ) {
    return "UI_ELEMENT_MISSING";
  }

  if (testStatus === "timedOut" || hasTimeoutKeyword) {
    const backendRequestsObserved =
      executionSignals.backendRequestsObserved ?? 0;
    if (!hasBackendFailureSignals && backendRequestsObserved === 0) {
      return "TIMEOUT_NO_API_ACTIVITY";
    }
    if (slowCalls.length > 0) {
      return "SLOW_API_RESPONSE";
    }
    if (hasStrongSlowBackendSignal(slowCalls)) {
      return "SLOW_API_RESPONSE";
    }
    return "GLOBAL_TIMEOUT_UI_STALL";
  }

  if (hasLocatorSignal) {
    return "UI_ELEMENT_MISSING";
  }
  if (ASSERTION_PATTERN.test(errorMessage)) {
    return "ASSERTION_FAILURE";
  }
  if (slowCalls.length > 0) {
    return "SLOW_API_RESPONSE";
  }
  return "UNKNOWN";
};

const normaliseApiErrors = (
  signals: ApiErrorSignal[],
): {
  all: ApiErrorSignal[];
  server: ApiErrorSignal[];
  client: ApiErrorSignal[];
} => {
  const all = signals.map((signal) => ({
    method: normaliseMethod(signal.method),
    status: signal.status,
    url: sanitizeUrlForLogs(signal.url),
  }));
  return {
    all,
    server: all.filter((signal) => signal.status >= 500),
    client: all.filter((signal) => signal.status >= 400 && signal.status < 500),
  };
};

const normaliseSlowCalls = (signals: SlowCallSignal[]): SlowCallSignal[] =>
  signals.map((signal) => ({
    method: normaliseMethod(signal.method),
    durationMs: Math.round(signal.durationMs),
    url: sanitizeUrlForLogs(signal.url),
  }));

const normaliseNetworkFailures = (
  signals: NetworkFailureSignal[],
): NetworkFailureSignal[] =>
  signals.map((signal) => ({
    method: normaliseMethod(signal.method),
    url: sanitizeUrlForLogs(signal.url),
    reason: sanitizeErrorText(signal.reason, 200),
  }));

export const buildFailureDiagnosis = ({
  testTitle,
  errorMessage,
  apiErrors,
  slowCalls = [],
  networkFailures = [],
  slowThresholdMs = 5000,
  testStatus,
  setupMarker = "n/a",
  executionSignals = {},
}: FailureDiagnosisInput): FailureDiagnosis => {
  const message = sanitizeErrorText(errorMessage ?? "");
  const { all, server, client } = normaliseApiErrors(apiErrors);
  const normalisedSlowCalls = normaliseSlowCalls(slowCalls);
  const normalisedNetworkFailures = normaliseNetworkFailures(networkFailures);
  const networkTimeout = hasTimeoutSignal(message, normalisedNetworkFailures);

  const failureType = classifyFailureType({
    errorMessage: message,
    serverErrors: server,
    clientErrors: client,
    slowCalls: normalisedSlowCalls,
    networkFailures: normalisedNetworkFailures,
    testStatus,
    executionSignals,
  });

  const timeoutSuspects = buildTimeoutSuspects(
    normalisedSlowCalls,
    normalisedNetworkFailures,
  );
  const slowAggregates = aggregateSlowCalls(normalisedSlowCalls);
  const dominantSlowEndpoint = slowAggregates[0] ?? null;
  const slowEndpointSummary = slowAggregates
    .slice(0, 3)
    .map((entry) => summarizeSlowEndpoint(entry));
  const backendWait = deriveBackendWaitFlag(
    failureType,
    server,
    client,
    normalisedSlowCalls,
    normalisedNetworkFailures,
  );
  const phaseMarker = derivePhaseMarker(failureType, backendWait);
  const topSuspect = buildTopSuspect(
    failureType,
    timeoutSuspects,
    server,
    client,
    normalisedNetworkFailures,
    normalisedSlowCalls,
  );
  const likelyRootCause = deriveLikelyRootCause(
    failureType,
    dominantSlowEndpoint,
    timeoutSuspects,
    topSuspect,
    executionSignals,
  );

  const summary =
    `API summary: errors=${all.length}, 5xx=${server.length}, ` +
    `4xx=${client.length}, slow>${slowThresholdMs}ms=${normalisedSlowCalls.length}, ` +
    `networkFailures=${normalisedNetworkFailures.length}`;

  const annotations: Array<{ type: string; description: string }> = [
    { type: "Failure type", description: failureType },
    { type: "Phase marker", description: phaseMarker },
    { type: "Setup marker", description: setupMarker },
    { type: "Backend wait", description: backendWait },
    {
      type: "Likely root cause",
      description: truncate(likelyRootCause, DEFAULT_ANNOTATION_LIMIT),
    },
    {
      type: "Top suspect",
      description: truncate(topSuspect, DEFAULT_ANNOTATION_LIMIT),
    },
  ];

  if (all.length > 0) {
    annotations.push({
      type: "API errors",
      description: toAnnotationText(
        all.map(
          (signal) => `${signal.method} ${signal.url} -> HTTP ${signal.status}`,
        ),
      ),
    });
  }
  if (normalisedSlowCalls.length > 0) {
    annotations.push({
      type: "Slow calls",
      description: toAnnotationText(
        normalisedSlowCalls.map(
          (signal) =>
            `${signal.method} ${signal.url} -> ${signal.durationMs}ms`,
        ),
      ),
    });
  }
  if (slowEndpointSummary.length > 0) {
    annotations.push({
      type: "Slow endpoint summary",
      description: toAnnotationText(slowEndpointSummary, 2),
    });
  }
  if (normalisedNetworkFailures.length > 0) {
    annotations.push({
      type: "Network failures",
      description: toAnnotationText(
        normalisedNetworkFailures.map(
          (signal) => `${signal.method} ${signal.url} -> ${signal.reason}`,
        ),
      ),
    });
  }
  if (timeoutSuspects.length > 0) {
    annotations.push({
      type: "Timeout suspects",
      description: toAnnotationText(timeoutSuspects, 2),
    });
  }

  const text = [
    `Test failed: ${testTitle}`,
    testStatus ? `Status: ${testStatus}` : "",
    `Failure type: ${failureType}`,
    `Phase marker: ${phaseMarker}`,
    `Setup marker: ${setupMarker}`,
    `Backend wait: ${backendWait}`,
    `Likely root cause: ${likelyRootCause}`,
    `Top suspect: ${topSuspect}`,
    message ? `Error: ${message}` : "",
    summary,
    timeoutSuspects.length > 0
      ? `Timeout suspects: ${toAnnotationText(timeoutSuspects, 3, 1200)}`
      : "",
    slowEndpointSummary.length > 0
      ? `Slow endpoint summary: ${toAnnotationText(slowEndpointSummary, 3, 1200)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    failureType,
    phaseMarker,
    backendWait,
    likelyRootCause,
    topSuspect,
    timeoutSuspects,
    slowEndpointSummary,
    errorMessage: message,
    summary,
    apiErrors: all,
    serverErrors: server,
    clientErrors: client,
    slowCalls: normalisedSlowCalls,
    networkFailures: normalisedNetworkFailures,
    networkTimeout,
    annotations,
    text,
    data: {
      testTitle,
      testStatus,
      failureType,
      phaseMarker,
      setupMarker,
      backendWait,
      likelyRootCause,
      topSuspect,
      timeoutSuspects,
      slowEndpointSummary,
      errorMessage: message,
      summary,
      apiErrors: all,
      serverErrors: server,
      clientErrors: client,
      slowCalls: normalisedSlowCalls,
      networkFailures: normalisedNetworkFailures,
      networkTimeout,
      executionSignals,
      timestamp: new Date().toISOString(),
    },
  };
};

export const attachFailureDiagnosis = async (
  testInfo: TestInfo,
  diagnosis: FailureDiagnosis,
  options: { textAttachmentName?: string; jsonAttachmentName?: string } = {},
): Promise<void> => {
  for (const annotation of diagnosis.annotations) {
    if (annotation.description.trim()) {
      testInfo.annotations.push(annotation);
    }
  }

  await testInfo.attach(options.textAttachmentName ?? "Failure diagnosis", {
    body: diagnosis.text,
    contentType: "text/plain",
  });
  await testInfo.attach(options.jsonAttachmentName ?? "failure-data.json", {
    body: JSON.stringify(diagnosis.data, null, 2),
    contentType: "application/json",
  });
};

export const __test__ = {
  classifyFailureType,
  isBackendApiUrl,
  isFailureStatus,
  sanitizeErrorText,
  sanitizeUrlForLogs,
};
