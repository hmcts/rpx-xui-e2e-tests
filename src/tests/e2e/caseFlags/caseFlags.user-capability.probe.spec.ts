import { expect, test } from "../../../fixtures/ui";
import { ensureSessionCookies } from "../../../utils/integration/session.utils.js";

test.describe("Case flags user capability probe", () => {
  test("candidate user can run party flags flow prerequisites", async () => {
    await ensureSessionCookies("DIVORCE_FLAGS_ADMIN", {
      strict: true,
    });

    expect(true).toBe(true);
  });
});
