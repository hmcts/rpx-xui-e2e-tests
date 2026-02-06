import { test, expect } from "@playwright/test";

import {
  LocationBuilder,
  TaskBuilder,
  TaskListBuilder,
  TaskSearchBuilder,
  TestData,
  UserDetailsBuilder,
} from "../../utils/api/testDataBuilders";
import {
  buildTaskSearchRequest,
  seedTaskId,
} from "../../utils/api/work-allocation";

test.describe("Builder and task helper coverage", () => {
  const taskStateCases = [
    {
      title: "assigned task builder sets assignee",
      build: () => new TaskBuilder().assigned("user-1").build(),
      assert: (task: { task_state?: string; assignee?: string | null }) => {
        expect(task.task_state).toBe("assigned");
        expect(task.assignee).toBe("user-1");
      },
    },
    {
      title: "unassigned task builder clears assignee",
      build: () => new TaskBuilder().unassigned().build(),
      assert: (task: { task_state?: string; assignee?: string | null }) => {
        expect(task.task_state).toBe("unassigned");
        expect(task.assignee).toBeNull();
      },
    },
    {
      title: "completed task builder sets completed state",
      build: () => new TaskBuilder().completed().build(),
      assert: (task: { task_state?: string }) => {
        expect(task.task_state).toBe("completed");
      },
    },
    {
      title: "cancelled task builder sets cancelled state",
      build: () => new TaskBuilder().cancelled().build(),
      assert: (task: { task_state?: string }) => {
        expect(task.task_state).toBe("cancelled");
      },
    },
  ];

  taskStateCases.forEach(({ title, build, assert }) => {
    // Generated table-driven cases intentionally use dynamic titles.
    // eslint-disable-next-line playwright/valid-title
    test(title, () => {
      assert(build());
    });
  });

  test("task builder default payload contains stable defaults", () => {
    const task = new TaskBuilder().build();
    expect(task.id).toBe("default-task-id");
    expect(task.task_state).toBe("unassigned");
    expect(task.task_title).toBe("Default Task");
  });

  test("task builder withId sets id", () => {
    const task = new TaskBuilder().withId("task-123").build();
    expect(task.id).toBe("task-123");
  });

  test("task builder withTitle sets title", () => {
    const task = new TaskBuilder().withTitle("Review bundle").build();
    expect(task.task_title).toBe("Review bundle");
  });

  test("task builder withCase sets id and explicit name", () => {
    const task = new TaskBuilder()
      .withCase("1616161616161616", "Case A")
      .build();
    expect(task.case_id).toBe("1616161616161616");
    expect(task.case_name).toBe("Case A");
  });

  test("task builder withCase derives fallback case name", () => {
    const task = new TaskBuilder().withCase("1717171717171717").build();
    expect(task.case_name).toBe("Case 1717171717171717");
  });

  test("task builder atLocation sets location", () => {
    const task = new TaskBuilder().atLocation("Taylor House").build();
    expect(task.location_name).toBe("Taylor House");
  });

  test("task builder createdOn accepts ISO string", () => {
    const task = new TaskBuilder()
      .createdOn("2026-01-01T00:00:00.000Z")
      .build();
    expect(task.created_date).toBe("2026-01-01T00:00:00.000Z");
  });

  test("task builder createdOn accepts Date input", () => {
    const task = new TaskBuilder()
      .createdOn(new Date("2026-01-02T00:00:00.000Z"))
      .build();
    expect(task.created_date).toBe("2026-01-02T00:00:00.000Z");
  });

  test("task builder dueOn accepts ISO string", () => {
    const task = new TaskBuilder().dueOn("2026-01-03T00:00:00.000Z").build();
    expect(task.due_date).toBe("2026-01-03T00:00:00.000Z");
  });

  test("task builder dueOn accepts Date input", () => {
    const task = new TaskBuilder()
      .dueOn(new Date("2026-01-04T00:00:00.000Z"))
      .build();
    expect(task.due_date).toBe("2026-01-04T00:00:00.000Z");
  });

  test("task builder overdue creates a past due date", () => {
    const task = new TaskBuilder().overdue().build();
    const now = Date.now();
    expect(typeof task.due_date).toBe("string");
    expect(new Date(task.due_date as string).getTime()).toBeLessThanOrEqual(
      now,
    );
  });

  [0, 1, 3].forEach((count) => {
    test(`task builder buildMany creates ${count} tasks`, () => {
      const tasks = new TaskBuilder().withId("seed-task").buildMany(count);
      expect(tasks).toHaveLength(count);
      tasks.forEach((task, index) => {
        expect(task.id).toBe(`seed-task-${index}`);
      });
    });
  });

  test("task list builder withTasks sets tasks and total", () => {
    const tasks = new TaskBuilder().buildMany(2);
    const list = new TaskListBuilder().withTasks(tasks).build();
    expect(list.tasks).toHaveLength(2);
    expect(list.total_records).toBe(2);
  });

  test("task list builder addTask appends entries", () => {
    const first = new TaskBuilder().withId("a").build();
    const second = new TaskBuilder().withId("b").build();
    const list = new TaskListBuilder().addTask(first).addTask(second).build();
    expect(list.tasks).toHaveLength(2);
    expect(list.total_records).toBe(2);
  });

  test("task list builder withTotalRecords overrides total", () => {
    const list = new TaskListBuilder()
      .withTasks(new TaskBuilder().buildMany(1))
      .withTotalRecords(50)
      .build();
    expect(list.total_records).toBe(50);
  });

  test("task list builder empty clears list", () => {
    const list = new TaskListBuilder()
      .withTasks(new TaskBuilder().buildMany(2))
      .empty()
      .build();
    expect(list.tasks).toEqual([]);
    expect(list.total_records).toBe(0);
  });

  const searchViewCases = ["MyTasks", "AllWork", "AvailableTasks"] as const;
  searchViewCases.forEach((view) => {
    test(`task search builder supports ${view} view`, () => {
      const payload = new TaskSearchBuilder().view(view).build();
      expect(payload.view).toBe(view);
    });
  });

  test("task search builder inLocations appends location filter", () => {
    const payload = new TaskSearchBuilder()
      .inLocations(["loc-1", "loc-2"])
      .build();
    const searchRequest = payload.searchRequest as Array<{
      key: string;
      values: string[];
    }>;
    const locationFilter = searchRequest.find(
      (entry) => entry.key === "location",
    );
    expect(locationFilter).toEqual({
      key: "location",
      operator: "IN",
      values: ["loc-1", "loc-2"],
    });
  });

  test("task search builder withStates appends state filter", () => {
    const payload = new TaskSearchBuilder().withStates(["assigned"]).build();
    const searchRequest = payload.searchRequest as Array<{
      key: string;
      values: string[];
    }>;
    const stateFilter = searchRequest.find((entry) => entry.key === "state");
    expect(stateFilter).toEqual({
      key: "state",
      operator: "IN",
      values: ["assigned"],
    });
  });

  test("task search builder forJurisdiction appends EQUAL filter", () => {
    const payload = new TaskSearchBuilder().forJurisdiction("IA").build();
    const searchRequest = payload.searchRequest as Array<{
      key: string;
      operator: string;
    }>;
    const jurisdictionFilter = searchRequest.find(
      (entry) => entry.key === "jurisdiction",
    );
    expect(jurisdictionFilter?.key).toBe("jurisdiction");
    expect(jurisdictionFilter?.operator).toBe("EQUAL");
  });

  test("task search builder searchByCaseworker sets searchBy", () => {
    const payload = new TaskSearchBuilder().searchByCaseworker().build();
    expect(payload.searchBy).toBe("caseworker");
  });

  test("task search builder paginate sets first and pageSize", () => {
    const payload = new TaskSearchBuilder().paginate(5, 25).build();
    expect(payload.first).toBe(5);
    expect(payload.pageSize).toBe(25);
  });

  test("task search builder sortBy sets field and order", () => {
    const payload = new TaskSearchBuilder().sortBy("dueDate", "desc").build();
    expect(payload.sortedBy).toEqual({ field: "dueDate", order: "desc" });
  });

  test("task search builder composes chained filters", () => {
    const payload = new TaskSearchBuilder()
      .view("AllWork")
      .inLocations(["loc-1"])
      .withStates(["assigned", "unassigned"])
      .forJurisdiction("CIVIL")
      .searchByCaseworker()
      .paginate(0, 50)
      .sortBy("createdDate", "asc")
      .build();
    const searchRequest = payload.searchRequest as Array<{ key: string }>;
    expect(payload.view).toBe("AllWork");
    const keys = searchRequest.map((entry) => entry.key);
    expect(keys).toHaveLength(3);
    expect(new Set(keys)).toEqual(
      new Set(["location", "state", "jurisdiction"]),
    );
  });

  test("location builder populates defaults", () => {
    const location = new LocationBuilder().build();
    expect(location.id).toBe("default-location-id");
    expect(location.locationName).toBe("Default Location");
  });

  test("location builder supports fluent setters", () => {
    const location = new LocationBuilder()
      .withId("loc-123")
      .withName("Birmingham")
      .withServices(["IA", "CIVIL"])
      .build();
    expect(location).toEqual({
      id: "loc-123",
      locationName: "Birmingham",
      services: ["IA", "CIVIL"],
    });
  });

  [1, 3].forEach((count) => {
    test(`location builder buildMany creates ${count} entries`, () => {
      const locations = new LocationBuilder().withId("base").buildMany(count);
      expect(locations).toHaveLength(count);
      locations.forEach((location, index) => {
        expect(location.id).toBe(`base-${index}`);
      });
    });
  });

  test("user details builder defaults include userInfo", () => {
    const user = new UserDetailsBuilder().build();
    expect((user.userInfo as { id?: string }).id).toBe("default-user-id");
  });

  test("user details builder withId updates id and uid", () => {
    const user = new UserDetailsBuilder().withId("new-user").build();
    expect((user.userInfo as { id?: string; uid?: string }).id).toBe(
      "new-user",
    );
    expect((user.userInfo as { id?: string; uid?: string }).uid).toBe(
      "new-user",
    );
  });

  test("user details builder withEmail and withName update fields", () => {
    const user = new UserDetailsBuilder()
      .withEmail("person@example.com")
      .withName("Person One")
      .build();
    expect((user.userInfo as { email?: string; name?: string }).email).toBe(
      "person@example.com",
    );
    expect((user.userInfo as { email?: string; name?: string }).name).toBe(
      "Person One",
    );
  });

  test("user details builder withRoles creates roleAssignmentInfo entries", () => {
    const user = new UserDetailsBuilder().withRoles(["caseworker-ia"]).build();
    const roles = user.roleAssignmentInfo as Array<{ roleName: string }>;
    expect(roles).toHaveLength(1);
    expect(roles[0].roleName).toBe("caseworker-ia");
  });

  test("TestData.task returns default task", () => {
    const task = TestData.task();
    expect(task.id).toBe("default-task-id");
  });

  test("TestData.assignedTask sets assignee", () => {
    const task = TestData.assignedTask("abc");
    expect(task.task_state).toBe("assigned");
    expect(task.assignee).toBe("abc");
  });

  test("TestData.unassignedTask clears assignee", () => {
    const task = TestData.unassignedTask();
    expect(task.task_state).toBe("unassigned");
    expect(task.assignee).toBeNull();
  });

  [0, 2, 5].forEach((count) => {
    test(`TestData.taskList builds ${count} task rows`, () => {
      const list = TestData.taskList(count);
      expect(list.tasks).toHaveLength(count);
      expect(list.total_records).toBe(count);
    });
  });

  test("TestData.emptyTaskList returns an empty list", () => {
    const list = TestData.emptyTaskList();
    expect(list.tasks).toEqual([]);
    expect(list.total_records).toBe(0);
  });

  test("TestData.location returns a location payload", () => {
    const location = TestData.location("L1", "Leeds");
    expect(location.id).toBe("L1");
    expect(location.locationName).toBe("Leeds");
  });

  test("TestData.user returns a user payload", () => {
    const user = TestData.user("U1", "u1@example.com");
    expect((user.userInfo as { id?: string }).id).toBe("U1");
    expect((user.userInfo as { email?: string }).email).toBe("u1@example.com");
  });

  test("buildTaskSearchRequest default payload is stable", () => {
    const payload = buildTaskSearchRequest("MyTasks");
    expect(payload.view).toBe("MyTasks");
    expect(payload.searchRequest.search_by).toBe("caseworker");
    expect(payload.searchRequest.search_parameters).toEqual([]);
    expect(payload.searchRequest.pagination_parameters).toEqual({
      page_number: 1,
      page_size: 25,
    });
  });

  const searchFilterCases = [
    {
      title: "adds user filter",
      options: { userIds: ["u-1"] },
      key: "user",
    },
    {
      title: "adds location filter",
      options: { locations: ["loc-1"] },
      key: "location",
    },
    {
      title: "adds jurisdiction filter",
      options: { jurisdictions: ["IA"] },
      key: "jurisdiction",
    },
    {
      title: "adds task type filter",
      options: { taskTypes: ["review"] },
      key: "taskType",
    },
    {
      title: "adds state filter",
      options: { states: ["assigned"] },
      key: "state",
    },
  ] as const;

  searchFilterCases.forEach(({ title, options, key }) => {
    test(`buildTaskSearchRequest ${title}`, () => {
      const payload = buildTaskSearchRequest("AllWork", options);
      const keys = payload.searchRequest.search_parameters.map(
        (entry) => entry.key,
      );
      expect(keys).toContain(key);
    });
  });

  test("buildTaskSearchRequest supports custom paging and search mode", () => {
    const payload = buildTaskSearchRequest("AvailableTasks", {
      pageNumber: 3,
      pageSize: 15,
      searchBy: "judge",
    });
    expect(payload.searchRequest.search_by).toBe("judge");
    expect(payload.searchRequest.pagination_parameters).toEqual({
      page_number: 3,
      page_size: 15,
    });
  });

  test("buildTaskSearchRequest preserves sorting defaults", () => {
    const payload = buildTaskSearchRequest("AllWork");
    expect(payload.searchRequest.sorting_parameters).toEqual([
      { sort_by: "dueDate", sort_order: "asc" },
    ]);
  });

  test("buildTaskSearchRequest with full options includes five filters", () => {
    const payload = buildTaskSearchRequest("MyTasks", {
      userIds: ["u-1"],
      locations: ["loc-1"],
      jurisdictions: ["IA"],
      taskTypes: ["review"],
      states: ["assigned"],
    });
    expect(payload.searchRequest.search_parameters).toHaveLength(5);
  });

  test("seedTaskId returns assigned task from first successful query", async () => {
    const apiClient = {
      post: async () => ({
        status: 200,
        data: { tasks: [{ id: "task-assigned" }] },
      }),
    };
    const seeded = await seedTaskId(apiClient, "loc-1");
    expect(seeded).toEqual({ id: "task-assigned", type: "assigned" });
  });

  test("seedTaskId falls back to unassigned when first result is empty", async () => {
    let calls = 0;
    const apiClient = {
      post: async () => {
        calls += 1;
        return calls === 1
          ? { status: 200, data: { tasks: [] } }
          : { status: 200, data: { tasks: [{ id: "task-unassigned" }] } };
      },
    };
    const seeded = await seedTaskId(apiClient, "loc-1");
    expect(seeded).toEqual({ id: "task-unassigned", type: "unassigned" });
  });

  test("seedTaskId returns undefined when no tasks are found", async () => {
    const apiClient = {
      post: async () => ({ status: 200, data: { tasks: [] } }),
    };
    await expect(seedTaskId(apiClient)).resolves.toBeUndefined();
  });

  test("seedTaskId returns undefined when response is non-200", async () => {
    const apiClient = {
      post: async () => ({ status: 500, data: { tasks: [{ id: "task-1" }] } }),
    };
    await expect(seedTaskId(apiClient)).resolves.toBeUndefined();
  });

  test("seedTaskId returns undefined when tasks field is missing", async () => {
    const apiClient = {
      post: async () => ({ status: 200, data: {} }),
    };
    await expect(seedTaskId(apiClient)).resolves.toBeUndefined();
  });

  test("seedTaskId returns undefined when first task has no id", async () => {
    const apiClient = {
      post: async () => ({ status: 200, data: { tasks: [{}] } }),
    };
    await expect(seedTaskId(apiClient)).resolves.toBeUndefined();
  });

  test("seedTaskId rejects when client throws unexpectedly", async () => {
    const apiClient = {
      post: async () => {
        throw new Error("network");
      },
    };
    await expect(seedTaskId(apiClient)).rejects.toThrow("network");
  });

  test("seedTaskId includes provided location in search payload", async () => {
    const recordedBodies: Array<Record<string, unknown>> = [];
    const apiClient = {
      post: async (_path: string, opts: { data?: Record<string, unknown> }) => {
        if (opts.data) recordedBodies.push(opts.data);
        return { status: 200, data: { tasks: [{ id: "task-1" }] } };
      },
    };
    await seedTaskId(apiClient, "loc-xyz");
    const firstBody = recordedBodies[0] as {
      searchRequest: {
        search_parameters: Array<{ key: string; values: string[] }>;
      };
    };
    const locationFilter = firstBody.searchRequest.search_parameters.find(
      (entry) => entry.key === "location",
    );
    expect(locationFilter?.values).toEqual(["loc-xyz"]);
  });
});
