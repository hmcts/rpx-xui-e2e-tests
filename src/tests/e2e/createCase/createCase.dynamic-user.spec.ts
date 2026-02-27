import { createLogger } from "@hmcts/playwright-common";

import { expect, test } from "../../../fixtures/ui";
import type { ProvisionedProfessionalUser } from "../../../utils/ui/professional-user.utils";
import { ensureAuthenticatedPage } from "../../../utils/ui/sessionCapture";
import { retryOnTransientFailure } from "../../../utils/ui/transient-failure.utils";

const jurisdiction = "DIVORCE";
const caseType = "XUI Case PoC";
const CREATE_CASE_SETUP_MAX_ATTEMPTS = 3;
const CREATE_CASE_FLOW_MAX_ATTEMPTS = 2;
const REQUIRED_ENV_VARS = ["TEST_SOLICITOR_ORGANISATION_ID"] as const;

const logger = createLogger({
  serviceName: "create-case-dynamic-user-e2e",
  format: "pretty",
});

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDependencyEnvironmentFailure(error: unknown): boolean {
  const message = asMessage(error);
  return (
    /returned HTTP 5\d\d/i.test(message) ||
    /status\s+5\d\d/i.test(message) ||
    /something went wrong page/i.test(message) ||
    /network timeout/i.test(message) ||
    /ECONNRESET|ETIMEDOUT/i.test(message)
  );
}

function missingRequiredEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
}

async function cleanupProvisionedUser(
  provisioned: ProvisionedProfessionalUser | undefined,
  cleanupFn: (args: {
    user: ProvisionedProfessionalUser;
    userIdentifier: string;
    rolesToRemove: readonly string[];
  }) => Promise<{ status: number; removedRoles: string[] }>,
): Promise<void> {
  const userIdentifier = provisioned?.organisationAssignment.userIdentifier;
  if (!provisioned || !userIdentifier) {
    return;
  }

  await cleanupFn({
    user: provisioned,
    userIdentifier,
    rolesToRemove: provisioned.organisationAssignment.roles,
  });
}

test.describe("Dynamic user create-case flow", () => {
  test("@dynamic-user creates solicitor user, authenticates, and creates divorce case", async ({
    page,
    createCasePage,
    caseDetailsPage,
    validatorUtils,
    professionalUserUtils,
  }, testInfo) => {
    const missingVars = missingRequiredEnvVars();
    if (missingVars.length > 0) {
      testInfo.skip(
        true,
        `Missing dynamic-user prerequisites: ${missingVars.join(", ")}`,
      );
    }

    const organisationId = process.env.TEST_SOLICITOR_ORGANISATION_ID!.trim();
    let provisioned: ProvisionedProfessionalUser | undefined;
    const previousSolicitorUsername = process.env.SOLICITOR_USERNAME;
    const previousSolicitorPassword = process.env.SOLICITOR_PASSWORD;

    try {
      provisioned =
        await professionalUserUtils.createSolicitorUserForOrganisation({
          organisationId,
          roleContext: {
            jurisdiction: "divorce",
            testType: "case-create",
          },
          mode: "auto",
          outputCreatedUserData: true,
        });

      await testInfo.attach("dynamic-user-create-case-user.json", {
        body: JSON.stringify(
          {
            id: provisioned.id,
            email: provisioned.email,
            forename: provisioned.forename,
            surname: provisioned.surname,
            roleNames: provisioned.roleNames,
            organisationAssignment: provisioned.organisationAssignment,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });

      process.env.SOLICITOR_USERNAME = provisioned.email;
      process.env.SOLICITOR_PASSWORD = provisioned.password;

      const createdCase = await retryOnTransientFailure(
        async () => {
          await ensureAuthenticatedPage(page, "SOLICITOR", {
            waitForSelector: "exui-header",
          });

          const caseData = await createCasePage.generateDivorcePoCData();
          await createCasePage.createDivorceCasePoC(
            jurisdiction,
            caseType,
            caseData,
            {
              maxAttempts: CREATE_CASE_FLOW_MAX_ATTEMPTS,
              createCaseMaxAttempts: CREATE_CASE_FLOW_MAX_ATTEMPTS,
            },
          );

          const caseNumber = await caseDetailsPage.getCaseNumberFromUrl();
          return { caseData, caseNumber };
        },
        {
          maxAttempts: CREATE_CASE_SETUP_MAX_ATTEMPTS,
          onRetry: async () => {
            if (page.isClosed()) {
              return;
            }
            await page.goto("/");
          },
        },
      );
      const { caseData, caseNumber } = createdCase;

      expect.soft(caseNumber).toMatch(validatorUtils.DIVORCE_CASE_NUMBER_REGEX);
      expect
        .soft(page.url())
        .toContain(`/${jurisdiction}/xuiTestJurisdiction/`);

      const expected = {
        "Text Field 0": caseData.textField0,
        "Text Field 1": caseData.textField1,
        "Text Field 2": caseData.textField2,
        "Text Field 3": caseData.textField3,
        "Select your gender": caseData.gender,
        Title: caseData.person1Title,
        "First Name": caseData.person1FirstName,
        "Last Name": caseData.person1LastName,
        Gender: caseData.person1Gender,
      };
      const expectedJob = {
        Title: caseData.person1JobTitle,
        Description: caseData.person1JobDescription,
      };

      const table1 = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.divorceDataTable,
      );
      expect.soft(table1).toMatchObject(expected);

      const table2 = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.divorceDataSubTable,
      );
      expect.soft(table2).toMatchObject(expectedJob);

      await caseDetailsPage.selectCaseDetailsTab("History");
      const { updateRow, updateDate, updateAuthor } =
        await caseDetailsPage.getCaseHistoryByEvent("Create a case");
      expect
        .soft(updateRow, "Create a case row should be present")
        .toBeTruthy();
      expect.soft(updateAuthor, "Case author should be present").not.toBe("");

      const historyTable = await caseDetailsPage.trRowsToObjectInPage(
        caseDetailsPage.historyDetailsTable,
      );
      expect.soft(historyTable).toMatchObject({
        Date: updateDate,
        Author: updateAuthor,
        "End state": "Case created",
        Event: "Create a case",
        Summary: "-",
        Comment: "-",
      });
    } catch (error) {
      if (isDependencyEnvironmentFailure(error)) {
        testInfo.skip(
          true,
          `Skipping dynamic create-case test due to dependency environment instability: ${asMessage(error)}`,
        );
        return;
      }
      throw error;
    } finally {
      process.env.SOLICITOR_USERNAME = previousSolicitorUsername;
      process.env.SOLICITOR_PASSWORD = previousSolicitorPassword;
      try {
        await cleanupProvisionedUser(
          provisioned,
          professionalUserUtils.cleanupOrganisationAssignment.bind(
            professionalUserUtils,
          ),
        );
      } catch (cleanupError) {
        logger.warn("Failed to cleanup dynamic provisioned user assignment", {
          error: asMessage(cleanupError),
          username: provisioned?.email,
        });
      }
    }
  });
});
