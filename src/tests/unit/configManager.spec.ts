import { randomUUID } from "node:crypto";

const freshImport = async () => {
  const cacheBuster = `?t=${randomUUID()}`;
  return (await import(/* @vite-ignore */ `../../../config/configManager.js${cacheBuster}`)).default;
};

describe("configManager env overrides", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("applies numeric overrides from env", async () => {
    process.env.PLAYWRIGHT_WORKERS = "12";
    process.env.PLAYWRIGHT_RETRIES = "3";
    process.env.PLAYWRIGHT_TIMEOUT = "12345";
    process.env.PLAYWRIGHT_EXPECT_TIMEOUT = "6789";
    process.env.API_REQUEST_TIMEOUT = "15000";

    const CONFIG = await freshImport();
    expect(CONFIG.test.workers).toBe(12);
    expect(CONFIG.test.retries).toBe(3);
    expect(CONFIG.test.timeout).toBe(12345);
    expect(CONFIG.test.expectTimeout).toBe(6789);
    expect(CONFIG.test.apiRequestTimeout).toBe(15000);
  });

  it("overrides urls and environment from env", async () => {
    process.env.TEST_ENV = "demo";
    process.env.TEST_URL = "https://example.test/ui";
    process.env.API_URL = "https://example.test/api";

    const CONFIG = await freshImport();
    expect(CONFIG.environment).toBe("demo");
    expect(CONFIG.urls.xui).toBe("https://example.test/ui");
    expect(CONFIG.urls.api).toBe("https://example.test/api");
  });

  it("merges users from env JSON into existing users map", async () => {
    process.env.TEST_ENV = "aat";
    process.env.TEST_USERS_JSON = JSON.stringify({
      default: { username: "user", password: "pass", cookieName: "xui" }
    });

    const CONFIG = await freshImport();
    expect(CONFIG.users.aat.default.username).toBe("user");
    expect(CONFIG.users.aat.default.password).toBe("pass");
    expect(CONFIG.users.aat.default.cookieName).toBe("xui");
  });

  it("uses UI_USERS_JSON fallback and alternate key names", async () => {
    process.env.TEST_ENV = "aat";
    process.env.UI_USERS_JSON = JSON.stringify({
      judge: { email: "judge@example.com", key: "secret", sessionFile: "judge.json", userIdentifier: "judge-1" },
      partial: { username: "missing-password" }
    });

    const CONFIG = await freshImport();
    expect(CONFIG.users.aat.judge.username).toBe("judge@example.com");
    expect(CONFIG.users.aat.judge.password).toBe("secret");
    expect(CONFIG.users.aat.judge.sessionFile).toBe("judge.json");
    expect(CONFIG.users.aat.judge.userIdentifier).toBe("judge-1");
    expect(CONFIG.users.aat.partial).toBeUndefined();
  });

  it("ignores malformed TEST_USERS_JSON", async () => {
    process.env.TEST_ENV = "aat";
    process.env.TEST_USERS_JSON = "not-json";

    const CONFIG = await freshImport();
    expect(CONFIG.users.aat?.default).toBeUndefined();
  });
});
