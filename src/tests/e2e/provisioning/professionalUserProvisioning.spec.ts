import { createLogger } from "@hmcts/playwright-common";
import type { TestInfo } from "@playwright/test";

import { expect, test } from "../../../fixtures/ui";
import {
  EXTENDED_SOLICITOR_ROLE_NAMES,
  SOLICITOR_ROLE_NAMES,
  type ProvisionedProfessionalUser,
} from "../../../utils/ui/professional-user.utils";
import {
  TEST_SOLICITOR_ORGANISATION_ID_ENV,
  requireTestSolicitorOrganisationId,
  resolveTestSolicitorOrganisationId,
} from "../../../utils/ui/test-organisation-id.utils";

const logger = createLogger({
  serviceName: "professional-user-provisioning",
  format: "pretty",
});

const RD_PROFESSIONAL_ENV_VARS = [
  "RD_PROFESSIONAL_API_PATH",
  "RD_PROFESSIONAL_API_SERVICE",
  "SERVICES_RD_PROFESSIONAL_API_PATH",
] as const;
const EXTENDED_ONLY_SOLICITOR_ROLES = EXTENDED_SOLICITOR_ROLE_NAMES.filter(
  (roleName) => !SOLICITOR_ROLE_NAMES.includes(roleName),
);
type ProvisioningAssignmentMode = "auto" | "external" | "internal";
const EXPECTED_RESOLVED_MODES_BY_REQUESTED: Record<
  ProvisioningAssignmentMode,
  readonly ("external" | "internal")[]
> = {
  auto: ["external", "internal"],
  external: ["external"],
  internal: ["internal"],
};

function hasValue(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!resolveTestSolicitorOrganisationId({ allowDefault: true })) {
    missing.push(TEST_SOLICITOR_ORGANISATION_ID_ENV);
  }
  const hasCreateUserToken = hasValue("CREATE_USER_BEARER_TOKEN");
  const hasCreateUserHydrationPrereqs =
    hasValue("IDAM_WEB_URL") &&
    hasValue("IDAM_TESTING_SUPPORT_URL") &&
    hasValue("IDAM_SECRET");
  const hasRdProfessionalApiPath = RD_PROFESSIONAL_ENV_VARS.some(hasValue);
  const hasAssignmentBearerToken =
    hasValue("ORG_USER_ASSIGNMENT_BEARER_TOKEN") ||
    hasValue("CREATE_USER_BEARER_TOKEN");
  const hasAssignmentUserCredentials =
    hasValue("ORG_USER_ASSIGNMENT_USERNAME") &&
    hasValue("ORG_USER_ASSIGNMENT_PASSWORD");
  const hasAnySolicitorCredentials =
    (hasValue("SOLICITOR_USERNAME") && hasValue("SOLICITOR_PASSWORD")) ||
    (hasValue("PRL_SOLICITOR_USERNAME") &&
      hasValue("PRL_SOLICITOR_PASSWORD")) ||
    (hasValue("WA_SOLICITOR_USERNAME") && hasValue("WA_SOLICITOR_PASSWORD")) ||
    (hasValue("NOC_SOLICITOR_USERNAME") && hasValue("NOC_SOLICITOR_PASSWORD"));
  const hasServiceToken = hasValue("S2S_TOKEN");
  const hasMicroserviceHint =
    hasValue("S2S_MICROSERVICE_NAME") || hasValue("MICROSERVICE");

  if (!hasCreateUserToken && !hasCreateUserHydrationPrereqs) {
    missing.push(
      "CREATE_USER_BEARER_TOKEN or IDAM_WEB_URL + IDAM_TESTING_SUPPORT_URL + IDAM_SECRET",
    );
  }
  if (!hasRdProfessionalApiPath) {
    missing.push(
      "RD_PROFESSIONAL_API_PATH or RD_PROFESSIONAL_API_SERVICE or SERVICES_RD_PROFESSIONAL_API_PATH",
    );
  }
  if (
    !hasAssignmentBearerToken &&
    !hasAssignmentUserCredentials &&
    !hasAnySolicitorCredentials
  ) {
    missing.push(
      "ORG_USER_ASSIGNMENT_BEARER_TOKEN (or CREATE_USER_BEARER_TOKEN) or assignment user credentials (ORG_USER_ASSIGNMENT_USERNAME/ORG_USER_ASSIGNMENT_PASSWORD or existing solicitor credentials)",
    );
  }
  if (!hasServiceToken && !hasMicroserviceHint) {
    missing.push("S2S_TOKEN or S2S_MICROSERVICE_NAME/MICROSERVICE");
  }

  return missing;
}

function resolveProvisioningAssignmentMode(): ProvisioningAssignmentMode {
  const rawMode =
    process.env.PROFESSIONAL_USER_ASSIGNMENT_MODE?.trim().toLowerCase();
  switch (rawMode) {
    case "external":
      return "external";
    case "internal":
      return "internal";
    case "auto":
    default:
      return "auto";
  }
}

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
  logger.info(
    `[provisioned-user-login] username=${user.email} password=${user.password}`,
  );
}

