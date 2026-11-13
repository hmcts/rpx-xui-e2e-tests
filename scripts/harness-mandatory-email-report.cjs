const assert = require('node:assert/strict');
const { escape } = require('./harness-report-coverage.cjs');

const policy = 'mandatory-email-two-source-rows-v1';
const contractDigest = 'sha256:8509e0cd65a6ecae5db89ddcc0849bac19b82d014a3859a7de89d2dccfcbdf28';
const sourceKey = 'prl-ccd-definitions:definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json';
// Independent presentation expectations; raw admission remains the sole credit authority.
const rows = [
  ['name', 'configuration-shape:d0189498d796f462bbd150341384aaf1743ec24491af04fc5176dc8e7e72439e', 14, 'sha256:15be218a2ec9b5e16174ad6b350558a2f777ff9f2776ce6541cc5889624bd4b4'],
  ['address', 'configuration-shape:afb8b838dc9de1bb8314cbf494ff26a987aa3edb845b2fa0a45c378834d2b74d', 13, 'sha256:84fc6347ddd5f5250fa841380bf5329337ce5b70c864926e2c3d11515cfcec3d'],
].map(([row, id, sourceIndex, sourceRowDigest]) => ({ id, row, sourceKey, sourceIndex, sourceRowDigest,
  baselineProofId: 'ccd-event-required-email-' + row, faultProofId: 'ccd-event-optional-email-' + row,
  assertionId: 'source-email-' + row + '-required', errorCode: 'MANDATORY_EMAIL_' + row.toUpperCase() + '_REQUIRED_DENIAL' }));
const MANDATORY_EMAIL_IDS = rows.map(row => row.id);
const hashes = ['producerDigest', 'candidateArtifactDigest', 'inputDigest', 'requestDigest', 'contractDigest'];
const fixed = { schemaVersion: 1, kind: 'mandatory-email-two-row-admission', status: 'passed', policy,
  obligationIds: MANDATORY_EMAIL_IDS, rows, boundary: 'candidate', family: 'PRIVATELAW', catalogueSize: 112,
  selected: 2, accepted: 2, baselineProofs: 2, effectiveFaults: 2, executions: 3,
  sourceComplete: false, runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false, releaseApproval: false };
const reasons = { 'missing-main-binding': 'The matching main binding is unavailable.',
  'different-producer': 'The producer differs from the main cohort.', 'different-candidate': 'The candidate differs from the main cohort.' };
