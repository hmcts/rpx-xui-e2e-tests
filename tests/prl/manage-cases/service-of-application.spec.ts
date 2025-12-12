import { test } from "../../../fixtures/test";
import { completeServiceOfApplication } from "../../../utils/prl/journeys/serviceOfApplication";

test.describe("@prl @manage-cases Service of application", () => {
  test("Court bailiff serves solicitor case", async ({ page }) => {
    const caseRef = await completeServiceOfApplication({ page });
    await test.step("Verify confirmation banner", async () => {
      await page.getByText(/Service of application/).waitFor();
    });
    test.info().annotations.push({ type: "caseRef", description: caseRef });
  });
});
