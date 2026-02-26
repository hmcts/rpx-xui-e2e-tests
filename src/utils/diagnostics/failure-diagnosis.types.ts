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
  correlationId?: string;
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
  correlationId?: string;
}

export interface ExecutionSignals {
  lastMainFrameUrl?: string;
  mainFrameNavigationCount?: number;
  totalRequestsObserved?: number;
  backendRequestsObserved?: number;
}

export interface FailureClassificationInput {
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
  fallbackUsed?: boolean;
  fallbackReason?: string;
  executionSignals?: ExecutionSignals;
  retryDetails?: {
    retryAttempt?: number;
    retryReason?: string;
  };
}

export interface SlowCallAggregate {
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
  fallbackUsed: boolean;
  fallbackReason: string;
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
  retryDetails?: {
    retryAttempt?: number;
    retryReason?: string;
  };
  annotations: Array<{ type: string; description: string }>;
  text: string;
  data: Record<string, unknown>;
}