const hash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const run = (value, prefix) => typeof value === 'string' && new RegExp('^' + prefix + '-[a-f0-9]{8}-[a-f0-9]{4}-' + (prefix === 'ci' ? '[1-8]' : '4') + '[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$').test(value);
function keys(value, names) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), names.slice().sort());
}
function validateMandatoryEmailAdmission(value) {
  try {
    keys(value, [...Object.keys(fixed), ...hashes, 'runId', 'cohortRunId', 'producerCommit', 'joint']);
    for (const [key, expected] of Object.entries(fixed)) assert.deepEqual(value[key], expected);
    for (const key of hashes) assert(hash(value[key]));
    assert.equal(value.contractDigest, contractDigest);
    assert(typeof value.producerCommit === 'string' && /^[a-f0-9]{40}$/.test(value.producerCommit));
    assert(run(value.runId, 'mandatory-admission') && run(value.cohortRunId, 'mandatory-email'));
    const joint = value.joint;
    assert.equal(joint?.policy, policy); assert.equal(joint.releaseCredit, false); assert.equal(joint.releaseApproval, false);
    if (joint.status === 'included') {
      keys(joint, ['policy', 'status', 'obligationIds', 'nativeRunId', 'mandatoryRunId', 'nativeBindingDigest', 'requestDigest', 'inputDigest', 'contractDigest', 'releaseCredit', 'releaseApproval']);
      assert.deepEqual(joint.obligationIds, MANDATORY_EMAIL_IDS);
      assert(run(joint.nativeRunId, 'ci')); assert.equal(joint.mandatoryRunId, value.runId);
      assert(hash(joint.nativeBindingDigest));
      for (const key of ['requestDigest', 'inputDigest', 'contractDigest']) assert.equal(joint[key], value[key]);
    } else {
      keys(joint, ['policy', 'status', 'reason', 'releaseCredit', 'releaseApproval']);
      assert.equal(joint.status, 'separate'); assert(Object.hasOwn(reasons, joint.reason));
    }
    return value;
  } catch { throw new Error('MANDATORY_EMAIL_REPORT_INVALID'); }
}
function validateMandatoryEmailTiming(timing, admission) {
  if (timing === undefined) return;
  try {
    validateMandatoryEmailAdmission(admission); assert.equal(admission.joint.status, 'included');
    keys(timing, ['schemaVersion', 'scope', 'clock', 'startedAt', 'elapsedMs', 'mainRunId', 'mandatoryRunId', 'requestDigest']);
    assert.equal(timing.schemaVersion, 1); assert.equal(timing.scope, 'mandatory-email-admission-call'); assert.equal(timing.clock, 'monotonic');
    assert(typeof timing.startedAt === 'string' && new Date(timing.startedAt).toISOString() === timing.startedAt);
    assert(Number.isSafeInteger(timing.elapsedMs) && timing.elapsedMs >= 0);
    assert.equal(timing.mainRunId, admission.joint.nativeRunId); assert.equal(timing.mandatoryRunId, admission.runId); assert.equal(timing.requestDigest, admission.requestDigest);
  } catch { throw new Error('MANDATORY_EMAIL_TIMING_INVALID'); }
}
function renderMandatoryEmailExecutionInfo(value) {
  validateMandatoryEmailAdmission(value);
  return '<tr><th scope="row">Mandatory email standalone executions</th><td>3</td></tr><tr><th scope="row">Mandatory email execution detail</th><td>2 baseline results and 2 effective named fault results, separate from core native proof counts. Per-execution worker observations and durations are not recorded in this public admission.</td></tr>';
}
function renderMandatoryEmailAdmission(value, timing) {
  validateMandatoryEmailAdmission(value); validateMandatoryEmailTiming(timing, value);
  const included = value.joint.status === 'included';
  const duration = timing === undefined ? 'Not recorded' : `${Math.floor(timing.elapsedMs / 60000)}m ${((timing.elapsedMs % 60000) / 1000).toFixed(3)}s`;
  const methods = rows.map(row => `<tr data-mandatory-email-row="${row.row}"><th scope="row">Email ${row.row} (source row ${row.sourceIndex})</th><td>Source-defined: fill the required ${row.row}, save and independently read the persisted value; leave it empty and check required-field denial without a case write.</td><td>Source-defined: change only this row to OPTIONAL and detect the loss of its required-field denial.</td><td>${escape(row.baselineProofId)}<br>${escape(row.faultProofId)}<br>${escape(row.assertionId)}</td></tr>`).join('');
  const identity = [['Producer commit', value.producerCommit], ['Admission run', value.runId], ['Cohort run', value.cohortRunId], ['Candidate artifact', value.candidateArtifactDigest], ['Contract digest', value.contractDigest], ['Request digest', value.requestDigest], ...(included ? [['Main native run', value.joint.nativeRunId], ['Parent binding digest', value.joint.nativeBindingDigest]] : [])];
  return `<section id="harness-mandatory-email-admission" class="odhin-thin-border p-3 mt-3" data-mandatory-email-status="PASS" data-mandatory-email-inclusion="${included ? 'included' : 'separate'}" data-mandatory-email-baselines="2" data-mandatory-email-effective-faults="2" data-mandatory-email-executions="3" data-mandatory-email-credited="${included ? 2 : 0}"><h3>Mandatory email source rows: ${included ? '2 requirements included in main candidate coverage' : 'validated packet in a separate run'}</h3><p>${included ? 'These two requirements are already included once each in the main candidate count.' : 'This separate packet adds no requirement to the main candidate count. ' + reasons[value.joint.reason]} The catalogue remains 112; no release credit.</p><p>Validated aggregates: <strong>2 baseline results + 2 effective named fault results across 3 executions</strong>. The two baseline results share one execution. Fault framework failures are expected named detections, not controller failures. Core native and diagnostic counts remain separate.</p><p data-mandatory-email-timing="${timing === undefined ? 'not-recorded' : timing.elapsedMs}">Admission call elapsed: ${duration}. ${timing === undefined ? '' : 'Started ' + escape(timing.startedAt) + '. '}Source-defined timing scope: the current caller’s awaited mandatory-email call is excluded from the recorded native interval. An outer Harness interval, when recorded, includes calls performed within that same invocation; this packet alone does not establish outer-interval containment. No per-proof duration is inferred.</p><h4>Source-defined methods</h4><p>The following text describes expected checks, not recorded action events. Detailed setup, actions, observations and per-proof durations: Not recorded in this admission projection.</p><div class="table-responsive"><table class="table harness-native-table"><thead><tr><th>Source row</th><th>Healthy method</th><th>Declared fault method</th><th>Verified proof identities</th></tr></thead><tbody>${methods}</tbody></table></div><p>Actual built EXUI and isolated CCD, with synthetic identity and source-shaped PRL rows. Typed source dates are retained, not evidence of activation. No deployed PRL journey, whole-profile or full-service coverage is claimed. Raw sourceComplete, runtimeAcceptance and catalogueCredit flags remain false.</p><details><summary>Mandatory email evidence identity</summary><dl>${identity.map(([name, content]) => `<dt>${name}</dt><dd>${escape(content)}</dd>`).join('')}</dl></details></section>`;
}
module.exports = { MANDATORY_EMAIL_IDS, validateMandatoryEmailAdmission, validateMandatoryEmailTiming, renderMandatoryEmailAdmission, renderMandatoryEmailExecutionInfo };
