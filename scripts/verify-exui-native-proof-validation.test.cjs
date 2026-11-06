const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { completeRun } = require('./fixtures/exui-release-evidence.mock.cjs');
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const hash = digit => 'sha256:' + digit.repeat(64);
const load = () => import('./lib/exui-native-proof-validation.mjs');
const scope = 'exui-ccd-event-capability-pilot';

async function fixture(t, selectedScope = scope) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'event-baseline-checkpoint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'baseline'));
  const policy = (await import('./lib/exui-release-policy.mjs')).getReleasePolicy(selectedScope);
  const manifest = completeRun().manifest;
  Object.assign(manifest, {
    runId: 'ccd-11111111-1111-4111-8111-111111111111',
    releaseScopeId: selectedScope, policyDigest: policy.policyDigest, requiredObligationIds: [...policy.requiredObligationIds],
    runtimeMetadata: { isolation: 'native-separate-api-owned-network-none', harnessSourceState: 'clean', harnessSourceDigest: hash('4'), harnessDependencyDigest: hash('5'), browserDigest: hash('6') },
  });
  const expected = {
    nativeAuthority: true,
    ...Object.fromEntries(['runId', 'harnessCommit', 'releaseScopeId', 'policyDigest', 'identity'].map(key => [key, structuredClone(manifest[key])])),
    ...Object.fromEntries(['harnessSourceDigest', 'harnessDependencyDigest', 'browserDigest'].map(key => [key, manifest.runtimeMetadata[key]])),
  };
  const report = {
    schemaVersion: 1, complete: true, status: 'passed', globalErrors: [],
    context: {
      ...Object.fromEntries(['runId', 'harnessCommit', 'releaseScopeId', 'policyDigest', 'identity'].map(key => [key, structuredClone(manifest[key])])),
      invocationId: 'baseline', harnessSourceState: 'clean', harnessSourceDigest: expected.harnessSourceDigest,
    },
    tests: policy.obligations.flatMap(item => item.requiredProofIds).sort().map(proofId => ({ proofId, expectedStatus: 'passed', status: 'passed', retry: 0, unattributedErrors: 0, failureId: null })),
  };
  const execution = { runId: manifest.runId, invocationId: 'baseline', kind: 'baseline', identity: structuredClone(manifest.identity), terminalState: 'completed', runnerExitCode: 0, unexpectedGlobalErrors: [] };
  const terminal = { code: 0, signal: null };
  const put = (name, value) => { const bytes = JSON.stringify(value); fs.writeFileSync(path.join(root, name), bytes); return { path: name, digest: sha(bytes) }; };
  const write = () => {
    put('baseline/manifest.json', manifest);
    execution.resultArtifact = put('baseline/report.json', report);
    put('baseline/framework-terminal.json', terminal);
    return put('baseline/execution.json', execution);
  };
  write();
  return { root, policy, manifest, expected, report, execution, terminal, write, put };
}

test('checkpoint reads exact baseline with full policy and binds all four artifacts without evaluating or writing a gate', async t => {
  const f = await fixture(t), { readEventBaselineCheckpoint } = await load();
  const before = fs.readdirSync(path.join(f.root, 'baseline')).sort().map(name => [name, sha(fs.readFileSync(path.join(f.root, 'baseline', name)))]);
  const observed = readEventBaselineCheckpoint(f.root, f.expected);
  assert.deepEqual(observed.input.policy, f.policy);
  assert.equal(observed.input.policy.mutationDefinitions.length, 11);
  assert.deepEqual(observed.input.mutations, []);
  assert.deepEqual(observed.input.results.map(result => result.proofId), ['ccd-courtadmin-read-recipient-shapes', 'ccd-courtadmin-update-recipient-shapes', 'ccd-event-create-denied', 'ccd-readonly-read-recipient-shapes', 'ccd-readonly-update-recipient-shapes-denied', 'ccd-source-shape-case-field-recipient-selector', 'ccd-source-shape-conditional-email-complex', 'ccd-source-shape-optional-postal-line-two', 'ccd-source-shape-postal-recipient-name', 'ccd-source-shape-recipient-collection', 'ccd-source-shape-required-delivery-radio']);
  assert.deepEqual(observed.terminal, f.terminal);
  assert.deepEqual(observed.references.map(item => item.path), ['baseline/manifest.json', 'baseline/execution.json', 'baseline/report.json', 'baseline/framework-terminal.json']);
  assert.equal(observed.checkpointDigest, sha(JSON.stringify(observed.references)));
  assert.equal(Object.hasOwn(observed, 'receipt'), false);
  assert.equal(Object.hasOwn(observed, 'verdict'), false);
  assert.deepEqual(fs.readdirSync(f.root).sort(), ['baseline']);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'baseline')).sort().map(name => [name, sha(fs.readFileSync(path.join(f.root, 'baseline', name)))]), before);
});

