const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

test('selector event row preserves nine source attributes and changes one summary cell only', async () => {
  const m = await import('./lib/exui-selector-event-row-contract.mjs');
  const baseline = m.deriveSelectorEventRowFixture();
  const fault = m.deriveSelectorEventRowFixture('summary-hidden');
  const row = m.selectorEventRow(baseline.fixture);
  assert.deepEqual(Object.keys(row).sort(), m.SELECTOR_EVENT_ATTRIBUTES);
  assert.equal(row.PageID, 2);
  assert.equal(row.PageDisplayOrder, 2);
  assert.equal(row.PageFieldDisplayOrder, 7);
  assert.equal(row.DisplayContext, 'OPTIONAL');
  assert.equal(row.ShowSummaryChangeOption, 'Y');
  const expected = structuredClone(baseline.fixture);
  m.selectorEventRow(expected).ShowSummaryChangeOption = 'N';
  assert.deepEqual(fault.fixture, expected);
  assert.equal(m.selectorEventRow(fault.fixture).ShowSummaryChangeOption, 'N');
  assert.equal(fault.binding.activationClaim, false);
  assert.equal(fault.binding.catalogueCredit, false);
  assert.equal(fault.fixture.sheets.CaseEventToFields.find(r => r.CaseEventID === 'create' && r.CaseFieldID === 'sodAdditionalRecipients').ShowSummaryChangeOption, 'Y');
  assert.equal(baseline.fixture.sheets.CaseEventToFields.find(r => r.CaseEventID === 'serviceOfDocuments' && r.CaseFieldID === 'sodAdditionalRecipientsList').CallBackURLMidEvent, undefined);
  assert.equal(baseline.binding.neighbouringCallback, 'omitted-controlled-context-no-business-workflow-claim');
  m.validateSelectorEventRowFixture(baseline, 'baseline');
  m.validateSelectorEventRowFixture(fault, 'summary-hidden');
  assert.throws(() => m.deriveSelectorEventRowFixture('binding-omitted'), /SELECTOR_VARIANT/);
  for (const mutate of [x => {m.selectorEventRow(x.fixture).PageID = 1;}, x => {m.selectorEventRow(x.fixture).PageShowCondition = 'false';}, x => {x.binding.activationClaim = true;}, x => {x.fixture.sheets.CaseEventToFields.push(structuredClone(m.selectorEventRow(x.fixture)));}]) {
    const bad = structuredClone(baseline); mutate(bad);
    assert.throws(() => m.validateSelectorEventRowFixture(bad, 'baseline'), /SELECTOR_/);
  }
});

const descriptors = () => ({
  definition: { id: 'HarnessNestedPRL', version: { number: 2 }, events: [{ id: 'serviceOfDocuments', case_fields: [{ case_field_id: 'sodAdditionalRecipients', display_context: 'OPTIONAL', show_condition: null, show_summary_change_option: true }, { case_field_id: 'protectedValue', display_context: 'READONLY' }] }], case_fields: [{ id: 'sodAdditionalRecipients', label: 'Select additional recipients who needs to be served', field_type: { id: 'MultiSelectList-AdditionalRecipients', type: 'MultiSelectList', fixed_list_items: [{ code: 'additionalRecipients', label: 'Additional recipients (optional)', order: 1 }] } }] },
  pages: { case_type_id: 'HarnessNestedPRL', event_id: 'serviceOfDocuments', wizard_pages: [{ id: 'serviceOfDocumentsharnessBefore', order: 1, show_condition: null, wizard_page_fields: [{ case_field_id: 'protectedValue', order: 1 }] }, { id: 'serviceOfDocuments2', order: 2, show_condition: null, wizard_page_fields: [{ case_field_id: 'sodAdditionalRecipients', order: 7 }, { case_field_id: 'sodAdditionalRecipientsList', order: 8 }] }] },
});

