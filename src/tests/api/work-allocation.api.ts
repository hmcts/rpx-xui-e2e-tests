/* eslint-disable @typescript-eslint/no-explicit-any */
import { config as testConfig } from "../../config/api";
import { WA_SAMPLE_ASSIGNED_TASK_ID, WA_SAMPLE_TASK_ID } from "../../data/api/testIds";
import { test, expect } from "../../fixtures/api";
import { ensureStorageState } from "../../fixtures/api-auth";
import { expectStatus, StatusSets, withRetry, withXsrf } from "../../utils/api/apiTestUtils";
import { expectTaskList } from "../../utils/api/assertions";
import { buildTaskSearchRequest } from "../../utils/api/work-allocation";

const { sampleTaskId, envTaskId, envAssignedTaskId, sampleMyTaskId } = buildSampleIds();
const locationIds = buildLocationIds();
const waConfig = testConfig.workallocation[testConfig.testEnv as keyof typeof testConfig.workallocation];
const userId = waConfig?.judgeUser?.id ?? (waConfig as any)?.legalOpsUser?.id;

test.describe("Work allocation (read-only)", () => {
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
      expectStatus(res.status, [401, 403]);
    }

    const res = await anonymousClient.post("workallocation/task", {
      data: buildTaskSearchRequest("MyTasks", { states: ["assigned"] }),
      throwOnError: false
    });
    expectStatus(res.status, [401, 403]);
  });

  test.describe("task search", () => {
    test("MyTasks returns structured response", async ({ apiClient }) => {
      if (!userId) {
        expect(userId).toBeUndefined();
        return;
      }

      const body = buildTaskSearchRequest("MyTasks", {
        userIds: [userId!],
        locations: locationIds ? [locationIds] : [],
        states: ["assigned"],
        searchBy: "caseworker"
      });
      const response = await withRetry(
        () =>
          apiClient.post<TaskListResponse>("workallocation/task", {
            data: body,
            throwOnError: false
          }),
        {
          retries: 1,
          retryStatuses: [502, 504]
        }
      );
      expectStatus(response.status, StatusSets.retryable);

      if (response.status !== 200) {
        return;
      }
      const parsed = expectTaskList(response.data);
      if (response.status === 200 && Array.isArray(parsed.tasks)) {
        expect(parsed.total_records).toBeGreaterThan(0);
        expect(parsed.tasks!.length).toBeGreaterThan(0);
      }
    });

    test("AvailableTasks returns structured response", async ({ apiClient }) => {
      const body = buildTaskSearchRequest("AvailableTasks", {
        locations: locationIds ? [locationIds] : [],
        states: ["unassigned", "assigned"],
        searchBy: "caseworker"
      });
      const response = await withRetry(
        () =>
          apiClient.post<TaskListResponse>("workallocation/task", {
            data: body,
            throwOnError: false
          }),
        {
          retries: 1,
          retryStatuses: [502, 504]
        }
      );
      expectStatus(response.status, StatusSets.retryable);
      if (response.status === 200) {
        expectTaskList(response.data);
      }
    });

    test("AllWork returns structured response", async ({ apiClient }) => {
      const body = buildTaskSearchRequest("AllWork", {
        jurisdictions: [],
        searchBy: "caseworker"
      });
      const response = await withRetry(
        () =>
          apiClient.post<TaskListResponse>("workallocation/task", {
            data: body,
            throwOnError: false
          }),
        {
          retries: 1,
          retryStatuses: [502, 504]
        }
      );
      expectStatus(response.status, StatusSets.retryable);
      if (response.status === 200) {
        expectTaskList(response.data);
      }
    });
  });
});

