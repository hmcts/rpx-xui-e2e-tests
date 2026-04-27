import { expect, test } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv";
import {
  resolveSearchCaseSessionCandidateUsers,
  resolveSearchCaseSessionUsers,
  resolveSearchCaseUserIdentifier
} from "../integration/helpers/searchCaseSession.helper";
import {
  resolveConfiguredWelshLanguageSessionIdentities,
  resolveWelshLanguageSessionUser,
  resolveWelshLanguageSessionUsers
} from "../integration/helpers/welshLanguageSession.helper";

test.describe("Parity session helper coverage", () => {
  test("search-case session helpers honour configured user rotation", async () => {
    await withEnv(
      {
        PW_SEARCH_CASE_SESSION_USERS: "FPL_GLOBAL_SEARCH,CASEWORKER_R2"
      },
      () => {
        expect(resolveSearchCaseSessionUsers()).toEqual(["FPL_GLOBAL_SEARCH", "CASEWORKER_R2"]);
        expect(resolveSearchCaseUserIdentifier({ workerIndex: 0 })).toBe("FPL_GLOBAL_SEARCH");
        expect(resolveSearchCaseUserIdentifier({ workerIndex: 1 })).toBe("CASEWORKER_R2");
        expect(resolveSearchCaseUserIdentifier({ workerIndex: 2 })).toBe("FPL_GLOBAL_SEARCH");
      }
    );
  });

  test("search-case session helpers retain configured users and search-capable fallbacks when the dedicated user is preferred", async () => {
    await withEnv(
      {
        PW_SEARCH_CASE_SESSION_USERS: "FPL_GLOBAL_SEARCH,CASEWORKER_R2"
      },
      () => {
        expect(resolveSearchCaseSessionCandidateUsers("FPL_GLOBAL_SEARCH")).toEqual([
          "FPL_GLOBAL_SEARCH",
          "CASEWORKER_R2",
          "CASEWORKER_GLOBALSEARCH",
          "WA2_GLOBAL_SEARCH",
          "CASEWORKER_R1"
        ]);
        expect(resolveSearchCaseSessionCandidateUsers("CASEWORKER_R2")).toEqual([
          "CASEWORKER_R2",
          "FPL_GLOBAL_SEARCH"
        ]);
      }
    );
  });

  test("search-case session helpers allow configured override pools even when the preferred user is absent", async () => {
    await withEnv(
      {
        PW_SEARCH_CASE_SESSION_USERS: "COURT_ADMIN,STAFF_ADMIN"
      },
      () => {
        expect(resolveSearchCaseSessionCandidateUsers("FPL_GLOBAL_SEARCH")).toEqual([
          "FPL_GLOBAL_SEARCH",
          "COURT_ADMIN",
          "STAFF_ADMIN",
          "CASEWORKER_GLOBALSEARCH",
          "WA2_GLOBAL_SEARCH",
          "CASEWORKER_R1"
        ]);
      }
    );
  });

  test("search-case session helpers still include the generic caseworker as the last fallback", async () => {
    await withEnv(
      {
        PW_SEARCH_CASE_SESSION_USERS: undefined
      },
      () => {
        expect(resolveSearchCaseSessionCandidateUsers("FPL_GLOBAL_SEARCH")).toEqual([
          "FPL_GLOBAL_SEARCH",
          "CASEWORKER_GLOBALSEARCH",
          "WA2_GLOBAL_SEARCH",
          "CASEWORKER_R1"
        ]);
      }
    );
  });

  test("Welsh-language session helpers prefer configured credentialed users and rotate by worker", async () => {
    await withEnv(
      {
        PW_WELSH_LANGUAGE_SESSION_USERS: "PRL_SOLICITOR,SOLICITOR",
        SOLICITOR_USERNAME: "solicitor@example.com",
        SOLICITOR_PASSWORD: "solicitor-pass",
        PRL_SOLICITOR_USERNAME: "prl-solicitor@example.com",
        PRL_SOLICITOR_PASSWORD: "prl-pass"
      },
      () => {
        expect(resolveWelshLanguageSessionUsers()).toEqual([
          {
            userIdentifier: "PRL_SOLICITOR",
            email: "prl-solicitor@example.com",
            password: "prl-pass"
          },
          {
            userIdentifier: "SOLICITOR",
            email: "solicitor@example.com",
            password: "solicitor-pass"
          }
        ]);
        expect(resolveWelshLanguageSessionUser({ workerIndex: 0 })).toEqual({
          userIdentifier: "PRL_SOLICITOR",
          email: "prl-solicitor@example.com",
          password: "prl-pass"
        });
        expect(resolveWelshLanguageSessionUser({ workerIndex: 1 })).toEqual({
          userIdentifier: "SOLICITOR",
          email: "solicitor@example.com",
          password: "solicitor-pass"
        });
        expect(resolveWelshLanguageSessionUser({ workerIndex: 2 })).toEqual({
          userIdentifier: "PRL_SOLICITOR",
          email: "prl-solicitor@example.com",
          password: "prl-pass"
        });
      }
    );
  });

  test("Welsh-language session helpers collapse duplicate-email aliases into one pooled identity", async () => {
    await withEnv(
      {
        PW_WELSH_LANGUAGE_SESSION_USERS: "PRL_SOLICITOR,SOLICITOR",
        SOLICITOR_USERNAME: "shared.solicitor@example.com",
        SOLICITOR_PASSWORD: "solicitor-pass",
        PRL_SOLICITOR_USERNAME: "shared.solicitor@example.com",
        PRL_SOLICITOR_PASSWORD: "prl-pass"
      },
      () => {
        expect(resolveConfiguredWelshLanguageSessionIdentities()).toEqual([
          {
            email: "shared.solicitor@example.com",
            password: "prl-pass",
            userIdentifier: "PRL_SOLICITOR"
          }
        ]);
        expect(resolveWelshLanguageSessionUsers()).toEqual([
          {
            email: "shared.solicitor@example.com",
            password: "prl-pass",
            userIdentifier: "PRL_SOLICITOR"
          }
        ]);
        expect(resolveWelshLanguageSessionUser({ workerIndex: 0 })).toEqual({
          email: "shared.solicitor@example.com",
          password: "prl-pass",
          userIdentifier: "PRL_SOLICITOR"
        });
        expect(resolveWelshLanguageSessionUser({ workerIndex: 1 })).toEqual({
          email: "shared.solicitor@example.com",
          password: "prl-pass",
          userIdentifier: "PRL_SOLICITOR"
        });
      }
    );
  });

  test("Welsh-language session helpers fall back to SOLICITOR when no configured session pool is credentialed", async () => {
    await withEnv(
      {
        PW_WELSH_LANGUAGE_SESSION_USERS: "PRL_SOLICITOR",
        PRL_SOLICITOR_USERNAME: undefined,
        PRL_SOLICITOR_PASSWORD: undefined,
        SOLICITOR_USERNAME: "solicitor@example.com",
        SOLICITOR_PASSWORD: "solicitor-pass"
      },
      () => {
        expect(resolveWelshLanguageSessionUsers()).toEqual(["SOLICITOR"]);
        expect(resolveWelshLanguageSessionUser({ workerIndex: 3 })).toBe("SOLICITOR");
      }
    );
  });
});
