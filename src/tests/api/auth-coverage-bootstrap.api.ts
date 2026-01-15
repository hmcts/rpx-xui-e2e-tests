/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from "@playwright/test";

import { __test__ as authTest } from "../../fixtures/api-auth";
import { withEnv } from "../../utils/api/testEnv";

type FakeResponse = {
  status: () => number;
  url?: () => string;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
};

type FakeRequestContext = {
  get: (url: string) => Promise<FakeResponse>;
  post: (url: string, opts?: unknown) => Promise<FakeResponse>;
  storageState: (opts?: unknown) => Promise<void>;
  dispose: () => Promise<void>;
};

const statusFn = (code: number) => () => code;

function createFormLoginContext(
  loginStatus: number,
  postStatus: number,
  html: string,
  isAuthenticated = true,
  authStatus = 200
): FakeRequestContext {
  const loginPage: FakeResponse = {
    status: statusFn(loginStatus),
    url: () => "https://example.test/login",
    text: async () => html
  };

  return {
    get: async (url: string) => {
      if (url === "auth/login") {
        return loginPage;
      }
      if (url === "auth/isAuthenticated") {
        return { status: statusFn(authStatus), json: async () => isAuthenticated };
      }
      return { status: statusFn(200) };
    },
    post: async () => ({ status: statusFn(postStatus) }),
    storageState: async () => {},
    dispose: async () => {}
  };
}

function buildAuthContext(): FakeRequestContext {
  return {
    get: async (url: string) =>
      url.includes("isAuthenticated")
        ? { status: () => 200, json: async () => true }
        : { status: () => 200 },
    post: async () => ({ status: () => 200 }),
    storageState: async () => {},
    dispose: async () => {}
  };
}

type AuthEnvironmentKey =
  | "API_AUTH_MODE"
  | "IDAM_SECRET"
  | "IDAM_WEB_URL"
  | "IDAM_TESTING_SUPPORT_URL"
  | "S2S_URL";

type AuthEnvironmentConfig = Partial<Record<AuthEnvironmentKey, string>>;

test.describe.configure({ mode: "serial" });

test.describe("Auth helper coverage - token bootstrap", () => {
  test("isTokenBootstrapEnabled respects env overrides", async () => {
    const mockAuthEnv: AuthEnvironmentConfig = {
      API_AUTH_MODE: "form",
      IDAM_SECRET: "MOCK_SECRET_FOR_TESTING",
      IDAM_WEB_URL: "https://mock-idam.test",
      IDAM_TESTING_SUPPORT_URL: "https://mock-support.test",
      S2S_URL: "https://mock-s2s.test"
    };

    await withEnv(mockAuthEnv, () => {
      expect(authTest.isTokenBootstrapEnabled()).toBe(false);
    });

    await withEnv(
      {
        API_AUTH_MODE: "token",
        ...Object.fromEntries(
          Object.keys(mockAuthEnv)
            .filter((key) => key !== "API_AUTH_MODE")
            .map((key) => [key, undefined])
        )
      },
      () => {
        expect(authTest.isTokenBootstrapEnabled()).toBe(true);
      }
    );

    await withEnv(Object.fromEntries(Object.keys(mockAuthEnv).map((key) => [key, undefined])), () => {
      expect(authTest.isTokenBootstrapEnabled()).toBe(false);
    });

    await withEnv({ ...mockAuthEnv, API_AUTH_MODE: undefined }, () => {
      expect(authTest.isTokenBootstrapEnabled()).toBe(true);
    });
  });

  test("createStorageStateViaForm handles csrf and login errors", async () => {
    await expect(
      authTest.createStorageStateViaForm(
        { username: "test-user", password: "mock-pass" },
        "state.json",
        "solicitor",
        { requestFactory: async () => createFormLoginContext(400, 200, "") as any }
      )
    ).rejects.toThrow("GET /auth/login");

    await expect(
      authTest.createStorageStateViaForm(
        { username: "test-user", password: "mock-pass" },
        "state.json",
        "solicitor",
        { requestFactory: async () => createFormLoginContext(200, 401, "") as any }
      )
    ).rejects.toThrow("POST https://example.test/login");

    await authTest.createStorageStateViaForm(
      { username: "test-user", password: "mock-pass" },
      "state.json",
      "solicitor",
      { requestFactory: async () => createFormLoginContext(200, 200, '<input name="_csrf" value="token">') as any }
    );

    await authTest.createStorageStateViaForm(
      { username: "test-user", password: "mock-pass" },
      "state.json",
      "solicitor",
      { requestFactory: async () => createFormLoginContext(200, 200, "<html></html>") as any }
    );
  });

  test("tryTokenBootstrap covers env and response branches", async () => {
    const warnCalls: string[] = [];
    const logger = { warn: (message: string) => warnCalls.push(message) } as any;

    const missingEnv = await authTest.tryTokenBootstrap(
      "solicitor",
      { username: "test-user", password: "mock-pass" },
      "state.json",
      { env: {} as NodeJS.ProcessEnv }
    );
    expect(missingEnv).toBe(false);

    const context = buildAuthContext();

    const mockEnv = {
      IDAM_SECRET: "MOCK_TEST_SECRET",
      IDAM_WEB_URL: "https://mock-idam.test",
      IDAM_TESTING_SUPPORT_URL: "https://mock-support.test",
      S2S_URL: "https://mock-s2s.test"
    } as NodeJS.ProcessEnv;

    const success = await authTest.tryTokenBootstrap(
      "solicitor",
      { username: "test-user", password: "mock-pass" },
      "state.json",
      {
        env: mockEnv,
        idamUtils: { generateIdamToken: async () => "mock-token" },
        serviceAuthUtils: { retrieveToken: async () => "mock-service-token" },
        requestFactory: async () => context as any,
        logger,
        readState: async () => ({ cookies: [{ name: "a" }] })
      }
    );
    expect(success).toBe(true);

    const authFailContext = {
      get: async () => ({ status: () => 401, json: async () => true }),
      storageState: async () => {},
      dispose: async () => {}
    };
    const failure = await authTest.tryTokenBootstrap(
      "solicitor",
      { username: "test-user", password: "mock-pass" },
      "state.json",
      {
        env: mockEnv,
        idamUtils: { generateIdamToken: async () => "mock-token" },
        serviceAuthUtils: { retrieveToken: async () => "mock-service-token" },
        requestFactory: async () => authFailContext as any,
        logger,
        readState: async () => ({ cookies: [{ name: "a" }] })
      }
    );
    expect(failure).toBe(false);
    expect(warnCalls.length).toBeGreaterThan(0);
  });

  test("tryTokenBootstrap logs and returns false on request failures", async () => {
    const warnCalls: string[] = [];
    const logger = { warn: (message: string) => warnCalls.push(message) } as any;

    const mockEnv = {
      IDAM_SECRET: "MOCK_TEST_SECRET",
      IDAM_WEB_URL: "https://mock-idam.test",
      IDAM_TESTING_SUPPORT_URL: "https://mock-support.test",
      S2S_URL: "https://mock-s2s.test"
    } as NodeJS.ProcessEnv;

    const result = await authTest.tryTokenBootstrap(
      "solicitor",
      { username: "test-user", password: "mock-pass" },
      "state.json",
      {
        env: mockEnv,
        idamUtils: { generateIdamToken: async () => "mock-token" },
        serviceAuthUtils: { retrieveToken: async () => "mock-service-token" },
        requestFactory: async () => {
          throw new Error("boom");
        },
        logger
      }
    );
    expect(result).toBe(false);
    expect(warnCalls.some((message) => message.includes("Token bootstrap failed"))).toBe(true);
  });
});
