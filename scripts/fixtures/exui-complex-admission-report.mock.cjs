function admission() {
  const hash = 'sha256:' + 'a'.repeat(64);
  return {
    schemaVersion:1, kind:'complex-email-row-admission', status:'passed',
    obligationId:'configuration-shape:9a20dc72fb413cd3bd34d97dc415f55c042088bf6b517cda7fc275215c5f7e39',
    boundary:'candidate', family:'PRIVATELAW', selected:1, accepted:1, catalogueSize:112,
    runId:'complex-00000000-0000-4000-8000-000000000003',
    producerCommit:'e'.repeat(40), candidateCommit:'f'.repeat(40), candidateArtifactDigest:hash,
    sourceKey:'prl-ccd-definitions:definitions/private-law/json/ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json',
    sourceRowDigest:'sha256:411c03f388498bbbb8328d3180f32805bd14c0bb22167ecd4727d83f011c8fcf',
    facets:['ID','ListElementCode','FieldType','ElementLabel','SecurityClassification','Searchable','LiveFrom'],
    browserContexts:2, mappingContexts:2, effectiveFaults:2, applicationClasses:635,
    hostPlatform:'darwin/arm64', runtimePlatform:'linux/arm64',
    contractDigest:hash, inputDigest:hash, receiptDigest:hash,
    sourceComplete:true, activationClaim:false, retentionClaim:false, normativeDateClaim:false,
    releaseCredit:false, releaseApproval:false,
    timing:{startedAt:'2026-11-06T07:26:16.444Z', endedAt:'2026-11-06T07:30:41.819Z', durationMs:265374, telemetryOnly:true},
    invocations:[
      {invocationId:'baseline', runId:'ccd-00000000-0000-4000-8000-000000000001', configuredWorkers:1},
      {invocationId:'email-type', runId:'ccd-00000000-0000-4000-8000-000000000002', configuredWorkers:1},
    ],
    joint:{status:'separate', reason:'producer-mismatch'},
  };
}
module.exports = {admission};

async function renderReport(t, {attempt, complex} = {}) {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const previous = process.cwd();
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'complex-public-report-'));
  process.chdir(root);
  t.after(() => {process.chdir(previous);fs.rmSync(root, {recursive:true, force:true});});
  const Reporter = require('../harness-public-odhin-reporter.cjs');
  const reporter = new Reporter({selection:'harness', complexEmailAttempt:attempt});
  if (complex) {
    const f = await require('./exui-native-report-packet.mock.cjs').fixture(t);
    const {readNativeReportEvidence} = await import('../lib/exui-native-report-evidence.mjs');
    reporter.nativeEvidence = await readNativeReportEvidence(f.descriptorPath);
    reporter.nativeEvidence.complexEmailAdmission = complex;
  }
  const tests = require('../harness-public-overview.cjs').profiles.harness.map((entry, index) => ({
    id:'complex-public-test-' + index, title:entry.titlePath.at(-1), titlePath:() => entry.titlePath,
    location:{file:path.join(root, entry.file), line:1}, retries:0, expectedStatus:'passed', annotations:[],
    parent:{project:() => ({name:'harness'})},
  }));
  const started = new Date('2026-11-06T08:00:00Z');
  reporter.onBegin({workers:4}, {allTests:() => tests});
  for (const test of tests) reporter.onTestEnd(test, {status:'passed', retry:0, duration:1, startTime:started, workerIndex:0, parallelIndex:0, errors:[], stdout:[], stderr:[], steps:[], attachments:[]});
  await reporter.onEnd({status:'passed', startTime:started, duration:1000});
  const htmlFile = path.join(root, 'functional-output/tests/harness/public/odhin/index.html');
  const recordFile = path.join(root, 'functional-output/tests/harness/private/public-odhin-harness.json');
  return {Reporter, htmlFile, recordFile};
}
module.exports.renderReport = renderReport;
