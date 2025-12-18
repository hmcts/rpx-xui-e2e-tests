import { ROLE_ACCESS_CASE_ID } from "../../data/api/testIds";
import { test, expect } from "../../fixtures/api";
import { StatusSets, expectStatus } from "../../utils/api/apiTestUtils";
import { expectCaseShareShape } from "../../utils/api/assertions";
import { resolveRoleAccessArray } from "../../utils/api/role-access";
import type { RoleAccessResponse, CaseShareResponseVariant } from "../../utils/api/types";

const CORS_ENDPOINTS = [
  { url: "api/role-access/roles/post", allowed: true },
  { url: "api/role-access/roles/access-get", allowed: true },
  { url: "api/role-access/roles/access-get-by-caseId", allowed: true },
  { url: "api/role-access/roles/getJudicialUsers", allowed: true },
  { url: "api/role-access/roles/get-my-access-new-count", allowed: true },
  { url: "api/role-access/roles/manageLabellingRoleAssignment/1234567890123456", allowed: true },
  { url: "api/role-access/allocate-role/confirm", allowed: true },
  { url: "api/role-access/allocate-role/reallocate", allowed: true },
  { url: "api/role-access/allocate-role/delete", allowed: true },
  { url: "api/role-access/allocate-role/valid-roles", allowed: true }
] as const;

test.describe("CORS and role access", () => {
  for (const { url, allowed } of CORS_ENDPOINTS) {
    test(`OPTIONS ${url} returns ${allowed ? "allowed" : "restricted"} status`, async ({ apiClient }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (apiClient as any).options(url, { throwOnError: false });
      const expectedStatuses = allowed ? StatusSets.corsAllowed : StatusSets.corsDisallowed;
      expect(expectedStatuses).toContain(response.status);
    });
  }

  test("GET api/role-access/roles/access-get returns data when case id provided", async ({ apiClient }) => {
    const response = await apiClient.get(`api/role-access/roles/access-get?caseId=${ROLE_ACCESS_CASE_ID}`, {
      throwOnError: false
    });
    expectStatus(response.status, StatusSets.roleAccessRead);
    if (response.status !== 200) return;

    const data = resolveRoleAccessArray(response.data as RoleAccessResponse);
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(typeof data[0]).toBe("object");
    }
  });

  test("GET api/role-access/roles/post returns data when case id provided", async ({ apiClient }) => {
    const response = await apiClient.get(`api/role-access/roles/post?caseId=${ROLE_ACCESS_CASE_ID}`, {
      throwOnError: false
    });
    expectStatus(response.status, StatusSets.roleAccessRead);
    if (response.status !== 200) return;

    const data = resolveRoleAccessArray(response.data as RoleAccessResponse);
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(typeof data[0]).toBe("object");
    }
  });

  test("GET api/caseshare/cases returns case share shape", async ({ apiClient }) => {
    const response = await apiClient.get("api/caseshare/cases", { throwOnError: false });
    expectStatus(response.status, StatusSets.guardedBasic);
    if (response.status !== 200) return;

    expectCaseShareShape(response.data as CaseShareResponseVariant, "cases");
  });
});
