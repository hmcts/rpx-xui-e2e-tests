import assert from "node:assert/strict";
import { effectiveCandidateConfiguration } from "./exui-candidate-runtime.mjs";
import { digestBytes } from "./exui-evidence-io.mjs";

const slices = {
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
  return invocation.mutation === "wa-broaden-scope"
    ? input.mutantArtifact
    : input.artifact;
}
export function nativeIdentity(input, invocation, candidateRoot) {
  const artifact = selectedArtifact(input, invocation);
  const { config, digest } = effectiveCandidateConfiguration(
    candidateRoot,
    invocation.mutation === "wa-drop-family" ? "wa-drop-family" : null,
  );
  if (input.releaseScopeId !== "exui-ccd-pilot")
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
          mutation: invocation.mutation ?? null,
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
export function seedAppCcdSessions(credentials, seed) {
  return Object.fromEntries(
    ["allowed", "denied"].map((persona) => {
      assert(credentials[persona], "CCD_APP_PERSONA_REQUIRED");
      return [persona, seed(persona, credentials[persona])];
    }),
  );
}
