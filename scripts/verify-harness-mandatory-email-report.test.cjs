const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { Module } = require('node:module');
function nativeModule() {
  const mutation = process.env.MANDATORY_EMAIL_REPORT_TEST_MUTATION;
  if (mutation === undefined) return require('./harness-native-report.cjs');
  assert(['base-native', 'reverse'].includes(mutation), 'FIXED_MANDATORY_REPORT_CONTROL');
  const file = path.join(__dirname, 'harness-native-report.cjs');
  let source = mutation === 'base-native' ? require('node:child_process').execFileSync('git', ['show', 'bf11ff6f7cfdf3e757e692b652ea55049d2d1c54:scripts/harness-native-report.cjs'], {cwd:path.join(__dirname,'..'),encoding:'utf8'}) : fs.readFileSync(file,'utf8');
  if (mutation === 'reverse') {
    const guard = "  for (const id of mandatoryReport.MANDATORY_EMAIL_IDS) assert.equal(coverage.creditedObligationIds.filter(value => value === id).length, mandatory?.joint.status === 'included' ? 1 : 0, 'NATIVE_REPORT_MANDATORY_JOIN');";
    assert.equal(source.split(guard).length,2); source = source.replace(guard,'');
  }
  const loaded = new Module(file,module); loaded.filename=file; loaded.paths=Module._nodeModulePaths(__dirname); loaded._compile(source,file); return loaded.exports;
}
const api = require('./harness-mandatory-email-report.cjs');
const hash = letter => 'sha256:' + letter.repeat(64);
// Literal public projection inputs only: these values are never raw admission evidence.
function admission(included = true) {
  const ids = ['configuration-shape:d0189498d796f462bbd150341384aaf1743ec24491af04fc5176dc8e7e72439e', 'configuration-shape:afb8b838dc9de1bb8314cbf494ff26a987aa3edb845b2fa0a45c378834d2b74d'];
  const rows = ['name', 'address'].map((row, index) => ({ id: ids[index], row,
    sourceKey: 'prl-ccd-definitions:definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json',
    sourceIndex: [14, 13][index], sourceRowDigest: ['sha256:15be218a2ec9b5e16174ad6b350558a2f777ff9f2776ce6541cc5889624bd4b4', 'sha256:84fc6347ddd5f5250fa841380bf5329337ce5b70c864926e2c3d11515cfcec3d'][index],
    baselineProofId: 'ccd-event-required-email-' + row, faultProofId: 'ccd-event-optional-email-' + row, assertionId: 'source-email-' + row + '-required', errorCode: 'MANDATORY_EMAIL_' + row.toUpperCase() + '_REQUIRED_DENIAL' }));
  const value = { schemaVersion: 1, kind: 'mandatory-email-two-row-admission', status: 'passed', policy: 'mandatory-email-two-source-rows-v1', obligationIds: ids, rows,
    boundary: 'candidate', family: 'PRIVATELAW', catalogueSize: 112, selected: 2, accepted: 2, baselineProofs: 2, effectiveFaults: 2, executions: 3,
    runId: 'mandatory-admission-00000000-0000-4000-8000-000000000001', cohortRunId: 'mandatory-email-00000000-0000-4000-8000-000000000002', producerCommit: 'b'.repeat(40),
    ...Object.fromEntries(['producerDigest', 'candidateArtifactDigest', 'inputDigest', 'requestDigest', 'contractDigest'].map(key => [key, hash('a')])),
    contractDigest: 'sha256:8509e0cd65a6ecae5db89ddcc0849bac19b82d014a3859a7de89d2dccfcbdf28',
    sourceComplete: false, runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false, releaseApproval: false };
  value.joint = included ? { policy: value.policy, status: 'included', obligationIds: structuredClone(ids), nativeRunId: 'ci-00000000-0000-4000-8000-000000000003', mandatoryRunId: value.runId, nativeBindingDigest: hash('c'), requestDigest: value.requestDigest, inputDigest: value.inputDigest, contractDigest: value.contractDigest, releaseCredit: false, releaseApproval: false }
    : { policy: value.policy, status: 'separate', reason: 'different-producer', releaseCredit: false, releaseApproval: false };
  return value;
}
function timing(value) {
  return { schemaVersion: 1, scope: 'mandatory-email-admission-call', clock: 'monotonic', startedAt: '2026-11-07T01:00:00.000Z', elapsedMs: 222227, mainRunId: value.joint.nativeRunId, mandatoryRunId: value.runId, requestDigest: value.requestDigest };
}
test('mandatory report separates fixed two-row aggregate outcomes from unrecorded actions and three executions', () => {
  const value = admission(), before = structuredClone(value), html = api.renderMandatoryEmailAdmission(value, timing(value));
  for (const text of ['2 baseline results + 2 effective named fault results across 3 executions', 'two baseline results share one execution', 'Source-defined methods', 'not recorded action events', '3m 42.227s', 'excluded from the recorded native interval', 'data-mandatory-email-credited="2"', 'Typed source dates are retained, not evidence of activation']) assert(html.includes(text), text);
  assert.equal((html.match(/data-mandatory-email-row=/g) || []).length, 2);
  assert.deepEqual(value, before);
  assert(!html.includes('data-native-step'));
  assert(api.renderMandatoryEmailAdmission(value).includes('Admission call elapsed: Not recorded'));
  for (const reason of ['missing-main-binding', 'different-producer', 'different-candidate']) {
    const separate = admission(false); separate.joint.reason = reason;
    const other = api.renderMandatoryEmailAdmission(separate);
    assert(other.includes('data-mandatory-email-credited="0"')); assert(other.includes('adds no requirement'));
    assert.throws(() => api.renderMandatoryEmailAdmission(separate, timing(value)), /MANDATORY_EMAIL_TIMING_INVALID/);
  }
  assert(api.renderMandatoryEmailExecutionInfo(value).includes('executions</th><td>3'));
});
test('mandatory presentation contract matches the strict source-derived current contract without using it as the expectation oracle', async () => {
  const source = await import('./lib/exui-mandatory-email-event-contract.mjs');
  assert.equal(source.mandatoryEmailAdmissionDigest(), 'sha256:8509e0cd65a6ecae5db89ddcc0849bac19b82d014a3859a7de89d2dccfcbdf28');
  const actual = source.mandatoryEmailAdmissionContract();
  const value = admission(); assert.deepEqual(value.obligationIds, actual.obligationIds);
  for (const [index,row] of value.rows.entries()) {
    const expected = actual.source.rows[index];
    assert.equal(row.sourceKey, actual.sourceKey); assert.equal(row.id, expected.obligationId); assert.equal(row.sourceIndex, expected.sourceIndex); assert.equal(row.sourceRowDigest, expected.sourceRowDigest);
    assert.equal(row.baselineProofId, expected.proofId); assert.equal(row.faultProofId, expected.mutantProofId); assert.equal(row.assertionId, expected.failureId);
  }
});
test('mandatory report rejects changed exact rows, joins, no-credit flags and private arbitrary fields', () => {
  const mutations = [v => { v.extra = '/private/PRIVATE_AUTH_CANARY'; }, v => { v.policy = 'other'; }, v => { v.executions = 4; }, v => { v.selected = 1; }, v => { v.accepted = 1; }, v => { v.catalogueSize = 114; }, v => { v.obligationIds.reverse(); }, v => { v.rows.pop(); }, v => { v.rows[0].sourceIndex = 13; }, v => { v.rows[0].sourceRowDigest = hash('e'); }, v => { v.rows[0].sourceKey = 'foreign'; }, v => { v.rows[0].baselineProofId = v.rows[1].baselineProofId; }, v => { v.rows[0].faultProofId = 'foreign'; }, v => { v.rows[0].errorCode = 'generic'; }, v => { v.rows[0].assertionId = 'other'; }, v => { v.rows[0].extra = true; }, v => { v.runId = 'foreign'; }, v => { v.producerCommit = '<script>PRIVATE_AUTH_CANARY</script>'; }, v => { v.producerDigest = 'bad'; }, v => { v.contractDigest = hash('e'); v.joint.contractDigest = hash('e'); }, v => { v.joint.mandatoryRunId = v.cohortRunId; }, v => { v.joint.nativeRunId = 'foreign'; }, v => { v.joint.requestDigest = hash('d'); }, v => { v.joint.obligationIds.pop(); }, v => { v.joint.extra = true; }, ...['sourceComplete','runtimeAcceptance','catalogueCredit','releaseCredit','releaseApproval'].map(key => v => { v[key] = true; })];
  for (const mutate of mutations) { const changed = admission(); mutate(changed); assert.throws(() => api.renderMandatoryEmailAdmission(changed), /^Error: MANDATORY_EMAIL_REPORT_INVALID$/); }
  const other = admission(false); other.joint.reason = 'PRIVATE_AUTH_CANARY'; assert.throws(() => api.renderMandatoryEmailAdmission(other), /^Error: MANDATORY_EMAIL_REPORT_INVALID$/);
  for (const missing of [undefined, null, false]) assert.throws(() => api.renderMandatoryEmailAdmission(missing), /^Error: MANDATORY_EMAIL_REPORT_INVALID$/);
});
test('mandatory call timing is exact finite telemetry bound to strict inclusion and cannot fabricate credit', () => {
  const value = admission();
  for (const mutate of [t => { t.extra = true; }, t => { t.clock = 'wall'; }, t => { t.scope = 'native'; }, t => { t.schemaVersion = 2; }, t => { t.elapsedMs = -1; }, t => { t.elapsedMs = 1.5; }, t => { t.elapsedMs = Number.MAX_SAFE_INTEGER + 1; }, t => { t.startedAt = 'PRIVATE_AUTH_CANARY'; }, t => { t.startedAt = '2026-11-07'; }, t => { t.mainRunId = value.runId; }, t => { t.mandatoryRunId = value.cohortRunId; }, t => { t.requestDigest = hash('d'); }]) {
    const changed = timing(value); mutate(changed); assert.throws(() => api.validateMandatoryEmailTiming(changed, value), /^Error: MANDATORY_EMAIL_TIMING_INVALID$/);
  }
  assert.throws(() => api.validateMandatoryEmailTiming(null, value), /MANDATORY_EMAIL_TIMING_INVALID/);
  assert.throws(() => api.validateMandatoryEmailTiming(timing(value), undefined), /MANDATORY_EMAIL_TIMING_INVALID/);
  const zero = timing(value); zero.elapsedMs = 0; assert(api.renderMandatoryEmailAdmission(value, zero).includes('0m 0.000s'));
});
test('strict raw mandatory fixture renders included two-ID coverage iff without mutating core results', async t => {
  const f = await require('./fixtures/exui-mandatory-email-admission.mock.cjs').admissionPacket(t);
  const { readNativeReportEvidence } = await import('./lib/exui-native-report-evidence.mjs');
  f.write(f.main.descriptorPath, f.descriptor);
  const evidence = await readNativeReportEvidence(f.main.descriptorPath);
  const native = nativeModule(), before = structuredClone(evidence), counts = native.nativeCounts(evidence);
  const span = timing(evidence.mandatoryEmailAdmission);
  const html = native.renderNativeEvidence(evidence, span);
  assert(html.includes('data-mandatory-email-credited="2"')); assert(html.includes('3m 42.227s'));
  assert.deepEqual(native.nativeCounts(evidence), counts); assert.deepEqual(evidence, before);
  assert.deepEqual(counts, native.nativeCounts(f.previousMain));
  assert.equal(evidence.catalogueCoverage.selected, 112);
  for (const mutate of [e => { delete e.mandatoryEmailAdmission; }, e => { e.mandatoryEmailAdmission = false; }, e => { delete e.catalogueCoverage.mandatoryEmailAdmission; }, e => { e.catalogueCoverage.selected++; e.catalogueCoverage.missing++; }, e => { e.catalogueCoverage.creditedObligationIds.pop(); e.catalogueCoverage.candidate--; e.catalogueCoverage.missing++; }, e => { e.catalogueCoverage.creditedObligationIds.push(api.MANDATORY_EMAIL_IDS[0]); }, e => { e.mandatoryEmailAdmission.producerCommit = 'e'.repeat(40); }, e => { e.mandatoryEmailAdmission.producerDigest = hash('e'); }, e => { e.mandatoryEmailAdmission.candidateArtifactDigest = hash('e'); }, e => { e.mandatoryEmailAdmission.joint.nativeRunId = 'ci-00000000-0000-4000-8000-000000000004'; }, e => { e.catalogueCoverage.mandatoryEmailAdmission.requestDigest = hash('e'); }]) {
    const changed = structuredClone(evidence); mutate(changed); assert.throws(() => native.renderNativeEvidence(changed));
  }
  const separate = structuredClone(evidence);
  separate.mandatoryEmailAdmission.joint = admission(false).joint;
  separate.catalogueCoverage.creditedObligationIds = separate.catalogueCoverage.creditedObligationIds.filter(id => !api.MANDATORY_EMAIL_IDS.includes(id));
  separate.catalogueCoverage.candidate -= 2; separate.catalogueCoverage.missing += 2; delete separate.catalogueCoverage.mandatoryEmailAdmission;
  assert(native.renderNativeEvidence(separate).includes('data-mandatory-email-credited="0"'));
  delete separate.mandatoryEmailAdmission;
  assert(!native.renderNativeEvidence(separate).includes('harness-mandatory-email-admission'));
  assert.throws(() => native.renderNativeEvidence(separate, span), /MANDATORY_EMAIL_TIMING_INVALID/);
});

// The report may display a separate/historical packet without an outer clock.
test('mandatory timing scope is source-defined and never asserts unrecorded outer containment', () => {
  for(const value of [admission(true),admission(false)]){
    const html=api.renderMandatoryEmailAdmission(value);
    assert(html.includes('Admission call elapsed: Not recorded'));
    assert(!html.includes('outer Harness span already includes it'));
    assert(html.includes('Source-defined timing scope'));
    assert(html.includes('this packet alone does not establish outer-interval containment'));
  }
});
