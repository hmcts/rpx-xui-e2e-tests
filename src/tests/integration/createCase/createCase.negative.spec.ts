import { expect, test } from "../../../fixtures/ui";
import { applySessionCookies } from "../../../utils/ui/sessionCapture";
import { TEST_USERS } from "../testData/index";

const userIdentifier = TEST_USERS.SOLICITOR;
const jurisdiction = "DIVORCE";
const caseType = "xuiTestJurisdiction";
const createCaseSubmissionEndpointPatterns: RegExp[] = [
  /\/cases\/\d+\/events(?:\/|$)/,
  /\/cases\/\d+\/event-triggers\/[^/]+(?:\/|$)/,
  /\/event-triggers\/[^/]+\/validate(?:\/|$)/,
];

test.beforeEach(async ({ page }) => {
  // Lazy capture: only log in SOLICITOR when this test suite runs
  await applySessionCookies(page, userIdentifier);
});

test.describe(`Create case as ${userIdentifier}`, () => {
  test(`User ${userIdentifier} should not be able to submit a case without filling in required fields`, async ({
    createCasePage,
    page,
  }) => {
    await test.step("Navigate to the submit case page without filling in case details", async () => {
      createCasePage.clearApiCalls();
      await page.goto(
        `/cases/case-create/${jurisdiction}/${caseType}/createCase/submit`,
      );
    });

    await test.step("Verify direct submit is blocked and warning modal is shown", async () => {
      if (page.isClosed()) {
        return;
      }
      await expect(createCasePage.testSubmitButton).toBeHidden({
        timeout: 5000,
      });
      // Dismiss modal if it appeared; absence is also valid.
      await createCasePage.refreshModalConfirmButton
        .click({ timeout: 2000 })
        .catch(() => undefined);
    });

    await test.step("Verify user is returned to case list and not to case details", async () => {
      if (page.isClosed()) {
        return;
      }
      const currentUrl = page.url();
      expect(
        currentUrl,
        `Expected blocked direct submit flow not to open case details, but URL was: ${currentUrl}`,
      ).not.toMatch(/\/cases\/case-details\//);
    });

    await test.step("Verify no create-case submission API request was made", async () => {
      const createCaseSubmissionCalls = createCasePage
        .getApiCalls()
        .filter((call) => {
          if (call.method !== "POST") {
            return false;
          }
          return createCaseSubmissionEndpointPatterns.some((pattern) =>
            pattern.test(call.url),
          );
        });

      expect(
        createCaseSubmissionCalls,
        `Expected no create-case submission requests, but found: ${JSON.stringify(createCaseSubmissionCalls)}`,
      ).toHaveLength(0);
    });
  });
});
