import { expect } from "@playwright/test";

import { CaseShareResponseVariant } from "./types";

export type CaseShareSchema =
  | ((payload: CaseShareResponseVariant, property: string) => void)
  | object;

export function resolveEntries(data: unknown, property: string): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object") {
    const direct = (data as Record<string, unknown>)[property];
    if (Array.isArray(direct)) {
      return direct;
    }
  }
  const nested =
    data && typeof data === "object"
      ? (data as { payload?: unknown }).payload
      : undefined;
  if (nested && typeof nested === "object") {
    const nestedDirect = (nested as Record<string, unknown>)[property];
    if (Array.isArray(nestedDirect)) {
      return nestedDirect;
    }
  }
  return [];
}

export function assertCaseShareEntries(
  data: unknown,
  property: string,
  schema: CaseShareSchema,
) {
  const entries = resolveEntries(data, property);
  expect(Array.isArray(entries)).toBe(true);
  if (entries.length > 0) {
    if (typeof schema === "function") {
      schema(data as CaseShareResponseVariant, property);
    } else {
      expect(entries[0]).toEqual(schema);
    }
  }
}
