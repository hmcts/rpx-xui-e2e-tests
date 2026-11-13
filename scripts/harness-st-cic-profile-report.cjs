const assert = require('node:assert/strict');
const { escape } = require('./harness-report-coverage.cjs');

const ST_CIC_PROFILE_ID = 'configuration-profile:31fed7b5d70bd2e333287f0b982632381576d11fbc15d71e90f27c14d986983b';
const failure = 'ST_CIC_REPORT_INVALID';
const sourceKeys = ['rpx-xui-webapp:config/default.json', 'rpx-xui-webapp:config/default.json'];
const hashes = ['producerDigest', 'candidateArtifactDigest', 'inputDigest', 'bindingDigest', 'receiptDigest', 'terminalDigest', 'launchDigest', 'cleanupDigest', 'contractDigest'];
const jointHashes = ['catalogueDigest', 'nativeBindingDigest', 'requestDigest', 'inputDigest', 'bindingDigest', 'receiptDigest', 'contractDigest'];
const fixed = {
  schemaVersion: 1, kind: 'st-cic-profile-admission', status: 'passed', obligationId: ST_CIC_PROFILE_ID,
  boundary: 'candidate', family: 'ST_CIC', baselineProofs: 5, effectiveFaults: 5,
  runtimeAcceptance: false, catalogueCredit: false, wholeProfileSatisfied: false,
  selected: 1, accepted: 1, catalogueSize: 112, releaseCredit: false, releaseApproval: false,
};
const reasons = {
  'missing-native-binding': 'Matching parent binding was unavailable.',
  'missing-parent-context': 'The standalone packet has no matching parent context.',
  'different-producer': 'The producer differs from the main cohort.',
  'different-candidate': 'The candidate differs from the main cohort.',
  'different-runtime': 'The runtime differs from the main cohort.',
  'different-browser': 'The browser differs from the main cohort.',
  'different-dependencies': 'The dependencies differ from the main cohort.',
};
const methods = [
  ['global-search', 'Global Search', 'Read delivered and warm-cached services, render the service choices and submit All with ST_CIC in the outgoing search.', 'Remove only ST_CIC; retain the remaining services and detect its missing membership.'],
  ['wa', 'WA membership', 'Exercise GET and POST task routes for ST_CIC and the IA control; compare returned tasks and exact outgoing searches.', 'Remove only ST_CIC membership; retain IA requests and detect the suppressed ST_CIC searches.'],
  ['staff', 'Staff support', 'Read supported families, fetch enriched staff and roles, then repeat the request against the warm cache.', 'Remove only ST_CIC; retain the IA control and detect the missing ST_CIC family and staff.'],
  ['mapping', 'BBA2 mapping', 'Exercise judicial, location and booking consumers with exact BBA2 request and response expectations.', 'Change only the ST_CIC service code and detect the differing mapped consumer evidence.'],
  ['wa-health', 'WA health', 'Read healthy base components with workAllocationEnabled false; compare the observed health journal delta.', 'Enable only Work Allocation health composition and detect the additional healthy dependency checks.'],
];
function keys(value, names) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), names.slice().sort());
}
function stringMatches(value, expression) {
  assert(typeof value === 'string' && expression.test(value));
}
function validateStCicProfileAdmission(value) {
  try {
    keys(value, [...Object.keys(fixed), ...hashes, 'runId', 'producerCommit', 'candidateCommit', 'joint']);
    for (const [name, expected] of Object.entries(fixed)) assert.equal(value[name], expected);
    for (const name of hashes) stringMatches(value[name], /^sha256:[a-f0-9]{64}$/);
    for (const name of ['producerCommit', 'candidateCommit']) stringMatches(value[name], /^[a-f0-9]{40}$/);
    stringMatches(value.runId, /^st-cic-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    const joint = value.joint;
    assert.equal(joint?.policy, 'st-cic-profile-joint-v1');
    assert.equal(joint.releaseCredit, false);
    assert.equal(joint.releaseApproval, false);
    if (joint.status === 'included') {
      keys(joint, ['policy', 'status', 'obligationId', 'sourceKeys', 'nativeRunId', 'profileRunId', ...jointHashes, 'releaseCredit', 'releaseApproval']);
      assert.equal(joint.obligationId, ST_CIC_PROFILE_ID);
      assert.deepEqual(joint.sourceKeys, sourceKeys);
      assert.equal(joint.profileRunId, value.runId);
      stringMatches(joint.nativeRunId, /^ci-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      for (const name of jointHashes) stringMatches(joint[name], /^sha256:[a-f0-9]{64}$/);
      for (const name of ['inputDigest', 'bindingDigest', 'receiptDigest', 'contractDigest']) assert.equal(joint[name], value[name]);
    } else {
      keys(joint, ['policy', 'status', 'reason', 'releaseCredit', 'releaseApproval']);
      assert.equal(joint.status, 'separate');
      assert(typeof joint.reason === 'string' && Object.hasOwn(reasons, joint.reason));
    }
    return value;
  } catch {
    throw new Error(failure);
  }
}
function renderStCicExecutionInfo(value) {
  validateStCicProfileAdmission(value);
  return '<tr><th scope="row">ST_CIC standalone executions</th><td>10</td></tr><tr><th scope="row">ST_CIC execution detail</th><td>5 baseline results and 5 effective fault detections, separate from core native proof counts. Per-execution worker observations and durations are not recorded in this public admission.</td></tr>';
}
function renderStCicProfileAdmission(value) {
  validateStCicProfileAdmission(value);
  const included = value.joint.status === 'included';
  const summary = included ? '1 requirement included in main candidate coverage' : 'validated packet in a separate run';
  const accounting = included
    ? 'This one requirement is already included once in the main candidate count.'
    : 'This separate packet adds no requirement to the main candidate count. ' + reasons[value.joint.reason];
  const rows = methods.map(([id, label, baseline, fault]) => `<tr data-st-cic-method="${id}"><th scope="row">${label}</th><td>${baseline}</td><td>${fault}</td></tr>`).join('');
  const identities = [['Producer commit', value.producerCommit], ['Profile run', value.runId], ['Candidate commit', value.candidateCommit], ['Candidate artifact', value.candidateArtifactDigest], ['Contract digest', value.contractDigest], ['Receipt digest', value.receiptDigest], ...(included ? [['Main native run', value.joint.nativeRunId], ['Parent binding digest', value.joint.nativeBindingDigest], ['Request digest', value.joint.requestDigest]] : [])];
  return `<section id="harness-st-cic-profile-admission" class="odhin-thin-border p-3 mt-3" data-st-cic-status="PASS" data-st-cic-inclusion="${included ? 'included' : 'separate'}" data-st-cic-baselines="5" data-st-cic-effective-faults="5" data-st-cic-executions="10" data-st-cic-credited="${included ? 1 : 0}"><h3>ST_CIC bounded profile: ${summary}</h3><p>${accounting} Five facets support one bounded source-profile requirement, not five requirements. The catalogue remains 112; no CCD or release credit.</p><p>Validated standalone aggregates: <strong>5 baseline results + 5 effective fault detections across 10 standalone executions</strong>. These are separate from core native results and diagnostic tests. Raw runtimeAcceptance, catalogueCredit and wholeProfileSatisfied flags remain false.</p><h4>Source-defined methods</h4><p>This table explains the fixed source checks. It is not a recorded per-step trace. Per-facet execution traces and timings are not recorded in this public admission.</p><div class="table-responsive"><table class="table harness-native-table"><thead><tr><th>Facet</th><th>Healthy method</th><th>Declared fault method</th></tr></thead><tbody>${rows}</tbody></table></div><p>Actual built EXUI with synthetic sessions/providers and controlled browser flags. No jurisdiction-selector, hearing journey, deployed service, CCD permissions or case-view WA-tab credit. No hearing or whole-service coverage follows. Source Work Allocation route membership and shared health composition are separate consumers.</p><details><summary>ST_CIC evidence identity</summary><dl>${identities.map(([name, content]) => `<dt>${name}</dt><dd>${escape(content)}</dd>`).join('')}</dl></details></section>`;
}

module.exports = { ST_CIC_PROFILE_ID, validateStCicProfileAdmission, renderStCicProfileAdmission, renderStCicExecutionInfo };
