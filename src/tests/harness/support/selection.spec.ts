import { test, expect } from "@playwright/test";

import { buildHarnessConfig } from "../../../harness/candidate";

test("support selection needs no runtime or authentication", () => {
  const config = buildHarnessConfig("support");
  expect(config.testMatch).toBe("**/support/*.spec.ts");
  expect(config.use.baseURL).toBeUndefined();
  expect(config.retries).toBe(0);
  expect(() => buildHarnessConfig("candidate")).toThrow(
    "CANDIDATE_IDENTITY_AND_MACHINE_REPORT_REQUIRED",
  );
});
