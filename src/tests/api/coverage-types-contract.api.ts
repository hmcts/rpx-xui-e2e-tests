import { test, expect } from "@playwright/test";

import {
  assertContract,
  expectContract,
  type Schema,
  SearchSchemas,
  validateSchema,
  WorkAllocationSchemas,
} from "../../utils/api/contractValidation";
import {
  AnnotationPayloadSchema,
  AddressLookupResponseSchema,
  BookmarkPayloadSchema,
  CaseShareResponseSchema,
  extractCaseShareEntries,
  isTaskList,
  RoleAssignmentContainerSchema,
  RoleAssignmentSchema,
  TaskListSchema,
  TaskSchema,
} from "../../utils/api/types";

test.describe("Types and contract validation coverage", () => {
  const taskListGuardCases: Array<{
    name: string;
    payload: unknown;
    expected: boolean;
  }> = [
    {
      name: "accepts empty tasks list",
      payload: { tasks: [] },
      expected: true,
    },
    {
      name: "accepts populated tasks list",
      payload: { tasks: [{ id: "task-1", task_state: "assigned" }] },
      expected: true,
    },
    {
      name: "rejects object without tasks",
      payload: { total_records: 1 },
      expected: false,
    },
    { name: "rejects null payload", payload: null, expected: false },
    { name: "rejects primitive payload", payload: "bad", expected: false },
    {
      name: "rejects tasks as non-array",
      payload: { tasks: {} },
      expected: false,
    },
  ];

  taskListGuardCases.forEach(({ name, payload, expected }) => {
    test(`isTaskList ${name}`, () => {
      expect(isTaskList(payload)).toBe(expected);
    });
  });

  const caseShareCases = [
    {
      title: "extracts direct cases array",
      payload: { cases: [{ caseId: "1111" }] },
      property: "cases",
      expectedLength: 1,
    },
    {
      title: "extracts direct users array",
      payload: { users: [{ userIdentifier: "u1" }] },
      property: "users",
      expectedLength: 1,
    },
    {
      title: "extracts nested payload cases array",
      payload: { payload: { cases: [{ caseId: "2222" }] } },
      property: "cases",
      expectedLength: 1,
    },
    {
      title: "returns empty when property missing",
      payload: { payload: { users: [] } },
      property: "cases",
      expectedLength: 0,
    },
    {
      title: "returns empty for null payload",
      payload: null,
      property: "cases",
      expectedLength: 0,
    },
    {
      title: "returns empty for non-object payload",
      payload: "text",
      property: "cases",
      expectedLength: 0,
    },
    {
      title: "returns empty for nested non-array property",
      payload: { payload: { cases: {} } },
      property: "cases",
      expectedLength: 0,
    },
    {
      title: "returns empty for direct non-array property",
      payload: { cases: {} },
      property: "cases",
      expectedLength: 0,
    },
  ];

  caseShareCases.forEach(({ title, payload, property, expectedLength }) => {
    test(`extractCaseShareEntries ${title}`, () => {
      const entries = extractCaseShareEntries(
        payload as unknown as Record<string, unknown>,
        property,
      );
      expect(entries).toHaveLength(expectedLength);
    });
  });

  test("TaskSchema accepts minimal valid task", () => {
    const parsed = TaskSchema.parse({ id: "task-1", task_state: "assigned" });
    expect(parsed.id).toBe("task-1");
  });

  test("TaskSchema accepts nullable assignee", () => {
    const parsed = TaskSchema.parse({
      id: "task-2",
      task_state: "unassigned",
      assignee: null,
    });
    expect(parsed.assignee).toBeNull();
  });

  test("TaskSchema rejects empty id when provided", () => {
    expect(() =>
      TaskSchema.parse({ id: "", task_state: "assigned" }),
    ).toThrow();
  });

  test("TaskListSchema accepts task list with total_records", () => {
    const parsed = TaskListSchema.parse({
      tasks: [{ id: "task-1", task_state: "assigned" }],
      total_records: 1,
    });
    expect(parsed.total_records).toBe(1);
  });

  test("TaskListSchema rejects negative total_records", () => {
    expect(() =>
      TaskListSchema.parse({
        tasks: [],
        total_records: -1,
      }),
    ).toThrow();
  });

  test("TaskListSchema passthrough keeps extra fields", () => {
    const parsed = TaskListSchema.parse({
      tasks: [],
      total_records: 0,
      extra: "ok",
    });
    expect((parsed as Record<string, unknown>).extra).toBe("ok");
  });

  test("RoleAssignmentSchema accepts optional fields", () => {
    const parsed = RoleAssignmentSchema.parse({
      roleName: "caseworker-ia",
      actions: ["read", "update"],
    });
    expect(parsed.roleName).toBe("caseworker-ia");
  });

  test("RoleAssignmentSchema rejects invalid actions type", () => {
    expect(() =>
      RoleAssignmentSchema.parse({
        roleName: "caseworker-ia",
        actions: "read",
      }),
    ).toThrow();
  });

  test("RoleAssignmentContainerSchema accepts empty object", () => {
    const parsed = RoleAssignmentContainerSchema.parse({});
    expect(parsed).toEqual({});
  });

  test("RoleAssignmentContainerSchema accepts roleAssignmentResponse array", () => {
    const parsed = RoleAssignmentContainerSchema.parse({
      roleAssignmentResponse: [{ roleName: "role-1" }],
    });
    expect(parsed.roleAssignmentResponse).toHaveLength(1);
  });

  test("CaseShareResponseSchema accepts direct properties", () => {
    const parsed = CaseShareResponseSchema.parse({
      cases: [{ caseId: "123" }],
      organisations: [{ organisationIdentifier: "org-1" }],
    });
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.organisations).toHaveLength(1);
  });

  test("CaseShareResponseSchema accepts nested payload property", () => {
    const parsed = CaseShareResponseSchema.parse({
      payload: { cases: [{ caseId: "456" }] },
    });
    expect(parsed.payload).toBeDefined();
  });

  test("BookmarkPayloadSchema accepts minimal bookmark", () => {
    const parsed = BookmarkPayloadSchema.parse({
      id: "bookmark-1",
      documentId: "doc-1",
      name: "Main bookmark",
    });
    expect(parsed.id).toBe("bookmark-1");
  });

  test("AnnotationPayloadSchema accepts rectangle payload", () => {
    const parsed = AnnotationPayloadSchema.parse({
      id: "anno-1",
      documentId: "doc-1",
      rectangles: [{ id: "r1", x: 1, y: 2, width: 100, height: 30 }],
    });
    expect(parsed.rectangles).toHaveLength(1);
  });

  test("AddressLookupResponseSchema accepts empty results", () => {
    const parsed = AddressLookupResponseSchema.parse({ results: [] });
    expect(parsed.results).toEqual([]);
  });

  test("AddressLookupResponseSchema accepts populated DPA rows", () => {
    const parsed = AddressLookupResponseSchema.parse({
      results: [
        {
          DPA: {
            POSTCODE: "E1 1AA",
            ADDRESS: "1 Test Road",
            POST_TOWN: "London",
          },
        },
      ],
      header: {},
    });
    expect(parsed.results).toHaveLength(1);
  });

  test("validateSchema passes for required object fields", () => {
    const schema: Schema = {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    };
    const result = validateSchema({ id: "abc" }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("validateSchema reports missing required fields", () => {
    const schema: Schema = {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    };
    const result = validateSchema({}, schema);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((issue) => issue.path === "root.id"),
    ).toBeTruthy();
  });

  test("validateSchema reports enum mismatch", () => {
    const schema: Schema = {
      type: "string",
      enum: ["a", "b"],
    };
    const result = validateSchema("c", schema);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((issue) =>
        issue.message.includes("Value must be one of"),
      ),
    ).toBeTruthy();
  });

  test("validateSchema allows nullable null values", () => {
    const schema: Schema = { type: "string", nullable: true };
    const result = validateSchema(null, schema);
    expect(result.valid).toBe(true);
  });

  test("validateSchema rejects null when field is not nullable", () => {
    const schema: Schema = { type: "string" };
    const result = validateSchema(null, schema);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((issue) =>
        issue.message.includes("Expected string but got null"),
      ),
    ).toBeTruthy();
  });

  test("validateSchema enforces array minItems", () => {
    const schema: Schema = {
      type: "array",
      minItems: 2,
      items: { type: "string" },
    };
    const result = validateSchema(["a"], schema);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((issue) => issue.message.includes("minimum is 2")),
    ).toBeTruthy();
  });

  test("validateSchema enforces array maxItems", () => {
    const schema: Schema = {
      type: "array",
      maxItems: 1,
      items: { type: "string" },
    };
    const result = validateSchema(["a", "b"], schema);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((issue) => issue.message.includes("maximum is 1")),
    ).toBeTruthy();
  });

  test("validateSchema emits warnings for deprecated fields", () => {
    const schema: Schema = {
      type: "string",
      deprecated: true,
    };
    const result = validateSchema("legacy", schema);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  test("validateSchema catches nested object property type mismatch", () => {
    const schema: Schema = {
      type: "object",
      properties: {
        child: {
          type: "object",
          properties: {
            count: { type: "number" },
          },
        },
      },
    };
    const result = validateSchema({ child: { count: "bad" } }, schema);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((issue) => issue.path === "root.child.count"),
    ).toBeTruthy();
  });

  test("assertContract throws when strict mode is enabled", () => {
    const schema: Schema = {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    };
    expect(() => assertContract({}, schema, { strict: true })).toThrow();
  });

  test("assertContract does not throw when strict mode is disabled", () => {
    const schema: Schema = {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    };
    expect(() => assertContract({}, schema, { strict: false })).not.toThrow();
  });

  test("expectContract passes for valid payload", () => {
    const schema: Schema = {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    };
    expect(() => expectContract({ id: "ok" }, schema)).not.toThrow();
  });

  test("expectContract throws for invalid payload", () => {
    const schema: Schema = {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    };
    expect(() => expectContract({}, schema)).toThrow();
  });

  test("WorkAllocationSchemas.Location validates a valid location", () => {
    const result = validateSchema(
      { id: "loc-1", locationName: "Taylor House", services: ["IA"] },
      WorkAllocationSchemas.Location,
    );
    expect(result.valid).toBe(true);
  });

  test("WorkAllocationSchemas.LocationList rejects malformed item", () => {
    const result = validateSchema(
      [{ id: "loc-1", locationName: 1 }],
      WorkAllocationSchemas.LocationList,
    );
    expect(result.valid).toBe(false);
  });

  test("WorkAllocationSchemas.Task validates supported state values", () => {
    const result = validateSchema(
      {
        id: "task-1",
        task_state: "assigned",
        task_title: "Review",
      },
      WorkAllocationSchemas.Task,
    );
    expect(result.valid).toBe(true);
  });

  test("WorkAllocationSchemas.Task rejects unsupported state values", () => {
    const result = validateSchema(
      {
        id: "task-1",
        task_state: "unknown",
        task_title: "Review",
      },
      WorkAllocationSchemas.Task,
    );
    expect(result.valid).toBe(false);
  });

  test("WorkAllocationSchemas.TaskList accepts minimal task entry", () => {
    const result = validateSchema(
      {
        tasks: [{ id: "task-1", task_state: "assigned" }],
      },
      WorkAllocationSchemas.TaskList,
    );
    expect(result.valid).toBe(true);
  });

  test("WorkAllocationSchemas.UserDetails validates id and userInfo", () => {
    const result = validateSchema(
      {
        userInfo: { id: "user-1", email: "u@example.com" },
      },
      WorkAllocationSchemas.UserDetails,
    );
    expect(result.valid).toBe(true);
  });

  test("SearchSchemas.GlobalSearchServices validates service entries", () => {
    const result = validateSchema(
      [{ serviceId: "DIVORCE", serviceName: "Family Divorce" }],
      SearchSchemas.GlobalSearchServices,
    );
    expect(result.valid).toBe(true);
  });

  test("SearchSchemas.GlobalSearchServices rejects missing keys", () => {
    const result = validateSchema(
      [{ serviceId: "DIVORCE" }],
      SearchSchemas.GlobalSearchServices,
    );
    expect(result.valid).toBe(false);
  });

  test("SearchSchemas.SupportedJurisdictions accepts empty arrays", () => {
    const result = validateSchema([], SearchSchemas.SupportedJurisdictions);
    expect(result.valid).toBe(true);
  });

  test("SearchSchemas.SupportedJurisdictions rejects non-string entries", () => {
    const result = validateSchema(
      ["IA", 123],
      SearchSchemas.SupportedJurisdictions,
    );
    expect(result.valid).toBe(false);
  });
});
