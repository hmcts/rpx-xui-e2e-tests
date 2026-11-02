const assert = require('node:assert/strict');
const { test } = require('node:test');
const { completeRun, digest, promotionExpected } = require('./fixtures/exui-release-evidence.mock.cjs');
const contract = import('./lib/exui-release-evidence.mjs');

test('a complete candidate baseline and intended mutant yield PASS', async () => {
  const { evaluateReleaseEvidence } = await contract;
  assert.deepEqual(evaluateReleaseEvidence(completeRun()), { status: 'PASS', exitCode: 0, reasons: [] });
});

const invalidRuns = {
  'empty selection': (x) => { x.manifest.requiredObligationIds = []; },
  'unknown obligation': (x) => { x.manifest.requiredObligationIds = ['unknown']; },
  'missing toolkit digest': (x) => { delete x.manifest.identity.toolkitDigest; },
  'dirty source revision': (x) => { x.manifest.identity.webappCommit += '-dirty'; },
  'unsupported schema': (x) => { x.manifest.schemaVersion = 2; },
  'duplicate required IDs': (x) => { x.manifest.requiredObligationIds.push(x.manifest.requiredObligationIds[0]); },
  'smaller runner selection': (x) => { x.policy.requiredObligationIds.push('second'); x.policy.obligations.push({ id: 'second', boundary: 'candidate', requiredProofIds: ['second-proof'], requiredMutationIds: [] }); },
  'wrong policy digest': (x) => { x.manifest.policyDigest = digest('9'); },
  'pilot renamed as full release': (x) => { x.manifest.releaseScopeId = 'full-release'; },
  'missing result': (x) => { x.results = []; },
  'skipped mandatory proof': (x) => { x.results[0].outcome = 'skipped'; },
  'blocked mandatory proof': (x) => { x.results[0].outcome = 'blocked'; },
  'incomplete proof': (x) => { x.results[0].complete = false; },
  'another candidate': (x) => { x.results[0].identity.artifactDigest = digest('9'); },
  'another run': (x) => { x.results[0].runId = 'other-run'; },
  'another configuration': (x) => { x.results[0].identity.configurationDigest = digest('9'); },
  'another definition': (x) => { x.results[0].identity.definitionDigests.example = digest('9'); },
  'model replacing candidate proof': (x) => { x.results[0].boundary = 'model'; },
  'duplicate proof': (x) => { x.results.push(structuredClone(x.results[0])); },
  'unselected proof': (x) => { x.results.push({ ...structuredClone(x.results[0]), proofId: 'unselected' }); },
  'mandatory retry': (x) => { x.results[0].retryIndex = 1; },
  'missing execution': (x) => { x.executions.shift(); },
  'duplicate execution': (x) => { x.executions.push(structuredClone(x.executions[0])); },
  'passed assertions then teardown failure': (x) => { x.executions[0].runnerExitCode = 1; x.executions[0].unexpectedGlobalErrors.push('teardown failed'); },
  'termination after last assertion': (x) => { x.executions[0].terminalState = 'interrupted'; x.executions[0].runnerExitCode = null; },
  'nonzero exit without failed assertion': (x) => { x.executions[0].runnerExitCode = 1; },
  'missing raw report digest': (x) => { delete x.executions[0].resultArtifact.digest; },
  'wrong execution identity': (x) => { x.executions[0].identity.toolkitVersion = '2.0.0'; },
  'wrong execution run': (x) => { x.executions[0].runId = 'other-run'; },
  'missing mutation': (x) => { x.mutations = []; },
  'duplicate mutation': (x) => { x.mutations.push(structuredClone(x.mutations[0])); },
  'unknown mutation definition': (x) => { x.mutations[0].mutationDefinitionDigest = digest('9'); },
  'startup failure as mutation kill': (x) => { x.mutations[0].mutantResult.failureId = 'runtime-startup'; },
  'self-declared expected failure': (x) => { x.mutations[0].expectedFailureId = 'runtime-startup'; x.mutations[0].mutantResult.failureId = 'runtime-startup'; },
  'mutant unexpectedly passes': (x) => { x.mutations[0].mutantResult.outcome = 'passed'; x.mutations[0].mutantResult.failureId = null; x.executions[1].runnerExitCode = 0; },
  'mutant teardown failure': (x) => { x.executions[1].unexpectedGlobalErrors.push('teardown failed'); },
  'mutant unrecognized exit': (x) => { x.executions[1].runnerExitCode = 137; },
  'mutant kept baseline identity': (x) => { x.mutations[0].mutantIdentity = structuredClone(x.manifest.identity); },
  'baseline reference was changed': (x) => { x.mutations[0].baselineResult.failureId = 'fake-failure'; },
  'mutation references different baseline': (x) => { x.mutations[0].baselineIdentity.artifactDigest = digest('9'); },
  'external proof through internal path': (x) => { x.policy.obligations[0].boundary = 'external'; x.results[0].boundary = 'external'; },
  'CCD proof without observed CCD identity': (x) => { x.policy.obligations[0].boundary = 'ccd'; x.results[0].boundary = 'ccd'; },
  'proof ID reused by another obligation': (x) => { x.policy.obligations.push({ ...structuredClone(x.policy.obligations[0]), id: 'other' }); }
};
for (const [name, change] of Object.entries(invalidRuns)) {
  test(`${name} blocks release`, async () => {
    const { evaluateReleaseEvidence } = await contract;
    const input = completeRun();
    change(input);
    const verdict = evaluateReleaseEvidence(input);
    assert.equal(verdict.status, 'BLOCKED', JSON.stringify(verdict));
    assert.equal(verdict.exitCode, 2);
    assert.ok(verdict.reasons.length > 0);
  });
}

