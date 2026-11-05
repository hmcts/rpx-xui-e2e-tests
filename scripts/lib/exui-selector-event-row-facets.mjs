import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deriveSelectorEventRowFixture } from './exui-selector-event-row-contract.mjs';
import { docker, verifyCcdContainerIdentity } from './exui-ccd-runtime.mjs';
import { digestBytes } from './exui-evidence-io.mjs';

const one = (rows, predicate) => {
  assert(Array.isArray(rows), 'SELECTOR_DESCRIPTOR_SCHEMA');
  const selected = rows.filter(predicate);
  assert.equal(selected.length, 1, 'SELECTOR_DESCRIPTOR_ROW_REQUIRED');
  return selected[0];
};

export function validateSelectorRowDescriptors(definition, pages, variant = 'baseline') {
  const { binding, fixture } = deriveSelectorEventRowFixture(variant);
  assert.equal(definition.id, binding.caseType, 'SELECTOR_CASE_TYPE');
  assert(Number.isSafeInteger(definition.version?.number) && definition.version.number > 0, 'SELECTOR_IMPORT_VERSION');
  assert.equal(pages.case_type_id, binding.caseType, 'SELECTOR_PAGE_CASE_TYPE');
  assert.equal(pages.event_id, binding.eventId, 'SELECTOR_PAGE_EVENT');
  const event = one(definition.events, item => item.id === binding.eventId);
  const field = one(event.case_fields, item => item.case_field_id === binding.fieldId);
  assert.equal(field.display_context, 'OPTIONAL', 'SELECTOR_DISPLAY_CONTEXT');
  assert.equal(field.show_condition, null, 'SELECTOR_FIELD_CONDITION');
  assert.equal(field.show_summary_change_option, variant === 'baseline', 'SELECTOR_SUMMARY_OPTION');
  const backing = one(definition.case_fields, item => item.id === binding.fieldId);
  const sourceField = one(fixture.sheets.CaseField, item => item.ID === binding.fieldId);
  assert.equal(backing.label, sourceField.Label, 'SELECTOR_BACKING_LABEL');
  assert.equal(backing.field_type.type, sourceField.FieldType, 'SELECTOR_BACKING_TYPE');
  assert.equal(backing.field_type.id, 'MultiSelectList-AdditionalRecipients', 'SELECTOR_BACKING_LIST');
  assert.deepEqual(backing.field_type.fixed_list_items, [{ code: 'additionalRecipients', label: 'Additional recipients (optional)', order: 1 }], 'SELECTOR_BACKING_OPTIONS');
  assert.equal(pages.wizard_pages.length, 2, 'SELECTOR_PAGE_COUNT');
  const page = one(pages.wizard_pages, item => item.id === binding.pageId);
  assert.equal(page.order, 2, 'SELECTOR_PAGE_ORDER');
  assert.equal(page.show_condition, null, 'SELECTOR_PAGE_CONDITION');
  assert.deepEqual(page.wizard_page_fields.map(item => [item.case_field_id, item.order]).sort((a, b) => a[1] - b[1]), [['sodAdditionalRecipients', 7], ['sodAdditionalRecipientsList', 8]], 'SELECTOR_FIELD_ORDER');
  const predecessor = one(pages.wizard_pages, item => item.id === 'serviceOfDocumentsharnessBefore');
  assert.equal(predecessor.order, 1, 'SELECTOR_PREDECESSOR_ORDER');
  assert.equal(predecessor.show_condition, null, 'SELECTOR_PREDECESSOR_CONDITION');
  assert.deepEqual(predecessor.wizard_page_fields.map(item => [item.case_field_id, item.order]), [['protectedValue', 1]], 'SELECTOR_PREDECESSOR_FIELD');
  assert.equal(one(event.case_fields, item => item.case_field_id === 'protectedValue').display_context, 'READONLY', 'SELECTOR_PREDECESSOR_CONTEXT');
  return { kind: 'selector-event-row-descriptors', binding, definitionVersion: definition.version.number, label: backing.label, activationClaim: false, catalogueCredit: false };
}

export function validateSelectorStoredDate(rows, version) {
  const { binding } = deriveSelectorEventRowFixture();
  assert(Number.isSafeInteger(version) && version > 0, 'SELECTOR_DATE_VERSION');
  assert.deepEqual(rows, [{ case_type: binding.caseType, version, event: binding.eventId, page: binding.pageId, field: binding.fieldId, live_from: binding.liveFrom, sql_type: 'date' }], 'SELECTOR_DATE_EXACT_ROW');
  return { kind: 'selector-event-row-date-retention', rows, sourceRowDigest: binding.sourceRowDigest, sourceRevision: binding.sourceRevision, activationClaim: false, catalogueCredit: false };
}

