import { SELECTOR_EVENT_SCOPE, SELECTOR_EVENT_MUTATION } from './exui-selector-event-row-contract.mjs';
import {SHARED_NESTED_SCOPE,SHARED_NESTED_MUTATIONS} from './exui-shared-nested-scope.mjs';
import {APPLICANT_RESULTS_SCOPE,APPLICANT_RESULTS_MUTATIONS} from './exui-applicant-results-contract.mjs';
import { CALLBACK_SCOPE, CALLBACK_MUTATION } from './exui-recipient-callback-contract.mjs';
import { SOURCE_SHAPE_MUTATIONS } from './exui-source-shape-contract.mjs';
import {RESULTS_UI_KIND,resultsConfiguration} from './exui-results-ui-contract.mjs';
import assert from "node:assert/strict";
import { effectiveCandidateConfiguration } from "./exui-candidate-runtime.mjs";
import { digestBytes } from "./exui-evidence-io.mjs";
import {
  ROUTING_SCOPE,
  ROUTING_CONFIGURATION_MODE,
  routingConfiguration,
} from "./exui-routing-contract.mjs";

import { GLOBAL_SEARCH_SCOPE, GLOBAL_SEARCH_MUTATION, globalSearchConfiguration } from "./exui-global-search-contract.mjs";
import { EVENT_CAPABILITY_SCOPE, EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION } from "./exui-ccd-event-capability.mjs";

