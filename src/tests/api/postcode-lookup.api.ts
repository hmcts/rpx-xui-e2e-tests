import { test, expect } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";
import { expectAddressLookupShape } from "../../utils/api/assertions";

const endpoints = [
  {
    path: "external/postcodeLookup?postcode=SW1A1AA",
    expected: StatusSets.okOrBadRequest,
  },
  {
    path: "external/postcodeLookup?postcode=",
    expected: StatusSets.okOrBadRequest,
  },
];

test.describe("Postcode lookup", () => {
  for (const { path, expected } of endpoints) {
    test(`GET ${path}`, async ({ apiClient }) => {
      const response = await apiClient.get<unknown>(path, {
        throwOnError: false,
      });
      expectStatus(response.status, expected);
      assertPostcodeLookupResponse(response);
    });
  }
});

function assertPostcodeLookupResponse(response: {
  status: number;
  data: unknown;
}): void {
  if (response.status === 200) {
    expect(response.data).toBeTruthy();
    expectAddressLookupShape(response.data);
  }
}