test('a coherent product assertion failure remains FAIL', async () => {
  const { evaluateReleaseEvidence } = await contract;
  const input = completeRun();
  input.policy.obligations[0].requiredMutationIds = [];
  input.policy.mutationDefinitions = [];
  input.mutations = [];
  input.executions.pop();
  input.results[0].outcome = 'failed';
  input.results[0].failureId = 'assert-wa-scope';
  input.executions[0].runnerExitCode = 1;
  const verdict = evaluateReleaseEvidence(input);
  assert.equal(verdict.status, 'FAIL');
  assert.equal(verdict.exitCode, 1);
  assert.ok(verdict.reasons.some((reason) => reason.includes('assert-wa-scope')));
});

test('infrastructure problems retain observed product failure facts', async () => {
  const { evaluateReleaseEvidence } = await contract;
  const input = completeRun();
  input.results[0].outcome = 'failed';
  input.results[0].failureId = 'assert-wa-scope';
  input.executions[0].runnerExitCode = 1;
  input.executions[0].unexpectedGlobalErrors.push('teardown failed');
  const verdict = evaluateReleaseEvidence(input);
  assert.equal(verdict.status, 'BLOCKED');
  assert.ok(verdict.reasons.some((reason) => reason.includes('assert-wa-scope')));
});

test('all required execution cells must pass, not just one proof in an obligation', async () => {
  const { evaluateReleaseEvidence } = await contract;
  const input = completeRun();
  input.policy.obligations[0].requiredProofIds.push('wa-denied-persona');
  assert.equal(evaluateReleaseEvidence(input).status, 'BLOCKED');
});

test('distinct passing execution cells can share one completed invocation', async () => {
  const { evaluateReleaseEvidence } = await contract;
  const input = completeRun();
  input.policy.obligations[0].requiredProofIds.push('wa-denied-persona');
  input.results.push({ ...structuredClone(input.results[0]), proofId: 'wa-denied-persona' });
  assert.equal(evaluateReleaseEvidence(input).status, 'PASS');
});

test('a failure followed by a passing retry never replaces the failed facts', async () => {
  const { evaluateReleaseEvidence } = await contract;
  const input = completeRun();
  input.results.unshift({ ...structuredClone(input.results[0]), outcome: 'failed', failureId: 'assert-wa-scope' });
  input.results[1].retryIndex = 1;
  const verdict = evaluateReleaseEvidence(input);
  assert.equal(verdict.status, 'BLOCKED');
  assert.ok(verdict.reasons.some((reason) => reason.includes('assert-wa-scope')));
});

