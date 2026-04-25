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

export type ExecutionSignals = {
  lastMainFrameUrl: string;
  mainFrameNavigationCount: number;
  totalRequestsObserved: number;
  backendRequestsObserved: number;
};

type ApiSignal = {
  status?: number;
  url?: string;
  method?: string;
};

type FailedRequest = {
  url?: string;
  method?: string;
  errorText?: string;
};

type ClassifyFailureContext = {
  error: string;
  serverErrors: ApiSignal[];
  clientErrors: ApiSignal[];
  slowCalls: ApiSignal[];
  failedRequests: FailedRequest[];
  networkTimeout: boolean;
  testStatus: string;
  executionSignals: ExecutionSignals;
  failureLocation?: string;
  actionableErrorLine?: string;
};

type RootCauseContext = {
  failureType: FailureType;
  testStatus: string;
  error: string;
  timeoutSummary: string;
  dominantSlowEndpoint: string | null;
  topSuspect: string;
  executionSignals: ExecutionSignals;
  failureLocation?: string;
  actionableErrorLine?: string;
};

function lowerSignals(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join("\n").toLowerCase();
}

function hasDirectCcdTokenFailure(value: string): boolean {
  return /direct ccd event token|event-token/.test(value);
}

function directCcdTokenStatus(value: string): number | null {
  const match = /direct ccd event token.*?http\s*(\d{3})|http\s*(\d{3}).*?direct ccd event token/i.exec(value);
  const status = match?.[1] ?? match?.[2];
  return status ? Number(status) : null;
}

function hasUiReadinessSignal(value: string): boolean {
  return /locator|element|shell did not become ready|filter panel|filter controls|filter checkbox|service down|waiting for|page shell/.test(
    value
  );
}

function hasAssertionSignal(value: string): boolean {
  return /expect|expected|received|assert/i.test(value);
}

function hasNetworkTimeoutSignal(context: ClassifyFailureContext, value: string): boolean {
  return (
    context.networkTimeout ||
    /timeout|timed out|net::err_|econnreset|econnrefused|etimedout|enotfound|socket hang up/.test(value) ||
    context.failedRequests.some((request) => /timeout|timed out|net::err_/i.test(request.errorText ?? ""))
  );
}

export function classifyFailure(context: ClassifyFailureContext): FailureType {
  const signalText = lowerSignals(context.error, context.failureLocation, context.actionableErrorLine);
  const ccdStatus = directCcdTokenStatus(signalText);

  if ((ccdStatus ?? 0) >= 500 || context.serverErrors.length > 0) {
    return "DOWNSTREAM_API_5XX";
  }
  if ((ccdStatus ?? 0) >= 400 || context.clientErrors.length > 0) {
    return "DOWNSTREAM_API_4XX";
  }
  if (context.slowCalls.length > 0) {
    return "SLOW_API_RESPONSE";
  }
  if (hasUiReadinessSignal(signalText) && context.testStatus !== "timedOut") {
    return "UI_ELEMENT_MISSING";
  }
  if (context.testStatus === "timedOut" || /test timeout/.test(signalText)) {
    if (hasUiReadinessSignal(signalText)) {
      return "GLOBAL_TIMEOUT_UI_STALL";
    }
    if (context.executionSignals.backendRequestsObserved === 0) {
      return "TIMEOUT_NO_API_ACTIVITY";
    }
    return hasNetworkTimeoutSignal(context, signalText) ? "NETWORK_TIMEOUT" : "GLOBAL_TIMEOUT_UI_STALL";
  }
  if (hasNetworkTimeoutSignal(context, signalText)) {
    return "NETWORK_TIMEOUT";
  }
  if (hasAssertionSignal(signalText)) {
    return "ASSERTION_FAILURE";
  }
  return "UNKNOWN";
}

export function derivePhaseMarker(
  failureType: FailureType,
  error: string,
  executionSignals: ExecutionSignals,
  backendWait: string,
  failureLocation?: string,
  actionableErrorLine?: string
): string {
  const signalText = lowerSignals(error, failureLocation, actionableErrorLine);

  if (/filter checkbox|state could not be read|locator\.ischecked/.test(signalText)) {
    return "ui-filter-checkbox-timeout";
  }
  if (/filter controls/.test(signalText)) {
    return "ui-filter-controls-timeout";
  }
  if (/filter panel/.test(signalText)) {
    return "ui-filter-panel-timeout";
  }
  if (/task list.*service down|available-tasks|tasklist|task-list|task list shell/.test(signalText)) {
    return "ui-task-list-shell-timeout";
  }
  if (/cases page shell|case-list|\/cases/.test(signalText) || executionSignals.lastMainFrameUrl.includes("/cases")) {
    return "ui-cases-shell-timeout";
  }
  if (failureType === "DOWNSTREAM_API_5XX" || failureType === "DOWNSTREAM_API_4XX") {
    return "backend-api-response";
  }
  if (failureType === "TIMEOUT_NO_API_ACTIVITY" || backendWait === "no") {
    return "setup-no-api-activity-timeout";
  }
  if (failureType === "NETWORK_TIMEOUT" || failureType === "SLOW_API_RESPONSE") {
    return "backend-api-timeout";
  }
  return "unknown";
}

export function deriveLikelyRootCause(context: RootCauseContext): string {
  const signalText = lowerSignals(context.error, context.failureLocation, context.actionableErrorLine);

  if (hasDirectCcdTokenFailure(signalText)) {
    return "Direct CCD event-token bootstrap failed because a downstream 5xx response was returned before UI assertions ran.";
  }
  if (/dynamic user provisioning|provisioning/.test(signalText)) {
    return "setup/provisioning timeout; this is not a document-upload UI failure and should be triaged in dynamic user setup.";
  }
  if (/filter checkbox|state could not be read|locator\.ischecked/.test(signalText)) {
    return "Task-list filter checkbox never became usable; investigate filter state/interaction readiness before blaming backend APIs.";
  }
  if (/filter controls/.test(signalText)) {
    return "Task-list filter controls never became visible; investigate filter-shell readiness before blaming backend APIs.";
  }
  if (/filter panel/.test(signalText)) {
    return "Task-list filter panel never became usable; investigate filter-panel readiness before blaming backend APIs.";
  }
  if (/task list.*service down|service down.*task list/.test(signalText)) {
    return "Task-list showed an error/service-down state while waiting for task-list readiness.";
  }
  if (/cases page shell|case-list/.test(signalText)) {
    return "/cases shell did not become interactive; investigate case-list bootstrap readiness.";
  }
  if (context.failureType === "DOWNSTREAM_API_5XX") {
    return `Downstream 5xx dependency failure. Top suspect: ${context.topSuspect}.`;
  }
  if (context.failureType === "DOWNSTREAM_API_4XX") {
    return `Downstream 4xx dependency failure. Top suspect: ${context.topSuspect}.`;
  }
  if (context.failureType === "GLOBAL_TIMEOUT_UI_STALL") {
    return "UI stalled before expected controls became ready; inspect the rendered page and readiness selectors.";
  }
  return context.timeoutSummary || context.dominantSlowEndpoint || context.topSuspect || "No likely root cause identified.";
}

export const __test__ = {
  classifyFailure,
  deriveLikelyRootCause,
  derivePhaseMarker
};
