import { expect, test } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv";
import { UserUtils } from "../../utils/ui/user.utils";
import { resolveIntegrationSessionWarmupUsers } from "../integration/helpers/searchCaseSession.helper";

test.describe("Search-case support coverage", () => {
  test("FPL global search credentials fall back to the source-compatible AAT account when env vars are absent", async () => {
    await withEnv(
      {
        FPL_GLOBAL_SEARCH_USERNAME: undefined,
        FPL_GLOBAL_SEARCH_PASSWORD: undefined,
        TEST_ENV: "aat"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("FPL_GLOBAL_SEARCH")).toEqual({
          email: "fpl-ctsc-admin@justice.gov.uk",
          password: "Password12"
        });
      }
    );
  });

  test("FPL global search credentials keep the source-compatible baseline even when env vars are present", async () => {
    await withEnv(
      {
        FPL_GLOBAL_SEARCH_USERNAME: "search-user@example.com",
        FPL_GLOBAL_SEARCH_PASSWORD: "search-pass",
        CASEWORKER_R1_USERNAME: "caseworker-r1@example.com",
        CASEWORKER_R1_PASSWORD: "caseworker-pass"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("FPL_GLOBAL_SEARCH")).toEqual({
          email: "fpl-ctsc-admin@justice.gov.uk",
          password: "Password12"
        });
      }
    );
  });

  test("search-case alias users keep the source-compatible baseline even when env vars are present", async () => {
    await withEnv(
      {
        CASEWORKER_GLOBALSEARCH_USERNAME: "caseworker-globalsearch@example.com",
        CASEWORKER_GLOBALSEARCH_PASSWORD: "caseworker-globalsearch-pass",
        WA2_GLOBAL_SEARCH_USERNAME: "wa2-globalsearch@example.com",
        WA2_GLOBAL_SEARCH_PASSWORD: "wa2-globalsearch-pass"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("CASEWORKER_GLOBALSEARCH")).toEqual({
          email: "exuigsuser@mailinator.com",
          password: "Welcome01"
        });
        expect(userUtils.getUserCredentials("WA2_GLOBAL_SEARCH")).toEqual({
          email: "exuigsuser@mailinator.com",
          password: "Welcome01"
        });
      }
    );
  });

  test("SOLICITOR resolves from the source-compatible default account when env vars are absent", async () => {
    await withEnv(
      {
        SOLICITOR_USERNAME: undefined,
        SOLICITOR_PASSWORD: undefined,
        TEST_ENV: "aat"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("SOLICITOR")).toEqual({
          email: "xui_auto_test_user_solicitor@mailinator.com",
          password: "Monday01"
        });
      }
    );
  });

  test("USER_WITH_FLAGS uses configured credentials when they are available", async () => {
    await withEnv(
      {
        USER_WITH_FLAGS_USERNAME: "flags-user@example.com",
        USER_WITH_FLAGS_PASSWORD: "flags-password",
        TEST_ENV: "aat"
      },
      () => {
        const userUtils = new UserUtils();
        expect(userUtils.getUserCredentials("USER_WITH_FLAGS")).toEqual({
          email: "flags-user@example.com",
          password: "flags-password"
        });
      }
    );
  });

  test("integration session warmup users match the source baseline and include configured search users", async () => {
    await withEnv(
      {
        PW_INTEGRATION_SESSION_WARMUP_USERS: undefined,
        PW_SEARCH_CASE_SESSION_USERS: "FPL_GLOBAL_SEARCH,CASEWORKER_R1"
      },
      () => {
        expect(resolveIntegrationSessionWarmupUsers()).toEqual([
          "FPL_GLOBAL_SEARCH",
          "SOLICITOR",
          "STAFF_ADMIN",
          "CASEWORKER_R1"
        ]);
      }
    );
  });
});
