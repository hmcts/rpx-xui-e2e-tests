const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { completeRun, digest } = require('./fixtures/exui-release-evidence.mock.cjs');

function externalRun() {
  const input = completeRun();
  input.manifest.runtimeMetadata.evaluatedAt = new Date().toISOString();
  input.manifest.identity.dependencyIdentities.idam = { artifactDigest: digest('6'), apiContractDigest: digest('7') };
  // This independent owner is separately versioned; it must not inherit the candidate's SHA.
  input.policy.obligations.push({ id: 'identity-provider', boundary: 'external', requiredProofIds: ['idam-contract'], requiredMutationIds: [] });
  input.policy.requiredObligationIds.push('identity-provider');
  input.manifest.requiredObligationIds.push('identity-provider');
  for (const result of input.results) result.identity = structuredClone(input.manifest.identity);
  for (const execution of input.executions) execution.identity.dependencyIdentities = structuredClone(input.manifest.identity.dependencyIdentities);
  for (const mutation of input.mutations) {
    mutation.baselineIdentity = structuredClone(input.manifest.identity);
    mutation.baselineResult = structuredClone(input.results[0]);
    mutation.mutantIdentity.dependencyIdentities = structuredClone(input.manifest.identity.dependencyIdentities);
    mutation.mutantResult.identity = structuredClone(mutation.mutantIdentity);
  }
  input.policy.externalCompatibilityRules = [{
    id: 'idam-v1', proofId: 'idam-contract', producerGateId: 'idam-required', producerScopeId: 'idam-contract-v1', producerProofId: 'oidc-contract',
    artifactUriTemplate: 'https://ci.example.invalid/idam/{producerRunId}/receipt.json',
    gateConfigurationDigest: digest('8'), maxAgeSeconds: 3600, producerRunIdFormat: 'build-number',
    identityBindings: [
      { producerKey: 'image', candidatePath: 'dependencyIdentities.idam.artifactDigest' },
      { producerKey: 'contract', candidatePath: 'dependencyIdentities.idam.apiContractDigest' }
    ]
  }];
  input.externalResults = [{
    releaseRunId: input.manifest.runId, proofId: 'idam-contract', obligationId: 'identity-provider', compatibilityRuleId: 'idam-v1', producerRunId: '57',
    producerArtifact: { uri: 'https://ci.example.invalid/idam/57/receipt.json', path: 'idam.json', digest: digest('9') },
    original: {
      schemaVersion: 1, producerRunId: '57', producerGateId: 'idam-required', producerScopeId: 'idam-contract-v1', proofId: 'oidc-contract',
      gateConfigurationDigest: digest('8'), complete: true, outcome: 'PASS', attempts: 1,
      completedAt: new Date(Date.now() - 1800000).toISOString(), identity: { image: digest('6'), contract: digest('7'), producerCommit: 'c'.repeat(40) }
    }
  }];
  return input;
}

test('separately versioned external result retains provenance and satisfies only its policy-owned mapping', async () => {
  const { evaluateReleaseEvidence } = await import('./lib/exui-release-evidence.mjs');
  const input = externalRun();
  const before = structuredClone(input.externalResults);
  assert.deepEqual(evaluateReleaseEvidence(input), { status: 'PASS', exitCode: 0, reasons: [] });
  assert.deepEqual(input.externalResults, before);
  input.externalResults[0].original.outcome = 'FAIL';
  assert.equal(evaluateReleaseEvidence(input).status, 'FAIL');
});

