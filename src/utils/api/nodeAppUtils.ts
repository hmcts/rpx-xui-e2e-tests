import { expect } from '@playwright/test';
import type { Cookie } from 'playwright-core';

type UnknownRecord = Record<string, unknown>;
type StorageCookie = Partial<Cookie> & { name: string; value: string; expires?: number };
type StorageState = { cookies?: StorageCookie[] };

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

export function assertUserInfoDetails(userInfo: UnknownRecord) {
  expect(userInfo).toEqual(
    expect.objectContaining({
      email: expect.any(String),
      roles: expect.arrayContaining([expect.any(String)]),
    })
  );
  expect(userInfo.uid ?? userInfo.id).toBeDefined();
  if (userInfo.given_name || userInfo.forename) {
    expect(userInfo.given_name ?? userInfo.forename).toEqual(expect.any(String));
  }
  if (userInfo.family_name || userInfo.surname) {
    expect(userInfo.family_name ?? userInfo.surname).toEqual(expect.any(String));
  }
}

export function assertUiConfigResponse(data: Record<string, unknown>, expectedKeys: string[]) {
  expect(Object.keys(data)).toEqual(expect.arrayContaining(expectedKeys));
  expect(data.clientId).toBe('xuiwebapp');
  expect(data).toEqual(
    expect.objectContaining({
      protocol: expect.any(String),
      oAuthCallback: expect.any(String),
    })
  );
}

export function assertUserDetailsPayload(payload: UnknownRecord) {
  expect(payload).toEqual(
    expect.objectContaining({
      roleAssignmentInfo: expect.any(Array),
      canShareCases: expect.any(Boolean),
      sessionTimeout: expect.objectContaining({
        idleModalDisplayTime: expect.any(Number),
        pattern: expect.any(String),
      }),
    })
  );
}

export function assertUserDetailsKeys(payload: UnknownRecord, expected: UnknownRecord) {
  const expectedKeys = Object.keys(expected);
  expect(Object.keys(payload)).toEqual(expect.arrayContaining(expectedKeys));

  const payloadRoleAssignmentInfo = payload.roleAssignmentInfo;
  const expectedRoleAssignmentInfo = expected.roleAssignmentInfo;
  if (
    Array.isArray(payloadRoleAssignmentInfo) &&
    payloadRoleAssignmentInfo.length > 0 &&
    isRecord(payloadRoleAssignmentInfo[0]) &&
    Array.isArray(expectedRoleAssignmentInfo) &&
    isRecord(expectedRoleAssignmentInfo[0])
  ) {
    const expectedRoleKeys = Object.keys(expectedRoleAssignmentInfo[0]);
    expect(Object.keys(payloadRoleAssignmentInfo[0])).toEqual(expect.arrayContaining(expectedRoleKeys));
  }
}

export function assertSecurityHeaders(cacheControl?: string, xcto?: string) {
  if (cacheControl) {
    expect(cacheControl.toLowerCase()).toContain('no-store');
  }
  if (xcto) {
    expect(xcto.toLowerCase()).toBe('nosniff');
  }
}

export function resolveUserInfo(payload: UnknownRecord | undefined): UnknownRecord {
  return isRecord(payload?.userInfo) ? payload.userInfo : {};
}

export function shouldProcessUserDetails(status: number): boolean {
  return status === 200;
}

export function formatAttachmentBody(attachment: { body: unknown }) {
  return typeof attachment.body === 'string' ? attachment.body : JSON.stringify(attachment.body, null, 2);
}

export function resolveHeader(headers: Record<string, string>, key: string): string | undefined {
  const titleKey = key
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-');
  return headers[key] || headers[key.toLowerCase()] || headers[titleKey] || headers[key.toUpperCase()];
}

export function buildExpiredCookies(state: StorageState): Cookie[] {
  return Array.isArray(state.cookies)
    ? state.cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain ?? 'localhost',
        path: cookie.path ?? '/',
        expires: 0,
        httpOnly: cookie.httpOnly ?? false,
        secure: cookie.secure ?? false,
        sameSite: cookie.sameSite ?? 'Lax',
      }))
    : [];
}

export async function applyExpiredCookies(
  ctx: { storageState: (opts: { cookies: Cookie[]; origins: [] }) => Promise<void> },
  cookies: Array<Cookie | StorageCookie>
) {
  if (cookies.length) {
    await ctx.storageState({ cookies: buildExpiredCookies({ cookies: cookies as StorageCookie[] }), origins: [] });
  }
}
