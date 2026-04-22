import { expect, test } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv";
import {
  resolveSearchCaseSessionUsers,
  resolveSearchCaseUserIdentifier
} from "../integration/helpers/searchCaseSession.helper";
import {
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
        expect(resolveWelshLanguageSessionUsers()).toEqual(["PRL_SOLICITOR", "SOLICITOR"]);
        expect(resolveWelshLanguageSessionUser({ workerIndex: 0 })).toBe("PRL_SOLICITOR");
        expect(resolveWelshLanguageSessionUser({ workerIndex: 1 })).toBe("SOLICITOR");
        expect(resolveWelshLanguageSessionUser({ workerIndex: 2 })).toBe("PRL_SOLICITOR");
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
