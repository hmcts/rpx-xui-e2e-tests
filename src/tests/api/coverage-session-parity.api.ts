import { expect, test } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv";
import {
  resolveSearchCaseSessionCandidateUsers,
  resolveSearchCaseSessionUsers,
  resolveSearchCaseUserIdentifier
} from "../integration/helpers/searchCaseSession.helper";

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
});
