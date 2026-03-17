import { test, expect } from "../../fixtures/api";
import {
  withXsrf,
  withRetry,
  expectStatus,
  StatusSets,
} from "../../utils/api/apiTestUtils";
import { expectAddressLookupShape } from "../../utils/api/assertions";
import { shouldAssertAddress } from "../../utils/api/postcodeLookupUtils";
import type { AddressLookupResponse } from "../../utils/api/types";

test.describe("Postcode lookup", { tag: "@svc-postcode-lookup" }, () => {
  test("returns address data for postcode E1", async ({ apiClient }) => {
    const postcode = "E1 8QS";

    await withXsrf("solicitor", async (headers) => {
      const response = await withRetry(
        () =>
          apiClient.get<AddressLookupResponse>(
            `api/addresses?postcode=${encodeURIComponent(postcode)}`,
            {
              headers,
              throwOnError: false,
            },
          ),
        { retries: 2, retryStatuses: [502, 504], baseDelayMs: 400 },
      );

      expectStatus(
        response.status,
        StatusSets.guardedBasic.filter((s) => s !== 403),
      );
      if (!shouldAssertAddress(response.status)) {
        return;
      }

      expectAddressLookupShape(response.data);
    });
  });
});

test.describe(
  "Postcode lookup helper coverage",
  { tag: "@svc-postcode-lookup" },
  () => {
    test("shouldAssertAddress handles guarded status", () => {
      expect(shouldAssertAddress(200)).toBe(true);
      expect(shouldAssertAddress(500)).toBe(false);
    });
  },
);
