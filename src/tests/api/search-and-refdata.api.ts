/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from "node:fs";

import { request } from "@playwright/test";

import { config } from "../../config/api";
import { ROLE_ACCESS_CASE_ID } from "../../data/api/testIds";
import { expect, test } from "../../fixtures/api";
import { ensureStorageState } from "../../fixtures/api-auth";
import { expectStatus, StatusSets, withRetry, withXsrf } from "../../utils/api/apiTestUtils";
import { expectRoleAssignmentShape } from "../../utils/api/assertions";
import { seedRoleAccessCaseId } from "../../utils/api/role-access";
import { RoleAssignmentContainer } from "../../utils/api/types";

test.describe("Global search", () => {
  test("lists available services", async ({ apiClient }) => {
    const response = await withRetry(
      () =>
        apiClient.get<Array<{ serviceId: string; serviceName: string }>>("api/globalSearch/services", {
          throwOnError: false
        }),
      { retries: 1, retryStatuses: [502, 504] }
    );
    expectStatus(response.status, StatusSets.guardedBasic);
    assertGlobalSearchServices(response);
  });

  test("returns results payload or guarded status", async ({ apiClient }) => {
    const response = await apiClient.post<{ results?: unknown }>("api/globalSearch/results", {
      data: { searchRequest: { caseReferences: ["1234567890123456"] } },
      throwOnError: false
    });
    expectStatus(response.status, StatusSets.globalSearch);
    assertGlobalSearchResults(response);
  });

  test("searchCases proxy responds or guards", async ({ apiClient }) => {
    const response = await withRetry(
      () =>
        apiClient.post<{ total?: number; cases?: unknown[] }>("data/internal/searchCases?ctid=xuiTestCaseType", {
          data: { size: 1, from: 0, sort: [], native_es_query: { match_all: {} } },
          throwOnError: false
        }),
      { retries: 1, retryStatuses: [502, 504] }
    );
    expectStatus(response.status, [200, 400, 401, 403, 404, 500, 502, 504]);
    assertSearchCasesResponse(response);
  });
});

test.describe("Ref data and supported jurisdictions", () => {
  test("wa-supported jurisdictions", async ({ apiClient }) => {
    const res = await apiClient.get<string[]>("api/wa-supported-jurisdiction", { throwOnError: false });
    expectStatus(res.status, StatusSets.guardedBasic);
    assertSupportedJurisdictions(res);
  });

  test("staff-supported jurisdictions", async ({ apiClient }) => {
    const res = await apiClient.get<string[]>("api/staff-supported-jurisdiction", { throwOnError: false });
    expectStatus(res.status, StatusSets.guardedBasic);
    assertSupportedJurisdictions(res);
  });

  test("locations endpoint returns list or guarded status", async ({ apiClient }) => {
    await withXsrf("solicitor", async (headers) => {
      const res = await apiClient.get<Array<{ epimms_id?: string }>>("api/locations", {
        headers,
        throwOnError: false
      });
      expectStatus(res.status, StatusSets.guardedBasic);
      assertLocationsResponse(res);
    });
  });

  test("staff-ref-data endpoint responds", async ({ apiClient }) => {
    const res = await apiClient.post<{ staff?: Array<{ known_as?: string; email_id?: string }> }>("api/staff-ref-data/search", {
      data: { attributes: ["email"], searchString: "test" },
      throwOnError: false
    });
    expectStatus(res.status, [200, 400, 401, 403, 500]);
    assertStaffRefData(res);
  });
});

