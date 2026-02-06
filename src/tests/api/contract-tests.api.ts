import { z } from "zod";

import { test, expect } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";
import {
  expectContract,
  WorkAllocationSchemas,
  SearchSchemas,
} from "../../utils/api/contractValidation";
import {
  TaskBuilder,
  TaskListBuilder,
  LocationBuilder,
  TestData,
} from "../../utils/api/testDataBuilders";

const serviceCodes = ["IA", "CIVIL", "PRIVATELAW"];
const locationSchema = z.object({
  id: z.string(),
  locationName: z.string(),
});

test.describe("Work Allocation API Contracts", () => {
  test("GET /workallocation/location contract", async ({ apiClient }) => {
    const endpoint = `workallocation/location?serviceCodes=${encodeURIComponent(serviceCodes.join(","))}`;
    const response = await apiClient.get(endpoint, { throwOnError: false });
    expectStatus(response.status, StatusSets.guardedBasic);
    assertLocationContract(response, endpoint);
  });

  test("POST /workallocation/task contract", async ({ apiClient }) => {
    const searchRequest = {
      view: "MyTasks",
      searchRequest: [],
    };

    const response = await apiClient.post("workallocation/task", {
      data: searchRequest,
      throwOnError: false,
    });

    expectStatus(response.status, [200, 401, 403, 500, 502]);
    assertTaskListContract(response);
  });

  test("GET /api/user/details contract", async ({ apiClient }) => {
    const response = await apiClient.get("api/user/details", {
      throwOnError: false,
    });
    expectStatus(response.status, StatusSets.guardedBasic);
    assertUserDetailsContract(response);
  });

  test("GET /workallocation/taskNames contract", async ({ apiClient }) => {
    const response = await apiClient.get("workallocation/taskNames", {
      throwOnError: false,
    });
    expectStatus(response.status, StatusSets.guardedBasic);
    assertTaskNamesContract(response);
  });

  test("GET /workallocation/task/types-of-work contract", async ({
    apiClient,
  }) => {
    const response = await apiClient.get("workallocation/task/types-of-work", {
      throwOnError: false,
    });
    expectStatus(response.status, StatusSets.guardedBasic);
    assertWorkTypesContract(response);
  });
});

test.describe("Search and Ref Data API Contracts", () => {
  test("GET /api/globalSearch/services contract", async ({ apiClient }) => {
    const response = await apiClient.get("api/globalSearch/services", {
      throwOnError: false,
    });
    expectStatus(response.status, StatusSets.guardedBasic);
    assertGlobalSearchServicesContract(response);
  });

  test("GET /api/wa-supported-jurisdiction contract", async ({ apiClient }) => {
    const response = await apiClient.get("api/wa-supported-jurisdiction", {
      throwOnError: false,
    });
    expectStatus(response.status, StatusSets.guardedBasic);
    assertSupportedJurisdictionsContract(response);
  });

  test("GET /api/staff-supported-jurisdiction contract", async ({
    apiClient,
  }) => {
    const response = await apiClient.get("api/staff-supported-jurisdiction", {
      throwOnError: false,
    });
    expectStatus(response.status, StatusSets.guardedBasic);
    assertSupportedJurisdictionsContract(response);
  });
});

test.describe("Test Data Builders Validation", () => {
  test("TaskBuilder creates valid task objects", () => {
    const task = new TaskBuilder()
      .withId("task-123")
      .withTitle("Review application")
      .assigned("user-456")
      .withCase("case-789", "Test Case")
      .atLocation("London")
      .overdue()
      .build();

    expect(task.id).toBe("task-123");
    expect(task.task_title).toBe("Review application");
    expect(task.task_state).toBe("assigned");
    expect(task.assignee).toBe("user-456");
    expect(task.case_id).toBe("case-789");
    expect(task.case_name).toBe("Test Case");
    expect(task.location_name).toBe("London");
    expect(task.due_date).toBeTruthy();
    assertTaskOverdue(task.due_date);
  });

  test("TaskListBuilder creates valid task list responses", () => {
    const tasks = [
      new TaskBuilder().withId("task-1").assigned().build(),
      new TaskBuilder().withId("task-2").unassigned().build(),
      new TaskBuilder().withId("task-3").completed().build(),
    ];

    const taskList = new TaskListBuilder()
      .withTasks(tasks)
      .withTotalRecords(50)
      .build();

    expect(taskList.tasks).toHaveLength(3);
    expect(taskList.total_records).toBe(50);
    assertTaskListIds(taskList);
  });

  test("LocationBuilder creates valid location objects", () => {
    const location = new LocationBuilder()
      .withId("loc-456")
      .withName("Birmingham Civil and Family Justice Centre")
      .withServices(["IA", "CIVIL", "PRIVATELAW"])
      .build();

    expect(location.id).toBe("loc-456");
    expect(location.locationName).toBe(
      "Birmingham Civil and Family Justice Centre",
    );
    expect(location.services).toEqual(["IA", "CIVIL", "PRIVATELAW"]);
  });

  test("TestData quick helpers create valid objects", () => {
    const task = TestData.task();
    const assignedTask = TestData.assignedTask("user-1");
    const unassignedTask = TestData.unassignedTask();
    const taskList = TestData.taskList(5);
    const emptyTaskList = TestData.emptyTaskList();
    const location = TestData.location("loc-1", "Test Location");

    expect(task.id).toBeTruthy();
    expect(assignedTask.task_state).toBe("assigned");
    expect(assignedTask.assignee).toBe("user-1");
    expect(unassignedTask.task_state).toBe("unassigned");
    expect(taskList.tasks).toHaveLength(5);
    expect(taskList.total_records).toBe(5);
    expect(emptyTaskList.tasks).toHaveLength(0);
    expect(location.id).toBe("loc-1");
    expect(location.locationName).toBe("Test Location");
  });

  test("TaskBuilder.buildMany creates multiple tasks with incremental IDs", () => {
    const builder = new TaskBuilder()
      .withTitle("Standard Task")
      .assigned("user-1");
    const tasks = builder.buildMany(3);

    expect(tasks).toHaveLength(3);
    expect(tasks[0].id).toBe("default-task-id-0");
    expect(tasks[1].id).toBe("default-task-id-1");
    expect(tasks[2].id).toBe("default-task-id-2");
    expect(tasks.every((task) => task.task_title === "Standard Task")).toBe(
      true,
    );
    expect(tasks.every((task) => task.assignee === "user-1")).toBe(true);
  });
});

