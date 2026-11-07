const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {admission} = require('./fixtures/exui-complex-admission-report.mock.cjs');
const {renderComplexEmailAdmission, renderComplexEmailAttempt, complexInvocationCounts} = require('./harness-complex-email-report.cjs');

test('Complex report separates two browser invocations, two mappings and source classes', () => {
  const html = renderComplexEmailAdmission(admission());
  for (const fragment of ['data-complex-browser-contexts="2"', 'data-complex-mapping-contexts="2"', '4m 25s', '635 application class files matched', 'No complete service journey', 'Date retention and activation remain unproved', 'separate row adds no requirement']) assert(html.includes(fragment), fragment);
  assert.deepEqual(complexInvocationCounts(admission()), {invocations:2, workerSlots:[1], workersUnknown:0});
  const unrecorded = admission();unrecorded.invocations.forEach(row => {row.configuredWorkers = null;});
  assert.deepEqual(complexInvocationCounts(unrecorded), {invocations:2, workerSlots:[], workersUnknown:2});
});

test('Complex public projection cannot overstate its row, dates, counts or worker observations', () => {
  for (const change of [
    v => {v.accepted = 2;}, v => {v.catalogueSize = 111;}, v => {v.facets.pop();},
    v => {v.normativeDateClaim = true;}, v => {v.retentionClaim = true;}, v => {v.releaseCredit = true;},
    v => {v.sourceKey += '/foreign';}, v => {v.applicationClasses = 636;}, v => {v.mappingContexts = 3;},
    v => {v.invocations[1].runId = v.invocations[0].runId;}, v => {v.invocations[0].configuredWorkers = 0;},
    v => {v.timing.durationMs = -1;}, v => {v.joint = {status:'included'};},
  ]) {const value = admission();change(value);assert.throws(() => renderComplexEmailAdmission(value));}
});

test('Complex unsupported or unconfigured report records no fictional executions', () => {
  const value = {schemaVersion:1, kind:'complex-email-attempt', status:'NOT_RUN', reason:'SOURCE_PROOF_PLATFORM_UNSUPPORTED'};
  const html = renderComplexEmailAttempt(value);
  assert(html.includes('requirement remains unaccepted'));
  assert(!html.includes('data-complex-baselines'));
  for (const changed of [{...value, status:'BLOCKED'}, {...value, reason:'PRIVATE_CANARY'}, {...value, private:'PRIVATE_CANARY'}, {...value, durationMs:0}]) assert.throws(() => renderComplexEmailAttempt(changed));
});

test('Complex dashboard activity preserves main totals and the main duration', () => {
  const script = fs.readFileSync(path.join(__dirname, 'harness-public-dashboard.js'), 'utf8');
  for (const included of [false, true]) {
    const make = () => ({dataset:{}, children:[], classList:{add() {}}, append(...rows) {this.children.push(...rows);}, setAttribute() {}});
    const metrics = make();metrics.replaceChildren = () => {metrics.children = [];};
    metrics.querySelector = selector => ({textContent:selector.includes('metric-0') ? '116' : selector.includes('metric-1') ? '100%' : '0'});
    const elements = {
      '#harness-application-coverage':{dataset:{runtimeObligations:'112'}}, '.report-metrics':metrics,
      '#harness-public-run':{dataset:{nativeElapsedMs:'60000'}},
      '#harness-native-evidence':{dataset:{nativeStatus:'PASS'}, querySelectorAll:() => [{}, {}]},
      '#harness-complex-email-admission':{dataset:{complexStatus:'PASS', complexBrowserContexts:'2', complexMappingContexts:'2', complexEffectiveFaults:'2', complexDurationMs:'265374', complexInclusion:included ? 'included' : 'separate'}},
    };
    const document = {createElement:make, querySelector:selector => elements[selector] || null, querySelectorAll:() => [{dataset:{catalogueAccepted:included ? '39' : '38'}}]};
    vm.runInNewContext(script, {document});
    assert.equal(metrics.children[0].children[1].textContent, `${included ? 39 : 38} / 112`);
    assert.equal(metrics.children[1].children[1].textContent, '2 + 2');
    assert(metrics.children[1].children[2].textContent.includes('1.0 min recorded native interval'));
    const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
    assert(text(metrics).includes('2 browser invocations · 2 mapping contexts · 2 effective faults'));
    assert(text(metrics).includes('4m 25s'));
  }
});