test('changing only a mutant version label without any content digest is not a mutation', async () => {
  const { evaluateReleaseEvidence } = await contract;
  const input = completeRun();
  const identity = { ...structuredClone(input.manifest.identity), toolkitVersion: 'changed-label' };
  input.mutations[0].mutantIdentity = identity;
  input.mutations[0].mutantResult.identity = structuredClone(identity);
  input.executions[1].identity = structuredClone(identity);
  assert.equal(evaluateReleaseEvidence(input).status, 'BLOCKED');
});

test('malformed evidence returns BLOCKED rather than throwing', async () => {
  const { evaluateReleaseEvidence } = await contract;
  for (const value of [null, [], {}, { manifest: null }, { ...completeRun(), results: 'wrong-type' }]) {
    assert.equal(evaluateReleaseEvidence(value).status, 'BLOCKED');
  }
});

test('manifest validation rejects bad identities and accepts a complete manifest', async () => {
  const { validateRunManifest } = await contract;
  const input = completeRun();
  assert.deepEqual(validateRunManifest(input.manifest), input.manifest);
  input.manifest.identity.dependencyIdentities.ccd = { artifactDigest: digest('a') };
  assert.throws(() => validateRunManifest(input.manifest), /INVALID_IDENTITY/);
});

test('a matching identity-bearing receipt permits the promotion gate step', async () => {
  const { evaluateReleaseEvidence, createGateReceipt, validatePromotionReceipt } = await contract;
  const input = completeRun();
  const verdict = evaluateReleaseEvidence(input);
  const expected = promotionExpected(input);
  const receipt = createGateReceipt(input.manifest, expected.evidenceManifestDigest, verdict);
  assert.deepEqual(validatePromotionReceipt(receipt, expected), verdict);
  assert.deepEqual(receipt.identity, input.manifest.identity);
  assert.equal(receipt.schemaVersion, 1);
});

for (const field of ['runId', 'harnessCommit', 'releaseScopeId', 'policyDigest', 'evidenceManifestDigest', 'identity']) {
  test(`promotion rejects independent ${field} mismatch`, async () => {
    const { evaluateReleaseEvidence, createGateReceipt, validatePromotionReceipt } = await contract;
    const input = completeRun();
    const expected = promotionExpected(input);
    const receipt = createGateReceipt(input.manifest, expected.evidenceManifestDigest, evaluateReleaseEvidence(input));
    if (field === 'identity') expected.identity.artifactDigest = digest('9');
    else if (field.endsWith('Digest')) expected[field] = digest('9');
    else if (field === 'harnessCommit') expected[field] = '9'.repeat(40);
    else expected[field] = 'different';
    assert.equal(validatePromotionReceipt(receipt, expected).status, 'BLOCKED');
  });
}

test('missing, incomplete and internally contradictory promotion receipts cannot authorize release', async () => {
  const { createGateReceipt, validatePromotionReceipt } = await contract;
  const input = completeRun();
  const expected = promotionExpected(input);
  for (const value of [null, {}, { schemaVersion: 2 }, { ...expected, schemaVersion: 1, verdict: { status: 'PASS', exitCode: 1, reasons: [] } }]) {
    assert.equal(validatePromotionReceipt(value, expected).status, 'BLOCKED');
  }
  assert.throws(() => createGateReceipt(input.manifest, expected.evidenceManifestDigest, { status: 'PASS', exitCode: 1, reasons: [] }), /INVALID_VERDICT/);
  assert.throws(() => createGateReceipt(input.manifest, 'invalid', { status: 'PASS', exitCode: 0, reasons: [] }), /INVALID_DIGEST/);
});

test('matching FAIL and BLOCKED receipts never become promotion success', async () => {
  const { createGateReceipt, validatePromotionReceipt } = await contract;
  const input = completeRun();
  const expected = promotionExpected(input);
  for (const [status, exitCode] of [['FAIL', 1], ['BLOCKED', 2]]) {
    const verdict = { status, exitCode, reasons: ['synthetic-required-failure'] };
    const receipt = createGateReceipt(input.manifest, expected.evidenceManifestDigest, verdict);
    assert.deepEqual(validatePromotionReceipt(receipt, expected), verdict);
  }
});