test('checkpoint retains an attributed product failure and requires coherent framework and execution terminal', async t => {
  const f = await fixture(t), { readEventBaselineCheckpoint } = await load();
  f.report.tests[0].status = 'failed'; f.report.tests[0].failureId = 'courtadmin-update-persistence';
  f.report.status = 'failed'; f.execution.runnerExitCode = 1; f.terminal.code = 1; f.write();
  assert.equal(readEventBaselineCheckpoint(f.root, f.expected).input.results[0].outcome, 'failed');
  f.terminal.code = 0; f.write();
  assert.throws(() => readEventBaselineCheckpoint(f.root, f.expected), /TERMINAL/);
  f.terminal.code = 1; f.terminal.signal = 'SIGTERM'; f.write();
  assert.throws(() => readEventBaselineCheckpoint(f.root, f.expected), /TERMINAL/);
});

test('checkpoint rejects partial selection, retries, skips, global and unattributed failures', async t => {
  const { readEventBaselineCheckpoint } = await load();
  for (const change of [
    f => f.report.tests.pop(),
    f => { f.report.tests.find(test => test.proofId === "ccd-courtadmin-update-recipient-shapes").proofId = "ccd-courtadmin-email-one"; },
    f => { f.report.tests[1].proofId = "ccd-courtadmin-read-email-one"; },
    f => f.report.tests.push(structuredClone(f.report.tests[0])),
    f => { f.report.tests[0].proofId = 'ccd-event-create-enabled'; },
    f => { f.report.tests[0].retry = 1; },
    f => { f.report.tests[0].status = 'skipped'; },
    f => { f.report.globalErrors.push('unexpected'); f.execution.unexpectedGlobalErrors.push('unexpected'); },
    f => { f.report.tests[0].unattributedErrors = 1; },
    f => { f.report.tests[0].status = 'failed'; f.report.status = 'failed'; f.execution.runnerExitCode = 1; f.terminal.code = 1; },
    f => { f.execution.terminalState = 'running'; },
  ]) {
    const f = await fixture(t); change(f); f.write();
    assert.throws(() => readEventBaselineCheckpoint(f.root, f.expected));
  }
});

test('checkpoint binds independent candidate, full policy, clean source, dependencies and browser identity', async t => {
  const { readEventBaselineCheckpoint } = await load();
  for (const change of [
    f => { f.expected.identity.artifactDigest = hash('f'); },
    f => { f.expected.harnessCommit = 'f'.repeat(40); },
    f => { f.expected.releaseScopeId = 'exui-ccd-pilot'; },
    f => { f.expected.policyDigest = hash('b'); },
    f => { f.expected.harnessSourceDigest = hash('c'); },
    f => { delete f.expected.harnessDependencyDigest; },
    f => { f.expected.browserDigest = hash('d'); },
    f => { delete f.expected.nativeAuthority; },
    f => { f.manifest.requiredObligationIds.pop(); },
    f => { f.manifest.runtimeMetadata.harnessSourceState = 'dirty'; },
    f => { f.report.context.harnessSourceDigest = hash('7'); },
  ]) {
    const f = await fixture(t); change(f); f.write();
    assert.throws(() => readEventBaselineCheckpoint(f.root, f.expected));
  }
});

