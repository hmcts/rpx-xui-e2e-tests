import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {deriveRecipientCallbackFixture} from './exui-recipient-callback-fixture.mjs';
import {docker,verifyCcdContainerIdentity} from './exui-ccd-runtime.mjs';
const source=()=>deriveRecipientCallbackFixture();
const one=(items,predicate)=>{const selected=items.filter(predicate);assert.equal(selected.length,1,'CALLBACK_FACET_ROW_AMBIGUOUS');return selected[0];};
export function callbackRowFacetExpected() {
 const {fixture,binding}=source();const row=one(fixture.sheets.CaseEventToFields,r=>r.CaseEventID===binding.eventId&&r.CaseFieldID===binding.fieldId);
 const field=one(fixture.sheets.CaseField,r=>r.ID===binding.fieldId);
 const [day,month,year]=row.LiveFrom.split('/');
 return {row,binding,label:field.Label,fieldType:field.FieldType,fieldTypeParameter:field.FieldTypeParameter,liveFrom:`${year}-${month}-${day}`};
}
export function validateCallbackRowDescriptors(definition,pages) {
 const expected=callbackRowFacetExpected(),{row,binding}=expected;
 const event=one(definition.events,e=>e.id===binding.eventId);
 const eventField=one(event.case_fields,f=>f.case_field_id===binding.fieldId);
 assert.equal(eventField.display_context,row.DisplayContext,'CALLBACK_FACET_CONTEXT');assert.equal(eventField.show_condition,row.FieldShowCondition,'CALLBACK_FACET_CONDITION');assert.equal(eventField.show_summary_change_option,true,'CALLBACK_FACET_SUMMARY_CHANGE');
 const field=one(definition.case_fields,f=>f.id===binding.fieldId);assert.equal(field.label,expected.label,'CALLBACK_FACET_LABEL');assert.equal(field.field_type.type,expected.fieldType,'CALLBACK_FACET_TYPE');assert.equal(field.field_type.collection_field_type.id,expected.fieldTypeParameter,'CALLBACK_FACET_TYPE');
 const page=one(pages.wizard_pages,p=>p.id===binding.eventId+String(row.PageID));assert.equal(page.order,row.PageDisplayOrder,'CALLBACK_FACET_PAGE_ORDER');assert.equal(one(page.wizard_page_fields,f=>f.case_field_id===binding.fieldId).order,row.PageFieldDisplayOrder,'CALLBACK_FACET_FIELD_ORDER');assert.equal(one(page.wizard_page_fields,f=>f.case_field_id==='sodAdditionalRecipients').order,7,'CALLBACK_FACET_FIELD_ORDER');
 const predecessor=one(pages.wizard_pages,p=>p.id===binding.eventId+'harnessBefore');assert.equal(predecessor.order,1,'CALLBACK_FACET_PREDECESSOR');assert.deepEqual(predecessor.wizard_page_fields.map(f=>[f.case_field_id,f.order]),[['protectedValue',1]],'CALLBACK_FACET_PREDECESSOR');
 assert.equal(one(event.case_fields,f=>f.case_field_id==='protectedValue').display_context,'READONLY','CALLBACK_FACET_PREDECESSOR');assert.equal(pages.wizard_pages.length,2,'CALLBACK_FACET_PREDECESSOR');
 return {kind:'callback-row-descriptor-facets',sourceRowDigest:binding.sourceRowDigest,sourceRevision:binding.sourceRevision,sourcePath:binding.sourcePath,expected,runtimeAcceptance:false,catalogueCredit:false};
}
export function validateCallbackStoredDate(rows,version) {
 const expected=callbackRowFacetExpected();assert(Number.isSafeInteger(version)&&version>0,'CALLBACK_FACET_VERSION');
 assert.deepEqual(rows,[{case_type:'HarnessNestedPRL',version,event:'serviceOfDocuments',page:'serviceOfDocuments2',field:'sodAdditionalRecipientsList',live_from:expected.liveFrom,sql_type:'date'}],'CALLBACK_FACET_DATE_ROW');
 return {kind:'callback-row-date-preservation',rows,sourceRowDigest:expected.binding.sourceRowDigest,sourceRevision:expected.binding.sourceRevision,sourcePath:expected.binding.sourcePath,activationClaim:false,runtimeAcceptance:false,catalogueCredit:false};
}
export function readCallbackStoredDate(state,version,{runDocker=docker,inspect=verifyCcdContainerIdentity}={}) {
 assert(Number.isSafeInteger(version)&&version>0,'CALLBACK_FACET_VERSION');inspect(state);
 // Pinned definition-store entity joins; no caller SQL/identifiers and no activation interpretation.
 const sql=`BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
SELECT ct.reference AS case_type, ct.version, ev.reference AS event, dg.reference AS page, cf.reference AS field,
dgcf.live_from::text AS live_from, pg_typeof(dgcf.live_from)::text AS sql_type
FROM display_group_case_field dgcf JOIN display_group dg ON dg.id=dgcf.display_group_id
JOIN case_type ct ON ct.id=dg.case_type_id JOIN event ev ON ev.id=dg.event_id AND ev.case_type_id=ct.id
JOIN case_field cf ON cf.id=dgcf.case_field_id AND cf.case_type_id=ct.id
WHERE ct.reference='HarnessNestedPRL' AND ct.version=${version} AND ev.reference='serviceOfDocuments'
AND dg.reference='serviceOfDocuments2' AND cf.reference='sodAdditionalRecipientsList') r; COMMIT;`;
 let raw;try {raw=runDocker(['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition'],sql);}catch {throw Error('CALLBACK_FACET_DATE_QUERY_FAILED');}
 inspect(state);assert(Buffer.byteLength(raw)<16384,'CALLBACK_FACET_DATE_RESPONSE');let rows;try {rows=JSON.parse(raw);}catch {throw Error('CALLBACK_FACET_DATE_RESPONSE');}
 const file=path.join(state.output,'recipient-callback-import/stored-row-date.json');fs.writeFileSync(file,JSON.stringify({kind:'callback-row-date-readback',rows,version,catalogueCredit:false},null,2)+'\n',{mode:0o600});
 const result=validateCallbackStoredDate(rows,version);fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
