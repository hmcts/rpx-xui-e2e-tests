import { expect } from "@playwright/test";

type UserInfo = {
  uid?: unknown;
  id?: unknown;
  given_name?: unknown;
  forename?: unknown;
  family_name?: unknown;
  surname?: unknown;
  email?: unknown;
  roles?: unknown;
};

type UserDetailsPayload = {
  roleAssignmentInfo?: unknown;
  canShareCases?: unknown;
  sessionTimeout?: {
    idleModalDisplayTime?: unknown;
    pattern?: unknown;
  };
  userInfo?: unknown;
};

type CookieState = { cookies?: Array<Record<string, unknown>> };

export function assertUserInfoDetails(userInfo: UserInfo) {
  expect(userInfo).toEqual(
    expect.objectContaining({
      email: expect.any(String),
      roles: expect.arrayContaining([expect.any(String)]),
    }),
  );
  expect(userInfo.uid ?? userInfo.id).toBeDefined();
  if (userInfo.given_name || userInfo.forename) {
    expect(userInfo.given_name ?? userInfo.forename).toEqual(
      expect.any(String),
    );
  }
  if (userInfo.family_name || userInfo.surname) {
    expect(userInfo.family_name ?? userInfo.surname).toEqual(
      expect.any(String),
    );
  }
}

export function assertUiConfigResponse(
  data: Record<string, unknown>,
  expectedKeys: string[],
) {
  expect(Object.keys(data)).toEqual(expect.arrayContaining(expectedKeys));
  expect(data.clientId).toBe("xuiwebapp");
  expect(data).toEqual(
    expect.objectContaining({
      protocol: expect.any(String),
      oAuthCallback: expect.any(String),
    }),
  );
}

export function assertUserDetailsPayload(payload: UserDetailsPayload) {
  expect(payload).toEqual(
    expect.objectContaining({
      roleAssignmentInfo: expect.any(Array),
      canShareCases: expect.any(Boolean),
      sessionTimeout: expect.objectContaining({
        idleModalDisplayTime: expect.any(Number),
        pattern: expect.any(String),
      }),
    }),
  );
}

export function assertUserDetailsKeys(
  payload: UserDetailsPayload,
  expected: Record<string, unknown>,
) {
  const expectedKeys = Object.keys(expected);
  expect(Object.keys(payload)).toEqual(expect.arrayContaining(expectedKeys));

  const expectedRoles = expected.roleAssignmentInfo;
  if (
    Array.isArray(payload.roleAssignmentInfo) &&
    payload.roleAssignmentInfo.length > 0 &&
    Array.isArray(expectedRoles) &&
    expectedRoles.length > 0
  ) {
    const actualFirst = payload.roleAssignmentInfo[0];
    const expectedFirst = expectedRoles[0];
    if (
      actualFirst &&
      typeof actualFirst === "object" &&
      expectedFirst &&
      typeof expectedFirst === "object"
    ) {
      const expectedRoleKeys = Object.keys(
        expectedFirst as Record<string, unknown>,
      );
      expect(Object.keys(actualFirst as Record<string, unknown>)).toEqual(
        expect.arrayContaining(expectedRoleKeys),
      );
    }
  }
}

export function assertSecurityHeaders(cacheControl?: string, xcto?: string) {
  if (cacheControl) {
    expect(cacheControl.toLowerCase()).toContain("no-store");
  }
  if (xcto) {
    expect(xcto.toLowerCase()).toBe("nosniff");
  }
}

export function resolveUserInfo(payload: UserDetailsPayload | undefined) {
  return payload?.userInfo ?? {};
}

export function shouldProcessUserDetails(status: number): boolean {
  return status === 200;
}

export function formatAttachmentBody(attachment: { body: unknown }) {
  return typeof attachment.body === "string"
    ? attachment.body
    : JSON.stringify(attachment.body, null, 2);
}

export function resolveHeader(
  headers: Record<string, string>,
  key: string,
): string | undefined {
  const titleKey = key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
  return (
    headers[key] ||
    headers[key.toLowerCase()] ||
    headers[titleKey] ||
    headers[key.toUpperCase()]
  );
}

export function buildExpiredCookies(
  state: unknown,
): Array<Record<string, unknown>> {
  const cookies = (state as CookieState | undefined)?.cookies;
  return Array.isArray(cookies)
    ? cookies.map((cookie) => ({ ...cookie, expires: 0 }))
    : [];
}

export async function applyExpiredCookies(
  ctx: {
    storageState: (opts: {
      cookies: Array<Record<string, unknown>>;
      origins: [];
    }) => Promise<void>;
  },
  cookies: Array<Record<string, unknown>>,
) {
  if (cookies.length) {
    await ctx.storageState({ cookies, origins: [] });
  }
}
