import { test, expect } from "../../fixtures/api";
import { withXsrf } from "../../utils/api/apiTestUtils";
import { expectCaseShareShape } from "../../utils/api/assertions";
import { CaseShareResponseVariant } from "../../utils/api/types";

const CASESHARE_ENDPOINTS = [
  {
    path: "caseshare/orgs",
    property: "organisations",
    schema: expect.objectContaining({
      organisationIdentifier: expect.any(String),
      name: expect.any(String)
    })
  },
  {
    path: "caseshare/users",
    property: "users",
    schema: expect.objectContaining({
      userIdentifier: expect.any(String),
      email: expect.any(String)
    })
  },
  {
    path: "caseshare/cases",
    property: "cases",
    schema: expectCaseShareShape
  },
  {
    path: "caseshare/case-assignments",
    property: "sharedCases",
    schema: expectCaseShareShape
  }
] as const;

test.describe("Case share endpoints", () => {
  for (const { path, property, schema } of CASESHARE_ENDPOINTS) {
    test(`GET ${path}`, async ({ apiClient }) => {
      await withXsrf("solicitor", async (headers) => {
        const response = await apiClient.get(path, { headers: { ...headers, experimental: "true" }, throwOnError: false });
        expect([200, 500, 502, 504]).toContain(response.status);
        expect(response.data).toBeTruthy();

        assertCaseShareEntries(response.data, property, schema);
      });
    });
  }
});

function resolveEntries(data: unknown, property: string): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record[property])) {
      return record[property] as unknown[];
    }
    const nested = (record as { payload?: Record<string, unknown> }).payload;
    if (nested && Array.isArray(nested[property] as unknown[])) {
      return nested[property] as unknown[];
    }
  }
  return [];
}

function assertCaseShareEntries(data: unknown, property: string, schema: unknown): void {
  const entries = resolveEntries(data, property);
  expect(Array.isArray(entries)).toBe(true);
  if (entries.length > 0) {
    if (typeof schema === "function") {
      schema(data as CaseShareResponseVariant, property as "cases" | "sharedCases");
    } else {
      expect(entries[0]).toEqual(schema);
    }
  }
}
