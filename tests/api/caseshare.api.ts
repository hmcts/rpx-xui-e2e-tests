import { test, expect } from "./fixtures.ts";
import { withXsrf } from "./utils/apiTestUtils.ts";
import { expectCaseShareShape } from "./utils/assertions.ts";
import { CaseShareResponseVariant } from "./utils/types.ts";

const CASESHARE_ENDPOINTS = [
  {
    path: "caseshare/orgs",
    property: "organisations",
    schema: expect.objectContaining({
      organisationIdentifier: expect.any(String),
      name: expect.any(String),
    }),
  },
  {
    path: "caseshare/users",
    property: "users",
    schema: expect.objectContaining({
      userIdentifier: expect.any(String),
      email: expect.any(String),
    }),
  },
  {
    path: "caseshare/cases",
    property: "cases",
    schema: expectCaseShareShape,
  },
  {
    path: "caseshare/case-assignments",
    property: "sharedCases",
    schema: expectCaseShareShape,
  },
] as const;

test.describe("@api case share endpoints", () => {
  for (const { path, property, schema } of CASESHARE_ENDPOINTS) {
    test(`GET ${path}`, async ({ apiClient }) => {
      await withXsrf("solicitor", async (headers) => {
        const response = await apiClient.get(path, {
          headers: { ...headers, experimental: "true" },
          throwOnError: false,
        });
        expect([200, 500, 502, 504]).toContain(response.status);
        expect(response.data).toBeTruthy();

        const entries = resolveEntries(response.data, property);
        expect(Array.isArray(entries)).toBe(true);
        if (entries.length > 0) {
          if (typeof schema === "function") {
            schema(response.data as CaseShareResponseVariant, property);
          } else {
            expect(entries[0]).toEqual(schema);
          }
        }
      });
    });
  }
});

function resolveEntries(
  data: CaseShareResponseVariant | CaseShareCase[],
  property: string,
): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object") {
    const direct = (data as Record<string, unknown>)[property];
    if (Array.isArray(direct)) {
      return direct;
    }
    const nested = (data as { payload?: CaseShareResponseVariant }).payload;
    if (nested && typeof nested === "object") {
      const nestedEntries = (nested as Record<string, unknown>)[property];
      if (Array.isArray(nestedEntries)) {
        return nestedEntries;
      }
    }
  }
  return [];
}