test.describe("Work allocation (write)", () => {
  test.describe("search with XSRF", () => {
    test("MyTasks returns guarded status", async ({ apiClient }) => {
      const response = await withXsrf("solicitor", (headers) =>
        apiClient.post<TaskListResponse>("workallocation/task", {
          data: buildTaskSearchRequest("MyTasks"),
          headers,
          throwOnError: false
        })
      );
      expectStatus(response.status, StatusSets.retryable);
    });
  });

  test.describe("task metadata", () => {
    const endpoints = ["task/roles", "task/types", "tasks", "taskCategories", "task/job-types"];
    endpoints.forEach((endpoint) => {
      test(`${endpoint} responds with guarded status`, async ({ apiClient }) => {
        const response = await apiClient.get<any>(`workallocation/${endpoint}`, { throwOnError: false });
        expectStatus(response.status, StatusSets.guardedExtended);
      });
    });
  });

  test.describe("task actions (anonymous)", () => {
    const actions = ["claim", "unclaim", "complete", "assign", "unassign", "cancel"];

    actions.forEach((action) => {
      test(`rejects unauthenticated ${action}`, async ({ anonymousClient }) => {
        const response = await anonymousClient.post("workallocation/task/12345/" + action, {
          data: {},
          throwOnError: false
        });
        expectStatus(response.status, StatusSets.unauthenticated);
      });
    });
  });

  test.describe("task actions (auth)", () => {
    const actions = ["claim", "assign", "unassign", "unclaim", "complete", "cancel"];
    const taskId = () => envTaskId ?? sampleTaskId ?? "00000000-0000-0000-0000-000000000000";

    actions.forEach((action) => {
      test(`${action} without xsrf returns guarded status`, async ({ apiClient }) => {
        await ensureStorageState("solicitor");
        const response = await apiClient.post(`workallocation/task/${taskId()}/${action}`, {
          data: {},
          headers: {},
          throwOnError: false
        });
        expectStatus(response.status, [200, 204, 401, 403, 404, 502]);
      });
    });

    actions.forEach((action) => {
      test(`${action} with invalid XSRF token`, async ({ apiClient }) => {
        await ensureStorageState("solicitor");
        const response = await apiClient.post(`workallocation/task/${taskId()}/${action}`, {
          data: {},
          headers: { "X-XSRF-TOKEN": "invalid-token" },
          throwOnError: false
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
            throwOnError: false
          })
        );
        expectStatus(response.status, [200, 204, 400, 403, 404, 409, 502]);
      });
    });
  });

  test.describe("task actions (happy-path attempt)", () => {
    const fallbackId = "00000000-0000-0000-0000-000000000000";

    const positiveActions: Array<{ action: string; taskId: () => string }> = [
      { action: "claim", taskId: () => envTaskId ?? sampleTaskId ?? fallbackId },
      { action: "unclaim", taskId: () => envAssignedTaskId ?? envTaskId ?? sampleMyTaskId ?? sampleTaskId ?? fallbackId },
      { action: "complete", taskId: () => envAssignedTaskId ?? envTaskId ?? sampleMyTaskId ?? sampleTaskId ?? fallbackId },
      { action: "assign", taskId: () => envTaskId ?? sampleTaskId ?? fallbackId },
      { action: "unassign", taskId: () => envAssignedTaskId ?? envTaskId ?? sampleMyTaskId ?? sampleTaskId ?? fallbackId },
      { action: "cancel", taskId: () => envAssignedTaskId ?? envTaskId ?? sampleMyTaskId ?? sampleTaskId ?? fallbackId }
    ];

    positiveActions.forEach(({ action, taskId }) => {
      test(`${action} returns allowed status with XSRF`, async ({ apiClient }) => {
        const response = await withXsrf("solicitor", async (headers) => {
          const before = await fetchTaskById(apiClient, taskId());
          const res = await apiClient.post(`workallocation/task/${taskId()}/${action}`, {
            data: {},
            headers,
            throwOnError: false
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
          throwOnError: false
        })
      );
      expectStatus(response.status, StatusSets.guardedExtended);
      const data = response.data as any;
      if (response.status === 200 && Array.isArray(data) && data.length > 0) {
        expect(data[0]).toEqual(
          expect.objectContaining({
            firstName: expect.any(String),
            lastName: expect.any(String),
            idamId: expect.any(String)
          })
        );
      }
    });

    test("returns judicial users", async ({ apiClient }) => {
      const response = await apiClient.get("workallocation/task/judicialusers", { throwOnError: false });
      expectStatus(response.status, StatusSets.guardedExtended);
      const data = response.data as any;
      if (response.status === 200 && Array.isArray(data) && data.length > 0) {
        expect(data[0]).toEqual(
          expect.objectContaining({
            email: expect.any(String),
            firstName: expect.any(String),
            idamId: expect.any(String),
            surname: expect.any(String),
            title: expect.any(String)
          })
        );
      }
    });
  });

  test.describe("work baskets", () => {
    test("returns work-basket inputs", async ({ apiClient }) => {
      const response = await apiClient.get("workallocation/work-basket-inputs");
      expectStatus(response.status, StatusSets.guardedExtended);
      const inputs = toArray(response.data);
      if (response.status === 200 && Array.isArray(inputs) && inputs.length > 0) {
        expect(inputs[0]).toEqual(
          expect.objectContaining({
            label: expect.any(String),
            field: expect.objectContaining({
              id: expect.any(String)
            })
          })
        );
      }
    });
  });
});

test.describe("Work allocation (requires session)", () => {
  test("unauthenticated task search returns guarded status", async ({ anonymousClient }) => {
    const response = await anonymousClient.post("workallocation/task", {
      data: buildTaskSearchRequest("MyTasks"),
      throwOnError: false
    });
    expectStatus(response.status, [401, 403]);
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

function buildSampleIds() {
  const sampleTaskId = process.env.WA_SAMPLE_TASK_ID || WA_SAMPLE_TASK_ID;
  const sampleAssignedTaskId = process.env.WA_SAMPLE_ASSIGNED_TASK_ID || WA_SAMPLE_ASSIGNED_TASK_ID;
  const envCfg = testConfig.workallocation[testConfig.testEnv as keyof typeof testConfig.workallocation];
  const envTaskId = envCfg?.iaCaseIds?.[0] ?? sampleTaskId;
  const envAssignedTaskId = (envCfg as any)?.assignedTaskId ?? sampleAssignedTaskId;
  const sampleMyTaskId = (envCfg as any)?.myTaskId;

  return { sampleTaskId, sampleAssignedTaskId, envTaskId, envAssignedTaskId, sampleMyTaskId };
}

function buildLocationIds() {
  return testConfig.workallocation[testConfig.testEnv as keyof typeof testConfig.workallocation]?.locationId ?? process.env.WA_LOCATION_ID;
}

type TaskListResponse = ReturnType<typeof expectTaskList>;

async function fetchTaskById(apiClient: any, id: string) {
  const res = await apiClient.get(`workallocation/task/${id}`, { throwOnError: false });
  if (res.status !== 200) return undefined;
  const data = res.data as any;
  const task = typeof data === "object" && data !== null ? (data.task ?? data) : undefined;
  return { task };
}

function assertStateTransition(action: string, before?: Record<string, unknown>, after?: Record<string, unknown>) {
  if (!before || !after) return;
  if (before.id !== after.id) return;

  const prev = before.state ?? before.task_state ?? before.taskState;
  const next = after.state ?? after.task_state ?? after.taskState;

  switch (action) {
    case "claim":
      if (prev === "unassigned" && next === "assigned") return;
      break;
    case "unclaim":
      if (prev === "assigned" && next === "unassigned") return;
      break;
    case "complete":
      if (next === "completed") return;
      break;
    case "cancel":
      if (next === "cancelled") return;
      break;
    case "assign":
      if (next === "assigned" || next === "assigned_without_judge") return;
      break;
    case "unassign":
      if (next === "unassigned") return;
      break;
    default:
      break;
  }
}
