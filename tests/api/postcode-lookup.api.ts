import { test } from "./fixtures.ts";
import { withXsrf, expectStatus, StatusSets } from "./utils/apiTestUtils.ts";
import { expectAddressLookupShape } from "./utils/assertions.ts";
import type { AddressLookupResponse } from "./utils/types.ts";

test.describe("@api postcode lookup", () => {
  test("returns address data for postcode E1", async ({ apiClient }) => {
    await withXsrf("solicitor", async (headers) => {
      const response = await apiClient.get<AddressLookupResponse>("api/addresses?postcode=E1", {
        headers,
        throwOnError: false,
      });

      expectStatus(
        response.status,
        StatusSets.guardedBasic.filter((s) => s !== 403),
      );
      if (response.status !== 200) {
        return;
      }

      expectAddressLookupShape(response.data);
    });
  });
});
