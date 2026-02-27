import { createLogger } from "@hmcts/playwright-common";
import type { TestInfo } from "@playwright/test";

import type {
  ProvisionedProfessionalUser,
  ProfessionalUserUtils,
  SolicitorRoleContext,
} from "../../../utils/ui/professional-user.utils";

type DynamicSolicitorAlias =
  | "SOLICITOR"
  | "SEARCH_EMPLOYMENT_CASE"
  | "USER_WITH_FLAGS";

type DynamicProvisionHandle = {
  user: ProvisionedProfessionalUser;
  cleanup: () => Promise<void>;
};

type ProvisionDynamicSolicitorArgs = {
  alias: DynamicSolicitorAlias;
  professionalUserUtils: ProfessionalUserUtils;
  roleContext?: SolicitorRoleContext;
  roleNames?: readonly string[];
  testInfo: TestInfo;
  mode?: "internal" | "external" | "auto";
};

const logger = createLogger({
  serviceName: "dynamic-solicitor-session",
  format: "pretty",
});

const USER_ENV_VARS: Record<
  DynamicSolicitorAlias,
  { username: string; password: string }
> = {
  SOLICITOR: {
    username: "SOLICITOR_USERNAME",
    password: "SOLICITOR_PASSWORD",
  },
  SEARCH_EMPLOYMENT_CASE: {
    username: "SEARCH_EMPLOYMENT_CASE_USERNAME",
    password: "SEARCH_EMPLOYMENT_CASE_PASSWORD",
  },
  USER_WITH_FLAGS: {
    username: "USER_WITH_FLAGS_USERNAME",
    password: "USER_WITH_FLAGS_PASSWORD",
  },
};

export const EMPLOYMENT_DYNAMIC_SOLICITOR_ROLES = [
  "caseworker",
  "caseworker-employment",
  "caseworker-employment-legalrep-solicitor",
  "pui-case-manager",
  "pui-user-manager",
  "pui-organisation-manager",
  "pui-finance-manager",
  "pui-caa",
] as const;

export const DIVORCE_FLAGS_DYNAMIC_SOLICITOR_ROLES = [
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

export async function provisionDynamicSolicitorForAlias({
  alias,
  professionalUserUtils,
  roleContext,
  roleNames,
  testInfo,
  mode = "external",
}: ProvisionDynamicSolicitorArgs): Promise<DynamicProvisionHandle> {
  const organisationId = process.env.TEST_SOLICITOR_ORGANISATION_ID?.trim();
  if (!organisationId) {
    testInfo.skip(
      true,
      "Missing dynamic-user prerequisite: TEST_SOLICITOR_ORGANISATION_ID",
    );
  }

  const envKeys = USER_ENV_VARS[alias];
  const previousUsername = process.env[envKeys.username];
  const previousPassword = process.env[envKeys.password];

  const user = await professionalUserUtils.createSolicitorUserForOrganisation({
    organisationId: organisationId!,
    roleContext,
    roleNames,
    mode,
    resendInvite: false,
    outputCreatedUserData: true,
  });

  process.env[envKeys.username] = user.email;
  process.env[envKeys.password] = user.password;

  await testInfo.attach(`${alias.toLowerCase()}-dynamic-user.json`, {
    body: JSON.stringify(
      {
        alias,
        email: user.email,
        forename: user.forename,
        surname: user.surname,
        roleNames: user.roleNames,
        organisationAssignment: user.organisationAssignment,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });

  return {
    user,
    cleanup: async () => {
      process.env[envKeys.username] = previousUsername;
      process.env[envKeys.password] = previousPassword;

      const userIdentifier = user.organisationAssignment.userIdentifier;
      if (!userIdentifier) {
        return;
      }
      try {
        await professionalUserUtils.cleanupOrganisationAssignment({
          user,
          userIdentifier,
          rolesToRemove: user.organisationAssignment.roles,
        });
      } catch (error) {
        logger.warn(
          "Failed to cleanup dynamic solicitor organisation assignment",
          {
            alias,
            email: user.email,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    },
  };
}
