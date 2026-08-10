import { expect, test } from "../../../fixtures/ui";
import { applySessionCookies, openCreateCaseJourney, setupCreateCaseBaseRoutes } from "../helpers/index.js";
import { dynamicFieldConfigCaseData } from "../mocks/dynamicFieldConfig.mock.js";

test.describe(
  "Create case dynamic field-config validation",
  { tag: ["@integration-bucket-2", "@integration", "@integration-create-case"] },
  () => {
    test.beforeEach(async ({ createCasePage, page }) => {
      await applySessionCookies(page, "SOLICITOR");
      await setupCreateCaseBaseRoutes(page, { caseData: dynamicFieldConfigCaseData() });
      await openCreateCaseJourney(page, createCasePage, {
        jurisdiction: "DIVORCE",
        caseType: "xuiTestJurisdiction",
        afterNavigation: async () => expect(page.getByLabel("Case title")).toBeVisible()
      });
    });

    test("rejects a value that violates configured regular-expression validation", async ({ createCasePage, page }) => {
      await page.getByLabel("Case title").fill("A title");
      await page.locator("#CaseReference").fill("12");
      await createCasePage.continueButton.click();

      await expect(page.locator("#CaseReference")).toHaveValue("12");
      await expect(page.getByRole("heading", { name: "Check your answers" })).toBeHidden();
    });

    test("makes a conditionally mandatory field required when its controller selects urgent", async ({ createCasePage, page }) => {
      await page.getByLabel("Case title").fill("An urgent case");
      await page.getByLabel("Case type").selectOption({ label: "Urgent" });
      await page.locator("#CaseReference").fill("123");
      await createCasePage.continueButton.click();

      await expect(page.locator(".govuk-error-message, .validation-error").filter({ hasText: /reason for urgent handling/i })).toBeVisible();
      await expect(page.getByLabel("Reason for urgent handling")).toBeVisible();
    });
  }
);