test('checkpoint accepts only fixed canonical baseline artifacts and digest-verified report bytes', async t => {
  const { readEventBaselineCheckpoint } = await load();
  const f = await fixture(t);
  fs.appendFileSync(path.join(f.root, 'baseline/report.json'), ' ');
  assert.throws(() => readEventBaselineCheckpoint(f.root, f.expected), /ARTIFACT_DIGEST_MISMATCH/);
  f.write();
  fs.copyFileSync(path.join(f.root, 'baseline/report.json'), path.join(f.root, 'baseline/other.json'));
  f.execution.resultArtifact.path = 'baseline/other.json'; f.put('baseline/execution.json', f.execution);
  assert.throws(() => readEventBaselineCheckpoint(f.root, f.expected), /REPORT_PATH/);
  f.write();
  fs.renameSync(path.join(f.root, 'baseline/report.json'), path.join(f.root, 'baseline/report-original.json'));
  fs.symlinkSync('report-original.json', path.join(f.root, 'baseline/report.json'));
  assert.throws(() => readEventBaselineCheckpoint(f.root, f.expected), /PATH/);
});

test('shared complete native validation retains mutation identity checks and structural-outcome rejection', async t => {
  const f = await fixture(t), api = await load();
  const baseline = api.readEventBaselineCheckpoint(f.root, f.expected).input;
  const input = { ...baseline, executions: [...baseline.executions], mutations: [] };
  for (const definition of f.policy.mutationDefinitions) {
    const baselineResult = baseline.results.find(item => item.proofId === definition.baselineProofId);
    const mutantIdentity = structuredClone(f.manifest.identity); mutantIdentity.configurationDigest = sha(definition.mutationId);
    const mutant = { ...structuredClone(baselineResult), proofId: definition.mutantProofId, invocationId: definition.mutationId, identity: mutantIdentity, outcome: 'failed', failureId: definition.expectedFailureId };
    input.executions.push({ ...structuredClone(baseline.executions[0]), invocationId: definition.mutationId, kind: 'mutation', identity: mutantIdentity, runnerExitCode: 1 });
    input.mutations.push({ mutationId: definition.mutationId, obligationId: definition.obligationId, runId: f.manifest.runId, mutationDefinitionDigest: definition.definitionDigest, baselineIdentity: f.manifest.identity, mutantIdentity, baselineResult, mutantResult: mutant });
  }
  api.validateCompleteNativeProofs(input, f.policy);
  api.validateNativeOutcome(input, { status: 'PASS', exitCode: 0, reasons: [] });
  api.validateNativeOutcome(input, { status: 'BLOCKED', exitCode: 2, reasons: ['MUTATION_BASELINE_UNAVAILABLE'] });
  assert.throws(() => api.validateNativeOutcome(input, { status: 'BLOCKED', exitCode: 2, reasons: ['WRONG_POLICY'] }), /NATIVE_REPORT_STRUCTURAL_EVIDENCE_REJECTED/);
  input.mutations[0].mutantResult.identity = structuredClone(f.manifest.identity);
  assert.throws(() => api.validateCompleteNativeProofs(input, f.policy), /NATIVE_REPORT_(?:PROOF|MUTATION)_IDENTITY_MISMATCH/);
});

