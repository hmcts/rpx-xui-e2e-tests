import { expect, test } from "@playwright/test";

import {
  ORG_ADMIN_SOLICITOR_ROLE_NAMES,
  SOLICITOR_ROLE_AUGMENT_BY_TEST_TYPE,
  SOLICITOR_ROLE_NAMES_BY_JURISDICTION,
  resolveSolicitorRoleStrategy,
} from "../../../utils/ui/professional-user.utils";

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

test.describe(
  "Dynamic professional user role resolution",
  { tag: "@svc-internal" },
  () => {
    test("explicit roleNames take precedence over context and profile", () => {
      const resolved = resolveSolicitorRoleStrategy({
        roleNames: ["custom-role-1", "custom-role-2", "custom-role-1"],
        roleProfile: "extended",
        roleContext: {
          jurisdiction: "probate",
          testType: "manage-org",
        },
      });

      expect(resolved.source).toBe("explicit-roleNames");
      expect(resolved.roleProfile).toBe("extended");
      expect(resolved.roleNames).toEqual(["custom-role-1", "custom-role-2"]);
      expect(resolved.context.jurisdiction).toBe("probate");
      expect(resolved.context.testType).toBe("manage-org");
    });

    test("jurisdiction + test type resolves expected solicitor role matrix", () => {
      const resolved = resolveSolicitorRoleStrategy({
        roleProfile: "minimal",
        roleContext: {
          jurisdiction: "probate",
          testType: "manage-org",
        },
      });

      expect(resolved.source).toBe("context-driven");
      expect(resolved.context.jurisdiction).toBe("probate");
      expect(resolved.context.testType).toBe("manage-org");

      const expectedRoles = [
        ...SOLICITOR_ROLE_NAMES_BY_JURISDICTION.probate,
        ...SOLICITOR_ROLE_AUGMENT_BY_TEST_TYPE["manage-org"],
      ];
      expect(uniqueSorted(resolved.roleNames)).toEqual(
        uniqueSorted(expectedRoles),
      );
    });

    test("unknown case type falls back to profile roles and applies test-type augment", () => {
      const resolved = resolveSolicitorRoleStrategy({
        roleProfile: "org-admin",
        roleContext: {
          caseType: "some-unknown-case-type",
          testType: "finance",
        },
      });

      expect(resolved.source).toBe("context-driven");
      expect(resolved.context.jurisdiction).toBeUndefined();
      expect(resolved.context.testType).toBe("finance");
      const expectedRoles = [
        ...ORG_ADMIN_SOLICITOR_ROLE_NAMES,
        ...SOLICITOR_ROLE_AUGMENT_BY_TEST_TYPE.finance,
      ];
      expect(uniqueSorted(resolved.roleNames)).toEqual(
        uniqueSorted(expectedRoles),
      );
    });
  },
);
