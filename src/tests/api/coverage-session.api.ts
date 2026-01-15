import { promises as fs } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv";
import { resolveUiStorageTtlMinutes } from "../../utils/ui/session-storage.utils";
import { resolveUiStoragePathForUser } from "../../utils/ui/storage-state.utils";
import { UserUtils } from "../../utils/ui/user.utils";
import { loadSessionCookies } from "../e2e/integration/utils/session.utils";

test.describe.configure({ mode: "serial" });

test.describe("Session and user utilities coverage", () => {
  test("UserUtils returns credentials for known users and errors on unknown", async () => {
    await withEnv(
      { SOLICITOR_USERNAME: "user@example.com", SOLICITOR_PASSWORD: "pass" },
      () => {
        const userUtils = new UserUtils();
        const creds = userUtils.getUserCredentials("SOLICITOR");
        expect(creds.email).toContain("@");
        expect(creds.password).toBe("pass");
        expect(() => userUtils.getUserCredentials("UNKNOWN_USER")).toThrow("User \"UNKNOWN_USER\" is not configured");
      }
    );
  });

  test("loadSessionCookies reads stored cookies and handles invalid data", async () => {
    await withEnv(
      { SOLICITOR_USERNAME: "user@example.com", SOLICITOR_PASSWORD: "pass" },
      async () => {
        const storagePath = resolveUiStoragePathForUser("SOLICITOR");
        await fs.mkdir(path.dirname(storagePath), { recursive: true });

        await fs.writeFile(
          storagePath,
          JSON.stringify({ cookies: [{ name: "__userid__", value: "user-1" }] }),
          "utf8"
        );
        const loaded = loadSessionCookies("SOLICITOR");
        expect(loaded.cookies).toHaveLength(1);

        await fs.writeFile(storagePath, "{bad-json", "utf8");
        const invalid = loadSessionCookies("SOLICITOR");
        expect(invalid.cookies).toHaveLength(0);

        await fs.rm(storagePath, { force: true });
      }
    );
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
});
