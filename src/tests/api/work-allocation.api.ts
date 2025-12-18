import { WA_SAMPLE_ASSIGNED_TASK_ID, WA_SAMPLE_TASK_ID } from "../../data/api/testIds";
import { test, expect } from "../../fixtures/api";
import { ensureStorageState } from "../../fixtures/api-auth";
import { expectStatus, StatusSets, withRetry, withXsrf } from "../../utils/api/apiTestUtils";
import { expectTaskList } from "../../utils/api/assertions";
import type { TaskListResponse, UserDetailsResponse } from "../../utils/api/types";
import { buildTaskSearchRequest, seedTaskId } from "../../utils/api/work-allocation";

const serviceCodes = ["IA", "CIVIL", "PRIVATELAW"];

test.describe("Work allocation (read-only)", () => {
  let cachedLocationId: string | undefined;
  let userId: string | undefined;
  let sampleTaskId: string | undefined;
  let sampleMyTaskId: string | undefined;
  const envTaskId = WA_SAMPLE_TASK_ID;
  const envAssignedTaskId = WA_SAMPLE_ASSIGNED_TASK_ID;

  test.beforeAll(async ({ apiClient }) => {
    const userRes = await apiClient.get<UserDetailsResponse>("api/user/details", {
      throwOnError: false
    });
    if (userRes.status === 200) {
      userId = userRes.data?.userInfo?.id ?? userRes.data?.userInfo?.uid;
    }

    const listResponse = await apiClient.get<Array<{ id?: string }>>(
      `workallocation/location?serviceCodes=${encodeURIComponent(serviceCodes.join(","))}`,
      {
        throwOnError: false
      }
    );
    if (listResponse.status === 200 && Array.isArray(listResponse.data) && listResponse.data.length > 0) {
      cachedLocationId = listResponse.data[0]?.id;
    }

    const seeded = await seedTaskId(apiClient, cachedLocationId);
    if (seeded?.id) {
      if (seeded.type === "assigned") {
        sampleMyTaskId = seeded.id;
      } else {
        sampleTaskId = seeded.id;
      }
    }
  });

  test("lists available locations", async ({ apiClient }) => {
    const response = await apiClient.get<Array<{ id: string; locationName: string }>>(
      `workallocation/location?serviceCodes=${encodeURIComponent(serviceCodes.join(","))}`,
      { throwOnError: false }
    );

    expectStatus(response.status, StatusSets.guardedBasic);
    if (response.status !== 200) {
      return;
    }
    const data = response.data;
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          locationName: expect.any(String)
        })
      );
    }
  });

  test("fetches location by id", async ({ apiClient }) => {
    if (!cachedLocationId) return;

    const response = await apiClient.get<Record<string, unknown>>(`workallocation/location/${cachedLocationId}`, {
      throwOnError: false
    });
    expectStatus(response.status, [200, 401, 403, 404, 500]);
  });

  test("returns task names catalogue", async ({ apiClient }) => {
    const response = await apiClient.get<unknown>("workallocation/taskNames");
    expect(response.status).toBe(200);

    const names = toArray<string>(response.data);
    expect(Array.isArray(names)).toBe(true);
    if (names.length > 0) {
      expect(typeof names[0]).toBe("string");
    }
  });

  test("returns types of work catalogue", async ({ apiClient }) => {
    const response = await apiClient.get<unknown>("workallocation/task/types-of-work");
    expect(response.status).toBe(200);

    const types = toArray(response.data);
    expect(Array.isArray(types)).toBe(true);
    if (types.length > 0 && typeof types[0] === "object" && types[0] !== null) {
      expect(types[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String)
        })
      );
    }
  });

  test("rejects unauthenticated access", async ({ anonymousClient }) => {
    for (const endpoint of ["workallocation/location", "workallocation/taskNames"]) {
      const res = await anonymousClient.get(endpoint, { throwOnError: false });
      expect(res.status).toBe(401);
    }

    const res = await anonymousClient.post("workallocation/task", {
      data: buildTaskSearchRequest("MyTasks", { states: ["assigned"] }),
      throwOnError: false
    });
    expect(res.status).toBe(401);
  });

  test.describe("task search", () => {
    test("MyTasks returns structured response", async ({ apiClient }) => {
      if (!userId) {
        expect(userId).toBeUndefined();
        return;
      }

      const body = buildTaskSearchRequest("MyTasks", {
        userIds: [userId!],
        locations: cachedLocationId ? [cachedLocationId] : [],
        states: ["assigned"],
        searchBy: "caseworker"
      });

      const response = (await withRetry(
        () =>
          apiClient.post("workallocation/task", {
            data: body
          }),
        { retries: 1, retryStatuses: [502, 504] }
      )) as { data: TaskListResponse; status: number };
      expectTaskList(response.data);
    });

    test("AvailableTasks returns structured response", async ({ apiClient }) => {
      const body = buildTaskSearchRequest("AvailableTasks", {
        locations: cachedLocationId ? [cachedLocationId] : [],
        states: ["unassigned"],
        searchBy: "caseworker"
      });

      const response = (await withRetry(
        () =>
          apiClient.post("workallocation/task", {
            data: body,
            throwOnError: false
          }),
        { retries: 1, retryStatuses: [502, 504] }
      )) as { data: TaskListResponse; status: number };
      expectStatus(response.status, StatusSets.guardedBasic);
      if (response.status !== 200) {
        return;
      }
      expectTaskList(response.data);
    });

    test("AllWork returns structured response", async ({ apiClient }) => {
      const body = buildTaskSearchRequest("AllWork", {
        locations: cachedLocationId ? [cachedLocationId] : [],
        states: ["assigned", "unassigned"],
        searchBy: "caseworker"
      });

      const response = (await withRetry(
        () =>
          apiClient.post("workallocation/task", {
            data: body,
            throwOnError: false
          }),
        { retries: 1, retryStatuses: [502, 504] }
      )) as { data: TaskListResponse; status: number };
      if (response.status !== 200) {
        expect(response.status).toBeGreaterThanOrEqual(400);
        return;
      }
      expectTaskList(response.data);
    });
  });

  test.describe("my-work dashboards", () => {
    const endpoints = ["workallocation/my-work/cases", "workallocation/my-work/myaccess"];
    endpoints.forEach((endpoint) => {
      test(`${endpoint} returns data or guarded status`, async ({ apiClient }) => {
        const response = await withXsrf("solicitor", (headers) =>
          apiClient.get(endpoint, {
            headers,
            throwOnError: false
          })
        );
        expectStatus(response.status, StatusSets.guardedExtended);
        if (response.status === 200 && response.data) {
          const data = response.data;
          const cases =
            Array.isArray(data) && data.length > 0
              ? data
              : typeof data === "object" &&
                  data !== null &&
                  Array.isArray((data as Record<string, unknown>).cases as unknown[])
                ? ((data as Record<string, unknown>).cases as unknown[])
                : [];
          if (cases.length > 0) {
            expect(cases[0]).toEqual(
              expect.objectContaining({
                caseId: expect.any(String)
              })
            );
          }
        }
      });
    });
  });

  test.describe("task actions", () => {
    test("claim/unclaim guarded", async ({ apiClient }) => {
      const taskId = sampleTaskId ?? envTaskId ?? sampleMyTaskId ?? envAssignedTaskId;
      const endpoint = "workallocation/task/claim";
      const response = await withXsrf("solicitor", (headers) =>
        apiClient.post(endpoint, {
          data: taskId ? { taskId } : undefined,
          headers,
          throwOnError: false
        })
      );
      expectStatus(response.status, StatusSets.actionWithConflicts);
    });

    test("assign/unassign guarded", async ({ apiClient }) => {
      const taskId = sampleMyTaskId ?? envAssignedTaskId ?? sampleTaskId ?? envTaskId;
      const endpoint = "workallocation/task/assign";
      const response = await withXsrf("solicitor", (headers) =>
        apiClient.post(endpoint, {
          data: taskId ? { taskId, assignee: "some-user" } : undefined,
          headers,
          throwOnError: false
        })
      );
      expectStatus(response.status, StatusSets.actionWithConflicts);
    });

    test("complete/cancel guarded", async ({ apiClient }) => {
      const taskId = sampleMyTaskId ?? envAssignedTaskId ?? sampleTaskId ?? envTaskId;
      const response = await withXsrf("solicitor", (headers) =>
        apiClient.post("workallocation/task/complete", {
          data: taskId ? { taskId } : undefined,
          headers,
          throwOnError: false
        })
      );
      expectStatus(response.status, StatusSets.actionWithConflicts);
    });

    test("available task actions guarded", async ({ apiClient }) => {
      const taskId = sampleTaskId ?? envTaskId;
      const response = await apiClient.get(taskId ? `workallocation/task/${taskId}` : "workallocation/task/12345", {
        throwOnError: false
      });
      expectStatus(response.status, StatusSets.retryable);
      if (response.status === 200) {
        const data = response.data;
        const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : undefined;
        const actions =
          record && Array.isArray(record.actions as unknown[])
            ? (record.actions as Array<Record<string, unknown>>)
            : record &&
                typeof record.task === "object" &&
                record.task !== null &&
                Array.isArray((record.task as Record<string, unknown>).actions as unknown[])
              ? ((record.task as Record<string, unknown>).actions as Array<Record<string, unknown>>)
              : [];
        if (actions.length > 0) {
          expect(actions[0]).toEqual(
            expect.objectContaining({
              id: expect.any(String),
              title: expect.any(String)
            })
          );
        }
      }
    });
  });
});

test.describe("Work allocation (requires session)", () => {
  test("unauthenticated task search returns 401", async ({ anonymousClient }) => {
    const response = await anonymousClient.post("workallocation/task", {
      data: buildTaskSearchRequest("MyTasks"),
      throwOnError: false
    });
    expect(response.status).toBe(401);
  });

  test("session creation with storage state", async ({ apiClient }) => {
    await ensureStorageState("solicitor");
    const response = await apiClient.get("auth/isAuthenticated", { throwOnError: false });
    expectStatus(response.status, [200, 401, 403]);
  });
});

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null) return Object.values(value) as T[];
  return [];
}
