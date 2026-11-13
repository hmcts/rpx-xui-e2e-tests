const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Module } = require('node:module');
const hash = letter => 'sha256:' + letter.repeat(64);
const ID = 'configuration-profile:31fed7b5d70bd2e333287f0b982632381576d11fbc15d71e90f27c14d986983b';
const sourceKeys = ['rpx-xui-webapp:config/default.json', 'rpx-xui-webapp:config/default.json'];
function reportModule(file) {
  const mutation = process.env.ST_CIC_PROFILE_REPORT_TEST_MUTATION;
  if (mutation === undefined) return require('./' + file);
  assert(['flags', 'reverse'].includes(mutation), 'FIXED_ST_CIC_REPORT_MUTATION');
  const target = mutation === 'flags' ? 'harness-st-cic-profile-report.cjs' : 'harness-native-report.cjs';
  if (file !== target) return require('./' + file);
  const full = path.join(__dirname, file);
  let source = fs.readFileSync(full, 'utf8');
  const before = mutation === 'flags'
    ? 'for (const [name, expected] of Object.entries(fixed)) assert.equal(value[name], expected);'
    : "  assert.equal(coverage.creditedObligationIds.includes(ST_CIC_PROFILE_ID), stCic?.joint.status === 'included', 'NATIVE_REPORT_ST_CIC_JOIN');";
  const after = mutation === 'flags'
    ? "for (const [name, expected] of Object.entries(fixed)) if (name !== 'catalogueCredit') assert.equal(value[name], expected);"
    : '';
  assert.equal(source.split(before).length, 2, 'EXACT_ST_CIC_REPORT_GUARD');
  source = source.replace(before, after);
  const mod = new Module(full);
  mod.filename = full;
  mod.paths = Module._nodeModulePaths(__dirname);
  mod._compile(source, full);
  return mod.exports;
}
const api = () => reportModule('harness-st-cic-profile-report.cjs');

// Presentation inputs only. These literals are not native or admission evidence.
function admission(included = false) {
  const value = {
    schemaVersion: 1, kind: 'st-cic-profile-admission', status: 'passed', obligationId: ID,
    boundary: 'candidate', family: 'ST_CIC', baselineProofs: 5, effectiveFaults: 5,
    runtimeAcceptance: false, catalogueCredit: false, wholeProfileSatisfied: false,
    selected: 1, accepted: 1, catalogueSize: 112, releaseCredit: false, releaseApproval: false,
    runId: 'st-cic-00000000-0000-4000-8000-000000000001',
    producerCommit: 'b'.repeat(40), candidateCommit: 'c'.repeat(40),
    ...Object.fromEntries(['producerDigest', 'candidateArtifactDigest', 'inputDigest', 'bindingDigest', 'receiptDigest', 'terminalDigest', 'launchDigest', 'cleanupDigest', 'contractDigest'].map(name => [name, hash('a')])),
  };
  value.joint = included ? {
    policy: 'st-cic-profile-joint-v1', status: 'included', obligationId: ID, sourceKeys: structuredClone(sourceKeys),
    catalogueDigest: hash('a'), nativeRunId: 'ci-00000000-0000-4000-8000-000000000001',
    profileRunId: value.runId, nativeBindingDigest: hash('a'), requestDigest: hash('a'),
    ...Object.fromEntries(['inputDigest', 'bindingDigest', 'receiptDigest', 'contractDigest'].map(name => [name, value[name]])),
    releaseCredit: false, releaseApproval: false,
  } : { policy: 'st-cic-profile-joint-v1', status: 'separate', reason: 'missing-parent-context', releaseCredit: false, releaseApproval: false };
  return value;
}

test('ST_CIC report separates standalone aggregate outcomes from five source-defined methods', () => {
  const value = admission(), before = structuredClone(value);
  const html = api().renderStCicProfileAdmission(value);
  assert.deepEqual(value, before);
  for (const label of ['Global Search', 'WA membership', 'Staff support', 'BBA2 mapping', 'WA health']) assert(html.includes(label));
  assert.equal((html.match(/data-st-cic-method=/g) || []).length, 5);
  for (const text of ['data-st-cic-inclusion="separate"', 'data-st-cic-credited="0"', '5 baseline results', '5 effective fault detections', '10 standalone executions', 'Source-defined methods', 'not recorded', 'not five requirements', 'No jurisdiction-selector', 'No hearing']) assert(html.includes(text), text);
  assert(!html.includes('data-st-cic-duration'));
  assert(!html.includes('5 requirements included'));
  assert(!html.includes('5 recorded steps'));
});

