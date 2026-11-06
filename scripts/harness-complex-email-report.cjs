const assert = require('node:assert/strict');
const ID = 'configuration-shape:9a20dc72fb413cd3bd34d97dc415f55c042088bf6b517cda7fc275215c5f7e39';
const FACETS = ['ID', 'ListElementCode', 'FieldType', 'ElementLabel', 'SecurityClassification', 'Searchable', 'LiveFrom'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const duration = value => `${Math.floor(value / 60000)}m ${Math.floor(value % 60000 / 1000)}s`;

function validate(value) {
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.kind, 'complex-email-row-admission');
  assert.equal(value.status, 'passed');
  assert.equal(value.obligationId, ID);
  assert.equal(value.boundary, 'candidate');
  assert.equal(value.family, 'PRIVATELAW');
  assert.equal(value.selected, 1);
  assert.equal(value.accepted, 1);
  assert.equal(value.catalogueSize, 112);
  assert.equal(value.sourceKey, 'prl-ccd-definitions:definitions/private-law/json/ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json');
  assert.equal(value.sourceRowDigest, 'sha256:411c03f388498bbbb8328d3180f32805bd14c0bb22167ecd4727d83f011c8fcf');
  assert.deepEqual(value.facets, FACETS);
  assert.equal(value.browserContexts, 2);
  assert.equal(value.mappingContexts, 2);
  assert.equal(value.effectiveFaults, 2);
  assert.equal(value.applicationClasses, 635);
  assert.equal(value.hostPlatform, 'darwin/arm64');
  assert.equal(value.runtimePlatform, 'linux/arm64');
  for (const key of ['producerCommit', 'candidateCommit']) assert(/^[a-f0-9]{40}$/.test(value[key]));
  assert(/^complex-[a-f0-9-]{36}$/.test(value.runId));
  for (const key of ['candidateArtifactDigest', 'contractDigest', 'inputDigest', 'receiptDigest']) assert(/^sha256:[a-f0-9]{64}$/.test(value[key]));
  assert.equal(value.sourceComplete, true);
  for (const key of ['activationClaim', 'retentionClaim', 'normativeDateClaim', 'releaseCredit', 'releaseApproval']) assert.equal(value[key], false);
  assert(['included', 'separate'].includes(value.joint?.status));
  if (value.joint.status === 'included') {
    assert.equal(value.joint.obligationId, ID);
    assert.equal(value.joint.complexRunId, value.runId);
    assert.equal(value.joint.contractDigest, value.contractDigest);
    for (const key of ['nativeBindingDigest', 'requestDigest']) assert(/^sha256:[a-f0-9]{64}$/.test(value.joint[key]));
  }
  assert(value.timing?.telemetryOnly === true && Number.isSafeInteger(value.timing.durationMs) && value.timing.durationMs >= 0);
  for (const key of ['startedAt', 'endedAt']) assert(Number.isFinite(Date.parse(value.timing[key])));
  assert(Date.parse(value.timing.endedAt) >= Date.parse(value.timing.startedAt));
  assert(Array.isArray(value.invocations));
  assert.deepEqual(value.invocations.map(row => row.invocationId).sort(), ['baseline', 'email-type']);
  for (const row of value.invocations) {
    assert.deepEqual(Object.keys(row).sort(), ['configuredWorkers', 'invocationId', 'runId']);
    assert(/^ccd-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.runId));
    assert(row.configuredWorkers === null || (Number.isSafeInteger(row.configuredWorkers) && row.configuredWorkers > 0));
  }
  assert.equal(new Set(value.invocations.map(row => row.runId)).size, 2);
}

function complexInvocationCounts(value) {
  validate(value);
  return {invocations:2, workerSlots:[...new Set(value.invocations.map(row => row.configuredWorkers).filter(n => n !== null))].sort((a,b) => a-b), workersUnknown:value.invocations.filter(row => row.configuredWorkers === null).length};
}

function renderComplexEmailAdmission(value) {
  validate(value);
  const included = value.joint.status === 'included';
  return `<section class="odhin-thin-border p-3 mt-3" id="harness-complex-email-admission" data-complex-status="PASS" data-complex-inclusion="${included ? 'included' : 'separate'}" data-complex-baselines="2" data-complex-effective-faults="2" data-complex-browser-contexts="2" data-complex-mapping-contexts="2" data-complex-accepted="1" data-complex-total="1" data-complex-duration-ms="${value.timing.durationMs}"><h3>ComplexTypes email address: ${included ? '1 requirement included in main candidate coverage' : '1 requirement verified separately'}</h3><p>${included ? 'This row is already included once in the main catalogue count.' : 'This separate row adds no requirement to the main catalogue count.'} Private Law · PRIVATELAW · PRLAPPS. The isolated CCD derivative is HarnessNestedPRL.</p><div class="table-responsive"><table class="table harness-native-table"><thead><tr><th>Configuration check</th><th>Observed result</th></tr></thead><tbody><tr><td>Text field baseline</td><td>Two recipients validated, shown on CYA, changed and saved</td></tr><tr><td>Text → Email fault</td><td>Valid email control saved; non-email rejected at the exact leaf with no write</td></tr><tr><td>Searchable=N baseline</td><td>Nested data and classification mapping leaves absent</td></tr><tr><td>N → Y fault</td><td>Only the declared mapping leaves enabled</td></tr><tr><td>Definition-store source reproduction</td><td>635 application class files matched; source evidence, not 635 tests</td></tr></tbody></table></div><p>All seven source attributes are checked: nested type and field identity, Text, Email address label, PUBLIC classification, Searchable and LiveFrom. LiveFrom=01/12/2022 is not consumed by the pinned importer. Date retention and activation remain unproved. Mapping evidence does not establish indexed documents or search UI behaviour.</p><p>Observed cohort interval: ${duration(value.timing.durationMs)}, including its setup, proofs, source reproduction and cleanup. Two browser invocations and two mapping contexts; separate from main native time. No complete service journey, whole-image build or release approval is claimed.</p><details><summary>ComplexTypes proof identity</summary><dl><dt>Harness producer</dt><dd>${escape(value.producerCommit)}</dd><dt>Candidate source</dt><dd>${escape(value.candidateCommit)}</dd><dt>Source row</dt><dd>${escape(value.sourceRowDigest)}</dd><dt>Compiler host / application runtime</dt><dd>macOS ARM64 / Linux ARM64</dd></dl></details></section>`;
}

function renderComplexEmailAttempt(value) {
  assert.deepEqual(Object.keys(value).sort(), ['kind', 'reason', 'schemaVersion', 'status']);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.kind, 'complex-email-attempt');
  assert.equal(value.status, 'NOT_RUN');
  const reasons = {
    SOURCE_INPUTS_NOT_CONFIGURED:'The six pinned source and compiler inputs were not supplied.',
    SOURCE_PROOF_PLATFORM_UNSUPPORTED:'This worker does not support the pinned source compiler profile.',
    'preceding-stage-not-admitted':'The preceding stage did not permit this cohort to start.',
  };
  assert(Object.hasOwn(reasons, value.reason));
  return `<section class="odhin-thin-border p-3 mt-3" id="harness-complex-email-attempt" data-complex-attempt-status="NOT_RUN"><h3>ComplexTypes email address: not run</h3><p>${reasons[value.reason]} This requirement remains unaccepted in this run. No execution counts, duration or release credit are inferred.</p></section>`;
}

module.exports = {COMPLEX_EMAIL_ID:ID, renderComplexEmailAdmission, renderComplexEmailAttempt, complexInvocationCounts};
