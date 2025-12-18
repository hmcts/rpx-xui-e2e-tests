import type { RoleAccessResponse } from "./types";

export function resolveRoleAccessArray(response: RoleAccessResponse): unknown[] {
  if (!response) return [];
  if (Array.isArray(response.data)) return response.data;
  const payload = (response as { payload?: { data?: unknown[] } }).payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}
