import { expect } from '@playwright/test';

import { CaseShareResponseVariant } from './types';

export type CaseShareSchema = ((payload: CaseShareResponseVariant, property: string) => void) | object;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function resolveEntries(data: unknown, property: string): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (isRecord(data) && Array.isArray(data[property])) {
    return data[property];
  }
  const nested = isRecord(data) ? data.payload : undefined;
  if (isRecord(nested) && Array.isArray(nested[property])) {
    return nested[property];
  }
  return [];
}

export function assertCaseShareEntries(data: unknown, property: string, schema: CaseShareSchema) {
  const entries = resolveEntries(data, property);
  expect(Array.isArray(entries)).toBe(true);
  if (entries.length > 0) {
    if (typeof schema === 'function') {
      schema(data as CaseShareResponseVariant, property);
    } else {
      expect(entries[0]).toEqual(schema);
    }
  }
}