async function knownPostalInput() {
  const { getReleasePolicy } = await import('./lib/exui-release-policy.mjs');
  const { nativeInvocations } = await import('./lib/exui-native-contract.mjs');
  const policy = getReleasePolicy('exui-ccd-pilot');
  const manifest = completeRun().manifest;
  Object.assign(manifest, { releaseScopeId: policy.releaseScopeId, policyDigest: policy.policyDigest, requiredObligationIds: policy.requiredObligationIds });
  manifest.identity.dependencyIdentities.ccd = { artifactDigest: hash('5'), apiContractDigest: hash('6') };
  const result = completeRun().results[0];
  const results = policy.obligations.flatMap(obligation => obligation.requiredProofIds.map(proofId => ({
    ...structuredClone(result), proofId, obligationId: obligation.id, invocationId: 'baseline', boundary: obligation.boundary,
    identity: structuredClone(manifest.identity),
    outcome: proofId === 'ccd-postal-two-roundtrip' ? 'failed' : 'passed', failureId: proofId === 'ccd-postal-two-roundtrip' ? 'postal-required-fields' : null,
  })));
  const executions = [], mutations = [];
  for (const invocation of nativeInvocations(policy.releaseScopeId)) {
    const definition = policy.mutationDefinitions.find(item => item.mutationId === invocation.mutation);
    const identity = structuredClone(manifest.identity);
    if (definition) identity.configurationDigest = sha(definition.mutationId);
    executions.push({ invocationId: invocation.invocationId, kind: invocation.kind, runId: manifest.runId, identity, terminalState: 'completed', runnerExitCode: 1, unexpectedGlobalErrors: [], resultArtifact: { path: invocation.invocationId + '/report.json', digest: hash('3') } });
    if (definition) {
      const baselineResult = results.find(item => item.proofId === definition.baselineProofId);
      const mutantResult = { ...structuredClone(baselineResult), proofId: definition.mutantProofId, invocationId: invocation.invocationId, identity, outcome: 'failed', failureId: definition.mutationId === 'ccd-drop-postal-optional-child' ? 'postal-required-fields' : definition.expectedFailureId };
      mutations.push({ mutationId: definition.mutationId, obligationId: definition.obligationId, runId: manifest.runId, mutationDefinitionDigest: definition.definitionDigest, baselineIdentity: manifest.identity, mutantIdentity: identity, baselineResult, mutantResult });
    }
  }
  return { manifest, policy, executions, results, mutations, externalResults: [] };
}

test('known postal block accepts only full current CCD evidence with its exact early baseline and mutant failure', async () => {
  const input = await knownPostalInput(), api = await load();
  const { evaluateReleaseEvidence } = await import('./lib/exui-release-evidence.mjs');
  const verdict = evaluateReleaseEvidence(input);
  assert.deepEqual(verdict, { status: 'BLOCKED', exitCode: 2, reasons: ['MUTATION_BASELINE_UNAVAILABLE', 'OBSERVED_FAILED_RESULT:ccd-postal-two-roundtrip:postal-required-fields'] });
  assert.equal(api.isKnownPostalBlock(input, verdict), true);
  for (const change of [
    value => { value.results[0].outcome = 'failed'; value.results[0].failureId = 'nested-persistence'; },
    value => { value.results.find(item => item.proofId === 'ccd-postal-two-roundtrip').failureId = 'postal-persistence'; },
    value => { value.mutations.find(item => item.mutationId === 'ccd-drop-postal-optional-child').mutantResult.failureId = 'postal-persistence'; },
    value => { value.mutations.find(item => item.mutationId === 'ccd-write-then-deny').mutantResult.failureId = 'unrelated'; },
    value => { value.mutations.find(item => item.mutationId === 'ccd-write-then-deny').mutantResult.outcome = 'passed'; value.mutations.find(item => item.mutationId === 'ccd-write-then-deny').mutantResult.failureId = null; },
    value => { value.mutations.find(item => item.mutationId === 'ccd-write-then-deny').mutantIdentity.configurationDigest = value.manifest.identity.configurationDigest; },
    value => { value.mutations.find(item => item.mutationId === 'ccd-write-then-deny').mutantResult.proofId = 'ccd-access-broadened'; },
    value => { value.results[0].retryIndex = 1; },
    value => { value.executions[0].unexpectedGlobalErrors.push('unexpected'); },
    value => { value.manifest.requiredObligationIds.pop(); },
    value => { value.policy.mutationDefinitions.pop(); },
    value => { value.manifest.runtimeMetadata.harnessSourceState = 'dirty'; },
    value => { value.manifest.releaseScopeId = 'exui-ccd-event-capability-pilot'; },
  ]) {
    const changed = structuredClone(input); change(changed);
    assert.equal(api.isKnownPostalBlock(changed, verdict), false);
  }
  for (const invalid of [
    { ...verdict, status: 'PASS', exitCode: 0 },
    { ...verdict, reasons: verdict.reasons.slice(1) },
    { ...verdict, reasons: [...verdict.reasons, 'EXPECTED_MUTATION_ASSERTION_MISSING'] },
    null,
  ]) assert.equal(api.isKnownPostalBlock(input, invalid), false);
  const lateFailure = structuredClone(input);
  lateFailure.mutations.sort((left, right) => Number(right.mutationId === 'ccd-drop-postal-optional-child') - Number(left.mutationId === 'ccd-drop-postal-optional-child'));
  lateFailure.mutations.find(item => item.mutationId === 'ccd-write-then-deny').mutantResult.failureId = 'unrelated';
  assert.deepEqual(evaluateReleaseEvidence(lateFailure), verdict, 'the known early postal block can precede a later invalid witness');
  assert.equal(api.isKnownPostalBlock(lateFailure, verdict), false, 'continuation must still validate every later witness');
});

