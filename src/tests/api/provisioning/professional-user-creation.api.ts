import { IdamUtils, ServiceAuthUtils } from "@hmcts/playwright-common";

import { expect, test } from "../../../fixtures/api";
import { config as uiConfig } from "../../../utils/ui/config.utils";
import {
  SOLICITOR_ROLE_NAMES,
  ProfessionalUserUtils,
} from "../../../utils/ui/professional-user.utils";

function ensureProvisioningEnv(): void {
  process.env.IDAM_WEB_URL ??= uiConfig.urls.idamWebUrl;
  process.env.IDAM_TESTING_SUPPORT_URL ??= uiConfig.urls.idamTestingSupportUrl;
  process.env.S2S_URL ??= uiConfig.urls.serviceAuthUrl;
}

ensureProvisioningEnv();

function shouldOutputCreatedUserData(): boolean {
  const enabled = resolveBooleanFlag(
    process.env.PROFESSIONAL_USER_OUTPUT_CREATED_DATA,
  );
  if (!enabled) {
    return false;
  }
  if (
    isCiEnvironment() &&
    !resolveBooleanFlag(process.env.ALLOW_CREDENTIAL_OUTPUT_IN_CI)
  ) {
    return false;
  }
  return true;
}

function resolveBooleanFlag(value: string | undefined): boolean {
  const configured = value?.trim().toLowerCase();
  if (!configured) {
    return false;
  }
  return !["0", "false", "no", "off"].includes(configured);
}

function isCiEnvironment(): boolean {
  const configured = process.env.CI?.trim().toLowerCase();
  if (!configured) {
    return false;
  }
  return configured !== "false";
}

function maybeRedactedPassword(password: string): string {
  return shouldOutputCreatedUserData() ? password : "[REDACTED]";
}

function expectedEmailDomain(): string {
  return (
    process.env.PROFESSIONAL_USER_EMAIL_DOMAIN?.trim().toLowerCase() ||
    "test.local"
  );
}

function logProvisionedCredentialsIfEnabled(user: {
  email: string;
  password: string;
}): void {
  if (!shouldOutputCreatedUserData()) {
    return;
  }
  // Intentional: explicit env-gated output for AAT debug sessions.
  console.log(
    `[provisioned-user-login] username=${user.email} password=${user.password}`,
  );
}

test.describe("Dynamic professional user provisioning (API)", () => {
  test("@dynamic-user-api creates solicitor user in IDAM and prints login credentials", async ({}, testInfo) => {
    const professionalUserUtils = new ProfessionalUserUtils(
      new IdamUtils(),
      new ServiceAuthUtils(),
    );

    const createdUser = await professionalUserUtils.createSolicitorUser();
    const passwordForOutput = maybeRedactedPassword(createdUser.password);

    await testInfo.attach("provisioned-user-credentials.txt", {
      body: `username=${createdUser.email}\npassword=${passwordForOutput}\n`,
      contentType: "text/plain",
    });
    await testInfo.attach("provisioned-user-idam-only.json", {
      body: JSON.stringify(
        {
          id: createdUser.id,
          email: createdUser.email,
          password: passwordForOutput,
          forename: createdUser.forename,
          surname: createdUser.surname,
          roleNames: createdUser.roleNames,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    testInfo.annotations.push({
      type: "provisioned-user-login",
      description: `username=${createdUser.email} password=${passwordForOutput}`,
    });
    logProvisionedCredentialsIfEnabled(createdUser);

    expect(createdUser.email).toContain(`@${expectedEmailDomain()}`);
    expect(createdUser.forename).toContain("solicitor_fn_");
    expect(createdUser.surname).toContain("solicitor_sn_");
    for (const roleName of SOLICITOR_ROLE_NAMES) {
      expect(createdUser.roleNames).toContain(roleName);
    }
  });
});