test('Private Law summary names both bounded rows without treating them as a service profile', () => {
  const {familyRuntimeSummary} = require('./harness-public-overview.cjs');
  const value = {personalServiceAdmission:{joint:{status:'included'}}, complexEmailAdmission:admission()};
  const separate = familyRuntimeSummary('PRIVATELAW', value);
  assert(separate.includes('Personal-service event row: 1 candidate requirement included'));
  assert(separate.includes('ComplexTypes email address: separate 1/1'));
  value.complexEmailAdmission.joint.status = 'included';
  assert(familyRuntimeSummary('PRIVATELAW', value).includes('ComplexTypes email address: 1 candidate requirement included'));
  assert.equal(familyRuntimeSummary('CIVIL', value), 'See bounded native proofs above; no per-family profile claim');
});

test('real Odhín binds the NOT RUN panel to its private record', async t => {
  const value = {schemaVersion:1, kind:'complex-email-attempt', status:'NOT_RUN', reason:'SOURCE_PROOF_PLATFORM_UNSUPPORTED'};
  const {Reporter, htmlFile, recordFile} = await require('./fixtures/exui-complex-admission-report.mock.cjs').renderReport(t, {attempt:value});
  const html = fs.readFileSync(htmlFile, 'utf8'), original = fs.readFileSync(recordFile);
  assert(html.includes('id="harness-complex-email-attempt"'));
  assert.equal(Reporter.validatePublicReport().complexEmailAttempt.status, 'NOT_RUN');
  for (const change of [v => {v.complexEmailAttempt = null;}, v => {v.complexEmailAttempt.reason = 'SOURCE_INPUTS_NOT_CONFIGURED';}, v => {v.complexEmailAttempt.private = 'PRIVATE_CANARY';}]) {
    const record = JSON.parse(original);change(record);fs.writeFileSync(recordFile, JSON.stringify(record));assert.throws(() => Reporter.validatePublicReport());
  }
  fs.writeFileSync(recordFile, original);
});

test('real Odhín rejects removed, changed, duplicate or spurious Complex panels after coherent HTML rehash', async t => {
  const {Reporter, htmlFile, recordFile} = await require('./fixtures/exui-complex-admission-report.mock.cjs').renderReport(t, {complex:admission()});
  const originalHtml = fs.readFileSync(htmlFile, 'utf8'), originalRecord = fs.readFileSync(recordFile);
  assert.equal(Reporter.validatePublicReport().nativeEvidence.complexEmailAdmission.joint.status, 'separate');
  const panel = renderComplexEmailAdmission(admission());assert(originalHtml.includes(panel));
  for (const html of [originalHtml.replace(panel, ''), originalHtml.replace(panel, panel.replace('4m 25s', '40m 25s')), originalHtml.replace(panel, panel + panel), originalHtml.replace(panel, panel.replace('data-complex-inclusion="separate"', 'data-complex-inclusion="included"')), originalHtml.replace(panel, "<section id='harness-complex-email-admission'>foreign first panel</section>" + panel), originalHtml.replace(panel, '<section id=harness-complex-email-admission>foreign first panel</section>' + panel)]) {
    const record = JSON.parse(originalRecord);record.sha256 = require('node:crypto').createHash('sha256').update(html).digest('hex');
    fs.writeFileSync(htmlFile, html);fs.writeFileSync(recordFile, JSON.stringify(record));assert.throws(() => Reporter.validatePublicReport());
  }
  fs.writeFileSync(htmlFile, originalHtml);
  const record = JSON.parse(originalRecord);delete record.nativeEvidence.complexEmailAdmission;fs.writeFileSync(recordFile, JSON.stringify(record));assert.throws(() => Reporter.validatePublicReport());
  fs.writeFileSync(recordFile, originalRecord);
});
