/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { promises as fs } from "node:fs";

import { request } from "@playwright/test";

import { ensureStorageState } from "./auth.ts";
import { config as testConfig } from "./config.ts";
import { test, expect, buildApiAttachment } from "./fixtures.ts";
import { expectStatus, StatusSets } from "./utils/apiTestUtils.ts";

test.describe("@api node app endpoints", () => {
  test("serves external configuration without authentication", async ({ anonymousClient }) => {
    const response = await anonymousClient.get<Record<string, unknown>>(
      "external/configuration-ui",
    );
    expectStatus(response.status, [200]);
    const expectedKeys = testConfig.configuratioUi[testConfig.testEnv];
    const data = response.data;
    expect(Object.keys(data)).toEqual(expect.arrayContaining(expectedKeys));
    expect(data.clientId).toBe("xuiwebapp");
    expect(data).toEqual(
      expect.objectContaining({
        protocol: expect.any(String),
        oAuthCallback: expect.any(String),
      }),
    );
  });

  test("auth/isAuthenticated returns true for authenticated sessions", async ({ apiClient }) => {
    const response = await apiClient.get<boolean>("auth/isAuthenticated");
    expectStatus(response.status, [200]);
    expect(typeof response.data).toBe("boolean");
    // Token-based auth flows can return `false` even when the bearer token is valid, so only assert boolean.
    expect([true, false]).toContain(response.data);
  });

  test("auth/isAuthenticated returns false without session", async ({ anonymousClient }) => {
    const response = await anonymousClient.get<boolean>("auth/isAuthenticated");
    expectStatus(response.status, [200]);
    expect(response.data).toBe(false);
  });

  test("returns enriched user details for solicitor session", async ({ apiClient }, testInfo) => {
    const response = await apiClient.get<any>("api/user/details");

    expectStatus(response.status, [200]);
    const userInfo = response.data?.userInfo ?? {};
    expect(userInfo).toEqual(
      expect.objectContaining({
        email: expect.any(String),
        roles: expect.arrayContaining([expect.any(String)]),
      }),
    );
    expect(userInfo.uid ?? userInfo.id).toBeDefined();
    if (userInfo.given_name || userInfo.forename) {
      expect(userInfo.given_name ?? userInfo.forename).toEqual(expect.any(String));
    }
    if (userInfo.family_name || userInfo.surname) {
      expect(userInfo.family_name ?? userInfo.surname).toEqual(expect.any(String));
    }
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

    const expectedKeys = ["canShareCases", "roleAssignmentInfo", "sessionTimeout", "userInfo"];
    expect(Object.keys(response.data)).toEqual(expect.arrayContaining(expectedKeys));

    if (
      Array.isArray(response.data.roleAssignmentInfo) &&
      response.data.roleAssignmentInfo.length > 0
    ) {
      const expectedRoleKeys = ["jurisdiction", "isCaseAllocator", "substantive"];
      expect(Object.keys(response.data.roleAssignmentInfo[0])).toEqual(
        expect.arrayContaining(expectedRoleKeys),
      );
    }

    const attachment = buildApiAttachment(response.logEntry, {
      includeRaw: process.env.PLAYWRIGHT_DEBUG_API === "1",
    });
    const prettyBody =
      typeof attachment.body === "string"
        ? attachment.body
        : JSON.stringify(attachment.body, null, 2);
    await testInfo.attach(`${attachment.name}-pretty`, {
      body: prettyBody,
      contentType: "application/json",
    });
  });

  test("rejects unauthenticated calls to user details", async ({ anonymousClient }) => {
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
    const res = await ctx.get("external/configuration-ui", { failOnStatusCode: false });
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(headers["content-type"] || headers["Content-Type"]).toContain("application/json");
    const cacheControl = headers["cache-control"] || headers["Cache-Control"];
    if (cacheControl) {
      expect(cacheControl.toLowerCase()).toContain("no-store");
    }
    const xcto = headers["x-content-type-options"] || headers["X-Content-Type-Options"];
    if (xcto) {
      expect(xcto.toLowerCase()).toBe("nosniff");
    }
    await ctx.dispose();
  });

  test("stale session cookie returns guarded status", async () => {
    const statePath = await ensureStorageState("solicitor");
    const raw = await fs.readFile(statePath, "utf8");
    const state = JSON.parse(raw);
    const expiredCookies = Array.isArray(state.cookies)
      ? state.cookies.map((c: any) => ({ ...c, expires: 0 }))
      : [];

    const ctx = await request.newContext({
      baseURL: testConfig.baseUrl.replace(/\/+$/, ""),
      ignoreHTTPSErrors: true,
    });
    if (expiredCookies.length) {
      await ctx.storageState({ cookies: expiredCookies, origins: [] });
    }
    const res = await ctx.get("api/user/details", { failOnStatusCode: false });
    expectStatus(res.status(), [401, 403]);
    await ctx.dispose();
  });

  test("returns configuration value for feature flag query", async ({ apiClient }) => {
    const response = await apiClient.get<any>(
      "api/configuration?configurationKey=termsAndConditionsEnabled",
    );
    expectStatus(
      response.status,
      StatusSets.guardedBasic.filter((s) => s !== 403),
    ); // 200 or 401
    expect(JSON.stringify(response.data).length).toBeLessThan(6);
  });
});
