import { randomUUID } from "node:crypto";

const freshImport = async () => {
  const cacheBuster = `?t=${randomUUID()}`;
  return (await import(/* @vite-ignore */ `../../tests/api/config.js${cacheBuster}`)).config;
};

describe("api config parsing", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reads users from API_USERS_JSON", async () => {
    process.env.API_USERS_JSON = JSON.stringify({
      aat: { solicitor: { e: "user", sec: "pass" } }
    });
    const config = await freshImport();
    expect(config.users.aat.solicitor.e).toBe("user");
    expect(config.users.aat.solicitor.sec).toBe("pass");
  });

  it("falls back to legacy env creds when JSON absent", async () => {
    process.env.TEST_ENV = "aat";
    process.env.CASEMANAGER_USERNAME = "legacy-user";
    process.env.CASEMANAGER_PASSWORD = "legacy-pass";
    delete process.env.API_USERS_JSON;
    const config = await freshImport();
    expect(config.users.aat.solicitor.e).toBe("legacy-user");
    expect(config.users.aat.solicitor.sec).toBe("legacy-pass");
  });

  it("parses complex env JSON blobs", async () => {
    process.env.API_JURISDICTIONS_JSON = JSON.stringify({
      aat: [{ id: "TEST", caseTypeIds: ["X"] }]
    });
    process.env.API_CONFIGURATION_UI_KEYS_JSON = JSON.stringify({
      aat: ["clientId", "protocol"]
    });
    const config = await freshImport();
    expect(config.jurisdictions.aat[0].id).toBe("TEST");
    expect(config.configurationUi.aat).toContain("protocol");
  });
});
