import { promises as fs } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv";
import {
  ensureUiStorageStateForUser,
  resolveUiStorageTtlMinutes,
} from "../../utils/ui/session-storage.utils";
import { resolveUiStoragePathForUser } from "../../utils/ui/storage-state.utils";
import { UserUtils } from "../../utils/ui/user.utils";
import { loadSessionCookies } from "../e2e/integration/utils/session.utils";

test.describe.configure({ mode: "serial" });

const buildJwt = (payload: Record<string, string>): string => {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
};

test.describe("Session and user utilities coverage", () => {
  test("UserUtils returns credentials for known users and errors on unknown", async () => {
    await withEnv(
      { SOLICITOR_USERNAME: "user@example.com", SOLICITOR_PASSWORD: "pass" },
      () => {
        const userUtils = new UserUtils();
        const creds = userUtils.getUserCredentials("SOLICITOR");
        expect(creds.email).toContain("@");
        expect(creds.password).toBe("pass");
        expect(() => userUtils.getUserCredentials("UNKNOWN_USER")).toThrow(
          'User "UNKNOWN_USER" is not configured',
        );
      },
    );
  });

  test("loadSessionCookies reads stored cookies and handles invalid data", async () => {
    const runRoot = path.join(
      process.cwd(),
      "tmp",
      "session-coverage",
      `cookies-${Date.now()}`,
    );
    const storageTemplate = path.join(runRoot, "{user}.json");

    await withEnv(
      {
        SOLICITOR_USERNAME: "user@example.com",
        SOLICITOR_PASSWORD: "pass",
        PW_UI_STORAGE_PATH: storageTemplate,
        PW_UI_USERS: "SOLICITOR",
      },
      async () => {
        const storagePath = resolveUiStoragePathForUser("SOLICITOR");
        await fs.mkdir(path.dirname(storagePath), { recursive: true });

        await fs.writeFile(
          storagePath,
          JSON.stringify({
            cookies: [{ name: "__userid__", value: "user-1" }],
          }),
          "utf8",
        );
        const loaded = loadSessionCookies("SOLICITOR");
        expect(loaded.cookies).toHaveLength(1);

        await fs.writeFile(storagePath, "{bad-json", "utf8");
        const invalid = loadSessionCookies("SOLICITOR");
        expect(invalid.cookies).toHaveLength(0);
      },
    );

    await fs.rm(runRoot, { recursive: true, force: true });
  });

  test("resolveUiStorageTtlMinutes respects env values", async () => {
    await withEnv({ PW_UI_STORAGE_TTL_MIN: undefined }, () => {
      const defaultValue = resolveUiStorageTtlMinutes();
      expect(defaultValue).toBeGreaterThan(0);
    });

    await withEnv({ PW_UI_STORAGE_TTL_MIN: "1" }, () => {
      expect(resolveUiStorageTtlMinutes()).toBe(1);
    });
  });

  test("resolveUiStorageTtlMinutes falls back for invalid and negative values", async () => {
    await withEnv({ PW_UI_STORAGE_TTL_MIN: "invalid" }, () => {
      expect(resolveUiStorageTtlMinutes()).toBe(15);
    });

    await withEnv({ PW_UI_STORAGE_TTL_MIN: "-10" }, () => {
      expect(resolveUiStorageTtlMinutes()).toBe(0);
    });
  });

  test("resolveUiStoragePathForUser scopes files by test environment", async () => {
    let aatPath = "";
    let demoPath = "";

    await withEnv({ TEST_ENV: "aat" }, () => {
      aatPath = resolveUiStoragePathForUser("SOLICITOR");
    });

    await withEnv({ TEST_ENV: "demo" }, () => {
      demoPath = resolveUiStoragePathForUser("SOLICITOR");
    });

    expect(aatPath).toContain(`${path.sep}ui${path.sep}aat${path.sep}`);
    expect(demoPath).toContain(`${path.sep}ui${path.sep}demo${path.sep}`);
    expect(aatPath).not.toBe(demoPath);
  });

  test("resolveUiStoragePathForUser applies PW_UI_STORAGE_PATH user template", async () => {
    await withEnv(
      {
        PW_UI_STORAGE_PATH: path.join(
          process.cwd(),
          "tmp",
          "storage",
          "{user}.json",
        ),
        PW_UI_USERS: "SOLICITOR,JUDGE",
      },
      () => {
        const solicitor = resolveUiStoragePathForUser("SOLICITOR");
        const judge = resolveUiStoragePathForUser("JUDGE");
        expect(solicitor).toContain(`${path.sep}solicitor.json`);
        expect(judge).toContain(`${path.sep}judge.json`);
        expect(solicitor).not.toBe(judge);
      },
    );
  });

  test("resolveUiStoragePathForUser rejects non-templated override with multiple users", async () => {
    await withEnv(
      {
        PW_UI_STORAGE_PATH: path.join(
          process.cwd(),
          "tmp",
          "storage",
          "shared.json",
        ),
        PW_UI_USERS: "SOLICITOR,JUDGE",
      },
      () => {
        expect(() => resolveUiStoragePathForUser("SOLICITOR")).toThrow(
          'PW_UI_STORAGE_PATH must include "{user}"',
        );
      },
    );
  });

  test("resolveUiStoragePathForUser allows non-templated override for single user mode", async () => {
    await withEnv(
      {
        PW_UI_STORAGE_PATH: path.join(
          process.cwd(),
          "tmp",
          "storage",
          "single-user.json",
        ),
        PW_UI_USER: "SOLICITOR",
        PW_UI_USERS: undefined,
      },
      () => {
        expect(resolveUiStoragePathForUser("SOLICITOR")).toContain(
          `${path.sep}single-user.json`,
        );
      },
    );
  });

  test("ensureUiStorageStateForUser skips login for configured manual users", async () => {
    const runRoot = path.join(
      process.cwd(),
      "tmp",
      "session-coverage",
      `manual-${Date.now()}`,
    );
    const storageTemplate = path.join(runRoot, "{user}.json");
    const storagePath = path.join(runRoot, "solicitor.json");

    await withEnv(
      {
        PW_UI_STORAGE_PATH: storageTemplate,
        PW_UI_USERS: "SOLICITOR",
        PW_UI_MANUAL_USERS: "SOLICITOR",
      },
      async () => {
        await ensureUiStorageStateForUser("SOLICITOR", { strict: false });
        await expect(fs.access(storagePath)).rejects.toThrow();
      },
    );

    await fs.rm(runRoot, { recursive: true, force: true });
  });

  test("ensureUiStorageStateForUser throws in strict mode for manual users", async () => {
    const runRoot = path.join(
      process.cwd(),
      "tmp",
      "session-coverage",
      `manual-strict-${Date.now()}`,
    );

    await withEnv(
      {
        PW_UI_STORAGE_PATH: path.join(runRoot, "{user}.json"),
        PW_UI_USERS: "SOLICITOR",
        PW_UI_MANUAL_USERS: "SOLICITOR",
      },
      async () => {
        await expect(
          ensureUiStorageStateForUser("SOLICITOR", { strict: true }),
        ).rejects.toThrow("Manual session required");
      },
    );

    await fs.rm(runRoot, { recursive: true, force: true });
  });

  test("ensureUiStorageStateForUser detects storage user mismatch without launching browser", async () => {
    const runRoot = path.join(
      process.cwd(),
      "tmp",
      "session-coverage",
      `mismatch-${Date.now()}`,
    );
    const storageTemplate = path.join(runRoot, "{user}.json");
    const storagePath = path.join(runRoot, "solicitor.json");
    const validUntil = Math.floor(Date.now() / 1000) + 600;

    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(
      storagePath,
      JSON.stringify({
        cookies: [
          {
            name: "__auth__",
            value: buildJwt({ email: "other.user@example.com" }),
            expires: validUntil,
          },
        ],
      }),
      "utf8",
    );

    await withEnv(
      {
        PW_UI_STORAGE_PATH: storageTemplate,
        PW_UI_USERS: "SOLICITOR",
        PW_UI_MANUAL_USERS: "SOLICITOR",
        SOLICITOR_USERNAME: "expected.user@example.com",
        SOLICITOR_PASSWORD: "password",
      },
      async () => {
        await expect(
          ensureUiStorageStateForUser("SOLICITOR", { strict: false }),
        ).resolves.toBeUndefined();
        const saved = JSON.parse(await fs.readFile(storagePath, "utf8")) as {
          cookies?: Array<{ name?: string }>;
        };
        expect(Array.isArray(saved.cookies)).toBe(true);
      },
    );

    await fs.rm(runRoot, { recursive: true, force: true });
  });
});
