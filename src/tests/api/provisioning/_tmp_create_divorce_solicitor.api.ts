import { IdamUtils, ServiceAuthUtils } from "@hmcts/playwright-common";

import { test } from "../../../fixtures/api";
import { ProfessionalUserUtils } from "../../../utils/ui/professional-user.utils";

test.describe("Temporary divorce solicitor provisioning", () => {
  test("creates solicitor for divorce org and prints payload", async () => {
    const professionalUserUtils = new ProfessionalUserUtils(
      new IdamUtils(),
      new ServiceAuthUtils(),
    );

    const organisationId = process.env.TEST_SOLICITOR_ORGANISATION_ID?.trim();
    if (!organisationId) {
      throw new Error(
        "Set TEST_SOLICITOR_ORGANISATION_ID to run this provisioning test.",
      );
    }

    const createdUser =
      await professionalUserUtils.createSolicitorUserForOrganisation({
        organisationId,
        roleContext: {
          jurisdiction: "divorce",
          testType: "case-create",
        },
        mode: "external",
        resendInvite: false,
        outputCreatedUserData: true,
      });

    console.log(`[divorce-solicitor] ${JSON.stringify(createdUser, null, 2)}`);
  });
});
