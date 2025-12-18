import { expect } from "@playwright/test";

import type { TaskListResponse } from "./types";

export function expectCaseShareShape(response: unknown, property: "cases" | "sharedCases") {
  const asObject = isObject(response) ? response : undefined;
  const entries = Array.isArray(asObject?.[property])
    ? (asObject as Record<string, unknown[]>)[property]
    : isObject((asObject as { payload?: unknown })?.payload) &&
        Array.isArray(((asObject as { payload?: Record<string, unknown> }).payload?.[property] as unknown[]))
      ? ((asObject as { payload?: Record<string, unknown> }).payload?.[property] as unknown[])
      : [];

  expect(Array.isArray(entries)).toBe(true);
  if (entries.length === 0) return;

  expect(entries[0]).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      caseRef: expect.any(String),
      caseTitle: expect.any(String)
    })
  );
}

export function expectTaskList(result: TaskListResponse) {
  expect(result).toBeTruthy();
  expect(Array.isArray(result.tasks)).toBe(true);

  if (result.tasks.length > 0) {
    const task = result.tasks[0];
    expect(task).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        type: expect.any(String),
        state: expect.any(String)
      })
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