async function attachProvisionedCredentials(
  user: { email: string; password: string },
  testInfo: TestInfo,
): Promise<void> {
  const passwordForOutput = maybeRedactedPassword(user.password);
  await testInfo.attach("provisioned-user-credentials.txt", {
    body: `username=${user.email}\npassword=${passwordForOutput}\n`,
    contentType: "text/plain",
  });
  testInfo.annotations.push({
    type: "provisioned-user-login",
    description: `username=${user.email} password=${passwordForOutput}`,
  });
  logProvisionedCredentialsIfEnabled(user);
}

const missingEnvVars = getMissingEnvVars();

if (missingEnvVars.length > 0) {
  test.describe("Dynamic professional user provisioning", () => {
    test("@dynamic-user provisioning prerequisites must be configured", async ({}, testInfo) => {
      testInfo.annotations.push({
        type: "provisioning-prerequisites-missing",
        description: `Set: ${missingEnvVars.join(", ")}`,
      });
      expect(
        missingEnvVars,
        `Missing provisioning prerequisites: ${missingEnvVars.join(", ")}`,
      ).toEqual([]);
    });
  });
} else {
  test.describe("Dynamic professional user provisioning", () => {
    test("@dynamic-user creates solicitor user in IDAM and prints login credentials", async ({
      professionalUserUtils,
    }, testInfo) => {
      const createdUser = await professionalUserUtils.createSolicitorUser();
      try {
        await attachProvisionedCredentials(createdUser, testInfo);

        await testInfo.attach("provisioned-user-idam-only.json", {
          body: JSON.stringify(
            {
              id: createdUser.id,
              email: createdUser.email,
              password: maybeRedactedPassword(createdUser.password),
              forename: createdUser.forename,
              surname: createdUser.surname,
              roleNames: createdUser.roleNames,
            },
            null,
            2,
          ),
          contentType: "application/json",
        });

        expect(createdUser.email).toContain(`@${expectedEmailDomain()}`);
        expect(createdUser.forename).toMatch(/^[A-Za-z0-9]{1,24}$/);
        expect(createdUser.surname).toMatch(/^[A-Za-z0-9]{1,24}$/);
        expect(createdUser.forename.toLowerCase()).not.toContain("solicitor");
        expect(createdUser.surname.toLowerCase()).not.toContain("solicitor");
        for (const roleName of SOLICITOR_ROLE_NAMES) {
          expect(createdUser.roleNames).toContain(roleName);
        }
      } finally {
        testInfo.annotations.push({
          type: "cleanup-info",
          description:
            "IDAM cleanup skipped by policy: only testing-support account creation is allowed.",
        });
      }
    });

    test("@dynamic-user provisions solicitor with lean roles and assigns to organisation", async ({
      professionalUserUtils,
    }, testInfo) => {
      const organisationId = requireTestSolicitorOrganisationId(
        "Provisioning test prerequisite",
      );
      const assignmentMode = resolveProvisioningAssignmentMode();
      const createdUser = await professionalUserUtils.createSolicitorUser();
      await attachProvisionedCredentials(createdUser, testInfo);

      const organisationAssignment =
        await professionalUserUtils.assignUserToOrganisation({
          user: createdUser,
          organisationId,
          roles: createdUser.roleNames,
          mode: assignmentMode,
        });
      const provisioned: ProvisionedProfessionalUser = {
        ...createdUser,
        organisationAssignment,
      };

      await testInfo.attach("provisioned-user.json", {
        body: JSON.stringify(
          {
            id: provisioned.id,
            email: provisioned.email,
            password: maybeRedactedPassword(provisioned.password),
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

      testInfo.annotations.push({
        type: "cleanup-info",
        description:
          "Provisioned solicitor is intentionally preserved (no post-test cleanup).",
      });

      expect(provisioned.email).toContain(`@${expectedEmailDomain()}`);
      expect(provisioned.forename).toMatch(/^[A-Za-z0-9]{1,24}$/);
      expect(provisioned.surname).toMatch(/^[A-Za-z0-9]{1,24}$/);
      expect(provisioned.forename.toLowerCase()).not.toContain("solicitor");
      expect(provisioned.surname.toLowerCase()).not.toContain("solicitor");
      expect(provisioned.organisationAssignment.organisationId).toBe(
        organisationId,
      );
      expect(provisioned.organisationAssignment.requestedMode).toBe(
        assignmentMode,
      );
      const expectedResolvedModes =
        EXPECTED_RESOLVED_MODES_BY_REQUESTED[assignmentMode];
      expect(expectedResolvedModes).toContain(
        provisioned.organisationAssignment.mode,
      );
      expect([200, 201, 202, 409]).toContain(
        provisioned.organisationAssignment.status,
      );

      for (const roleName of SOLICITOR_ROLE_NAMES) {
        expect(provisioned.roleNames).toContain(roleName);
        expect(provisioned.organisationAssignment.roles).toContain(roleName);
      }
      for (const roleName of EXTENDED_ONLY_SOLICITOR_ROLES) {
        expect(provisioned.roleNames).not.toContain(roleName);
        expect(provisioned.organisationAssignment.roles).not.toContain(
          roleName,
        );
      }
    });
  });
}
