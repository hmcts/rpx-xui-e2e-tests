import { randomUUID } from "node:crypto";

const freshImport = async () => {
  const cacheBuster = `?t=${randomUUID()}`;
  return (await import(/* @vite-ignore */ `../../../config/configManager.js${cacheBuster}`)).__test__;
};

describe("configManager parseUsersFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("ignores non-object payloads", async () => {
    process.env.TEST_USERS_JSON = JSON.stringify(["bad"]);
    const { parseUsersFromEnv } = await freshImport();
    expect(parseUsersFromEnv()).toEqual({});
  });

  it("supports alternate keys and extra metadata", async () => {
    process.env.TEST_USERS_JSON = JSON.stringify({
      judge: {
        e: "judge@example.com",
        sec: "secret",
        cookieName: "sid",
        sessionFile: "judge.json",
        idamId: "123",
        release: "r1",
        userIdentifier: "judge-identifier"
      }
    });
    const { parseUsersFromEnv } = await freshImport();
    const parsed = parseUsersFromEnv();
    expect(parsed.judge.username).toBe("judge@example.com");
    expect(parsed.judge.password).toBe("secret");
    expect(parsed.judge.cookieName).toBe("sid");
    expect(parsed.judge.sessionFile).toBe("judge.json");
    expect(parsed.judge.idamId).toBe("123");
    expect(parsed.judge.release).toBe("r1");
    expect(parsed.judge.userIdentifier).toBe("judge-identifier");
  });

  it("falls back across username/password aliases", async () => {
    process.env.TEST_USERS_JSON = JSON.stringify({
      alt: { email: "alt@example.com", key: "k", release: "r2" },
      short: { e: "short@example.com", sec: "s" },
      wrong: { username: "user-only" }
    });
    const { parseUsersFromEnv } = await freshImport();
    const parsed = parseUsersFromEnv();
    expect(parsed.alt.username).toBe("alt@example.com");
    expect(parsed.alt.password).toBe("k");
    expect(parsed.alt.release).toBe("r2");
    expect(parsed.short.username).toBe("short@example.com");
    expect(parsed.short.password).toBe("s");
    expect(parsed.wrong).toBeUndefined();
  });
});