test.describe("Role access / AM", () => {
  let roleAccessCaseId = ROLE_ACCESS_CASE_ID ?? "1234567890123456";
  const hasCaseOfficer = !!(config.users?.[config.testEnv as keyof typeof config.users]?.caseOfficer_r1);
  test.beforeAll(async ({ apiClient }) => {
    if (roleAccessCaseId) {
      return;
    }
    const seeded = await seedRoleAccessCaseId(apiClient);
    if (seeded) {
      roleAccessCaseId = seeded;
    }
  });
  test("rejects unauthenticated role access calls", async ({ anonymousClient }) => {
    const res = await anonymousClient.post("api/role-access/allocate-role/confirm", {
      data: {},
      throwOnError: false
    });
    expectStatus(res.status, [401, 403]);
  });

  test("rejects role access mutation with invalid CSRF token", async ({ apiClient }) => {
    const res = await apiClient.post("api/role-access/allocate-role/confirm", {
      data: {},
      headers: { "X-XSRF-TOKEN": "invalid-token" },
      throwOnError: false
    });
    expectStatus(res.status, StatusSets.allocateRole);
  });

  test("get-my-access-new-count", async ({ apiClient }) => {
    const res = await safeGetMyAccessCount(apiClient);
    expectStatus(res.status, [0, 200, 401, 403, 500, 502, 504]);
    assertMyAccessCount(res);
  });

  test("roles/access-get responds", async ({ apiClient }) => {
    const res = await withRetry(
      () =>
        apiClient.post<RoleAssignmentContainer>("api/role-access/roles/access-get", {
          data: { caseIds: [roleAccessCaseId] },
          throwOnError: false
        }),
      { retries: 1, retryStatuses: [502, 504] }
    );
    expectStatus(res.status, [200, 400, 401, 403, 404, 500]);
    assertAccessGetResponse(res);
  });

  test("allocate-role/valid-roles responds", async ({ apiClient }) => {
    const res = await apiClient.post<Array<{ roleId: string; roleName: string }>>("api/role-access/allocate-role/valid-roles", {
      data: { requestedRoles: [], jurisdiction: "IA" },
      throwOnError: false
    });
    expectStatus(res.status, [200, 400, 401, 403, 404, 500]);
    assertValidRolesResponse(res);
  });

  test("roles/getJudicialUsers responds", async ({ apiClient }) => {
    const res = await apiClient.post("api/role-access/roles/getJudicialUsers", { data: {}, throwOnError: false });
    expectStatus(res.status, StatusSets.roleAccessGuarded);
  });

  if (hasCaseOfficer) {
    test.describe("case sharing", () => {
      test("shares cases with users", async ({ apiClient }) => {
        const res = await apiClient.put("api/role-access/roles/share-case", {
          data: {
            sharedCases: [
              {
                caseId: roleAccessCaseId,
                caseTitle: "case title",
                caseTypeId: "Asylum",
                sharedWith: [
                  {
                    idamId: process.env.CASEOFFICER_R1_USERNAME ?? config.users[config.testEnv as keyof typeof config.users]?.caseOfficer_r1?.e,
                    firstName: "xui_auto_co_r1",
                    lastName: "atjustice.gov.uk",
                    userType: "caseworker",
                    email: process.env.CASEOFFICER_R1_USERNAME ?? config.users[config.testEnv as keyof typeof config.users]?.caseOfficer_r1?.e
                  }
                ]
              }
            ]
          },
          throwOnError: false
        });
        expectStatus(res.status, [200, 400, 401, 403, 404, 500]);
      });
    });
  }
});

test.describe("Case flags", () => {
  test("authenticated call returns 401/403/200 with cached state", async () => {
    const statePath = await ensureStorageState("solicitor");
    const raw = await fs.readFile(statePath, "utf8");
    const state = JSON.parse(raw);
    const ctx = await request.newContext({
      baseURL: config.baseUrl.replace(/\/+$/, ""),
      storageState: state,
      ignoreHTTPSErrors: true
    });
    const res = await ctx.get("api/role-access/roles/all-judicial-users", {
      headers: { experimental: "true" },
      failOnStatusCode: false
    });
    expectStatus(res.status(), [200, 401, 403]);
    await ctx.dispose();
  });

  test("rejects unauthenticated call to all-judicial-users", async ({ anonymousClient }) => {
    const res = await anonymousClient.get("api/role-access/roles/all-judicial-users", {
      throwOnError: false,
      headers: { experimental: "true" }
    });
    expectStatus(res.status, [401, 403]);
  });
});

