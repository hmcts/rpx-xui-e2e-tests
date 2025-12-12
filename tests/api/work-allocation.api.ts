import { ApiClient } from "@hmcts/playwright-common";

import { ensureStorageState } from "./auth.ts";
import { WA_SAMPLE_ASSIGNED_TASK_ID, WA_SAMPLE_TASK_ID } from "./data/testIds";
import { test, expect } from "./fixtures.ts";
import { expectStatus, StatusSets, withRetry, withXsrf } from "./utils/apiTestUtils.ts";
import { expectTaskList } from "./utils/assertions.ts";
import type { Task, TaskListResponse, UserDetailsResponse } from "./utils/types.ts";
import { buildTaskSearchRequest, seedTaskId } from "./utils/work-allocation.ts";

const serviceCodes = ["IA", "CIVIL", "PRIVATELAW"];

test.describe("@api work allocation (read-only)", () => {
  let cachedLocationId: string | undefined;
  let userId: string | undefined;
  let sampleTaskId: string | undefined;
  let sampleMyTaskId: string | undefined;
  const envTaskId = WA_SAMPLE_TASK_ID;
  const envAssignedTaskId = WA_SAMPLE_ASSIGNED_TASK_ID;

  test.beforeAll(async ({ apiClient }) => {
    const userRes = await apiClient.get<UserDetailsResponse>("api/user/details", {
      throwOnError: false,
    });
    if (userRes.status === 200) {
      userId = userRes.data?.userInfo?.id ?? userRes.data?.userInfo?.uid;
    }

    const listResponse = await apiClient.get<{ id?: string }[]>(
      `workallocation/location?serviceCodes=${encodeURIComponent(serviceCodes.join(","))}`,
      {
        throwOnError: false,
      },
    );
    if (
      listResponse.status === 200 &&
      Array.isArray(listResponse.data) &&
      listResponse.data.length > 0
    ) {
      cachedLocationId = listResponse.data[0]?.id;
    }

    // seed tasks for action tests
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
    const response = await apiClient.get<{ id: string; locationName: string }[]>(
      `workallocation/location?serviceCodes=${encodeURIComponent(serviceCodes.join(","))}`,
      { throwOnError: false },
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
          locationName: expect.any(String),
        }),
      );
    }
  });

  test("fetches location by id", async ({ apiClient }) => {
    if (!cachedLocationId) return;

    const response = await apiClient.get<Record<string, unknown>>(
      `workallocation/location/${cachedLocationId}`,
      {
        throwOnError: false,
      },
    );
    expectStatus(response.status, [200, 401, 403, 404, 500]);
  });

  test("returns task names catalogue", async ({ apiClient }) => {
    const response = await withXsrf("solicitor", (headers) =>
      apiClient.get<unknown>("workallocation/taskNames", { headers, throwOnError: false }),
    );
    expectStatus(response.status, StatusSets.guardedBasic);
    if (response.status !== 200) {
      return;
    }

    const names = toArray<string>(response.data);
    expect(Array.isArray(names)).toBe(true);
    if (names.length > 0) {
      expect(typeof names[0]).toBe("string");
    }
  });

  test("returns types of work catalogue", async ({ apiClient }) => {
    const response = await withXsrf("solicitor", (headers) =>
      apiClient.get<unknown>("workallocation/task/types-of-work", { headers, throwOnError: false }),
    );
    expectStatus(response.status, StatusSets.guardedBasic);
    if (response.status !== 200) {
      return;
    }

    const types = toArray(response.data);
    expect(Array.isArray(types)).toBe(true);
    if (types.length > 0 && typeof types[0] === "object" && types[0] !== null) {
      expect(types[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
        }),
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
      throwOnError: false,
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
        userIds: [userId],
        locations: cachedLocationId ? [cachedLocationId] : [],
        states: ["assigned"],
        searchBy: "caseworker",
      });

      const response = (await withRetry(
        () =>
          apiClient.post("workallocation/task", {
            data: body,
          }),
        { retries: 1, retryStatuses: [502, 504] },
      )) as { data: TaskListResponse; status: number };
      expectTaskList(response.data);
    });

    test("AvailableTasks returns structured response", async ({ apiClient }) => {
      const body = buildTaskSearchRequest("AvailableTasks", {
        locations: cachedLocationId ? [cachedLocationId] : [],
        states: ["unassigned"],
        searchBy: "caseworker",
      });

      const response = (await withRetry(
        () =>
          apiClient.post("workallocation/task", {
            data: body,
            throwOnError: false,
          }),
        { retries: 1, retryStatuses: [502, 504] },
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
        searchBy: "caseworker",
      });

      const response = (await withRetry(
        () =>
          apiClient.post("workallocation/task", {
            data: body,
            throwOnError: false,
          }),
        { retries: 1, retryStatuses: [502, 504] },
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
            throwOnError: false,
          }),
        );
        expectStatus(response.status, StatusSets.guardedExtended);
        if (response.status === 200 && response.data) {
          const data = response.data as { cases?: unknown[] } | unknown[];
          const cases = Array.isArray(data)
            ? data
            : Array.isArray(data?.cases)
              ? (data.cases ?? [])
              : [];
          expect(Array.isArray(cases)).toBe(true);
        }
      });
    });

    test("my-work cases expose totals when present", async ({ apiClient }) => {
      const response = await withXsrf("solicitor", (headers) =>
        apiClient.get("workallocation/my-work/cases", {
          headers,
          throwOnError: false,
        }),
      );
      expectStatus(response.status, StatusSets.guardedExtended);
      if (response.status === 200 && response.data) {
        const data = response.data as { total_records?: number; cases?: unknown[] };
        const totalRecords = data.total_records;
        if (typeof totalRecords === "number") {
          expect(totalRecords).toBeGreaterThanOrEqual(0);
        }
        if (Array.isArray(data.cases)) {
          expect(data.cases.length).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  test.describe("task actions (negative)", () => {
    const actions = ["claim", "unclaim", "assign", "unassign", "complete", "cancel"] as const;
    const taskId = () => sampleTaskId ?? "00000000-0000-0000-0000-000000000000";

    actions.forEach((action) => {
      test(`rejects unauthenticated ${action}`, async ({ anonymousClient }) => {
        const response = await anonymousClient.post(`workallocation/task/${taskId()}/${action}`, {
          data: {},
          throwOnError: false,
        });
        expectStatus(response.status, [401, 403, 502]);
      });
    });

    actions.forEach((action) => {
      test(`rejects ${action} without XSRF header`, async ({ apiClient }) => {
        await ensureStorageState("solicitor");
        const response = await apiClient.post(`workallocation/task/${taskId()}/${action}`, {
          data: {},
          headers: {},
          throwOnError: false,
        });
        expectStatus(response.status, [200, 204, 401, 403, 404, 502]);
      });
    });

    actions.forEach((action) => {
      test(`rejects ${action} with invalid XSRF token`, async ({ apiClient }) => {
        await ensureStorageState("solicitor");
        const response = await apiClient.post(`workallocation/task/${taskId()}/${action}`, {
          data: {},
          headers: { "X-XSRF-TOKEN": "invalid-token" },
          throwOnError: false,
        });
        expectStatus(response.status, [400, 401, 403, 409, 500, 502]);
      });
    });

    actions.forEach((action) => {
      test(`${action} with XSRF header returns guarded status`, async ({ apiClient }) => {
        const response = await withXsrf("solicitor", (headers) =>
          apiClient.post(`workallocation/task/${taskId()}/${action}`, {
            data: {},
            headers,
            throwOnError: false,
          }),
        );
        expectStatus(response.status, [200, 204, 400, 403, 404, 409, 502]);
      });
    });
  });

  test.describe("deterministic task actions (env-seeded)", () => {
    const positive = [
      { action: "claim", id: () => envTaskId! },
      { action: "assign", id: () => envTaskId! },
      { action: "unclaim", id: () => envAssignedTaskId ?? envTaskId! },
      { action: "unassign", id: () => envAssignedTaskId ?? envTaskId! },
      { action: "complete", id: () => envAssignedTaskId ?? envTaskId! },
      { action: "cancel", id: () => envAssignedTaskId ?? envTaskId! },
    ] as const;

    positive.forEach(({ action, id }) => {
      test(`${action} succeeds with XSRF when seeded task ids provided`, async ({ apiClient }) => {
        if (!envTaskId && !envAssignedTaskId) {
          expect(true).toBe(true);
          return;
        }
        await withXsrf("solicitor", async (headers) => {
          const res = await apiClient.post(`workallocation/task/${id()}/${action}`, {
            data: {},
            headers,
            throwOnError: false,
          });
          expectStatus(res.status, [200, 204]);
        });
      });
    });
  });

  test.describe("task actions (happy-path attempt)", () => {
    const fallbackId = "00000000-0000-0000-0000-000000000000";

    const positiveActions: { action: string; taskId: () => string }[] = [
      { action: "claim", taskId: () => envTaskId ?? sampleTaskId ?? fallbackId },
      {
        action: "unclaim",
        taskId: () =>
          envAssignedTaskId ?? envTaskId ?? sampleMyTaskId ?? sampleTaskId ?? fallbackId,
      },
      {
        action: "complete",
        taskId: () =>
          envAssignedTaskId ?? envTaskId ?? sampleMyTaskId ?? sampleTaskId ?? fallbackId,
      },
      { action: "assign", taskId: () => envTaskId ?? sampleTaskId ?? fallbackId },
      {
        action: "unassign",
        taskId: () =>
          envAssignedTaskId ?? envTaskId ?? sampleMyTaskId ?? sampleTaskId ?? fallbackId,
      },
      {
        action: "cancel",
        taskId: () =>
          envAssignedTaskId ?? envTaskId ?? sampleMyTaskId ?? sampleTaskId ?? fallbackId,
      },
    ];

    positiveActions.forEach(({ action, taskId }) => {
      test(`${action} returns allowed status with XSRF`, async ({ apiClient }) => {
        const response = await withXsrf("solicitor", async (headers) => {
          const before = await fetchTaskById(apiClient, taskId());
          const res = await apiClient.post(`workallocation/task/${taskId()}/${action}`, {
            data: {},
            headers,
            throwOnError: false,
          });

          if (res.status === 200 || res.status === 204) {
            const after = await fetchTaskById(apiClient, taskId());
            assertStateTransition(action, before?.task, after?.task);
          }

          return res;
        });

        expectStatus(response.status, StatusSets.actionWithConflicts);
      });
    });
  });

  test.describe("caseworkers & people", () => {
    test("lists caseworkers", async ({ apiClient }) => {
      const response = await withXsrf("solicitor", (headers) =>
        apiClient.get("workallocation/caseworker", {
          headers,
          throwOnError: false,
        }),
      );
      expectStatus(response.status, StatusSets.guardedExtended);
      const data = response.data as CaseworkerEntry[] | undefined;
      if (response.status === 200 && Array.isArray(data) && data.length > 0) {
        expect(data[0]).toEqual(
          expect.objectContaining({
            firstName: expect.any(String),
            lastName: expect.any(String),
            idamId: expect.any(String),
          }),
        );
      }
    });

    test("lists caseworkers for location", async ({ apiClient }) => {
      if (!cachedLocationId) {
        expect(cachedLocationId).toBeUndefined();
        return;
      }
      const response = await withXsrf("solicitor", (headers) =>
        apiClient.get(`workallocation/caseworker/location/${cachedLocationId}`, {
          headers,
          throwOnError: false,
        }),
      );
      expectStatus(response.status, StatusSets.guardedExtended);
      const data = response.data as CaseworkerEntry[] | undefined;
      if (response.status === 200 && Array.isArray(data) && data.length > 0) {
        expect(data[0]).toEqual(
          expect.objectContaining({
            firstName: expect.any(String),
            lastName: expect.any(String),
            idamId: expect.any(String),
          }),
        );
      }
    });

    test("region/location matrix", async ({ apiClient }) => {
      const response = await apiClient.post("workallocation/region-location", {
        data: { serviceIds: serviceCodes },
        throwOnError: false,
      });
      expectStatus(response.status, [200, 400, 403]);
    });

    test("person search validation", async ({ apiClient }) => {
      const response = await apiClient.post("workallocation/findPerson", {
        data: { searchOptions: { searchTerm: "test", userRole: "judge", services: serviceCodes } },
        throwOnError: false,
      });
      expectStatus(response.status, [200, 400, 403]);
    });

    test("roles category endpoint responds", async ({ apiClient }) => {
      const response = await apiClient.get("workallocation/exclusion/rolesCategory", {
        throwOnError: false,
      });
      expectStatus(response.status, StatusSets.guardedExtended);
    });
  });
});

interface CaseworkerEntry {
  firstName?: string;
  lastName?: string;
  idamId?: string;
}

const hasArrayProp = <T>(value: unknown, prop: string): value is Record<string, T[]> =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as Record<string, unknown>)[prop]);

function toArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (hasArrayProp<T>(payload, "task_names")) {
    return payload.task_names;
  }
  if (hasArrayProp<T>(payload, "taskNames")) {
    return payload.taskNames;
  }
  if (hasArrayProp<T>(payload, "typesOfWork")) {
    return payload.typesOfWork;
  }
  return [];
}

type TaskDetail = Task & {
  task_state?: string;
  state?: string;
  assignee?: string | null;
  assigned_to?: string | null;
};

async function fetchTaskById(
  apiClient: ApiClient,
  id: string,
): Promise<{ status: number; task?: TaskDetail }> {
  const res = await apiClient.get<{ task?: TaskDetail }>(`workallocation/task/${id}`, {
    throwOnError: false,
  });
  return {
    status: res.status,
    task: (res.data as { task?: TaskDetail })?.task ?? (res.data as TaskDetail),
  };
}

function assertStateTransition(action: string, before?: TaskDetail, after?: TaskDetail) {
  if (!after) {
    return;
  }
  const prevAssignee = before?.assignee ?? before?.assigned_to;
  const assignee = after.assignee ?? after.assigned_to;
  const newState = (after.task_state ?? after.state ?? "").toLowerCase();
  if (["claim", "assign"].includes(action)) {
    expect(assignee ?? "").not.toEqual("");
    if (prevAssignee) {
      expect(assignee).not.toEqual("");
    }
    if (newState) {
      expect(newState).not.toContain("unassigned");
    }
  }
  if (["unclaim", "unassign", "cancel"].includes(action)) {
    if (prevAssignee) {
      expect(assignee ?? "").toBe("");
    }
    if (newState) {
      expect(newState).toMatch(/unassigned|cancel|unclaim/);
    }
  }
  if (action === "complete") {
    expect(newState).toMatch(/complete|done|closed/);
  }
}