test('callback checkpoint is closed to its one candidate proof and requires baseline success before omission', async t => {
 const {CALLBACK_SCOPE,CALLBACK_PROOF}=await import('./lib/exui-recipient-callback-contract.mjs');
 const {readCallbackBaselineCheckpoint,readEventBaselineCheckpoint}=await load();
 const f=await fixture(t,CALLBACK_SCOPE),observed=readCallbackBaselineCheckpoint(f.root,f.expected);
 assert.deepEqual(observed.input.results.map(row=>[row.proofId,row.boundary,row.outcome]),[[CALLBACK_PROOF,'candidate','passed']]);
 assert.equal(observed.input.mutations.length,0);assert.equal(observed.input.policy.mutationDefinitions.length,1);
 assert.throws(()=>readEventBaselineCheckpoint(f.root,f.expected),/NATIVE_CHECKPOINT_SCOPE_REQUIRED/);
 f.report.tests[0].status='failed';f.report.tests[0].failureId='recipient-callback-binding';f.report.status='failed';f.execution.runnerExitCode=1;f.terminal.code=1;f.write();
 assert.throws(()=>readCallbackBaselineCheckpoint(f.root,f.expected),/NATIVE_CHECKPOINT_CALLBACK_BASELINE_PASSED_REQUIRED/);
 const old=await fixture(t);assert.throws(()=>readCallbackBaselineCheckpoint(old.root,old.expected),/NATIVE_CHECKPOINT_SCOPE_REQUIRED/);
});


test('framework reporter retains only actual configured worker slots, with absence unknown', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-worker-config-'));
  const previous = {context: process.env.EXUI_EVIDENCE_CONTEXT, report: process.env.EXUI_EVIDENCE_REPORT};
  t.after(() => {
    for (const [key, value] of [['EXUI_EVIDENCE_CONTEXT', previous.context], ['EXUI_EVIDENCE_REPORT', previous.report]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(directory, {recursive:true, force:true});
  });
  process.env.EXUI_EVIDENCE_CONTEXT = path.join(directory, 'context.json');
  fs.writeFileSync(process.env.EXUI_EVIDENCE_CONTEXT, '{}');
  const {default: Reporter} = await import('./lib/exui-playwright-evidence-reporter.mjs');
  for (const workers of [1, 2, undefined, 0, 'PRIVATE_WORKER_CANARY']) {
    process.env.EXUI_EVIDENCE_REPORT = path.join(directory, 'report.json');
    const reporter = new Reporter();
    reporter.onBegin({workers, metadata:{token:'PRIVATE_CONFIG_CANARY'}});
    reporter.onEnd({status:'passed'});
    const report = JSON.parse(fs.readFileSync(process.env.EXUI_EVIDENCE_REPORT));
    assert.equal(report.configuredWorkers, workers === 1 || workers === 2 ? workers : null);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_/);
    fs.unlinkSync(process.env.EXUI_EVIDENCE_REPORT);
  }
});
