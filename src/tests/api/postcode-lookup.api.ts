import { test, expect } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";

const endpoints = [
  { path: "external/postcodeLookup?postcode=SW1A1AA", expected: StatusSets.okOrBadRequest },
  { path: "external/postcodeLookup?postcode=", expected: StatusSets.okOrBadRequest }
];

test.describe("Postcode lookup", () => {
  for (const { path, expected } of endpoints) {
    test(`GET ${path}`, async ({ apiClient }) => {
      const response = await apiClient.get<unknown>(path, { throwOnError: false });
      expectStatus(response.status, expected);
      assertPostcodeLookupResponse(response);
    });
  }
});

function assertPostcodeLookupResponse(response: { status: number; data: unknown }): void {
  if (response.status === 200) {
    expect(response.data).toBeTruthy();
    if (Array.isArray(response.data) && response.data.length > 0) {
      expect((response.data as unknown[])[0]).toEqual(
        expect.objectContaining({
          DPA: expect.anything()
        })
      );
    }
  }
}
