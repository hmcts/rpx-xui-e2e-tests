import assert from "node:assert/strict";
import { effectiveCandidateConfiguration } from "./exui-candidate-runtime.mjs";
import { digestBytes } from "./exui-evidence-io.mjs";
import {
  ROUTING_SCOPE,
  ROUTING_CONFIGURATION_MODE,
  routingConfiguration,
} from "./exui-routing-contract.mjs";

import { GLOBAL_SEARCH_SCOPE, GLOBAL_SEARCH_MUTATION, globalSearchConfiguration } from "./exui-global-search-contract.mjs";
import { EVENT_CAPABILITY_SCOPE, EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION, READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION } from "./exui-ccd-event-capability.mjs";

const slices = {
  [EVENT_CAPABILITY_SCOPE]: [
    { invocationId: "baseline", kind: "baseline", mutation: null },
    { invocationId: EVENT_CAPABILITY_MUTATION, kind: "mutation", mutation: EVENT_CAPABILITY_MUTATION },
    { invocationId: COURTADMIN_READ_MUTATION, kind: "mutation", mutation: COURTADMIN_READ_MUTATION },
    { invocationId: READONLY_READ_MUTATION, kind: "mutation", mutation: READONLY_READ_MUTATION },
    { invocationId: READONLY_UPDATE_MUTATION, kind: "mutation", mutation: READONLY_UPDATE_MUTATION },
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
  "exui-ccd-pilot": [
    { invocationId: "baseline", kind: "baseline", mutation: null },
    ...[
      "ccd-stale-revoked-bearer",
      "ccd-drop-child",
      "ccd-broaden-access",
      "ccd-write-then-deny",
      "ccd-drop-postal-optional-child",
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
  const { config, digest } = effectiveCandidateConfiguration(
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
  if (!["exui-ccd-pilot", EVENT_CAPABILITY_SCOPE].includes(input.releaseScopeId))
    return {
      config,
      identity: {
        ...artifact.identity,
        configurationDigest: digest,
        definitionDigests: {},
        dependencyIdentities: {},
      },
    };
  config.now = false;
  return {
    config,
    identity: {
      ...artifact.identity,
      configurationDigest: digestBytes(
        JSON.stringify({
          config,
          gatewayDigest: input.gatewayDigest,
          mutation: input.releaseScopeId === EVENT_CAPABILITY_SCOPE ? null : invocation.mutation ?? null,
        }),
      ),
      definitionDigests: { HarnessNestedPRL: input.definition.fixtureDigest },
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
  const actors = scope === EVENT_CAPABILITY_SCOPE
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
