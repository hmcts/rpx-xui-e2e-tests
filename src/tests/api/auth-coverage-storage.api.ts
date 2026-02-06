/* eslint-disable @typescript-eslint/no-explicit-any, playwright/no-conditional-in-test */
import { promises as fs } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { config } from "../../config/api";
import { __test__ as authTest } from "../../fixtures/api-auth";

test.describe.configure({ mode: "serial" });

test.describe("Auth helper coverage - storage operations", () => {
  test("tryReadState returns parsed state or undefined for invalid content", async () => {
    const tmpDir = path.join(process.cwd(), "test-results", "tmp-auth-state");
    await fs.mkdir(tmpDir, { recursive: true });

    const goodPath = path.join(tmpDir, "good.json");
    await fs.writeFile(goodPath, JSON.stringify({ cookies: [] }), "utf8");
    const good = await authTest.tryReadState(goodPath);
    expect(good).toEqual(expect.objectContaining({ cookies: [] }));

    const badPath = path.join(tmpDir, "bad.json");
    await fs.writeFile(badPath, "{not-json", "utf8");
    const bad = await authTest.tryReadState(badPath);
    expect(bad).toBeUndefined();

    const missing = await authTest.tryReadState(
      path.join(tmpDir, "missing.json"),
    );
    expect(missing).toBeUndefined();
  });

  test("ensureStorageStateWith rebuilds missing state and reuses fresh state", async () => {
    let stateExists = false;
    let createCalls = 0;
    let lockCalls = 0;
    const deps = {
      createStorageState: async () => {
        createCalls += 1;
        stateExists = true;
        return "state-2";
      },
      tryReadState: async () => {
        if (!stateExists) {
          return undefined;
        }
        return { cookies: [] };
      },
      unlink: async () => undefined,
      acquireLock: async () => {
        lockCalls += 1;
        return async () => undefined;
      },
      resolveStoragePath: () => "state-2",
      resolveLockPath: () => "state-2.lock",
      isStorageStateReusable: async () => true,
    };

    const first = await authTest.ensureStorageStateWith(
      "solicitor",
      deps as any,
    );
    expect(first).toBe("state-2");
    const second = await authTest.ensureStorageStateWith(
      "solicitor",
      deps as any,
    );
    expect(second).toBe("state-2");
    expect(createCalls).toBe(1);
    expect(lockCalls).toBe(2);
  });

  test("getStoredCookieWith returns cookie and throws when state remains missing", async () => {
    const deps = {
      createStorageState: async () => {
        return "state-2";
      },
      tryReadState: async (storagePath: string) => {
        if (storagePath !== "state-2") {
          return undefined;
        }
        return { cookies: [{ name: "XSRF-TOKEN", value: "token" }] };
      },
      unlink: async () => undefined,
      acquireLock: async () => async () => undefined,
      resolveStoragePath: () => "state-2",
      resolveLockPath: () => "state-2.lock",
      isStorageStateReusable: async () => true,
    };

    const value = await authTest.getStoredCookieWith(
      "solicitor",
      "XSRF-TOKEN",
      deps as any,
    );
    expect(value).toBe("token");

    const emptyDeps = {
      createStorageState: async () => "state-1",
      tryReadState: async () => undefined,
      unlink: async () => undefined,
      acquireLock: async () => async () => undefined,
      resolveStoragePath: () => "state-1",
      resolveLockPath: () => "state-1.lock",
      isStorageStateReusable: async () => false,
    };
    await expect(
      authTest.getStoredCookieWith("solicitor", "XSRF-TOKEN", emptyDeps as any),
    ).rejects.toThrow("Unable to read storage state");
  });

  test("createStorageStateWith honors token bootstrap and falls back to form login", async () => {
    const storageRoot = path.join(
      process.cwd(),
      "test-results",
      "auth-storage",
    );
    let formCalls = 0;
    const onForm = async () => {
      formCalls += 1;
    };

    const tokenSuccess = await authTest.createStorageStateWith("solicitor", {
      storageRoot,
      mkdir: async () => undefined,
      getCredentials: () => ({ username: "test-user", password: "mock-pass" }),
      isTokenBootstrapEnabled: () => true,
      tryTokenBootstrap: async () => true,
      createStorageStateViaForm: onForm,
    });
    expect(tokenSuccess).toContain(path.join(config.testEnv, "solicitor.json"));
    expect(formCalls).toBe(0);

    const tokenFallback = await authTest.createStorageStateWith("solicitor", {
      storageRoot,
      mkdir: async () => undefined,
      getCredentials: () => ({ username: "test-user", password: "mock-pass" }),
      isTokenBootstrapEnabled: () => true,
      tryTokenBootstrap: async () => false,
      createStorageStateViaForm: onForm,
    });
    expect(tokenFallback).toContain(
      path.join(config.testEnv, "solicitor.json"),
    );
    expect(formCalls).toBe(1);
  });
});
