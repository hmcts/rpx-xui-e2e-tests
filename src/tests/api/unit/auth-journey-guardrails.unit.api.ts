import { expect, test } from "@playwright/test";

import {
  assertAuthJourneyGuardrailScenarios,
  AUTH_JOURNEY_GUARDRAIL_REPLAY,
  buildAuthJourneyClassificationSummary,
  resolveAuthJourneyOutcome,
  resolveLegacyAuthJourneyOutcome
} from "../../../data/exui-historic-replay-packs.js";

test.describe("auth journey guardrail replay", { tag: "@svc-internal" }, () => {
  test("classifies SSO entrypoint and post-auth role mismatch as separate central contracts", () => {
    const summary = buildAuthJourneyClassificationSummary(AUTH_JOURNEY_GUARDRAIL_REPLAY);

    expect(summary["auth-entrypoint-owned"]).toEqual([
      "exui-4744-direct-idam-no-state-bookmark",
      "exui-4744-exui-auth-login-hint"
    ]);
    expect(summary["post-auth-authorisation-owned"]).toEqual([
      "exui-4697-authenticated-user-missing-caseworker-role",
      "exui-4697-authenticated-user-with-caseworker-role"
    ]);
    expect(summary["service-visual-layout-owned"]).toEqual([]);
  });

  test("resolves the historic broken outcomes and the fixed central outcomes", () => {
    const exuiAuthLogin = AUTH_JOURNEY_GUARDRAIL_REPLAY.scenarios.find(
      (scenario) => scenario.id === "exui-4744-exui-auth-login-hint"
    );
    const missingRole = AUTH_JOURNEY_GUARDRAIL_REPLAY.scenarios.find(
      (scenario) => scenario.id === "exui-4697-authenticated-user-missing-caseworker-role"
    );
    const validRole = AUTH_JOURNEY_GUARDRAIL_REPLAY.scenarios.find(
      (scenario) => scenario.id === "exui-4697-authenticated-user-with-caseworker-role"
    );

    expect(exuiAuthLogin).toBeDefined();
    expect(missingRole).toBeDefined();
    expect(validRole).toBeDefined();
    expect(resolveLegacyAuthJourneyOutcome(exuiAuthLogin!)).toBe("login-bookmark");
    expect(resolveAuthJourneyOutcome(exuiAuthLogin!)).toBe("redirect-sso");
    expect(resolveLegacyAuthJourneyOutcome(missingRole!)).toBe("logout-root-loop");
    expect(resolveAuthJourneyOutcome(missingRole!)).toBe("access-denied");
    expect(resolveAuthJourneyOutcome(validRole!)).toBe("app-shell");
  });

  test("fails if any replay scenario resolves to the wrong target outcome", () => {
    const invalidReplay = {
      ...AUTH_JOURNEY_GUARDRAIL_REPLAY,
      scenarios: [
        {
          ...AUTH_JOURNEY_GUARDRAIL_REPLAY.scenarios[0],
          expectedOutcome: "redirect-sso" as const
        }
      ]
    };

    expect(() => assertAuthJourneyGuardrailScenarios(AUTH_JOURNEY_GUARDRAIL_REPLAY)).not.toThrow();
    expect(() => assertAuthJourneyGuardrailScenarios(invalidReplay)).toThrow(
      /exui-4744-direct-idam-no-state-bookmark resolved to login-bookmark; expected redirect-sso/
    );
  });
});
