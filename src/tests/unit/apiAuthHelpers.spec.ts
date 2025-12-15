import { vi } from "vitest";
import { randomUUID } from "node:crypto";

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

describe("api auth helpers (unit)", () => {
  it("extracts csrf token when present and handles missing token", async () => {
    const { __test__ } = await freshImport();
    expect(__test__.extractCsrf(`<input name="_csrf" value="abc123">`)).toBe("abc123");
    expect(__test__.extractCsrf(`<html>No token</html>`)).toBeUndefined();
  });

  it("strips trailing slashes", async () => {
    const { __test__ } = await freshImport();
    expect(__test__.stripTrailingSlash("https://example.test/")).toBe("https://example.test");
    expect(__test__.stripTrailingSlash("https://example.test///")).toBe("https://example.test");
  });

  it("reads credentials for configured role and throws when missing", async () => {
    const mod = await freshImport();
    expect(mod.hasApiUser("solicitor")).toBe(true);
    expect(mod.__test__.getCredentials("solicitor")).toEqual({ username: "solicitor@example.com", password: "pw" });

    const otherMod = await import("../api/auth.js");
    expect(() => otherMod.__test__.getCredentials("missing" as any)).toThrow(/No credentials configured/);
  });

  it("decides token bootstrap based on env toggles", async () => {
    const mod = await freshImport();
    const { __test__ } = mod;
    // default false without env
    expect(__test__.isTokenBootstrapEnabled()).toBe(false);

    process.env.API_AUTH_MODE = "token";
    expect(__test__.isTokenBootstrapEnabled()).toBe(true);

    process.env.API_AUTH_MODE = "off";
    expect(__test__.isTokenBootstrapEnabled()).toBe(false);

    delete process.env.API_AUTH_MODE;
    process.env.IDAM_SECRET = "s";
    process.env.IDAM_WEB_URL = "https://idam";
    process.env.IDAM_TESTING_SUPPORT_URL = "https://support";
    process.env.S2S_URL = "http://s2s";
    expect(__test__.isTokenBootstrapEnabled()).toBe(true);
  });
});
