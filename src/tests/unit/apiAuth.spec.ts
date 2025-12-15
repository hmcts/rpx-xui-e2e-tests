import { randomUUID } from "node:crypto";
import { vi } from "vitest";

vi.mock("@hmcts/playwright-common", () => {
  class IdamUtils {
    async generateIdamToken() {
      return "idam-token";
    }
    async dispose() {}
  }
  class ServiceAuthUtils {
    async retrieveToken() {
      return "service-token";
    }
    async dispose() {}
  }
  const createLogger = () => ({
    info: vi.fn(),
    warn: vi.fn()
  });
  return { IdamUtils, ServiceAuthUtils, createLogger };
});

const freshImport = async () => {
  const cacheBuster = `?t=${randomUUID()}`;
  return await import(/* @vite-ignore */ `../../utils/api/auth.js${cacheBuster}`);
};

describe("api auth helpers", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("uses API_BEARER_TOKEN when provided", async () => {
    process.env.API_BEARER_TOKEN = "Bearer preset";
    const { buildAuthHeaders } = await freshImport();
    const headers = await buildAuthHeaders();
    expect(headers.Authorization).toBe("Bearer preset");
  });

  it("generates client-credentials token when no bearer", async () => {
    process.env.IDAM_CLIENT_ID = "client";
    process.env.IDAM_CLIENT_SECRET = "secret";
    process.env.IDAM_WEB_URL = "https://idam-web.example";
    process.env.IDAM_TESTING_SUPPORT_URL = "https://idam-testing.example";
    const { buildAuthHeaders } = await freshImport();
    const headers = await buildAuthHeaders();
    expect(headers.Authorization).toBe("Bearer idam-token");
  });

  it("falls back to CASEMANAGER_* user creds for password grant", async () => {
    process.env.IDAM_CLIENT_ID = "client";
    process.env.IDAM_CLIENT_SECRET = "secret";
    process.env.IDAM_WEB_URL = "https://idam-web.example";
    process.env.IDAM_TESTING_SUPPORT_URL = "https://idam-testing.example";
    process.env.CASEMANAGER_USERNAME = "legacy-user";
    process.env.CASEMANAGER_PASSWORD = "legacy-pass";
    const { buildAuthHeaders } = await freshImport();
    delete process.env.API_BEARER_TOKEN;
    const headers = await buildAuthHeaders();
    expect(headers.Authorization).toBe("Bearer idam-token");
  });

  it("adds ServiceAuthorization when S2S env present", async () => {
    process.env.IDAM_CLIENT_ID = "client";
    process.env.IDAM_CLIENT_SECRET = "secret";
    process.env.IDAM_WEB_URL = "https://idam-web.example";
    process.env.IDAM_TESTING_SUPPORT_URL = "https://idam-testing.example";
    process.env.S2S_MICROSERVICE_NAME = "xui_webapp";
    process.env.S2S_URL = "http://s2s.example";
    process.env.S2S_SECRET = "s2s-secret";
    const { buildAuthHeaders } = await freshImport();
    const headers = await buildAuthHeaders();
    expect(headers.ServiceAuthorization).toBe("Bearer service-token");
  });
});
