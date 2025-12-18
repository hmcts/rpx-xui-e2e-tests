import { EM_DOC_ID } from "../../data/api/testIds";
import { test, expect } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";

test.describe("Evidence manager", () => {
  test("document download guarded", async ({ apiClient }) => {
    const docId = EM_DOC_ID;
    const response = await apiClient.get(`em-npa/documents/${docId}/binary`, { throwOnError: false });
    expectStatus(response.status, StatusSets.guardedBasic);
    if (response.status === 200) {
      expect(response.data).toBeTruthy();
    }
  });
});
