import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateMandatoryEmailEventDerivation,validateMandatoryEmailEventDates} from './exui-mandatory-email-event-validation.mjs';
import {docker,verifyCcdContainerIdentity} from './exui-ccd-runtime.mjs';
import {digestBytes} from './exui-evidence-io.mjs';
const one=(items,predicate)=>{assert(Array.isArray(items),'MANDATORY_EMAIL_DESCRIPTOR_SCHEMA');const selected=items.filter(predicate);assert.equal(selected.length,1,'MANDATORY_EMAIL_DESCRIPTOR_ROW');return selected[0];};
export function validateMandatoryEmailDescriptors(definition,pages,derivation){
  validateMandatoryEmailEventDerivation(derivation,derivation.binding.variant);
  assert.equal(definition.id,'HarnessNestedPRL','MANDATORY_EMAIL_DESCRIPTOR_TYPE');
  assert(Number.isSafeInteger(definition.version?.number)&&definition.version.number>0,'MANDATORY_EMAIL_DESCRIPTOR_VERSION');
  assert.equal(pages.case_type_id,'HarnessNestedPRL','MANDATORY_EMAIL_DESCRIPTOR_TYPE');assert.equal(pages.event_id,'serviceOfDocuments','MANDATORY_EMAIL_DESCRIPTOR_EVENT');
  const event=one(definition.events,e=>e.id==='serviceOfDocuments');
  const parent=one(event.case_fields,f=>f.case_field_id==='sodAdditionalRecipientsList');
  const backing=one(definition.case_fields,f=>f.id==='sodAdditionalRecipientsList');
  assert.equal(backing.field_type.type,'Collection','MANDATORY_EMAIL_DESCRIPTOR_PARENT');assert.equal(backing.field_type.collection_field_type.id,'ServeOrgDetails','MANDATORY_EMAIL_DESCRIPTOR_COMPLEX_ID');
  const email=one(backing.field_type.collection_field_type.complex_fields,f=>f.id==='emailInformation');
  assert.equal(email.field_type.id,'EmailInformation','MANDATORY_EMAIL_DESCRIPTOR_EMAIL_TYPE');
  for(const row of derivation.binding.rows){
    const expected=row.normalizedRow,actual=one(parent.case_fields_complex,c=>c.reference===expected.ListElementCode);
    assert.equal(actual.displayContext,expected.DisplayContext,'MANDATORY_EMAIL_DESCRIPTOR_CONTEXT');
    assert.equal(actual.showCondition,expected.FieldShowCondition,'MANDATORY_EMAIL_DESCRIPTOR_CONDITION');
    assert.equal(actual.order,Number(expected.FieldDisplayOrder),'MANDATORY_EMAIL_DESCRIPTOR_ORDER');
    // The pinned definition parser trims the literal single-space override.
    assert.equal(actual.label,'','MANDATORY_EMAIL_DESCRIPTOR_BLANK_LABEL');
    const leaf=one(email.field_type.complex_fields,f=>f.id===expected.ListElementCode.split('.')[1]);
    assert.equal(leaf.label,row.id==='name'?'Name':'Email address','MANDATORY_EMAIL_DESCRIPTOR_LABEL_FALLBACK');assert.equal(leaf.field_type.type,'Text','MANDATORY_EMAIL_DESCRIPTOR_TEXT');
  }
  const page=one(pages.wizard_pages,p=>p.id==='serviceOfDocuments2');assert.equal(page.order,2,'MANDATORY_EMAIL_DESCRIPTOR_PAGE');
  assert.equal(one(page.wizard_page_fields,f=>f.case_field_id==='sodAdditionalRecipientsList').order,8,'MANDATORY_EMAIL_DESCRIPTOR_PARENT_ORDER');
  assert(pages.wizard_pages.every(p=>p.callback_url_mid_event==null||p.callback_url_mid_event===''),'MANDATORY_EMAIL_CALLBACK_OMITTED');
  return{kind:'mandatory-email-event-descriptor-facets',definitionVersion:definition.version.number,sourceBinding:derivation.binding,activationClaim:false,runtimeAcceptance:false,catalogueCredit:false};
}
export function readMandatoryEmailDates(state,version,{runDocker=docker,inspect=verifyCcdContainerIdentity,writeReceipt=true}={}){
  assert(Number.isSafeInteger(version)&&version>0,'MANDATORY_EMAIL_DATE_VERSION');assert.equal(typeof writeReceipt,'boolean','MANDATORY_EMAIL_DATE_WRITE');inspect(state);
  // Same pinned schema joins as exui-source-shape-dates; only these two fixed references.
  const sql=`BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
SELECT ct.reference AS case_type, ct.version, ev.reference AS event, cf.reference AS field,
ec.reference, ec.live_from::text AS live_from, pg_typeof(ec.live_from)::text AS sql_type
FROM event_case_field_complex_type ec JOIN event_case_field ef ON ef.id=ec.event_case_field_id
JOIN event ev ON ev.id=ef.event_id JOIN case_type ct ON ct.id=ev.case_type_id
JOIN case_field cf ON cf.id=ef.case_field_id AND cf.case_type_id=ct.id
WHERE ct.reference='HarnessNestedPRL' AND ct.version=${version} AND ev.reference='serviceOfDocuments'
AND cf.reference='sodAdditionalRecipientsList' AND ec.reference IN ('emailInformation.emailAddress','emailInformation.emailName')
ORDER BY ec.reference) r; COMMIT;`;
  let raw;try{raw=runDocker(['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition'],sql);}catch{throw Error('MANDATORY_EMAIL_DATE_QUERY_FAILED');}
  inspect(state);assert(typeof raw==='string'&&Buffer.byteLength(raw)<16384,'MANDATORY_EMAIL_DATE_RESPONSE');
  let rows;try{rows=JSON.parse(raw);}catch{throw Error('MANDATORY_EMAIL_DATE_RESPONSE');}
  const result={...validateMandatoryEmailEventDates(rows,version),rows,owner:state.owner,namespace:state.namespace,images:state.images,rawDigest:digestBytes(raw)};
  if(writeReceipt)fs.writeFileSync(path.join(state.output,'recipient-callback-import/mandatory-email-stored-dates.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  return result;
}
