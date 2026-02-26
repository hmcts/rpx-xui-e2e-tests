export const DEFAULT_TRANSIENT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF = {
  baseDelayMs: 500,
  multiplier: 2,
  maxDelayMs: 6_000,
  jitterRatio: 0.2,
};

const TRANSIENT_FAILURE_PATTERNS: RegExp[] = [
  /DOWNSTREAM_API_5\d\d/,
  /status\s+5\d\d/i,
  /NETWORK_TIMEOUT/,
  /SLOW_API_RESPONSE/,
  /The event could not be created/i,
  /Validation error after/i,
  /Something went wrong page was displayed/i,
  /callback data failed validation/i,
  /timeout of \d+ms exceeded/i,
  /Timeout \d+ms exceeded/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /Exceeded \d+ auto-advance attempts before submit/i,
  /Submit button did not become available/i,
  /Submit button not visible/i,
  /Continue button not visible while retrying wizard advance/i,
  /Critical wizard endpoint failure/i,
  /RETRY_MARKER:jurisdiction-bootstrap-5xx-circuit-breaker/i,
  /jurisdiction bootstrap 5xx circuit breaker/i,
  /Test ended/i,
];

const FATAL_PAGE_CLOSED_PATTERNS: RegExp[] = [
  /Target page, context or browser has been closed/i,
  /Execution context was destroyed/i,
];

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeRetryDelayMs(
  attempt: number,
  config: {
    baseDelayMs: number;
    multiplier: number;
    maxDelayMs: number;
    jitterRatio: number;
  },
): number {
  const exponentialDelay = Math.min(
    config.maxDelayMs,
    Math.round(config.baseDelayMs * Math.pow(config.multiplier, attempt - 1)),
  );
  const jitterWindow = Math.max(
    0,
    Math.round(exponentialDelay * config.jitterRatio),
  );
  if (jitterWindow === 0) {
    return exponentialDelay;
  }
  const jitter =
    Math.floor(Math.random() * (jitterWindow * 2 + 1)) - jitterWindow;
  return Math.max(0, exponentialDelay + jitter);
}

export function isTransientWorkflowFailure(error: unknown): boolean {
  const message = asErrorMessage(error);
  if (FATAL_PAGE_CLOSED_PATTERNS.some((pattern) => pattern.test(message))) {
    return false;
  }
  return TRANSIENT_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export async function retryOnTransientFailure<T>(
  action: () => Promise<T>,
  options: {
    maxAttempts?: number;
    onRetry?: (attempt: number, error: unknown) => Promise<void> | void;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    ensureIdempotent?: (attempt: number) => Promise<void> | void;
    backoff?: {
      baseDelayMs?: number;
      multiplier?: number;
      maxDelayMs?: number;
      jitterRatio?: number;
    };
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_TRANSIENT_MAX_ATTEMPTS;
  const shouldRetry =
    options.shouldRetry ??
    ((error: unknown) => isTransientWorkflowFailure(error));
  const backoff = {
    baseDelayMs:
      options.backoff?.baseDelayMs ?? DEFAULT_RETRY_BACKOFF.baseDelayMs,
    multiplier: options.backoff?.multiplier ?? DEFAULT_RETRY_BACKOFF.multiplier,
    maxDelayMs: options.backoff?.maxDelayMs ?? DEFAULT_RETRY_BACKOFF.maxDelayMs,
    jitterRatio:
      options.backoff?.jitterRatio ?? DEFAULT_RETRY_BACKOFF.jitterRatio,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      if (options.onRetry) {
        try {
          await options.onRetry(attempt, error);
        } catch (retryError) {
          if (!isTransientWorkflowFailure(retryError)) {
            throw retryError;
          }
        }
      }
      if (options.ensureIdempotent) {
        await options.ensureIdempotent(attempt);
      }
      const delayMs = computeRetryDelayMs(attempt, backoff);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    "retryOnTransientFailure exhausted without returning or throwing.",
  );
}
