import {
  DEFAULT_RETRY_BASE_MS,
  DEFAULT_RETRY_MAX_ELAPSED_MS,
  DEFAULT_RETRY_MAX_MS,
  isRetryableError,
  withRetry as commonWithRetry,
} from "@hmcts/playwright-common";
import { expect } from "@playwright/test";

import {
  ensureStorageState,
  getStoredCookie,
  type ApiUserRole,
} from "../../fixtures/api-auth";

// Central map of commonly reused status code sets to reduce magic arrays in tests.
export const StatusSets = {
  guardedBasic: [200, 401, 403, 502, 504] as const,
  guardedExtended: [200, 401, 403, 404, 500, 502, 504] as const,
  actionWithConflicts: [
    200, 204, 400, 401, 403, 404, 409, 500, 502, 504,
  ] as const,
  allocateRole: [
    200, 201, 204, 400, 401, 403, 404, 409, 500, 502, 504,
  ] as const,
  roleAccessRead: [200, 400, 401, 403, 404, 500, 502, 504] as const,
  searchCases: [200, 400, 401, 403, 404, 500, 502, 504] as const,
  globalSearch: [200, 400, 401, 403, 500, 502, 504] as const,
  okOnly: [200] as const,
  okOrBadRequest: [200, 400, 403] as const,
  corsAllowed: [200, 204, 400, 401, 403] as const,
  corsDisallowed: [200, 204, 400, 401, 403, 404] as const,
  retryable: [200, 401, 403, 404, 500, 502, 504] as const,
  roleAccessRetryable: [200, 400, 401, 403, 404, 409, 500, 502, 504] as const,
  roleAccessGuarded: [200, 401, 403, 404, 500, 502, 504] as const,
  bookmark: [200, 201, 204, 400, 401, 403, 404, 409, 500, 502, 504] as const,
  documentView: [200, 401, 403, 404] as const,
  unauthenticated: [401, 403] as const,
};

export type StatusSetName = keyof typeof StatusSets;

export function expectStatus(actual: number, allowed: ReadonlyArray<number>) {
  if (!allowed.includes(actual)) {
    expect({ status: actual }).toEqual({ status: allowed[0] }); // emit a Playwright diff if fails
  }
}

export async function buildXsrfHeadersWith(
  role: ApiUserRole,
  deps: {
    ensureStorageState?: typeof ensureStorageState;
    getStoredCookie?: typeof getStoredCookie;
  } = {},
): Promise<Record<string, string>> {
  const ensureState = deps.ensureStorageState ?? ensureStorageState;
  const readCookie = deps.getStoredCookie ?? getStoredCookie;
  await ensureState(role);
  const xsrf = await readCookie(role, "XSRF-TOKEN");
  return xsrf ? { "X-XSRF-TOKEN": xsrf } : {};
}

export async function buildXsrfHeaders(
  role: ApiUserRole,
): Promise<Record<string, string>> {
  return buildXsrfHeadersWith(role);
}

export async function buildRequiredXsrfHeaders(
  role: ApiUserRole,
): Promise<Record<string, string>> {
  const headers = await buildXsrfHeaders(role);
  if (!headers["X-XSRF-TOKEN"]) {
    throw new Error(`Missing XSRF token header for role "${role}"`);
  }
  return headers;
}

export async function withXsrf<T>(
  role: ApiUserRole,
  fn: (headers: Record<string, string>) => Promise<T>,
): Promise<T> {
  const headers = await buildXsrfHeaders(role);
  return fn(headers);
}

export async function withRequiredXsrf<T>(
  role: ApiUserRole,
  fn: (headers: Record<string, string>) => Promise<T>,
): Promise<T> {
  const headers = await buildRequiredXsrfHeaders(role);
  return fn(headers);
}

export async function withRetry<T extends { status: number }>(
  fn: () => Promise<T>,
  opts: { retries?: number; retryStatuses?: number[] } = {},
): Promise<T> {
  const retries = opts.retries ?? 1;
  if (retries < 0) {
    throw new Error("withRetry failed unexpectedly");
  }
  const retryStatuses = opts.retryStatuses ?? [502, 504];
  const attempts = Math.max(1, retries + 1);
  let lastResponse: T | undefined;

  const parseRetryAfterMs = (
    headers?: Record<string, string>,
  ): number | undefined => {
    if (!headers) return undefined;
    const raw = headers["retry-after"] ?? headers["Retry-After"];
    if (!raw) return undefined;
    const trimmed = String(raw).trim();
    if (!trimmed) return undefined;
    const seconds = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(seconds)) {
      return Math.min(Math.max(seconds, 0), 60) * 1000;
    }
    const date = Date.parse(trimmed);
    if (!Number.isNaN(date)) {
      const diff = date - Date.now();
      return diff > 0 ? Math.min(diff, 60_000) : undefined;
    }
    return undefined;
  };

  const shouldRetry = (error: unknown): boolean => {
    if (isRetryableError(error)) return true;
    if (error && typeof error === "object" && "status" in error) {
      const status = Number((error as { status?: unknown }).status);
      return Number.isFinite(status) && retryStatuses.includes(status);
    }
    return false;
  };

  try {
    return await commonWithRetry(
      async () => {
        const response = await fn();
        lastResponse = response;
        if (retryStatuses.includes(response.status)) {
          const retryAfterMs = parseRetryAfterMs(
            (response as { headers?: Record<string, string> }).headers,
          );
          const error = new Error(`Retryable status: ${response.status}`);
          (error as { status?: number; retryAfterMs?: number }).status =
            response.status;
          if (retryAfterMs) {
            (error as { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
          }
          throw error;
        }
        return response;
      },
      attempts,
      DEFAULT_RETRY_BASE_MS,
      DEFAULT_RETRY_MAX_MS,
      DEFAULT_RETRY_MAX_ELAPSED_MS,
      shouldRetry,
    );
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
    if (
      lastResponse &&
      typeof status === "number" &&
      retryStatuses.includes(status)
    ) {
      return lastResponse;
    }
    throw error;
  }
}

export const __test__ = {
  buildXsrfHeadersWith,
};
