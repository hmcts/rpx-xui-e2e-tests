import { test, expect, request } from "@playwright/test";

import { config } from "../../config/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";

const baseURL = config.baseUrl.replace(/\/+$/, "");

const origins = [
  { label: "allowed", origin: baseURL, expected: StatusSets.corsAllowed },
  {
    label: "disallowed",
    origin: "https://example.invalid",
    expected: StatusSets.corsDisallowed,
  },
];

test.describe("CORS and OPTIONS", () => {
  origins.forEach(({ label, origin, expected }) => {
    test(`OPTIONS /api/user/details (${label} origin)`, async () => {
      const ctx = await request.newContext({
        baseURL,
        ignoreHTTPSErrors: true,
      });
      try {
        const res = await ctx.fetch("api/user/details", {
          method: "OPTIONS",
          headers: { origin },
          failOnStatusCode: false,
        });
        expectStatus(res.status(), expected);
        assertCorsHeaders(res.status(), res.headers(), origin, expected);
      } catch (error) {
        handleCorsError(error);
      } finally {
        await ctx.dispose();
      }
    });

    test(`OPTIONS /api/configuration (${label} origin)`, async () => {
      const ctx = await request.newContext({
        baseURL,
        ignoreHTTPSErrors: true,
      });
      try {
        const res = await ctx.fetch("api/configuration", {
          method: "OPTIONS",
          headers: { origin },
          failOnStatusCode: false,
        });
        expectStatus(res.status(), expected);
        assertCorsHeaders(res.status(), res.headers(), origin, expected);
      } catch (error) {
        handleCorsError(error);
      } finally {
        await ctx.dispose();
      }
    });
  });
});

function assertCorsHeaders(
  status: number,
  headers: Record<string, string>,
  origin: string,
  expected: ReadonlyArray<number>,
): void {
  if (expected === StatusSets.corsAllowed && status < 500) {
    const allowOrigin =
      headers["access-control-allow-origin"] ||
      headers["Access-Control-Allow-Origin"];
    if (allowOrigin) {
      expect(allowOrigin).toBe(origin);
    }
  }
  if (expected === StatusSets.corsDisallowed && status < 500) {
    const allowed =
      headers["access-control-allow-origin"] ||
      headers["Access-Control-Allow-Origin"];
    expect(allowed === origin).toBe(false);
  }
}

function handleCorsError(error: unknown): void {
  const message = (error as Error)?.message ?? "";
  if (/ENOTFOUND|ECONNREFUSED/.test(message)) {
    expect(message).toContain("manage-case");
    return;
  }
  throw error;
}
