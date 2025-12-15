import { randomUUID } from "node:crypto";
import { vi } from "vitest";

const memStore = new Map<string, string>();

vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn(async () => {}),
    readFile: vi.fn(async (p: string) => {
      if (!memStore.has(p)) {
        throw new Error("missing");
      }
      return memStore.get(p)!;
    }),
    writeFile: vi.fn(async (p: string, data: string) => {
      memStore.set(p, data);
    }),
    unlink: vi.fn(async () => {})
  }
}));

const mockContextFactory = vi.fn();

vi.mock("@playwright/test", () => ({
  request: { newContext: mockContextFactory }
}));

vi.mock("@hmcts/playwright-common", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn() }),
  IdamUtils: class {
    async generateIdamToken() {
      return "token";
    }
  },
  ServiceAuthUtils: class {
    async retrieveToken() {
      return "service";
    }
  }
}));

vi.mock("../api/config.js", () => ({
  config: {
    baseUrl: "https://example.test/",
    testEnv: "aat",
    users: {
      aat: {
        solicitor: { e: "solicitor@example.com", sec: "pw" }
      }
    }
  }
}));

const freshImport = async () => {
  const cacheBuster = `?t=${randomUUID()}`;
  return await import(/* @vite-ignore */ `../api/auth.js${cacheBuster}`);
};

describe("api auth flow helpers", () => {
  beforeEach(() => {
    memStore.clear();
    mockContextFactory.mockReset();
    process.env.API_AUTH_MODE = "form";
  });

  it("creates storage state via form login and reads cookie", async () => {
    const loginHtml = `<input name="_csrf" value="csrf-token">`;
    const storageStatePath = `${process.cwd()}/functional-output/tests/playwright-api/storage-states/aat/solicitor.json`;

    const ctx: any = {
      get: vi.fn()
        .mockResolvedValueOnce({
          status: () => 200,
          url: () => "https://idam/login",
          text: async () => loginHtml
        })
        .mockResolvedValueOnce({ status: () => 200 }),
      post: vi.fn().mockResolvedValue({ status: () => 200 }),
      storageState: vi.fn(async () => {
        const payload = { cookies: [{ name: "XSRF-TOKEN", value: "abc" }] };
        memStore.set(storageStatePath, JSON.stringify(payload));
      }),
      dispose: vi.fn()
    };
    mockContextFactory.mockResolvedValue(ctx);

    const { ensureStorageState, getStoredCookie } = await freshImport();
    const path = await ensureStorageState("solicitor");
    expect(path.endsWith("solicitor.json")).toBe(true);
    const cookie = await getStoredCookie("solicitor", "XSRF-TOKEN");
    expect(cookie).toBe("abc");
    expect(ctx.get).toHaveBeenCalled();
    expect(ctx.post).toHaveBeenCalled();
  });
});