test('ST_CIC report validates exact fields and keeps raw no-credit flags even when joined', () => {
  const value = admission(true), html = api().renderStCicProfileAdmission(value);
  assert(html.includes('1 requirement included in main candidate coverage'));
  assert(html.includes('data-st-cic-credited="1"'));
  const mutations = [
    v => { v.extra = 'PRIVATE_CANARY'; }, v => { v.schemaVersion = 2; }, v => { v.obligationId = 'foreign'; },
    v => { v.family = 'IA'; }, v => { v.boundary = 'ccd'; }, v => { v.status = 'failed'; },
    v => { v.selected = 5; }, v => { v.accepted = 5; }, v => { v.catalogueSize = 113; },
    v => { v.baselineProofs = 4; }, v => { v.effectiveFaults = 4; },
    ...['runtimeAcceptance', 'catalogueCredit', 'wholeProfileSatisfied', 'releaseCredit', 'releaseApproval'].map(name => v => { v[name] = true; }),
    v => { v.producerCommit = ['b'.repeat(40)]; }, v => { v.candidateCommit = 'PRIVATE_CANARY'; },
    v => { v.receiptDigest = 'PRIVATE_CANARY'; }, v => { v.runId = 'st-cic-foreign'; },
    v => { v.joint.extra = 'PRIVATE_CANARY'; }, v => { v.joint.releaseCredit = true; },
    v => { v.joint.releaseApproval = true; }, v => { v.joint.obligationId = 'foreign'; },
    v => { v.joint.sourceKeys.pop(); }, v => { v.joint.sourceKeys[0] = 'foreign'; },
    v => { v.joint.profileRunId = 'st-cic-00000000-0000-4000-8000-000000000002'; },
    ...['inputDigest', 'bindingDigest', 'receiptDigest', 'contractDigest'].map(name => v => { v.joint[name] = hash('d'); }),
  ];
  for (const change of mutations) {
    const changed = structuredClone(value); change(changed);
    assert.throws(() => api().renderStCicProfileAdmission(changed), /ST_CIC_REPORT_INVALID/);
  }
  for (const reason of ['missing-native-binding', 'missing-parent-context', 'different-producer', 'different-candidate', 'different-runtime', 'different-browser', 'different-dependencies']) {
    const separate = admission(); separate.joint.reason = reason;
    assert(api().renderStCicProfileAdmission(separate).includes('data-st-cic-credited="0"'));
  }
  const arbitrary = admission(); arbitrary.joint.reason = 'PRIVATE_CANARY';
  assert.throws(() => api().renderStCicProfileAdmission(arbitrary), /ST_CIC_REPORT_INVALID/);
});

test('native report binds ST_CIC inclusion both ways without changing core proof counts', async t => {
  const { fixture } = require('./fixtures/exui-native-report-packet.mock.cjs');
  const { readNativeReportEvidence } = await import('./lib/exui-native-report-evidence.mjs');
  const f = await fixture(t);
  const evidence = await readNativeReportEvidence(f.descriptorPath);
  const { renderNativeEvidence, nativeCounts, renderNativeExecutionInfo } = reportModule('harness-native-report.cjs');
  const initialCounts = nativeCounts(evidence);
  const separate = admission();
  evidence.stCicProfileAdmission = separate;
  assert(renderNativeEvidence(evidence).includes('data-st-cic-inclusion="separate"'));
  assert.deepEqual(nativeCounts(evidence), initialCounts);

  const included = admission(true);
  Object.assign(included, { producerCommit: evidence.source.harnessCommit, candidateCommit: evidence.source.webappCommit, candidateArtifactDigest: evidence.source.candidateArtifactDigest });
  included.joint.nativeRunId = evidence.jobRunId;
  included.joint.catalogueDigest = evidence.catalogueCoverage.catalogueDigest;
  evidence.stCicProfileAdmission = included;
  evidence.catalogueCoverage.creditedObligationIds.push(ID);
  evidence.catalogueCoverage.candidate++;
  evidence.catalogueCoverage.missing--;
  evidence.catalogueCoverage.stCicProfileAdmission = structuredClone(included.joint);
  const beforeRender = structuredClone(evidence);
  const rendered = renderNativeEvidence(evidence);
  assert(rendered.includes('data-st-cic-inclusion="included"'));
  assert(rendered.includes('Core native: ' + initialCounts.baselines + ' baseline proof results'));
  assert(rendered.includes('Optional profile executions are reported in their own sections'));
  assert.deepEqual(evidence, beforeRender, 'rendering must not assign catalogue credit');
  assert.deepEqual(nativeCounts(evidence), initialCounts);
  assert(renderNativeExecutionInfo(evidence).includes('ST_CIC standalone executions</th><td>10'));
  assert(!renderNativeExecutionInfo(evidence).includes('ST_CIC Playwright invocations'));

  for (const mutate of [
    e => { delete e.stCicProfileAdmission; }, e => { e.stCicProfileAdmission = false; },
    e => { e.stCicProfileAdmission = admission(); }, e => { e.catalogueCoverage.stCicProfileAdmission = false; },
    e => { delete e.catalogueCoverage.stCicProfileAdmission; }, e => { e.catalogueCoverage.creditedObligationIds.push(ID); },
    e => { e.stCicProfileAdmission.producerCommit = 'd'.repeat(40); },
    e => { e.stCicProfileAdmission.candidateCommit = 'd'.repeat(40); },
    e => { e.stCicProfileAdmission.candidateArtifactDigest = hash('d'); },
    e => { e.stCicProfileAdmission.joint.nativeRunId = 'ci-00000000-0000-4000-8000-000000000002'; },
    e => { e.stCicProfileAdmission.joint.catalogueDigest = hash('d'); },
    e => { e.catalogueCoverage.stCicProfileAdmission.requestDigest = hash('d'); },
    e => { e.catalogueCoverage.candidate++; },
    e => { e.catalogueCoverage.selected++; e.catalogueCoverage.missing++; },
  ]) {
    const changed = structuredClone(evidence); mutate(changed);
    assert.throws(() => renderNativeEvidence(changed));
  }
  const noCredit = structuredClone(evidence);
  noCredit.catalogueCoverage.creditedObligationIds = noCredit.catalogueCoverage.creditedObligationIds.filter(id => id !== ID);
  noCredit.catalogueCoverage.candidate--;
  noCredit.catalogueCoverage.missing++;
  assert.throws(() => renderNativeEvidence(noCredit), /ST_CIC_JOIN/);
  noCredit.stCicProfileAdmission = admission();
  noCredit.catalogueCoverage.stCicProfileAdmission = false;
  assert.throws(() => renderNativeEvidence(noCredit), /ST_CIC_JOIN/);
});