test('selector descriptors reject wrong identity, condition, context, page order and summary variant', async () => {
  const { validateSelectorRowDescriptors } = await import('./lib/exui-selector-event-row-facets.mjs');
  const good = descriptors(); validateSelectorRowDescriptors(good.definition, good.pages);
  for (const mutate of [x => {x.definition.id = 'PRLAPPS';}, x => {x.definition.version.number = 0;}, x => {x.pages.event_id = 'create';}, x => {x.pages.wizard_pages[1].show_condition = '';}, x => {x.pages.wizard_pages[1].order = 1;}, x => {x.pages.wizard_pages[1].wizard_page_fields[0].order = 8;}, x => {x.definition.events[0].case_fields[0].display_context = 'MANDATORY';}, x => {x.definition.events[0].case_fields[0].show_summary_change_option = false;}, x => {x.definition.case_fields[0].field_type.fixed_list_items[0].code = 'different';}]) {
    const bad = descriptors(); mutate(bad);
    assert.throws(() => validateSelectorRowDescriptors(bad.definition, bad.pages), /SELECTOR_/);
  }
  good.definition.events[0].case_fields[0].show_summary_change_option = false;
  validateSelectorRowDescriptors(good.definition, good.pages, 'summary-hidden');
  assert.throws(() => validateSelectorRowDescriptors(good.definition, good.pages), /SELECTOR_/);
});

test('selector typed date binds exact imported row and version with no activation claim', async () => {
  const { validateSelectorStoredDate } = await import('./lib/exui-selector-event-row-facets.mjs');
  const rows = [{ case_type: 'HarnessNestedPRL', version: 2, event: 'serviceOfDocuments', page: 'serviceOfDocuments2', field: 'sodAdditionalRecipients', live_from: '2024-09-01', sql_type: 'date' }];
  const result = validateSelectorStoredDate(rows, 2);
  assert.equal(result.activationClaim, false); assert.equal(result.catalogueCredit, false);
  for (const [key, value] of [['version', 1], ['field', 'sodAdditionalRecipientsList'], ['page', '2'], ['live_from', '2024-09-02'], ['sql_type', 'text']]) {
    const bad = structuredClone(rows); bad[0][key] = value;
    assert.throws(() => validateSelectorStoredDate(bad, 2), /SELECTOR_/);
  }
  assert.throws(() => validateSelectorStoredDate([...rows, ...rows], 2), /SELECTOR_/);
  assert.throws(() => validateSelectorStoredDate(rows, 0), /SELECTOR_/);
});

test('selector effective fault requires healthy form and sibling CYA, exact terminal and named source assertion', async () => {
  const { assertSelectorUiOutcome } = await import('./lib/exui-selector-event-row-facets.mjs');
  const { deriveSelectorEventRowFixture } = await import('./lib/exui-selector-event-row-contract.mjs');
  const observed = { kind: 'selector-event-row-observation', variant: 'summary-hidden', catalogueCredit: false, releaseCredit: false, completed: false, optionalEmpty: { status: 200, pageId: 'serviceOfDocuments2' }, selectedCya: { validation: { status: 200, pageId: 'serviceOfDocuments2' }, selectorChecked: true, selectorPrecedesRecipient: true, predecessorRoundTrip: true, healthySiblingCount: 1, selectorSummaryCount: 0 }, faultEffective: true, witness: 'healthy-cya-without-selector-row' };
  const report = { errors: [], stats: { skipped: 0, unexpected: 1, expected: 0 }, suites: [{ specs: [{ tests: [{ results: [{ status: 'failed', error: { message: 'SELECTOR_SOURCE_SUMMARY_ROW_REQUIRED' }, steps: [{ title: 'harness-assertion:selector-event-summary-row', error: { message: 'SELECTOR_SOURCE_SUMMARY_ROW_REQUIRED' } }] }] }] }] }] };
  observed.sourceBinding = deriveSelectorEventRowFixture('summary-hidden').binding;
  report.suites[0].specs[0].tests[0].results[0].retry = 0;
  report.suites[0].specs[0].tests[0].results[0].errors = [report.suites[0].specs[0].tests[0].results[0].error];
  assert.equal(assertSelectorUiOutcome('summary-hidden', { code: 1, signal: null }, observed, report), 'selector-summary-omission-detected');
  for (const mutate of [x => {x.selectedCya.healthySiblingCount = 0;}, x => {x.selectedCya.selectorSummaryCount = 1;}, x => {x.optionalEmpty.status = 500;}, x => {x.selectedCya.predecessorRoundTrip = false;}, x => {x.faultEffective = false;}]) {
    const bad = structuredClone(observed); mutate(bad);
    assert.throws(() => assertSelectorUiOutcome('summary-hidden', { code: 1, signal: null }, bad, report), /SELECTOR_/);
  }
  assert.throws(() => assertSelectorUiOutcome('summary-hidden', { code: 0, signal: null }, observed, report), /SELECTOR_/);
  const missing = structuredClone(report); missing.suites[0].specs[0].tests[0].results[0].steps = [];
  assert.throws(() => assertSelectorUiOutcome('summary-hidden', { code: 1, signal: null }, observed, missing), /SELECTOR_/);
  const backend = structuredClone(report); backend.suites[0].specs[0].tests[0].results[0].error.message = 'backend failure';
  assert.throws(() => assertSelectorUiOutcome('summary-hidden', { code: 1, signal: null }, observed, backend), /SELECTOR_/);
  const retried = structuredClone(report); retried.suites[0].specs[0].tests[0].results[0].retry = 1;
  assert.throws(() => assertSelectorUiOutcome('summary-hidden', { code: 1, signal: null }, observed, retried), /SELECTOR_RETRY_FORBIDDEN/);
  const additional = structuredClone(report); additional.suites[0].specs[0].tests[0].results[0].errors.push({ message: 'candidate asset mismatch' });
  assert.throws(() => assertSelectorUiOutcome('summary-hidden', { code: 1, signal: null }, observed, additional), /SELECTOR_EXTRA_RESULT_ERROR/);
});

