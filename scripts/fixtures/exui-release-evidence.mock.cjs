const digest = (character) => `sha256:${character.repeat(64)}`;

function completeRun() {
  const identity = {
    webappCommit: 'a'.repeat(40),
    artifactDigest: digest('a'),
    dependencyLockDigest: digest('b'),
    toolkitVersion: '1.0.0',
    toolkitDigest: digest('c'),
    configurationDigest: digest('d'),
    definitionDigests: { example: digest('e') },
    dependencyIdentities: {}
  };
  const mutantIdentity = { ...structuredClone(identity), artifactDigest: digest('f') };
  const manifest = {
    schemaVersion: 1,
    runId: 'synthetic-run-1',
    harnessCommit: 'b'.repeat(40),
    releaseScopeId: 'pilot-wa',
    policyDigest: digest('1'),
    runtimeMetadata: { node: '22', playwright: '1.64.1', os: 'synthetic', architecture: 'arm64' },
    identity,
    requiredObligationIds: ['wa-family-scope']
  };
  const baselineResult = {
    proofId: 'wa-real-filter',
    obligationId: 'wa-family-scope',
    runId: manifest.runId,
    invocationId: 'baseline-1',
    identity: structuredClone(identity),
    boundary: 'candidate',
    outcome: 'passed',
    retryIndex: 0,
    complete: true,
    failureId: null,
    artifacts: ['baseline.json']
  };
  const mutantResult = {
    ...structuredClone(baselineResult),
    proofId: 'wa-missing-family',
    invocationId: 'mutation-1',
    identity: structuredClone(mutantIdentity),
    outcome: 'failed',
    failureId: 'assert-wa-family',
    artifacts: ['mutant.json']
  };
  return {
    manifest,
    policy: {
      releaseScopeId: manifest.releaseScopeId,
      policyDigest: manifest.policyDigest,
      requiredObligationIds: [...manifest.requiredObligationIds],
      obligations: [{ id: 'wa-family-scope', boundary: 'candidate', requiredProofIds: ['wa-real-filter'], requiredMutationIds: ['wa-drop-family'] }],
      mutationDefinitions: [{ mutationId: 'wa-drop-family', obligationId: 'wa-family-scope', definitionDigest: digest('2'), expectedFailureId: 'assert-wa-family', baselineProofId: baselineResult.proofId, mutantProofId: mutantResult.proofId }]
    },
    executions: [
      { invocationId: 'baseline-1', runId: manifest.runId, identity: structuredClone(identity), kind: 'baseline', terminalState: 'completed', runnerExitCode: 0, unexpectedGlobalErrors: [], resultArtifact: { path: 'baseline.json', digest: digest('3') } },
      { invocationId: 'mutation-1', runId: manifest.runId, identity: structuredClone(mutantIdentity), kind: 'mutation', terminalState: 'completed', runnerExitCode: 1, unexpectedGlobalErrors: [], resultArtifact: { path: 'mutant.json', digest: digest('4') } }
    ],
    results: [baselineResult],
    mutations: [{ mutationId: 'wa-drop-family', obligationId: 'wa-family-scope', runId: manifest.runId, baselineIdentity: structuredClone(identity), mutantIdentity, mutationDefinitionDigest: digest('2'), baselineResult: structuredClone(baselineResult), mutantResult }]
  };
}

function promotionExpected(input, evidenceManifestDigest = digest('5')) {
  const { runId, harnessCommit, releaseScopeId, policyDigest, identity } = input.manifest;
  return { runId, harnessCommit, releaseScopeId, policyDigest, identity: structuredClone(identity), evidenceManifestDigest };
}

module.exports = { completeRun, digest, promotionExpected };
