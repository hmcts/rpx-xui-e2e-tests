import { expect, test } from "@playwright/test";

import { resolveProvisionRoleNamesForAlias } from "../../e2e/_helpers/dynamicSolicitorSession";

function withEnv<T>(
  updates: Record<string, string | undefined>,
  run: () => T,
): T {
  const previous: Record<string, string | undefined> = {};
  Object.keys(updates).forEach((key) => {
    previous[key] = process.env[key];
    const nextValue = updates[key];
    if (nextValue === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = nextValue;
  });

  try {
    return run();
  } finally {
    Object.keys(updates).forEach((key) => {
      const oldValue = previous[key];
      if (oldValue === undefined) {
        delete process.env[key];
        return;
      }
      process.env[key] = oldValue;
    });
  }
}

test.describe(
  "Dynamic solicitor role precedence",
  { tag: "@svc-internal" },
  () => {
    test("explicit roleNames override role-context and template env roles", () => {
      const resolved = withEnv(
        {
          DYNAMIC_SOLICITOR_TEMPLATE_ROLES:
            "caseworker-privatelaw,caseworker-privatelaw-solicitor",
          ORG_USER_ASSIGNMENT_USER_ROLES: "caseworker,caseworker-privatelaw",
        },
        () =>
          resolveProvisionRoleNamesForAlias({
            alias: "SOLICITOR",
            roleContext: { jurisdiction: "divorce", testType: "case-create" },
            explicitRoleNames: ["caseworker", "caseworker-divorce"],
          }),
      );

      expect(resolved).toEqual(["caseworker", "caseworker-divorce"]);
    });

    test("jurisdiction-aware role context blocks template overrides", () => {
      const resolved = withEnv(
        {
          DYNAMIC_SOLICITOR_TEMPLATE_ROLES:
            "caseworker-privatelaw,caseworker-privatelaw-solicitor",
          ORG_USER_ASSIGNMENT_USER_ROLES: "caseworker,caseworker-privatelaw",
        },
        () =>
          resolveProvisionRoleNamesForAlias({
            alias: "SOLICITOR",
            roleContext: { jurisdiction: "divorce", testType: "case-create" },
          }),
      );

      expect(resolved).toBeUndefined();
    });

    test("falls back to template roles only when no explicit role context is provided", () => {
      const resolved = withEnv(
        {
          DYNAMIC_SOLICITOR_TEMPLATE_ROLES:
            "caseworker-privatelaw,caseworker-privatelaw-solicitor",
          ORG_USER_ASSIGNMENT_USER_ROLES: "caseworker,caseworker-privatelaw",
        },
        () =>
          resolveProvisionRoleNamesForAlias({
            alias: "SOLICITOR",
          }),
      );

      expect(resolved).toEqual([
        "caseworker-privatelaw",
        "caseworker-privatelaw-solicitor",
      ]);
    });
  },
);
