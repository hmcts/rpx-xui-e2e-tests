import { ApiClient } from "@hmcts/playwright-common";

import { withXsrf } from "./apiTestUtils.ts";
import { extractCaseShareEntries, type CaseShareCase } from "./types.ts";

/**
 * Attempts to derive a role-access caseId using the caseshare API.
 * Returns undefined if none found.
 */
export async function seedRoleAccessCaseId(apiClient: ApiClient): Promise<string | undefined> {
  try {
    return await withXsrf("solicitor", async (headers) => {
      const res = await apiClient.get<CaseShareCase[] | { cases?: CaseShareCase[] }>(
        "caseshare/cases",
        {
          headers,
          throwOnError: false,
        },
      );
      const cases = extractCaseShareEntries(res.data, "cases");
      const first =
        Array.isArray(cases) && cases.length > 0 ? (cases[0] as CaseShareCase) : undefined;
      const id = first?.caseId ?? first?.case_id;
      return typeof id === "string" && id.trim().length > 0 ? id : undefined;
    });
  } catch {
    return undefined;
  }
}