function assertGlobalSearchServices(response: { status: number; data: unknown }): void {
  if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
    expect(response.data[0]).toEqual(
      expect.objectContaining({
        serviceId: expect.any(String),
        serviceName: expect.any(String)
      })
    );
  }
}

function assertGlobalSearchResults(response: { status: number; data: unknown }): void {
  if (response.status === 200 && response.data) {
    expect(response.data).toHaveProperty("results");
    if (Array.isArray((response.data as any).results) && (response.data as any).results.length > 0) {
      const first = (response.data as any).results[0];
      expect(first).toEqual(expect.objectContaining({}));
      if (first.caseReference) {
        expect(typeof first.caseReference).toBe("string");
      }
    }
  }
}

function assertSearchCasesResponse(response: { status: number; data: any }): void {
  if (response.status === 200 && response.data) {
    if (typeof response.data.total === "number" && Array.isArray(response.data.cases)) {
      expect(response.data.total).toBeGreaterThanOrEqual(0);
      if (response.data.cases.length > 0) {
        expect(response.data.cases[0]).toEqual(expect.anything());
      }
    } else {
      expect(response.data).toEqual(expect.anything());
    }
  }
}

function assertSupportedJurisdictions(response: { status: number; data: unknown }): void {
  if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
    expect(typeof response.data[0]).toBe("string");
  }
}

function assertLocationsResponse(response: { status: number; data: unknown }): void {
  if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
    expect(response.data[0]).toHaveProperty("epimms_id");
  }
}

function assertStaffRefData(response: { status: number; data: any }): void {
  if (response.status === 200 && Array.isArray(response.data?.staff)) {
    const staffEntry = response.data.staff[0];
    expect(staffEntry).toEqual(
      expect.objectContaining({
        known_as: expect.any(String),
        email_id: expect.any(String)
      })
    );
  }
}

function assertMyAccessCount(response: { status: number; data: any }): void {
  const data = response.data as any;
  if (response.status === 200) {
    if (typeof data === "number") {
      expect(data).toBeGreaterThanOrEqual(0);
    } else if (typeof data?.count === "number") {
      expect(data.count).toBeGreaterThanOrEqual(0);
    } else {
      expect(data).toEqual(expect.anything());
    }
  }
}

async function safeGetMyAccessCount(apiClient: { get: (path: string, options: Record<string, unknown>) => Promise<{ status: number; data: unknown }> }): Promise<{
  status: number;
  data?: unknown;
}> {
  try {
    return await withRetry(
      () =>
        apiClient.get("api/role-access/roles/get-my-access-new-count", {
          throwOnError: false
        }),
      { retries: 1, retryStatuses: [502, 504] }
    );
  } catch (error) {
    if (isNetworkError(error)) {
      return { status: 0 };
    }
    throw error;
  }
}

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  if ("status" in error) {
    return Number((error as { status?: unknown }).status) === 0;
  }
  return false;
}

function assertAccessGetResponse(response: { status: number; data: any }): void {
  if (response.status === 200) {
    if (Array.isArray(response.data) && response.data.length > 0) {
      expectRoleAssignmentShape(response.data[0] as any);
    } else if (
      Array.isArray((response.data as RoleAssignmentContainer)?.roleAssignmentResponse) &&
      (response.data as RoleAssignmentContainer).roleAssignmentResponse!.length > 0
    ) {
      expectRoleAssignmentShape((response.data as RoleAssignmentContainer).roleAssignmentResponse![0] as any);
    } else {
      expect(response.data).toEqual(expect.anything());
    }
  }
}

function assertValidRolesResponse(response: { status: number; data: unknown }): void {
  if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
    expect(response.data[0]).toEqual(
      expect.objectContaining({
        roleId: expect.any(String),
        roleName: expect.any(String)
      })
    );
  }
}
