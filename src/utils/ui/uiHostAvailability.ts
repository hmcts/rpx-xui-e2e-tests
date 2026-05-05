import type { APIRequestContext } from '@playwright/test';

export type UiRouteAvailability = {
  path: string;
  status?: number;
  shouldSkip: boolean;
  reason: string;
};

export function isUiHostUnavailableStatus(status: number): boolean {
  return [502, 503, 504].includes(status);
}

export async function probeUiRouteAvailability(
  request: APIRequestContext,
  path: string
): Promise<UiRouteAvailability> {
  try {
    const response = await request.get(path, {
      failOnStatusCode: false,
      timeout: 15_000,
    });
    const status = response.status();
    return {
      path,
      status,
      shouldSkip: isUiHostUnavailableStatus(status),
      reason: isUiHostUnavailableStatus(status)
        ? `EXUI shell route ${path} returned ${status}; skipping route-dependent UI proof.`
        : `EXUI shell route ${path} returned ${status}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      path,
      shouldSkip: true,
      reason: `EXUI shell route ${path} could not be reached: ${message}`,
    };
  }
}
