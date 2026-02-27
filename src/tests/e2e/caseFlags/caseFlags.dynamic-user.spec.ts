import { faker } from "@faker-js/faker";

import { expect, test } from "../../../fixtures/ui";
import { caseBannerMatches } from "../../../utils/ui/banner.utils";
import type { ProvisionedProfessionalUser } from "../../../utils/ui/professional-user.utils";
import { ensureAuthenticatedPage } from "../../../utils/ui/sessionCapture";
import { filterEmptyRows } from "../../../utils/ui";
import { rowMatchesExpected } from "../../../utils/ui/case-flags.utils";

const REQUIRED_ENV_VARS = ["TEST_SOLICITOR_ORGANISATION_ID"] as const;
const JURISDICTION = "DIVORCE";
const CASE_TYPE = "xuiCaseFlagsV1";
const DYNAMIC_FLAGS_SOLICITOR_ROLES = [
  "caseworker",
  "caseworker-divorce",
  "caseworker-divorce-solicitor",
  "caseworker-divorce-financialremedy",
  "caseworker-divorce-financialremedy-solicitor",
  "pui-case-manager",
  "pui-user-manager",
  "pui-organisation-manager",
  "pui-finance-manager",
  "pui-caa",
] as const;

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

test.describe("Dynamic user case flags flow", () => {
  test.describe.configure({ timeout: 600000 });

  test("@dynamic-user creates case and verifies party level flags", async ({
    page,
    createCasePage,
    caseDetailsPage,
    tableUtils,
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
    const partyName = faker.person.firstName();
    let caseNumber = "";
    let provisioned: ProvisionedProfessionalUser | undefined;
    const previousSolicitorUsername = process.env.SOLICITOR_USERNAME;
    const previousSolicitorPassword = process.env.SOLICITOR_PASSWORD;

    try {
      provisioned =
        await professionalUserUtils.createSolicitorUserForOrganisation({
          organisationId,
          roleNames: DYNAMIC_FLAGS_SOLICITOR_ROLES,
          roleContext: {
            jurisdiction: "divorce",
            testType: "case-create",
          },
          mode: "external",
          resendInvite: false,
          outputCreatedUserData: true,
        });

      await testInfo.attach("dynamic-user-case-flags-user.json", {
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

      await ensureAuthenticatedPage(page, "SOLICITOR", {
        waitForSelector: "exui-header",
      });

      await createCasePage.createDivorceCaseFlag(
        partyName,
        JURISDICTION,
        CASE_TYPE,
      );
      caseNumber = await caseDetailsPage.getCaseNumberFromUrl();

      await testInfo.attach("dynamic-user-case-flags-case.json", {
        body: JSON.stringify(
          {
            caseNumber,
            jurisdiction: JURISDICTION,
            caseType: CASE_TYPE,
            partyName,
            createdBy: provisioned.email,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });

      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const existingFlags = await caseDetailsPage.waitForTableByName(partyName);
      const existingTable = await tableUtils.parseDataTable(existingFlags);
      expect
        .soft(filterEmptyRows(existingTable).length)
        .toBeGreaterThanOrEqual(0);

      await caseDetailsPage.exuiSpinnerComponent.wait();
      await caseDetailsPage.selectCaseAction("Create case flag");
      await caseDetailsPage.selectPartyFlagTarget(partyName, "Welsh");

      await expect
        .poll(
          async () => {
            const visible = await caseDetailsPage.caseAlertSuccessMessage
              .isVisible()
              .catch(() => false);
            if (!visible) {
              return false;
            }
            const bannerText =
              await caseDetailsPage.caseAlertSuccessMessage.innerText();
            return caseBannerMatches(
              bannerText,
              caseNumber,
              "has been updated with event: Create case flag",
            );
          },
          { timeout: 45000, intervals: [1000, 2000, 3000] },
        )
        .toBe(true);

      expect
        .soft(await caseDetailsPage.caseNotificationBannerTitle.isVisible())
        .toBe(true);
      expect
        .soft(await caseDetailsPage.caseNotificationBannerBody.innerText())
        .toContain("There is 1 active flag on this case.");

      await caseDetailsPage.selectCaseDetailsTab("Flags");
      const expectedFlag = {
        "Party level flags": "I want to speak Welsh at a hearing",
        Comments: `Welsh ${partyName}`,
        "Creation date": await caseDetailsPage.todaysDateFormatted(),
        "Last modified": "",
        "Flag status": "ACTIVE",
      };

      await expect
        .poll(
          async () => {
            const partyFlagsTable = await caseDetailsPage.waitForTableByName(
              partyName,
              { timeoutMs: 15_000 },
            );
            const table = await tableUtils.parseDataTable(partyFlagsTable);
            const visibleRows = filterEmptyRows(table);
            return visibleRows.some((row) =>
              rowMatchesExpected(row, expectedFlag),
            );
          },
          { timeout: 60_000, intervals: [1000, 2000, 3000] },
        )
        .toBe(true);

      await testInfo.attach("dynamic-user-case-flags-verification.json", {
        body: JSON.stringify(
          {
            caseNumber,
            partyName,
            expectedFlag: {
              type: "I want to speak Welsh at a hearing",
              comment: `Welsh ${partyName}`,
              status: "ACTIVE",
            },
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
    } finally {
      process.env.SOLICITOR_USERNAME = previousSolicitorUsername;
      process.env.SOLICITOR_PASSWORD = previousSolicitorPassword;
      await cleanupProvisionedUser(
        provisioned,
        professionalUserUtils.cleanupOrganisationAssignment.bind(
          professionalUserUtils,
        ),
      ).catch(() => undefined);
    }
  });
});
