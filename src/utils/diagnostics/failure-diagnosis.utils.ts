import type { TestInfo } from "@playwright/test";

import {
  aggregateSlowCalls,
  buildTimeoutSuspects,
  buildTopSuspect,
  classifyFailureType,
  deriveBackendWaitFlag,
  deriveLikelyRootCause,
  derivePhaseMarker,
  hasTimeoutSignal,
  isFailureStatus,
  normaliseApiErrors,
  normaliseNetworkFailures,
  normaliseSlowCalls,
  summarizeSlowEndpoint,
} from "./failure-diagnosis.classify";
import {
  isBackendApiUrl,
  sanitizeErrorText,
  sanitizeUrlForLogs,
  truncate,
} from "./failure-diagnosis.sanitise";
import type {
  FailureDiagnosis,
  FailureDiagnosisInput,
} from "./failure-diagnosis.types";

export type {
  ApiErrorSignal,
  ExecutionSignals,
  FailureClassificationInput,
  FailureType,
  NetworkFailureSignal,
  SlowCallAggregate,
  SlowCallSignal,
  FailureDiagnosis,
  FailureDiagnosisInput,
} from "./failure-diagnosis.types";

const DEFAULT_ANNOTATION_LIMIT = 500;
const DEFAULT_ANNOTATION_ITEMS = 3;

const toAnnotationText = (
  values: string[],
  maxItems = DEFAULT_ANNOTATION_ITEMS,
  maxLength = DEFAULT_ANNOTATION_LIMIT,
): string => truncate(values.slice(0, maxItems).join(" | "), maxLength);

export const buildFailureDiagnosis = ({
  testTitle,
  errorMessage,
  apiErrors,
  slowCalls = [],
  networkFailures = [],
  slowThresholdMs = 5000,
  testStatus,
  setupMarker = "n/a",
  fallbackUsed = false,
  fallbackReason = "",
  executionSignals = {},
  retryDetails,
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

  if (fallbackUsed) {
    annotations.push({
      type: "Fallback mode",
      description: truncate(
        [
          "Jurisdiction bootstrap switched to mock fallback after downstream instability.",
          fallbackReason ? `Reason: ${fallbackReason}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        DEFAULT_ANNOTATION_LIMIT,
      ),
    });
  }

  if (all.length > 0) {
    annotations.push({
      type: "API errors",
      description: toAnnotationText(
        all.map(
          (signal) =>
            `${signal.method} ${signal.url} -> HTTP ${signal.status}${
              signal.correlationId ? ` (cid=${signal.correlationId})` : ""
            }`,
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
          (signal) =>
            `${signal.method} ${signal.url} -> ${signal.reason}${
              signal.correlationId ? ` (cid=${signal.correlationId})` : ""
            }`,
        ),
      ),
    });
  }
  if (retryDetails?.retryAttempt) {
    annotations.push({
      type: "Retry details",
      description: truncate(
        `attempt=${retryDetails.retryAttempt}${
          retryDetails.retryReason ? ` reason=${retryDetails.retryReason}` : ""
        }`,
        DEFAULT_ANNOTATION_LIMIT,
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
    `Fallback used: ${fallbackUsed ? "yes" : "no"}`,
    fallbackUsed && fallbackReason ? `Fallback reason: ${fallbackReason}` : "",
    `Backend wait: ${backendWait}`,
    retryDetails?.retryAttempt
      ? `Retry details: attempt=${retryDetails.retryAttempt}${
          retryDetails.retryReason ? ` reason=${retryDetails.retryReason}` : ""
        }`
      : "",
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
    fallbackUsed,
    fallbackReason,
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
    retryDetails,
    annotations,
    text,
    data: {
      testTitle,
      testStatus,
      failureType,
      phaseMarker,
      setupMarker,
      backendWait,
      fallbackUsed,
      fallbackReason,
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
      retryDetails,
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

export {
  isBackendApiUrl,
  isFailureStatus,
  sanitizeErrorText,
  sanitizeUrlForLogs,
};
