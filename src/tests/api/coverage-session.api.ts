import { promises as fs } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv";
import {
  __test__ as sessionStorageTestUtils,
  isTransientUiBootstrapFailure,
  navigateToBaseUrlWithRetry,
  resolveUiStorageTtlMinutes
} from "../../utils/ui/session-storage.utils";
import {
  readUiStorageMetadata,
  resolveUiStorageMetadataPath,
  resolveUiStoragePathForUser,
  writeUiStorageMetadata
} from "../../utils/ui/storage-state.utils";
import { UserUtils } from "../../utils/ui/user.utils";
import { loadSessionCookies } from "../e2e/integration/utils/session.utils";

test.describe.configure({ mode: "serial" });

const encodeJwtSection = (value: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const createTestJwt = (payload: Record<string, unknown>) =>
  `${encodeJwtSection({ alg: "none", typ: "JWT" })}.${encodeJwtSection(payload)}.signature`;

test.describe("Session and user utilities coverage", () => {
  test("UserUtils honours env overrides for source-dynamic users and errors on unknown", async () => {
    await withEnv(
      { CASEWORKER_R1_USERNAME: "user@example.com", CASEWORKER_R1_PASSWORD: "pass" },
      () => {
        const userUtils = new UserUtils();
        const creds = userUtils.getUserCredentials("CASEWORKER_R1");
        expect(creds).toEqual({
          email: "user@example.com",
          password: "pass"
        });
        expect(() => userUtils.getUserCredentials("UNKNOWN_USER")).toThrow("User \"UNKNOWN_USER\" is not configured");
      }
    );
  });

  test("UserUtils keeps restricted case file view parity users on source defaults even when env aliases are present", async () => {
    await withEnv(
      {
        RESTRICTED_CASE_FILE_VIEW_V1_1_ON_USERNAME: "override-on@example.test",
        RESTRICTED_CASE_FILE_VIEW_V1_1_ON_PASSWORD: "Override01",
        RESTRICTED_CASE_FILE_VIEW_OFF_USERNAME: "override-off@example.test",
        RESTRICTED_CASE_FILE_VIEW_OFF_PASSWORD: "Override02"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("RESTRICTED_CASE_FILE_VIEW_ON")).toEqual({
          email: "xui_casefileview_v11_on@mailinator.com",
          password: "Welcome01"
        });
        expect(userUtils.getUserCredentials("RESTRICTED_CASE_FILE_VIEW_OFF")).toEqual({
          email: "xui_casefileview_v11_off@mailinator.com",
          password: "Welcome01"
        });
      }
    );
  });

  test("UserUtils keeps source-static parity users on source defaults even when env values are present", async () => {
    await withEnv(
      {
        BOOKING_UI_FT_ON_USERNAME: "xui_bookingui_on@hmcts.net",
        BOOKING_UI_FT_ON_PASSWORD: "Locked01",
        FPL_GLOBAL_SEARCH_USERNAME: "fpl-alt@example.test",
        FPL_GLOBAL_SEARCH_PASSWORD: "AltPassword01",
        STAFF_ADMIN_USERNAME: "staff-admin@example.test",
        STAFF_ADMIN_PASSWORD: "AltWelcome01",
        HEARING_MANAGER_CR84_ON_USERNAME: "hearing-on@example.test",
        HEARING_MANAGER_CR84_ON_PASSWORD: "AltMonday01",
        HEARING_MANAGER_CR84_OFF_USERNAME: "hearing-off@example.test",
        HEARING_MANAGER_CR84_OFF_PASSWORD: "AltMonday02",
        RESTRICTED_CASE_ACCESS_ON_USERNAME: "restricted-on@example.test",
        RESTRICTED_CASE_ACCESS_ON_PASSWORD: "AltWelcome02",
        RESTRICTED_CASE_ACCESS_OFF_USERNAME: "restricted-off@example.test",
        RESTRICTED_CASE_ACCESS_OFF_PASSWORD: "AltWelcome03"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("SOLICITOR")).toEqual({
          email: "xui_auto_test_user_solicitor@mailinator.com",
          password: "Monday01"
        });
        expect(userUtils.getUserCredentials("BOOKING_UI-FT-ON")).toEqual({
          email: "49932114EMP-@ejudiciary.net",
          password: "Hmcts1234"
        });
        expect(userUtils.getUserCredentials("FPL_GLOBAL_SEARCH")).toEqual({
          email: "fpl-ctsc-admin@justice.gov.uk",
          password: "Password12"
        });
        expect(userUtils.getUserCredentials("STAFF_ADMIN")).toEqual({
          email: "xui_caseofficer@justice.gov.uk",
          password: "Welcome01"
        });
        expect(userUtils.getUserCredentials("SEARCH_EMPLOYMENT_CASE")).toEqual({
          email: "employment_service@mailinator.com",
          password: "Nagoya0102"
        });
        expect(userUtils.getUserCredentials("USER_WITH_FLAGS")).toEqual({
          email: "henry_fr_harper@yahoo.com",
          password: "Nagoya0102"
        });
        expect(userUtils.getUserCredentials("RESTRICTED_CASE_FILE_VIEW_ON")).toEqual({
          email: "xui_casefileview_v11_on@mailinator.com",
          password: "Welcome01"
        });
        expect(userUtils.getUserCredentials("RESTRICTED_CASE_FILE_VIEW_OFF")).toEqual({
          email: "xui_casefileview_v11_off@mailinator.com",
          password: "Welcome01"
        });
        expect(userUtils.getUserCredentials("HEARING_MANAGER_CR84_ON")).toEqual({
          email: "xui_hearing_manager_cr84_on@justice.gov.uk",
          password: "Monday01"
        });
        expect(userUtils.getUserCredentials("HEARING_MANAGER_CR84_OFF")).toEqual({
          email: "xui_hearing_manager_cr84_off@justice.gov.uk",
          password: "Monday01"
        });
        expect(userUtils.getUserCredentials("RESTRICTED_CASE_ACCESS_ON")).toEqual({
          email: "xui_restricted_case_access_on@mailinator.com",
          password: "Welcome01"
        });
        expect(userUtils.getUserCredentials("RESTRICTED_CASE_ACCESS_OFF")).toEqual({
          email: "xui_restricted_case_access_off@mailinator.com",
          password: "Welcome01"
        });
      }
    );
  });

  test("loadSessionCookies reads stored cookies and handles invalid data", async () => {
    await withEnv(
      { SOLICITOR_USERNAME: "user@example.com", SOLICITOR_PASSWORD: "pass" },
      async () => {
        const storagePath = resolveUiStoragePathForUser("SOLICITOR");
        const legacyStoragePath = sessionStorageTestUtils.resolveLegacyUiStoragePathForUser("SOLICITOR");
        await fs.mkdir(path.dirname(storagePath), { recursive: true });
        await fs.rm(legacyStoragePath, { force: true });

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

        await fs.writeFile(
          legacyStoragePath,
          JSON.stringify({ cookies: [{ name: "__userid__", value: "legacy-user" }] }),
          "utf8"
        );
        const legacy = loadSessionCookies("SOLICITOR");
        expect(legacy.storageFile).toBe(legacyStoragePath);
        expect(legacy.cookies).toHaveLength(1);

        await fs.rm(legacyStoragePath, { force: true });
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

  test("resolveUiStoragePathForUser scopes storage state by user and email", () => {
    const storagePath = resolveUiStoragePathForUser("CASEWORKER_R1", {
      email: "Worker.One@example.com"
    });
    expect(path.basename(storagePath)).toBe("caseworker_r1-worker-one-example-com.json");
  });

  test("migrates legacy alias-scoped UI storage into the parity email-scoped path when identities match", async () => {
    await withEnv(
      {
        SOLICITOR_USERNAME: "xui_auto_test_user_solicitor@mailinator.com",
        SOLICITOR_PASSWORD: "Monday01"
      },
      async () => {
        const legacyPath = sessionStorageTestUtils.resolveLegacyUiStoragePathForUser("SOLICITOR");
        const storagePath = resolveUiStoragePathForUser("SOLICITOR");
        await fs.mkdir(path.dirname(legacyPath), { recursive: true });
        await fs.rm(storagePath, { force: true });
        await fs.rm(resolveUiStorageMetadataPath(storagePath), { force: true });

        await fs.writeFile(
          legacyPath,
          JSON.stringify({
            cookies: [
              { name: "Idam.Session", value: "session-cookie" },
              { name: "__auth__", value: createTestJwt({ sub: "xui_auto_test_user_solicitor@mailinator.com" }) }
            ]
          }),
          "utf8"
        );

        const migrated = sessionStorageTestUtils.migrateLegacyUiStorageStateIfPresent(
          "SOLICITOR",
          "xui_auto_test_user_solicitor@mailinator.com",
          storagePath
        );

        expect(migrated).toBe(true);
        expect(await fs.readFile(storagePath, "utf8")).toContain("session-cookie");
        expect(readUiStorageMetadata(storagePath)).toEqual(
          expect.objectContaining({
            userIdentifier: "SOLICITOR",
            email: "xui_auto_test_user_solicitor@mailinator.com"
          })
        );

        await fs.rm(legacyPath, { force: true });
        await fs.rm(storagePath, { force: true });
        await fs.rm(resolveUiStorageMetadataPath(storagePath), { force: true });
      }
    );
  });

  test("strict session validation reuses authenticated storage even when ttl is zero", async () => {
    await withEnv({ PW_UI_STORAGE_TTL_MIN: "0" }, async () => {
      const storagePath = resolveUiStoragePathForUser("CASEWORKER_R1", {
        email: "caseworker.one@example.com"
      });
      await fs.mkdir(path.dirname(storagePath), { recursive: true });
      await fs.writeFile(
        storagePath,
        JSON.stringify({
          cookies: [
            { name: "Idam.Session", value: "idam-session" },
            { name: "__auth__", value: "jwt-token" }
          ]
        }),
        "utf8"
      );
      writeUiStorageMetadata(storagePath, {
        userIdentifier: "CASEWORKER_R1",
        email: "caseworker.one@example.com"
      });

      const shouldRefresh = await sessionStorageTestUtils.shouldRefreshStorageState(
        storagePath,
        "https://example.test",
        {
          ignoreTtl: true,
          validateAuthenticatedState: async () => true,
          expectedIdentity: {
            userIdentifier: "CASEWORKER_R1",
            email: "caseworker.one@example.com"
          }
        }
      );

      expect(shouldRefresh).toBe(false);
      await fs.rm(storagePath, { force: true });
      await fs.rm(resolveUiStorageMetadataPath(storagePath), { force: true });
    });
  });

  test("strict session validation still refreshes unauthenticated storage even when ttl is zero", async () => {
    await withEnv({ PW_UI_STORAGE_TTL_MIN: "0" }, async () => {
      const storagePath = resolveUiStoragePathForUser("CASEWORKER_R1", {
        email: "caseworker.one@example.com"
      });
      await fs.mkdir(path.dirname(storagePath), { recursive: true });
      await fs.writeFile(
        storagePath,
        JSON.stringify({
          cookies: [
            { name: "Idam.Session", value: "idam-session" },
            { name: "__auth__", value: "jwt-token" }
          ]
        }),
        "utf8"
      );
      writeUiStorageMetadata(storagePath, {
        userIdentifier: "CASEWORKER_R1",
        email: "caseworker.one@example.com"
      });

      const shouldRefresh = await sessionStorageTestUtils.shouldRefreshStorageState(
        storagePath,
        "https://example.test",
        {
          ignoreTtl: true,
          validateAuthenticatedState: async () => false,
          expectedIdentity: {
            userIdentifier: "CASEWORKER_R1",
            email: "caseworker.one@example.com"
          }
        }
      );

      expect(shouldRefresh).toBe(true);
      await fs.rm(storagePath, { force: true });
      await fs.rm(resolveUiStorageMetadataPath(storagePath), { force: true });
    });
  });

  test("classifies initial page.goto timeout as transient UI bootstrap failure", () => {
    expect(isTransientUiBootstrapFailure(new Error("page.goto: Timeout 30000ms exceeded."))).toBe(true);
    expect(isTransientUiBootstrapFailure(new Error("Login page did not render."))).toBe(false);
  });

  test("navigateToBaseUrlWithRetry retries transient page.goto failures", async () => {
    let attempts = 0;
    const outcomes = [
      async () => {
        throw new Error("page.goto: Timeout 30000ms exceeded.");
      },
      async () => null
    ];

    const page = {
      goto: async () => {
        attempts += 1;
        return outcomes.shift()!();
      }
    };

    await navigateToBaseUrlWithRetry(page, "https://example.test", { maxAttempts: 2 });
    expect(attempts).toBe(2);
  });

  test("navigateToBaseUrlWithRetry does not retry non-transient failures", async () => {
    let attempts = 0;

    const page = {
      goto: async () => {
        attempts += 1;
        throw new Error("Unexpected base URL mismatch");
      }
    };

    await expect(
      navigateToBaseUrlWithRetry(page, "https://example.test", { maxAttempts: 2 })
    ).rejects.toThrow("Unexpected base URL mismatch");
    expect(attempts).toBe(1);
  });

  test("resolveUiLoginTargets preserves the app target and adds direct IDAM login fallback", async () => {
    await withEnv({ IDAM_WEB_URL: "https://idam-web-public.aat.platform.hmcts.net" }, () => {
      expect(
        sessionStorageTestUtils.resolveUiLoginTargets("https://manage-case.aat.platform.hmcts.net/cases")
      ).toEqual([
        "https://manage-case.aat.platform.hmcts.net/cases",
        "https://idam-web-public.aat.platform.hmcts.net/login"
      ]);
    });
  });

  test("isUiServiceUnavailablePage recognises front-door 504 pages", async () => {
    const page = {
      title: async () => "504 Gateway Time-out",
      locator: () => ({
        innerText: async () => "Our services aren't available right now"
      })
    } as unknown as Parameters<typeof sessionStorageTestUtils.isUiServiceUnavailablePage>[0];

    await expect(sessionStorageTestUtils.isUiServiceUnavailablePage(page)).resolves.toBe(true);
  });
});
