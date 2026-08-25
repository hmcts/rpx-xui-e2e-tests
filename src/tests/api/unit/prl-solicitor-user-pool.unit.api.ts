import { expect, test } from "@playwright/test";

import {
  getConfiguredPrlSolicitorUserIdentifiers,
  resolvePrlSolicitorUserIdentifier,
  resolvePooledUserIdentifier
} from "../../common/userPoolIdentifiers.js";

const configuredEnv = {
  PRL_SOLICITOR_USERNAME: "prl-legacy@example.test",
  PRL_SOLICITOR_PASSWORD: "secret-legacy",
  PRL_SOLICITOR2_USERNAME: "prl-2@example.test",
  PRL_SOLICITOR2_PASSWORD: "secret-2",
  PRL_SOLICITOR4_USERNAME: "prl-4@example.test",
  PRL_SOLICITOR4_PASSWORD: "secret-4"
};

test.describe("PRL solicitor user pool unit tests", { tag: "@svc-internal" }, () => {
  test("returns configured PRL users in stable identifier order", () => {
    expect(getConfiguredPrlSolicitorUserIdentifiers(configuredEnv)).toEqual([
      "PRL_SOLICITOR",
      "PRL_SOLICITOR2",
      "PRL_SOLICITOR4"
    ]);
  });

  test("selects configured PRL users by parallel index and preserves fallback", () => {
    expect(resolvePrlSolicitorUserIdentifier("PRL_SOLICITOR", { parallelIndex: 0 }, configuredEnv)).toBe("PRL_SOLICITOR");
    expect(resolvePrlSolicitorUserIdentifier("PRL_SOLICITOR", { parallelIndex: 1 }, configuredEnv)).toBe("PRL_SOLICITOR2");
    expect(resolvePrlSolicitorUserIdentifier("PRL_SOLICITOR", { parallelIndex: 2 }, configuredEnv)).toBe("PRL_SOLICITOR4");
    expect(resolvePrlSolicitorUserIdentifier("PRL_SOLICITOR", { parallelIndex: 3 }, configuredEnv)).toBe("PRL_SOLICITOR");
    expect(resolvePooledUserIdentifier("PRL_SOLICITOR", { parallelIndex: 1 }, configuredEnv)).toBe("PRL_SOLICITOR2");
    expect(resolvePrlSolicitorUserIdentifier("PRL_SOLICITOR", { parallelIndex: 0 }, {})).toBe("PRL_SOLICITOR");
  });
});
