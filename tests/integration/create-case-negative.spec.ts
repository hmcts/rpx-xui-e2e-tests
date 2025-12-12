import { expect, test } from "../../fixtures/test.ts";

const CREATE_USER = "SOLICITOR";
const jurisdiction = "DIVORCE";
const caseType = "xuiTestJurisdiction";

const getUserIfPresent = (
  userUtils: { getUserCredentials: (id: string) => { email: string; password: string } },
  id: string,
) => {
  try {
    return userUtils.getUserCredentials(id);
  } catch {
    return undefined;
  }
};

// Pending enablement in product; kept as documentation of expected guard behaviour.
test.describe("@integration create case negative", () => {
  test.beforeEach(async ({ userUtils, loginAs }) => {
    if (!getUserIfPresent(userUtils, CREATE_USER)) {
      throw new Error(`${CREATE_USER} credentials are not configured`);
    }
    await loginAs(CREATE_USER);
  });

  test("user cannot submit a case without required data", async ({ createCasePage, page }) => {
    await page.goto(`/cases/case-create/${jurisdiction}/${caseType}/createCase/submit`);

    await expect(createCasePage.exuiHeader.header).toBeVisible();
    await expect(createCasePage.testSubmitButton).toBeVisible();
    await expect(createCasePage.testSubmitButton).toBeDisabled();
    await expect(createCasePage.exuiCaseDetailsComponent.caseHeader).not.toBeVisible();
    await expect(page).not.toHaveURL(
      `/cases/case-create/${jurisdiction}/${caseType}/createCase/submit`,
    );
  });
});
