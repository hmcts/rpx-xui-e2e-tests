import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SOURCE_SHAPE_ROWS } from './exui-source-shape-contract.mjs';
import { EVENT_CAPABILITY_SOURCE_DIGEST, validateEventCapabilitySource } from './exui-ccd-event-capability.mjs';

// Pinned definition-store c37c9b84: EventCaseFieldComplexTypeParser parses
// LocalDate; EventComplexTypeEntity stores it, while its DTO omits it.
// This observes preservation only. It does not infer date activation semantics.
function sourceIdentity() {
  const source = JSON.parse(fs.readFileSync(new URL('../fixtures/ccd/event-capability.source.json', import.meta.url)));
  validateEventCapabilitySource(source);
  const sourcePath = 'definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json';
  const files = source.sources.filter(file => file.path === sourcePath);
  assert.equal(files.length, 1, 'SHAPE_DATE_SOURCE_REQUIRED');
  const rows = SOURCE_SHAPE_ROWS.map(contract => {
    const matches = files[0].rows.filter(({row}) => row.CaseTypeID === 'PRLAPPS' && row.ID === 'ServeOrgDetails' && row.CaseEventID === 'serviceOfDocuments' && row.CaseFieldID === 'sodAdditionalRecipientsList' && row.ListElementCode === contract.reference);
    assert.equal(matches.length, 1, 'SHAPE_DATE_SOURCE_REQUIRED');
    assert.equal(matches[0].row.LiveFrom, '01/09/2024', 'SHAPE_DATE_SOURCE_REQUIRED');
    return {reference:contract.reference, rowDigest:matches[0].rowDigest};
  }).sort((a,b) => a.reference.localeCompare(b.reference));
  return {sourceRevision:source.revision, sourceProjectionDigest:EVENT_CAPABILITY_SOURCE_DIGEST, sourcePath, sourceRows:rows};
}
function expectedRows(version) {
  assert(Number.isSafeInteger(version) && version > 0, 'SHAPE_DATE_VERSION_REQUIRED');
  return SOURCE_SHAPE_ROWS.map(({reference}) => ({case_type:'HarnessNestedPRL',version,event:'serviceOfDocuments',field:'sodAdditionalRecipientsList',reference,live_from:'2024-09-01',sql_type:'date'})).sort((a,b) => a.reference.localeCompare(b.reference));
}
export function sourceShapeDateRecord(rows, state, version) {
  assert.deepEqual(rows, expectedRows(version), 'SHAPE_STORED_DATE_ROWS_MISMATCH');
  assert(typeof state.owner === 'string' && state.owner.length > 0 && /^[a-f0-9]{64}$/.test(state.namespace), 'SHAPE_DATE_RUNTIME_IDENTITY_REQUIRED');
  return {schemaVersion:1,kind:'stored-source-shape-dates',owner:state.owner,namespace:state.namespace,definitionVersion:version,...sourceIdentity(),rows,activationClaim:false};
}
export function assertStoredSourceShapeDates(record, state, version) {
  assert(record, 'SHAPE_STORED_DATES_REQUIRED');
  assert.deepEqual(record, sourceShapeDateRecord(record.rows,state,version), 'SHAPE_STORED_DATE_BINDING_MISMATCH');
}
export function readStoredSourceShapeDates(state, version, {runDocker,inspect}) {
  expectedRows(version); // reject SQL interpolation before contact
  inspect(state);
  // Only the owned database, fixed identifiers and validated integer version.
  const sql = `BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
SELECT ct.reference AS case_type, ct.version, ev.reference AS event, cf.reference AS field,
ec.reference, ec.live_from::text AS live_from, pg_typeof(ec.live_from)::text AS sql_type
FROM event_case_field_complex_type ec JOIN event_case_field ef ON ef.id=ec.event_case_field_id
JOIN event ev ON ev.id=ef.event_id JOIN case_type ct ON ct.id=ev.case_type_id
JOIN case_field cf ON cf.id=ef.case_field_id AND cf.case_type_id=ct.id
WHERE ct.reference='HarnessNestedPRL' AND ct.version=${version}
AND ev.reference='serviceOfDocuments' AND cf.reference='sodAdditionalRecipientsList'
AND ec.reference IN ('serveByPostOrEmail','emailInformation','postalInformation.postalAddress.AddressLine2')
ORDER BY ec.reference) r; COMMIT;`;
  let raw;
  try {raw=runDocker(['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition'],sql);}
  catch {throw Error('SHAPE_DATE_QUERY_FAILED');}
  inspect(state);
  assert(typeof raw === 'string' && Buffer.byteLength(raw)<16384, 'SHAPE_DATE_RESPONSE_INVALID');
  let rows;try {rows=JSON.parse(raw);}catch {throw Error('SHAPE_DATE_RESPONSE_INVALID');}
  return sourceShapeDateRecord(rows,state,version);
}