test('selector workbook opt-in seals each variant and refuses restoring a conflicting callback', async t => {
  const { prepareRecipientCallbackImport, importRecipientCallback } = await import('./lib/exui-recipient-callback-import.mjs');
  const output = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'selector-workbook-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const seals = [];
  for (const variant of ['baseline', 'summary-hidden']) {
    const directory = path.join(output, variant);
    seals.push(await prepareRecipientCallbackImport(directory, { variant: 'binding-omitted', rowFacets: true, selectorEventVariant: variant }));
    const definition = JSON.parse(fs.readFileSync(path.join(directory, 'definition.json')));
    const row = definition.sheets.CaseEventToFields.find(r => r.CaseEventID === 'serviceOfDocuments' && r.CaseFieldID === 'sodAdditionalRecipients');
    assert.equal(row.ShowSummaryChangeOption, variant === 'baseline' ? 'Y' : 'N');
    assert.equal(seals.at(-1).selectorEventBinding.catalogueCredit, false);
  }
  assert.notEqual(seals[0].workbookDigest, seals[1].workbookDigest);
  await assert.rejects(prepareRecipientCallbackImport(path.join(output, 'wrong-context'), { variant: 'baseline', rowFacets: true, selectorEventVariant: 'baseline' }), /SELECTOR_CALLBACK_CONTEXT_REQUIRED/);
  await assert.rejects(importRecipientCallback({}, { fixtureDirectory: path.join(output, 'baseline'), variant: 'binding-omitted', rowFacets: true, selectorEventVariant: 'summary-hidden', request: () => { throw Error('runtime must not be accessed'); } }), /CALLBACK_IMPORT_SEAL_MISMATCH/);
});

test('selector date query proves ownership around exact-version read-only SQL and cannot overwrite a witness', async t => {
  const { readSelectorStoredDate } = await import('./lib/exui-selector-event-row-facets.mjs');
  const output = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'selector-date-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  fs.mkdirSync(path.join(output, 'recipient-callback-import'));
  const state = { output, owner: 'owned-test', namespace: 'namespace-test', images: { database: { id: 'sha256:' + 'a'.repeat(64) } } };
  let inspections = 0;
  const rows = [{ case_type: 'HarnessNestedPRL', version: 2, event: 'serviceOfDocuments', page: 'serviceOfDocuments2', field: 'sodAdditionalRecipients', live_from: '2024-09-01', sql_type: 'date' }];
  const deps = { inspect: value => { assert.equal(value, state); inspections++; }, runDocker: (args, sql) => {
    assert.deepEqual(args.slice(0, 4), ['exec', '-i', 'namespace-test', 'psql']);
    assert(sql.startsWith('BEGIN READ ONLY;')); assert(sql.endsWith('COMMIT;'));
    assert(sql.includes("ct.version=2")); assert(sql.includes("cf.reference='sodAdditionalRecipients'"));
    return JSON.stringify(rows);
  } };
  const result = readSelectorStoredDate(state, 2, deps);
  assert.equal(inspections, 2); assert.equal(result.owner, state.owner);
  assert.equal(result.activationClaim, false); assert.deepEqual(result.images, state.images);
  assert.throws(() => readSelectorStoredDate(state, 2, deps), /EEXIST/);
});
