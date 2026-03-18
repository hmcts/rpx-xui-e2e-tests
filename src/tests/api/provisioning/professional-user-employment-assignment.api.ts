import { IdamUtils, ServiceAuthUtils } from "@hmcts/playwright-common";

import { expect, test } from "../../../fixtures/api";
import { config as uiConfig } from "../../../utils/ui/config.utils";
import { ProfessionalUserUtils } from "../../../utils/ui/professional-user.utils";
import { requireTestSolicitorOrganisationId } from "../../../utils/ui/test-organisation-id.utils";
import { getProvisioningRuntimeStatus } from "./provisioning-runtime.utils";

const EMPLOYMENT_ASSIGNMENT_ROLES_UNFILTERED = [
  "caseworker",
  "caseworker-employment",
  "caseworker-employment-api",
  "caseworker-employment-englandwales",
  "caseworker-employment-leeds",
  "caseworker-employment-manchester",
  "caseworker-employment-scotland",
  "ccd-import",
  "caseworker-employment-legalrep-solicitor",
  "pui-case-manager",
  "pui-user-manager",
  "pui-organisation-manager",
  "pui-finance-manager",
  "pui-caa",
] as const;

const FILTERED_OUT_ASSIGNMENT_ROLES = [
  "caseworker-employment-api",
  "caseworker-employment-englandwales",
  "caseworker-employment-leeds",
  "caseworker-employment-manchester",
  "caseworker-employment-scotland",
  "ccd-import",
] as const;

function ensureProvisioningEnv(): void {
  process.env.IDAM_WEB_URL ??= uiConfig.urls.idamWebUrl;
  process.env.IDAM_TESTING_SUPPORT_URL ??= uiConfig.urls.idamTestingSupportUrl;
  process.env.S2S_URL ??= uiConfig.urls.serviceAuthUrl;
}

ensureProvisioningEnv();

function getRequiredOrganisationId(): string {
  return requireTestSolicitorOrganisationId("Provisioning API test");
}

test.describe("Dynamic professional user provisioning (Employment assignment API)", () => {
  test("@dynamic-user-api employment assignment accepts filtered payload roles", async ({}, testInfo) => {
    const provisioningRuntime = await getProvisioningRuntimeStatus();
    test.skip(!provisioningRuntime.available, provisioningRuntime.reason);

    const professionalUserUtils = new ProfessionalUserUtils(
      new IdamUtils(),
      new ServiceAuthUtils(),
    );
    const organisationId = getRequiredOrganisationId();

    const created =
      await professionalUserUtils.createSolicitorUserForOrganisation({
        organisationId,
        roleNames: EMPLOYMENT_ASSIGNMENT_ROLES_UNFILTERED,
        roleContext: {
          jurisdiction: "employment",
          testType: "case-create",
        },
        mode: "auto",
        resendInvite: false,
        outputCreatedUserData: true,
      });

    await testInfo.attach("employment-provisioned-user.json", {
      body: JSON.stringify(
        {
          id: created.id,
          email: created.email,
          roleNames: created.roleNames,
          organisationAssignment: created.organisationAssignment,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });

    testInfo.annotations.push({
      type: "cleanup-info",
      description:
        "Provisioned solicitor is intentionally preserved (no post-test cleanup).",
    });

    expect([200, 201, 202, 409]).toContain(
      created.organisationAssignment.status,
    );
    expect(["external", "internal"]).toContain(
      created.organisationAssignment.mode,
    );

    for (const roleName of FILTERED_OUT_ASSIGNMENT_ROLES) {
      expect(created.roleNames).toContain(roleName);
      expect(created.organisationAssignment.roles).not.toContain(roleName);
    }

    expect(created.organisationAssignment.roles).toEqual(
      expect.arrayContaining([
        "caseworker",
        "caseworker-employment",
        "caseworker-employment-legalrep-solicitor",
        "pui-case-manager",
      ]),
    );
    expect(created.organisationAssignment.roles).not.toEqual(
      expect.arrayContaining([
        "pui-user-manager",
        "pui-organisation-manager",
        "pui-finance-manager",
        "pui-caa",
      ]),
    );
  });
});
