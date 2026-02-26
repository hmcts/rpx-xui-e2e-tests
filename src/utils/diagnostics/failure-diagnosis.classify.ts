import type { TestInfo } from "@playwright/test";

import {
  sanitizeErrorText,
  sanitizeUrlForLogs,
} from "./failure-diagnosis.sanitise";
import type {
  ApiErrorSignal,
  ExecutionSignals,
  FailureClassificationInput,
  FailureType,
  NetworkFailureSignal,
  SlowCallAggregate,
  SlowCallSignal,
} from "./failure-diagnosis.types";

const TIMEOUT_PATTERN =
  /timeout|timed out|etimedout|econnreset|socket hang up|net::err_timed_out/i;
const UI_ELEMENT_PATTERN =
  /locator|element|waiting for|strict mode violation|toBeVisible|toBeEnabled|toContainText/i;
const ASSERTION_PATTERN =
  /\bexpect(?:ed)?\b|\breceived\b|\bassert(?:ion)?\b|toEqual|toBe|toContain/i;

const STRONG_SLOW_CALL_DURATION_MS = 15_000;
const STRONG_SLOW_CALL_COUNT = 3;

const normaliseMethod = (value: string): string =>
  value.trim() ? value.toUpperCase() : "UNKNOWN";

export const hasTimeoutSignal = (
  errorMessage: string,
  networkFailures: NetworkFailureSignal[],
): boolean =>
  TIMEOUT_PATTERN.test(errorMessage) ||
  networkFailures.some((failure) => TIMEOUT_PATTERN.test(failure.reason));

const hasStrongSlowBackendSignal = (slowCalls: SlowCallSignal[]): boolean =>
  slowCalls.length >= STRONG_SLOW_CALL_COUNT ||
  slowCalls.some((call) => call.durationMs >= STRONG_SLOW_CALL_DURATION_MS);

export const aggregateSlowCalls = (
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

export const summarizeSlowEndpoint = (entry: SlowCallAggregate): string => {
  const avgMs = Math.round(entry.totalDurationMs / entry.count);
  return `${entry.method} ${entry.url} (count=${entry.count}, avg=${avgMs}ms, max=${Math.round(entry.maxDurationMs)}ms)`;
};

export const buildTimeoutSuspects = (
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

export const deriveBackendWaitFlag = (
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

export const derivePhaseMarker = (
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

export const buildTopSuspect = (
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

export const deriveLikelyRootCause = (
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

export const normaliseApiErrors = (
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
    correlationId: sanitizeErrorText(signal.correlationId ?? "", 120),
  }));
  return {
    all,
    server: all.filter((signal) => signal.status >= 500),
    client: all.filter((signal) => signal.status >= 400 && signal.status < 500),
  };
};

export const normaliseSlowCalls = (
  signals: SlowCallSignal[],
): SlowCallSignal[] =>
  signals.map((signal) => ({
    method: normaliseMethod(signal.method),
    durationMs: Math.round(signal.durationMs),
    url: sanitizeUrlForLogs(signal.url),
  }));

export const normaliseNetworkFailures = (
  signals: NetworkFailureSignal[],
): NetworkFailureSignal[] =>
  signals.map((signal) => ({
    method: normaliseMethod(signal.method),
    url: sanitizeUrlForLogs(signal.url),
    reason: sanitizeErrorText(signal.reason, 200),
    correlationId: sanitizeErrorText(signal.correlationId ?? "", 120),
  }));

export const isFailureStatus = (status: TestInfo["status"]): boolean =>
  status === "failed" || status === "timedOut";
