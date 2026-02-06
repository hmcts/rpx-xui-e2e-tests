/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from "node:fs";

import { request } from "@playwright/test";

import { config as testConfig } from "../../config/api";
import { expect, test, buildApiAttachment } from "../../fixtures/api";
import { ensureStorageState } from "../../fixtures/api-auth";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";

test.describe("Node app endpoints", () => {
  test("serves external configuration without authentication", async ({
    anonymousClient,
  }) => {
    const response = await anonymousClient.get<Record<string, unknown>>(
      "external/configuration-ui",
    );
    expectStatus(response.status, [200]);
    const expectedKeys =
      testConfig.configurationUi[
        testConfig.testEnv as keyof typeof testConfig.configurationUi
      ] ?? [];
    assertUiConfigResponse(
      response.data as Record<string, unknown>,
      expectedKeys,
    );
  });

  test("serves external config/ui alias", async ({ anonymousClient }) => {
    const response =
      await anonymousClient.get<Record<string, unknown>>("external/config/ui");
    expectStatus(response.status, [200]);
    const expectedKeys =
      testConfig.configurationUi[
        testConfig.testEnv as keyof typeof testConfig.configurationUi
      ] ?? [];
    assertUiConfigResponse(
      response.data as Record<string, unknown>,
      expectedKeys,
    );
  });

  test("serves external config/check snapshot", async ({ anonymousClient }) => {
    const response = await anonymousClient.get<Record<string, unknown>>(
      "external/config/check",
    );
    expectStatus(response.status, [200]);
    expect(response.data).toEqual(
      expect.objectContaining({
        clientId: expect.any(String),
        protocol: expect.any(String),
      }),
    );
  });

  test("auth/isAuthenticated returns session status for authenticated sessions", async ({
    apiClient,
  }) => {
    const response = await apiClient.get<boolean>("auth/isAuthenticated", {
      throwOnError: false,
    });
    expectStatus(response.status, StatusSets.guardedBasic);
    assertSessionStatus(response);
  });

  test("auth/isAuthenticated returns false without session", async ({
    anonymousClient,
  }) => {
    const response = await anonymousClient.get<boolean>("auth/isAuthenticated");
    expectStatus(response.status, [200]);
    expect(response.data).toBe(false);
  });

  test("auth/login responds", async ({ anonymousClient }) => {
    const response = await anonymousClient.get("auth/login", {
      throwOnError: false,
    });
    expectStatus(response.status, [200, 302, 401, 403, 500, 502, 504]);
  });

  test("returns enriched user details for solicitor session", async ({
    apiClient,
  }, testInfo) => {
    const response = await apiClient.get<any>("api/user/details", {
      throwOnError: false,
    });

    expectStatus(response.status, StatusSets.guardedExtended);
    assertUserDetails(response);

    const attachment = buildApiAttachment(response.logEntry, {
      includeRaw: process.env.PLAYWRIGHT_DEBUG_API === "1",
    });
    const prettyBody = formatAttachmentBody(attachment);
    await testInfo.attach(`${attachment.name}-pretty`, {
      body: prettyBody,
      contentType: "application/json",
    });
  });

  test("rejects unauthenticated calls to user details", async ({
    anonymousClient,
  }) => {
    const response = await anonymousClient.get("api/user/details", {
      throwOnError: false,
    });

    expectStatus(response.status, [401]);
  });

  test("applies security headers on open configuration endpoint", async () => {
    const ctx = await request.newContext({
      baseURL: testConfig.baseUrl.replace(/\/+$/, ""),
      ignoreHTTPSErrors: true,
    });
    const res = await ctx.get("external/configuration-ui", {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    assertSecurityHeaders(res.headers());
    await ctx.dispose();
  });

  test("stale session cookie returns guarded status", async () => {
    const statePath = await ensureStorageState("solicitor");
    const raw = await fs.readFile(statePath, "utf8");
    const state = JSON.parse(raw);
    const expiredCookies = resolveExpiredCookies(state);

    const ctx = await request.newContext({
      baseURL: testConfig.baseUrl.replace(/\/+$/, ""),
      ignoreHTTPSErrors: true,
    });
    await applyExpiredCookies(ctx, expiredCookies);
    const res = await ctx.get("api/user/details", { failOnStatusCode: false });
    expectStatus(res.status(), [401, 403]);
    await ctx.dispose();
  });

  test("returns configuration value for feature flag query", async ({
    apiClient,
  }) => {
    const response = await apiClient.get<any>(
      "api/configuration?configurationKey=termsAndConditionsEnabled",
    );
    expectStatus(
      response.status,
      StatusSets.guardedBasic.filter((s) => s !== 403),
    ); // 200 or 401
    expect(JSON.stringify(response.data).length).toBeLessThan(6);
  });

  test("healthCheck responds with healthState", async ({ anonymousClient }) => {
    const response = await anonymousClient.get<{ healthState?: boolean }>(
      "api/healthCheck?path=",
      { throwOnError: false },
    );
    expectStatus(response.status, [200, 500, 502, 504]);
    assertHealthCheckResponse(response);
  });
});

function resolveUserInfo(
  data: { userInfo?: Record<string, unknown> } | undefined,
): Record<string, unknown> {
  return data?.userInfo ?? {};
}

function assertSessionStatus(response: {
  status: number;
  data: unknown;
}): void {
  if (response.status === 200) {
    expect(typeof response.data).toBe("boolean");
  }
}

function assertHealthCheckResponse(response: {
  status: number;
  data?: { healthState?: unknown };
}): void {
  if (response.status === 200) {
    expect(typeof response.data?.healthState).toBe("boolean");
  }
}

function assertUserDetails(response: {
  status: number;
  data: Record<string, unknown>;
}): void {
  if (response.status !== 200) {
    return;
  }
  const userInfo = resolveUserInfo(response.data);
  expect(userInfo).toEqual(
    expect.objectContaining({
      email: expect.any(String),
      roles: expect.arrayContaining([expect.any(String)]),
    }),
  );
  expect(userInfo.uid ?? userInfo.id).toBeDefined();
  assertOptionalUserNames(userInfo);
  expect(response.data).toEqual(
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

function formatAttachmentBody(attachment: { body: string | unknown }): string {
  return typeof attachment.body === "string"
    ? attachment.body
    : JSON.stringify(attachment.body, null, 2);
}

function resolveExpiredCookies(state: {
  cookies?: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  return Array.isArray(state.cookies)
    ? state.cookies.map((c) => ({ ...c, expires: 0 }))
    : [];
}

function assertOptionalUserNames(userInfo: Record<string, unknown>): void {
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

function assertSecurityHeaders(headers: Record<string, string>): void {
  expect(headers["content-type"] || headers["Content-Type"]).toContain(
    "application/json",
  );
  const cacheControl = headers["cache-control"] || headers["Cache-Control"];
  if (cacheControl) {
    expect(cacheControl.toLowerCase()).toContain("no-store");
  }
  const xcto =
    headers["x-content-type-options"] || headers["X-Content-Type-Options"];
  if (xcto) {
    expect(xcto.toLowerCase()).toBe("nosniff");
  }
}

function assertUiConfigResponse(
  data: Record<string, unknown>,
  expectedKeys: string[],
): void {
  expect(Object.keys(data)).toEqual(expect.arrayContaining(expectedKeys));
  expect(data["clientId"]).toBe("xuiwebapp");
  expect(data).toEqual(
    expect.objectContaining({
      protocol: expect.any(String),
      oAuthCallback: expect.any(String),
    }),
  );
}

async function applyExpiredCookies(
  ctx: Awaited<ReturnType<typeof request.newContext>>,
  expiredCookies: Array<Record<string, unknown>>,
): Promise<void> {
  if (expiredCookies.length) {
    await ctx.storageState({
      cookies: expiredCookies,
      origins: [],
    } as unknown as any);
  }
}