for (const [label, change] of Object.entries({
  absent: (input) => { input.externalResults = []; },
  stale: (input) => { input.externalResults[0].original.completedAt = new Date(Date.now() - 86400000).toISOString(); },
  future: (input) => { input.externalResults[0].original.completedAt = new Date(Date.now() + 86400000).toISOString(); },
  'wrong current release': (input) => { input.externalResults[0].releaseRunId = 'previous-release'; },
  'wrong producer run': (input) => { input.externalResults[0].original.producerRunId = 'another-run'; },
  'wrong dependency': (input) => { input.externalResults[0].original.identity.image = digest('a'); },
  'wrong producer scope': (input) => { input.externalResults[0].original.producerScopeId = 'narrower-pilot'; },
  'wrong required gate configuration': (input) => { input.externalResults[0].original.gateConfigurationDigest = digest('a'); },
  'missing producer identity': (input) => { delete input.externalResults[0].original.identity.contract; },
  'unmapped compatibility': (input) => { input.externalResults[0].compatibilityRuleId = 'invented'; },
  'empty compatibility': (input) => { input.policy.externalCompatibilityRules[0].identityBindings = []; },
  'last green URL': (input) => { input.externalResults[0].producerArtifact.uri = 'https://ci.example.invalid/idam/lastSuccessfulBuild/receipt.json'; },
  retry: (input) => { input.externalResults[0].original.attempts = 2; },
  incomplete: (input) => { input.externalResults[0].original.complete = false; },
  blocked: (input) => { input.externalResults[0].original.outcome = 'BLOCKED'; },
  duplicate: (input) => { input.externalResults.push(structuredClone(input.externalResults[0])); },
  'internal proof substitution': (input) => { input.results.push({ ...input.results[0], proofId: 'idam-contract', obligationId: 'identity-provider', boundary: 'external' }); input.externalResults = []; }
})) test(`external ${label} blocks promotion`, async () => {
  const { evaluateReleaseEvidence } = await import('./lib/exui-release-evidence.mjs');
  const input = externalRun(); change(input);
  assert.equal(evaluateReleaseEvidence(input).status, 'BLOCKED');
});

test('loader binds original external bytes; missing or modified receipt cannot become a green badge', async () => {
  const { loadRunEvidence, digestBytes } = await import('./lib/exui-evidence-io.mjs');
  const input = externalRun();
  // External-only scope exercises the distinct adapter without fabricated local executions.
  input.policy.obligations.shift(); input.policy.requiredObligationIds.shift(); input.policy.mutationDefinitions = [];
  input.manifest.requiredObligationIds.shift();
  const directory = mkdtempSync(join(tmpdir(), 'exui-external-'));
  try {
    const external = input.externalResults[0];
    const bytes = JSON.stringify(external.original);
    external.producerArtifact.digest = digestBytes(bytes);
    writeFileSync(join(directory, 'idam.json'), bytes);
    const { original, ...reference } = external;
    const run = { schemaVersion: 1, manifest: input.manifest, executionArtifacts: [], mutations: [], externalResults: [reference] };
    const file = join(directory, 'run.json'); writeFileSync(file, JSON.stringify(run));
    const result = loadRunEvidence(file, input.policy);
    assert.equal(result.receipt.verdict.status, 'PASS');
    assert.deepEqual(result.input.externalResults[0].original, original);
    writeFileSync(join(directory, 'idam.json'), JSON.stringify({ ...original, producerRunId: 'another-run' }));
    assert.throws(() => loadRunEvidence(file, input.policy), /DIGEST/);
    rmSync(join(directory, 'idam.json'));
    assert.throws(() => loadRunEvidence(file, input.policy));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('incoherent external provenance blocks while retaining the observed failure', async () => {
  const { evaluateReleaseEvidence } = await import('./lib/exui-release-evidence.mjs');
  const input = externalRun();
  input.externalResults[0].original.outcome = 'FAIL';
  input.externalResults[0].original.gateConfigurationDigest = digest('a');
  const result = evaluateReleaseEvidence(input);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasons.includes('OBSERVED_FAILED_EXTERNAL_RESULT:idam-contract'));
});

for (const alias of ['lastSuccessfulBuild', 'lastCompletedBuild', 'latest']) test(`coherent ${alias} producer alias is not an immutable build`, async () => {
  const { evaluateReleaseEvidence } = await import('./lib/exui-release-evidence.mjs');
  const input = externalRun();
  input.externalResults[0].producerRunId = alias;
  input.externalResults[0].original.producerRunId = alias;
  input.externalResults[0].producerArtifact.uri = `https://ci.example.invalid/idam/${alias}/receipt.json`;
  assert.equal(evaluateReleaseEvidence(input).status, 'BLOCKED');
});

test('backdating untrusted manifest time cannot renew a stale producer receipt', async () => {
  const { evaluateReleaseEvidence } = await import('./lib/exui-release-evidence.mjs');
  const input = externalRun();
  input.externalResults[0].original.completedAt = new Date(Date.now() - 86400000).toISOString();
  input.manifest.runtimeMetadata.evaluatedAt = input.externalResults[0].original.completedAt;
  assert.equal(evaluateReleaseEvidence(input).status, 'BLOCKED');
});