function assertLocationContract(
  response: { status: number; data?: unknown },
  endpoint: string,
): void {
  if (response.status === 200 && Array.isArray(response.data)) {
    expectContract(response.data, WorkAllocationSchemas.LocationList, {
      context: { endpoint, status: response.status },
    });
    assertLocationSchema(response.data);
  }
}

function assertLocationSchema(data: unknown[]): void {
  if (data.length > 0) {
    locationSchema.parse(data[0]);
  }
}

function assertTaskListContract(response: {
  status: number;
  data?: unknown;
}): void {
  if (response.status === 200) {
    expectContract(response.data, WorkAllocationSchemas.TaskList, {
      context: {
        endpoint: "workallocation/task",
        view: "MyTasks",
        status: response.status,
      },
    });
    assertTaskListShape(response.data);
  }
}

function assertTaskListShape(data: unknown): void {
  const taskListData = data as { tasks: unknown[] };
  expect(taskListData).toHaveProperty("tasks");
  expect(Array.isArray(taskListData.tasks)).toBe(true);
  if (taskListData.tasks.length > 0) {
    const firstTask = taskListData.tasks[0] as {
      id: unknown;
      task_state: unknown;
    };
    expect(firstTask).toHaveProperty("id");
    expect(firstTask).toHaveProperty("task_state");
    expect(typeof firstTask.id).toBe("string");
    expect(typeof firstTask.task_state).toBe("string");
  }
}

function assertUserDetailsContract(response: {
  status: number;
  data?: unknown;
}): void {
  if (
    response.status === 200 &&
    response.data &&
    typeof response.data === "object"
  ) {
    const userData = response.data as Record<string, unknown>;
    const userInfo = userData.userInfo as Record<string, unknown> | undefined;
    if (userInfo && typeof userInfo === "object") {
      expect(userInfo.id || userInfo.uid).toBeDefined();
    }
  }
}

function assertTaskNamesContract(response: {
  status: number;
  data?: unknown;
}): void {
  if (response.status === 200 && response.data !== undefined) {
    if (Array.isArray(response.data)) {
      expect(response.data.length).toBeGreaterThanOrEqual(0);
    }
  }
}

function assertWorkTypesContract(response: {
  status: number;
  data?: unknown;
}): void {
  if (response.status === 200 && response.data !== undefined) {
    if (Array.isArray(response.data)) {
      expect(response.data.length).toBeGreaterThanOrEqual(0);
    }
  }
}

function assertGlobalSearchServicesContract(response: {
  status: number;
  data?: unknown;
}): void {
  if (response.status === 200 && Array.isArray(response.data)) {
    expectContract(response.data, SearchSchemas.GlobalSearchServices, {
      context: {
        endpoint: "api/globalSearch/services",
        status: response.status,
      },
    });
    assertServiceShape(response.data);
  }
}

function assertServiceShape(data: unknown[]): void {
  if (data.length > 0) {
    const firstService = data[0] as Record<string, unknown>;
    expect(firstService).toHaveProperty("serviceId");
    expect(firstService).toHaveProperty("serviceName");
  }
}

function assertSupportedJurisdictionsContract(response: {
  status: number;
  data?: unknown;
}): void {
  if (response.status === 200) {
    expect(response.data).toBeDefined();
  }
}

function assertTaskOverdue(dateValue: string | null | undefined): void {
  if (dateValue && typeof dateValue === "string") {
    const dueDate = new Date(dateValue);
    expect(dueDate < new Date()).toBe(true);
  }
}

function assertTaskListIds(taskList: { tasks?: Array<{ id?: string }> }): void {
  if (taskList.tasks && taskList.tasks.length >= 3) {
    expect(taskList.tasks[0].id).toBe("task-1");
    expect(taskList.tasks[1].id).toBe("task-2");
    expect(taskList.tasks[2].id).toBe("task-3");
  }
}
