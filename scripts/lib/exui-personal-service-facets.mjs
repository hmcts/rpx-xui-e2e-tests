import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { derivePersonalServiceFixture } from './exui-personal-service-contract.mjs';
import { docker, verifyCcdContainerIdentity } from './exui-ccd-runtime.mjs';
import { digestBytes } from './exui-evidence-io.mjs';

const one = (rows, predicate) => {
  assert(Array.isArray(rows), 'PERSONAL_SERVICE_DESCRIPTOR_SCHEMA');
  const selected = rows.filter(predicate);
  assert.equal(selected.length, 1, 'PERSONAL_SERVICE_DESCRIPTOR_ROW_REQUIRED');
  return selected[0];
};

export function validatePersonalServiceDescriptors(definition, pages, variant = 'baseline') {
  const { binding, fixture } = derivePersonalServiceFixture(variant);
  assert.equal(definition.id, binding.caseType, 'PERSONAL_SERVICE_CASE_TYPE');
  assert(Number.isSafeInteger(definition.version?.number) && definition.version.number > 0, 'PERSONAL_SERVICE_IMPORT_VERSION');
  assert.equal(pages.case_type_id, binding.caseType, 'PERSONAL_SERVICE_PAGE_CASE_TYPE');
  assert.equal(pages.event_id, binding.eventId, 'PERSONAL_SERVICE_PAGE_EVENT');
  const event = one(definition.events, item => item.id === binding.eventId);
  const field = one(event.case_fields, item => item.case_field_id === binding.fieldId);
  assert.equal(field.display_context, variant==='baseline'?'MANDATORY':'OPTIONAL', 'PERSONAL_SERVICE_DISPLAY_CONTEXT');
  assert.equal(field.show_condition, null, 'PERSONAL_SERVICE_FIELD_CONDITION');
  assert.equal(field.show_summary_change_option, true, 'PERSONAL_SERVICE_SUMMARY_OPTION');
  const backing = one(definition.case_fields, item => item.id === binding.fieldId);
  const sourceField = one(fixture.sheets.CaseField, item => item.ID === binding.fieldId);
  assert.equal(backing.label, sourceField.Label, 'PERSONAL_SERVICE_BACKING_LABEL');
  assert.equal(backing.field_type.type, sourceField.FieldType, 'PERSONAL_SERVICE_BACKING_TYPE');
  assert.equal(backing.field_type.id, 'FixedRadioList-YesNoNotApplicable', 'PERSONAL_SERVICE_BACKING_LIST');
  assert.deepEqual(backing.field_type.fixed_list_items, [{code:'Yes',label:'Yes',order:1},{code:'No',label:'No',order:2},{code:'NotApplicable',label:'Not applicable',order:3}], 'PERSONAL_SERVICE_BACKING_OPTIONS');
  assert.equal(pages.wizard_pages.length, 2, 'PERSONAL_SERVICE_PAGE_COUNT');
  const page = one(pages.wizard_pages, item => item.id === binding.pageId);
  assert.equal(page.order, 2, 'PERSONAL_SERVICE_PAGE_ORDER');
  assert.equal(page.show_condition, null, 'PERSONAL_SERVICE_PAGE_CONDITION');
  assert.deepEqual(page.wizard_page_fields.map(item => [item.case_field_id, item.order]).sort((a, b) => a[1] - b[1]), [['sodServeToRespondentOptions',2], ['sodAdditionalRecipients', 7], ['sodAdditionalRecipientsList', 8]], 'PERSONAL_SERVICE_FIELD_ORDER');
  const predecessor = one(pages.wizard_pages, item => item.id === 'serviceOfDocumentsharnessBefore');
  assert.equal(predecessor.order, 1, 'PERSONAL_SERVICE_PREDECESSOR_ORDER');
  assert.equal(predecessor.show_condition, null, 'PERSONAL_SERVICE_PREDECESSOR_CONDITION');
  assert.deepEqual(predecessor.wizard_page_fields.map(item => [item.case_field_id, item.order]), [['protectedValue', 1]], 'PERSONAL_SERVICE_PREDECESSOR_FIELD');
  assert.equal(one(event.case_fields, item => item.case_field_id === 'protectedValue').display_context, 'READONLY', 'PERSONAL_SERVICE_PREDECESSOR_CONTEXT');
  return { kind: 'personal-service-descriptors', binding, definitionVersion: definition.version.number, label: backing.label, activationClaim: false, catalogueCredit: false };
}

export function validatePersonalServiceDate(rows, version) {
  const { binding } = derivePersonalServiceFixture();
  assert(Number.isSafeInteger(version) && version > 0, 'PERSONAL_SERVICE_DATE_VERSION');
  assert.deepEqual(rows, [{ case_type: binding.caseType, version, event: binding.eventId, page: binding.pageId, field: binding.fieldId, live_from: binding.liveFrom, sql_type: 'date' }], 'PERSONAL_SERVICE_DATE_EXACT_ROW');
  return { kind: 'personal-service-date-retention', rows, sourceRowDigest: binding.sourceRowDigest, sourceRevision: binding.sourceRevision, activationClaim: false, catalogueCredit: false };
}

export function readPersonalServiceDate(state, version, { runDocker = docker, inspect = verifyCcdContainerIdentity, writeReceipt = true } = {}) {
  assert(Number.isSafeInteger(version) && version > 0, 'PERSONAL_SERVICE_DATE_VERSION');
  inspect(state);
  const sql = `BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
SELECT ct.reference AS case_type, ct.version, ev.reference AS event, dg.reference AS page, cf.reference AS field,
dgcf.live_from::text AS live_from, pg_typeof(dgcf.live_from)::text AS sql_type
FROM display_group_case_field dgcf JOIN display_group dg ON dg.id=dgcf.display_group_id
JOIN case_type ct ON ct.id=dg.case_type_id JOIN event ev ON ev.id=dg.event_id AND ev.case_type_id=ct.id
JOIN case_field cf ON cf.id=dgcf.case_field_id AND cf.case_type_id=ct.id
WHERE ct.reference='HarnessNestedPRL' AND ct.version=${version} AND ev.reference='serviceOfDocuments'
AND dg.reference='serviceOfDocuments2' AND cf.reference='sodServeToRespondentOptions') r; COMMIT;`;
  let raw;
  try { raw = runDocker(['exec', '-i', state.namespace, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'ccd_definition'], sql); }
  catch { throw Error('PERSONAL_SERVICE_DATE_QUERY_FAILED'); }
  inspect(state);
  assert(typeof raw === 'string' && Buffer.byteLength(raw) < 16384, 'PERSONAL_SERVICE_DATE_RESPONSE');
  let rows;
  try { rows = JSON.parse(raw); } catch { throw Error('PERSONAL_SERVICE_DATE_RESPONSE'); }
  const result = { ...validatePersonalServiceDate(rows, version), owner: state.owner, namespace: state.namespace, images: state.images, rawDigest: digestBytes(raw) };
  assert.equal(typeof writeReceipt, 'boolean', 'PERSONAL_SERVICE_DATE_WRITE_MODE');
  if (writeReceipt) fs.writeFileSync(path.join(state.output, 'recipient-callback-import/personal-service-stored-row-date.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return result;
}

