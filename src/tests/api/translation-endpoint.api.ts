import { z } from "zod";

import { expect, test } from "../../fixtures/api";
import { expectStatus, StatusSets } from "../../utils/api/apiTestUtils";

const translationResponseSchema = z
  .object({
    translations: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

test.describe("Translation API contract", () => {
  test("GET /api/translation/cy is reachable and returns valid shape when successful", async ({
    apiClient,
  }) => {
    const response = await apiClient.get("api/translation/cy", {
      throwOnError: false,
    });

    // Translation endpoint behaviour varies by environment; validate payload only on 200.
    expectStatus(response.status, [...StatusSets.guardedExtended, 405]);

    // eslint-disable-next-line playwright/no-conditional-in-test -- Environment-conditional: translation endpoint availability varies across envs; guard prevents false failures in non-200 environments
    if (response.status !== 200) {
      return;
    }

    const payload = translationResponseSchema.parse(response.data);
    expect(payload.translations).toBeDefined();
    expect(
      Object.keys(payload.translations ?? {}).length,
      "Expected non-empty translations payload",
    ).toBeGreaterThan(0);
  });
});