export function readSelectorStoredDate(state, version, { runDocker = docker, inspect = verifyCcdContainerIdentity } = {}) {
  assert(Number.isSafeInteger(version) && version > 0, 'SELECTOR_DATE_VERSION');
  inspect(state);
  const sql = `BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
SELECT ct.reference AS case_type, ct.version, ev.reference AS event, dg.reference AS page, cf.reference AS field,
dgcf.live_from::text AS live_from, pg_typeof(dgcf.live_from)::text AS sql_type
FROM display_group_case_field dgcf JOIN display_group dg ON dg.id=dgcf.display_group_id
JOIN case_type ct ON ct.id=dg.case_type_id JOIN event ev ON ev.id=dg.event_id AND ev.case_type_id=ct.id
JOIN case_field cf ON cf.id=dgcf.case_field_id AND cf.case_type_id=ct.id
WHERE ct.reference='HarnessNestedPRL' AND ct.version=${version} AND ev.reference='serviceOfDocuments'
AND dg.reference='serviceOfDocuments2' AND cf.reference='sodAdditionalRecipients') r; COMMIT;`;
  let raw;
  try { raw = runDocker(['exec', '-i', state.namespace, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'ccd_definition'], sql); }
  catch { throw Error('SELECTOR_DATE_QUERY_FAILED'); }
  inspect(state);
  assert(typeof raw === 'string' && Buffer.byteLength(raw) < 16384, 'SELECTOR_DATE_RESPONSE');
  let rows;
  try { rows = JSON.parse(raw); } catch { throw Error('SELECTOR_DATE_RESPONSE'); }
  const result = { ...validateSelectorStoredDate(rows, version), owner: state.owner, namespace: state.namespace, images: state.images, rawDigest: digestBytes(raw) };
  fs.writeFileSync(path.join(state.output, 'recipient-callback-import/selector-stored-row-date.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return result;
}

export function assertSelectorUiOutcome(variant, terminal, observed, report) {
  const { binding } = deriveSelectorEventRowFixture(variant);
  assert.equal(observed.kind, 'selector-event-row-observation', 'SELECTOR_OBSERVATION_KIND');
  assert.equal(observed.variant, variant, 'SELECTOR_OBSERVATION_VARIANT');
  assert.deepEqual(observed.sourceBinding, binding, 'SELECTOR_OBSERVATION_SOURCE');
  assert.equal(observed.catalogueCredit, false, 'SELECTOR_FEASIBILITY_CREDIT');
  assert.equal(observed.releaseCredit, false, 'SELECTOR_FEASIBILITY_CREDIT');
  assert.deepEqual(observed.optionalEmpty, { status: 200, pageId: 'serviceOfDocuments2' }, 'SELECTOR_OPTIONAL_EMPTY');
  assert.deepEqual(observed.selectedCya, { validation: { status: 200, pageId: 'serviceOfDocuments2' }, selectorChecked: true, selectorPrecedesRecipient: true, predecessorRoundTrip: true, healthySiblingCount: 1, selectorSummaryCount: variant === 'baseline' ? 1 : 0 }, 'SELECTOR_HEALTHY_SELECTED_CYA');
  assert.equal(terminal.signal, null, 'SELECTOR_TERMINAL_SIGNAL');
  assert.equal(report.errors?.length ?? 0, 0, 'SELECTOR_FRAMEWORK_ERROR');
  assert.equal(report.stats.skipped, 0, 'SELECTOR_SKIPPED_PROOF');
  const specs = [];
  const visit = suite => { specs.push(...(suite.specs ?? [])); for (const child of suite.suites ?? []) visit(child); };
  for (const suite of report.suites ?? []) visit(suite);
  assert.equal(specs.length, 1, 'SELECTOR_ONE_SPEC_REQUIRED');
  assert.equal(specs[0].tests.length, 1, 'SELECTOR_ONE_TEST_REQUIRED');
  assert.equal(specs[0].tests[0].results.length, 1, 'SELECTOR_ONE_ATTEMPT_REQUIRED');
  const result = specs[0].tests[0].results[0];
  assert.equal(result.retry, 0, 'SELECTOR_RETRY_FORBIDDEN');
  if (variant === 'baseline') {
    assert.equal(terminal.code, 0, 'SELECTOR_BASELINE_EXIT');
    assert.equal(result.status, 'passed', 'SELECTOR_BASELINE_STATUS');
    assert.equal(report.stats.expected, 1, 'SELECTOR_BASELINE_COUNT');
    assert.equal(report.stats.unexpected, 0, 'SELECTOR_BASELINE_FAILURE');
    assert.equal(observed.completed, true, 'SELECTOR_BASELINE_INCOMPLETE');
    assert.equal(observed.changeRoundTrip, true, 'SELECTOR_CHANGE_ROUND_TRIP');
    assert.equal(observed.submissionStatus, 201, 'SELECTOR_PERSISTENCE_REQUIRED');
    return 'selector-event-row-feasibility-observed';
  }
  assert.equal(terminal.code, 1, 'SELECTOR_FAULT_EXIT');
  assert.equal(result.status, 'failed', 'SELECTOR_FAULT_STATUS');
  assert.equal(report.stats.unexpected, 1, 'SELECTOR_FAULT_COUNT');
  assert.equal(report.stats.expected, 0, 'SELECTOR_FAULT_COUNT');
  assert.equal(observed.faultEffective, true, 'SELECTOR_FAULT_NOT_EFFECTIVE');
  assert.equal(observed.witness, 'healthy-cya-without-selector-row', 'SELECTOR_FAULT_WITNESS');
  assert(result.error?.message?.includes('SELECTOR_SOURCE_SUMMARY_ROW_REQUIRED'), 'SELECTOR_FAILURE_NOT_ATTRIBUTED');
  const steps = [];
  const walk = values => { for (const value of values ?? []) { steps.push(value); walk(value.steps); } };
  walk(result.steps);
  assert.equal(steps.filter(value => value.title === 'harness-assertion:selector-event-summary-row' && value.error?.message?.includes('SELECTOR_SOURCE_SUMMARY_ROW_REQUIRED')).length, 1, 'SELECTOR_NAMED_FAILURE_REQUIRED');
  return 'selector-summary-omission-detected';
}