const slices = {
  [SELECTOR_EVENT_SCOPE]: [{invocationId:"baseline",kind:"baseline",mutation:null},{invocationId:SELECTOR_EVENT_MUTATION,kind:"mutation",mutation:SELECTOR_EVENT_MUTATION}],
  [APPLICANT_RESULTS_SCOPE]: [{invocationId:"baseline",kind:"baseline",mutation:null},...APPLICANT_RESULTS_MUTATIONS.map(mutation=>({invocationId:mutation,kind:"mutation",mutation}))],
  [CALLBACK_SCOPE]: [{invocationId:"baseline",kind:"baseline"},{invocationId:CALLBACK_MUTATION,kind:"mutation",mutation:CALLBACK_MUTATION}],
  [EVENT_CAPABILITY_SCOPE]: [
    { invocationId: "baseline", kind: "baseline", mutation: null },
    { invocationId: EVENT_CAPABILITY_MUTATION, kind: "mutation", mutation: EVENT_CAPABILITY_MUTATION },
    { invocationId: COURTADMIN_READ_MUTATION, kind: "mutation", mutation: COURTADMIN_READ_MUTATION },
    { invocationId: READONLY_READ_MUTATION, kind: "mutation", mutation: READONLY_READ_MUTATION },
    { invocationId: READONLY_UPDATE_MUTATION, kind: "mutation", mutation: READONLY_UPDATE_MUTATION },
    { invocationId: COURTADMIN_UPDATE_MUTATION, kind: "mutation", mutation: COURTADMIN_UPDATE_MUTATION },
    ...SOURCE_SHAPE_MUTATIONS.map(mutation => ({invocationId:mutation, kind:"mutation", mutation})),
  ],
  "exui-hearing-publication-pilot": [
    { invocationId: "baseline", kind: "baseline", mutation: null },
    {
      invocationId: "hearing-amendments-use-enabled-map",
      kind: "mutation",
      mutation: "hearing-amendments-use-enabled-map",
    },
  ],
  [GLOBAL_SEARCH_SCOPE]: [
    { invocationId: "baseline", kind: "baseline", mutation: null },
    { invocationId: GLOBAL_SEARCH_MUTATION, kind: "mutation", mutation: GLOBAL_SEARCH_MUTATION },
  ],
  [ROUTING_SCOPE]: [
    { invocationId: "baseline", kind: "baseline", mutation: null },
    ...["routing-omit-web-url", "routing-omit-noc-base-url"].map(
      (mutation) => ({
        invocationId: mutation,
        kind: "mutation",
        mutation,
        proofFile:
          mutation === "routing-omit-web-url"
            ? "create-entry.spec.ts"
            : "noc-cache.spec.ts",
      }),
    ),
  ],
  "exui-wa-family-pilot": [
    { invocationId: "baseline", kind: "baseline", mutation: null },
    {
      invocationId: "wa-drop-family",
      kind: "mutation",
      mutation: "wa-drop-family",
    },
  ],
  "exui-wa-scope-pilot": [
    { invocationId: "scope-ia", kind: "baseline", persona: "ia" },
    { invocationId: "scope-civil", kind: "baseline", persona: "civil" },
    {
      invocationId: "wa-scope-broadened",
      kind: "mutation",
      persona: "ia",
      mutation: "wa-broaden-scope",
    },
  ],
  [SHARED_NESTED_SCOPE]:[{invocationId:"baseline",kind:"baseline",mutation:null},...SHARED_NESTED_MUTATIONS.map(mutation=>({invocationId:mutation,kind:"mutation",mutation}))],
  "exui-ccd-pilot": [
    { invocationId: "baseline", kind: "baseline", mutation: null },
    ...[
      "ccd-stale-revoked-bearer",
      "ccd-drop-child",
      "ccd-broaden-access",
      "ccd-write-then-deny",
      "ccd-drop-postal-optional-child",
      "ccd-drop-workbasket-field",
    ].map((mutation) => ({
      invocationId: mutation,
      kind: "mutation",
      mutation,
    })),
  ],
};
export function nativeInvocations(scope) {
  assert(slices[scope], "UNSUPPORTED_RELEASE_SCOPE");
  return structuredClone(slices[scope]);
}
export function nativeInvocation(input, id) {
  const value = nativeInvocations(input.releaseScopeId).find(
    (item) => item.invocationId === id,
  );
  assert(value, "UNKNOWN_NATIVE_INVOCATION");
  return value;
}
export function selectedArtifact(input, invocation) {
  return ["wa-broaden-scope", "hearing-amendments-use-enabled-map"].includes(invocation.mutation)
    ? input.mutantArtifact
    : input.artifact;
}
export function nativeIdentity(input, invocation, candidateRoot) {
  const artifact = selectedArtifact(input, invocation);
  let { config, digest } = effectiveCandidateConfiguration(
    candidateRoot,
    invocation.mutation === "wa-drop-family" ? "wa-drop-family" : null,
  );
  if (input.releaseScopeId === GLOBAL_SEARCH_SCOPE) {
    const global = globalSearchConfiguration(config, invocation.mutation ?? null);
    return { config: global, identity: { ...artifact.identity, configurationDigest: digestBytes(JSON.stringify(global)), definitionDigests: {}, dependencyIdentities: {} } };
  }
  if (input.releaseScopeId === ROUTING_SCOPE) {
    const routed = routingConfiguration(config, invocation.mutation ?? null);
    return {
      config: routed,
      identity: {
        ...artifact.identity,
        configurationDigest: digestBytes(
          JSON.stringify({
            config: routed,
            loadMode: ROUTING_CONFIGURATION_MODE,
          }),
        ),
        definitionDigests: {},
        dependencyIdentities: {},
      },
    };
  }
  if (!["exui-ccd-pilot", EVENT_CAPABILITY_SCOPE, CALLBACK_SCOPE, APPLICANT_RESULTS_SCOPE, SELECTOR_EVENT_SCOPE, SHARED_NESTED_SCOPE].includes(input.releaseScopeId))
    return {
      config,
      identity: {
        ...artifact.identity,
        configurationDigest: digest,
        definitionDigests: {},
        dependencyIdentities: {},
      },
    };
  if(input.releaseScopeId===APPLICANT_RESULTS_SCOPE)config=resultsConfiguration(config);
  if(input.kind===RESULTS_UI_KIND){assert.equal(invocation.mutation??null,null,"RESULT_UI_BASELINE_ONLY");config=resultsConfiguration(config);}
  config.now = false;
  if ((input.releaseScopeId === "exui-ccd-pilot" && input.workbasket) || input.releaseScopeId===SHARED_NESTED_SCOPE)
    config.jurisdictions = `${config.jurisdictions},HARNESS`;
  return {
    config,
    identity: {
      ...artifact.identity,
      configurationDigest: digestBytes(
        JSON.stringify({
          config,
          gatewayDigest: input.gatewayDigest,
          mutation: [EVENT_CAPABILITY_SCOPE, CALLBACK_SCOPE, APPLICANT_RESULTS_SCOPE, SELECTOR_EVENT_SCOPE].includes(input.releaseScopeId) ? null : invocation.mutation ?? null,
        }),
      ),
      definitionDigests: { [input.kind===RESULTS_UI_KIND||input.releaseScopeId===APPLICANT_RESULTS_SCOPE?"HarnessResultsPRL":"HarnessNestedPRL"]: input.definition.fixtureDigest,
        ...(input.workbasket ? { HarnessResultsPRL: input.workbasketDefinitionDigest } : {}) },
      dependencyIdentities: Object.fromEntries(
        ["data", "definition"].map((service) => [
          service === "data" ? "ccd" : "ccd-definition",
          {
            artifactDigest: input.ccd.images[service].id,
            apiContractDigest: input.apiContracts[service],
          },
        ]),
      ),
    },
  };
}
export function seedAppCcdSessions(credentials, seed, scope) {
  const actors = [EVENT_CAPABILITY_SCOPE, CALLBACK_SCOPE, SELECTOR_EVENT_SCOPE].includes(scope)
    ? ["allowed", "courtadmin", "judge", "readonly"]
    : ["allowed", "denied", ...(credentials.transitioning ? ["transitioning"] : [])];
  return Object.fromEntries(
    actors.map((persona) => {
      assert(credentials[persona], "CCD_APP_PERSONA_REQUIRED");
      if (["courtadmin", "judge", "readonly"].includes(persona))
        assert.deepEqual(credentials[persona].roles?.slice().sort(), [
          "caseworker", "caseworker-harness", `caseworker-privatelaw-${persona}`,
        ], "CCD_SOURCE_ACTOR_ROLES_REQUIRED");
      return [persona, seed(persona, credentials[persona])];
    }),
  );
}
