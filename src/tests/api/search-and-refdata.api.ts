import { test, expect } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";

const ENDPOINTS = [
  { path: "api/globalSearch/services", name: "global search services", expected: StatusSets.globalSearch },
  { path: "api/globalSearch/results", name: "global search results", expected: StatusSets.globalSearch },
  { path: "api/wa-supported-jurisdiction/get", name: "WA supported jurisdictions", expected: StatusSets.roleAccessRetryable },
  { path: "api/wa-supported-jurisdiction/detail", name: "WA supported jurisdiction detail", expected: StatusSets.roleAccessRetryable },
  { path: "api/staff-supported-jurisdiction/get", name: "staff supported jurisdictions", expected: StatusSets.roleAccessRetryable },
  { path: "api/ref-data/services", name: "ref data services", expected: StatusSets.roleAccessRetryable },
  { path: "api/ref-data/regions", name: "ref data regions", expected: StatusSets.roleAccessRetryable },
  { path: "api/ref-data/locations-by-service-code", name: "ref data locations by service", expected: StatusSets.roleAccessRetryable },
  { path: "api/ref-data/locations", name: "ref data locations", expected: StatusSets.roleAccessRetryable },
  { path: "api/staff-ref-data/getUserTypes", name: "staff ref data user types", expected: StatusSets.roleAccessRetryable },
  { path: "api/staff-ref-data/getJobTitles", name: "staff ref data job titles", expected: StatusSets.roleAccessRetryable },
  { path: "api/staff-ref-data/getSkills", name: "staff ref data skills", expected: StatusSets.roleAccessRetryable }
];

test.describe("Search and ref data", () => {
  for (const { path, name, expected } of ENDPOINTS) {
    test(`GET ${name}`, async ({ apiClient }) => {
      const response = await apiClient.get(path, { throwOnError: false });
      expectStatus(response.status, expected);
      if (response.status === 200) {
        expect(response.data).toBeTruthy();
      }
    });
  }
});
