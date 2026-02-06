import type { TestInfo } from "@playwright/test";

export type FailureType =
  | "DOWNSTREAM_API_5XX"
  | "DOWNSTREAM_API_4XX"
  | "SLOW_API_RESPONSE"
  | "NETWORK_TIMEOUT"
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

interface FailureClassificationInput {
  errorMessage: string;
  serverErrors: ApiErrorSignal[];
  clientErrors: ApiErrorSignal[];
  slowCalls: SlowCallSignal[];
  networkFailures: NetworkFailureSignal[];
}

export interface FailureDiagnosisInput {
  testTitle: string;
  errorMessage?: string;
  apiErrors: ApiErrorSignal[];
  slowCalls?: SlowCallSignal[];
  networkFailures?: NetworkFailureSignal[];
  slowThresholdMs?: number;
}

export interface FailureDiagnosis {
  failureType: FailureType;
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

export const classifyFailureType = ({
  errorMessage,
  serverErrors,
  clientErrors,
  slowCalls,
  networkFailures,
}: FailureClassificationInput): FailureType => {
  if (serverErrors.length > 0) {
    return "DOWNSTREAM_API_5XX";
  }
  if (clientErrors.length > 0) {
    return "DOWNSTREAM_API_4XX";
  }
  if (hasTimeoutSignal(errorMessage, networkFailures)) {
    return slowCalls.length > 0 ? "SLOW_API_RESPONSE" : "NETWORK_TIMEOUT";
  }
  if (UI_ELEMENT_PATTERN.test(errorMessage)) {
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
  });

  const summary =
    `API summary: errors=${all.length}, 5xx=${server.length}, ` +
    `4xx=${client.length}, slow>${slowThresholdMs}ms=${normalisedSlowCalls.length}, ` +
    `networkFailures=${normalisedNetworkFailures.length}`;

  const annotations: Array<{ type: string; description: string }> = [
    { type: "Failure type", description: failureType },
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

  const text = [
    `Test failed: ${testTitle}`,
    `Failure type: ${failureType}`,
    message ? `Error: ${message}` : "",
    summary,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    failureType,
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
      failureType,
      errorMessage: message,
      summary,
      apiErrors: all,
      serverErrors: server,
      clientErrors: client,
      slowCalls: normalisedSlowCalls,
      networkFailures: normalisedNetworkFailures,
      networkTimeout,
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
