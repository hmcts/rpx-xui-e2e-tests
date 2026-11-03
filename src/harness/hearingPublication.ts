import assert from "node:assert/strict";

// Independent publication oracle reviewed against webapp76bf hearingConfigs/prod.ts.
// Neither the candidate data nor the artifact transformer supplies these expectations.
export const EXPECTED_PROD_ENABLED4 = {
  ".+": [
    {
      includeCaseTypes: ["Benefit", "Benefit_SCSS", "Benefit-sscs-pr-3575"],
      jurisdiction: "SSCS",
      roles: ["caseworker-sscs", "caseworker-sscs-judge"],
    },
    {
      caseType: "PRLAPPS",
      jurisdiction: "PRIVATELAW",
      roles: [
        "caseworker-privatelaw",
        "caseworker-privatelaw-courtadmin",
        "caseworker-privatelaw-judge",
      ],
    },
    {
      includeCaseTypes: ["Bail", "Asylum"],
      jurisdiction: "IA",
      roles: [
        "caseworker-ia-caseofficer",
        "caseworker-ia-judiciary",
        "hmcts-ctsc",
        "hmcts-admin",
        "hmcts-legal-operations",
        "hmcts-judiciary",
        "caseworker-ia-admofficer",
        "caseworker-ia-iacjudge",
      ],
    },
    { includeCaseTypes: ["CIVIL"], jurisdiction: "CIVIL" },
  ],
} as const;

export const EXPECTED_PROD_AMENDMENTS2 = {
  ".+": [
    { includeCaseTypes: ["CIVIL"], jurisdiction: "CIVIL" },
    { includeCaseTypes: ["Asylum", "Bail"], jurisdiction: "IA" },
  ],
} as const;

const scope = "exui-hearing-publication-pilot";
const fault = "hearing-amendments-use-enabled-map";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isStringList = (value: unknown) =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string");

export function hearingPublicationProofId(mutation: string | undefined) {
  assert(mutation === undefined || mutation === fault, "HEARING_PUBLICATION_UNKNOWN_MUTATION");
  return mutation === fault ? "hearing-amendment-map-broadened" : "hearing-prod-capabilities";
}

export function assertHearingPublicationInvocation(
  manifest: unknown,
  context: unknown,
  mutation: string | undefined,
) {
  hearingPublicationProofId(mutation);
  assert(isRecord(manifest) && isRecord(context), "HEARING_PUBLICATION_CONTEXT_REQUIRED");
  assert.equal(manifest.releaseScopeId, scope, "HEARING_PUBLICATION_SCOPE_REQUIRED");
  assert.equal(context.releaseScopeId, scope, "HEARING_PUBLICATION_CONTEXT_SCOPE_REQUIRED");
  assert(typeof manifest.runId === "string" && manifest.runId.length > 0, "HEARING_PUBLICATION_RUN_REQUIRED");
  assert.equal(context.runId, manifest.runId, "HEARING_PUBLICATION_RUN_MISMATCH");
  assert.equal(context.invocationId, mutation === fault ? fault : "baseline", "HEARING_PUBLICATION_INVOCATION_MISMATCH");
}

function assertMapShape(value: unknown) {
  assert(isRecord(value) && Object.keys(value).length > 0, "HEARING_PUBLICATION_MAP_REQUIRED");
  for (const entries of Object.values(value)) {
    assert(Array.isArray(entries), "HEARING_PUBLICATION_ENTRIES_REQUIRED");
    for (const entry of entries) {
      assert(isRecord(entry) && typeof entry.jurisdiction === "string", "HEARING_PUBLICATION_JURISDICTION_REQUIRED");
      assert(
        (typeof entry.caseType === "string" && entry.includeCaseTypes === undefined)
        || (entry.caseType === undefined && isStringList(entry.includeCaseTypes)),
        "HEARING_PUBLICATION_CASE_TYPES_REQUIRED",
      );
      assert(entry.roles === undefined || isStringList(entry.roles), "HEARING_PUBLICATION_ROLES_INVALID");
    }
  }
}

export function assertHearingPublicationEligibility(body: unknown, mutation: string | undefined) {
  hearingPublicationProofId(mutation);
  assert(isRecord(body) && isRecord(body.hearingJurisdictionConfig), "HEARING_PUBLICATION_CONFIGURATION_REQUIRED");
  const config = body.hearingJurisdictionConfig;
  assert.deepEqual(Object.keys(config).sort(), ["hearingAmendment", "hearingJurisdictions"], "HEARING_PUBLICATION_MAP_KEYS");
  assertMapShape(config.hearingJurisdictions);
  assertMapShape(config.hearingAmendment);
  assert.deepEqual(config.hearingJurisdictions, EXPECTED_PROD_ENABLED4, "HEARING_PUBLICATION_ENABLED_MAP_REQUIRED");
  if (mutation === fault) {
    // A valid fault must independently publish Enabled4 before it can earn an attributed failure.
    assert.deepEqual(config.hearingAmendment, EXPECTED_PROD_ENABLED4, "HEARING_PUBLICATION_MUTANT_ENABLED_MAP_REQUIRED");
  }
  return config;
}
