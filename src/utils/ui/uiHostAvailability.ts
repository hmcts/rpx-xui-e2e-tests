import type { APIRequestContext } from "@playwright/test";

const UI_HOST_UNAVAILABLE_STATUSES = new Set([502, 503, 504]);
const UI_HOST_UNAVAILABLE_ERROR_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /timeout/i,
  /ERR_CONNECTION/i,
  /socket hang up/i,
];

export interface UiRouteAvailabilityProbe {
  path: string;
  status?: number;
  shouldSkip: boolean;
  reason: string;
}

export function isUiHostUnavailableStatus(status: number): boolean {
  return UI_HOST_UNAVAILABLE_STATUSES.has(status);
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUiHostUnavailableError(error: unknown): boolean {
  const message = asErrorMessage(error);
  return UI_HOST_UNAVAILABLE_ERROR_PATTERNS.some((pattern) =>
    pattern.test(message),
  );
}

export async function probeUiRouteAvailability(
  request: APIRequestContext,
  path: string,
): Promise<UiRouteAvailabilityProbe> {
  try {
    const response = await request.get(path, {
      failOnStatusCode: false,
      timeout: 30_000,
    });
    const status = response.status();
    const shouldSkip = isUiHostUnavailableStatus(status);

    return {
      path,
      status,
      shouldSkip,
      reason: shouldSkip
        ? `EXUI shell route ${path} returned ${status}; skipping mocked UI journey until the shared shell recovers.`
        : `EXUI shell route ${path} returned ${status}.`,
    };
  } catch (error) {
    const shouldSkip = isUiHostUnavailableError(error);
    return {
      path,
      shouldSkip,
      reason: shouldSkip
        ? `EXUI shell route ${path} could not be reached (${asErrorMessage(error)}); skipping mocked UI journey until the shared shell recovers.`
        : `EXUI shell route ${path} probe failed (${asErrorMessage(error)}).`,
    };
  }
}
