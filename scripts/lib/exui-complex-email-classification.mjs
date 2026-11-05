import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
import {docker,verifyCcdContainerIdentity} from './exui-ccd-runtime.mjs';

export function validateComplexEmailObserver(state) {
  assert(state&&typeof state==='object'&&state.case_data&&Array.isArray(state.case_data.sodAdditionalRecipientsList),'COMPLEX_EMAIL_OBSERVER_DATA');
  assert(state.data_classification&&typeof state.data_classification==='object'&&!Array.isArray(state.data_classification),'COMPLEX_EMAIL_OBSERVER_CLASSIFICATION');
  // The authenticated CCD API omits complex-ACL classifications. Their values
  // must be proven separately against the owned database, never inferred here.
  assert(!Object.hasOwn(state.data_classification,'sodAdditionalRecipientsList'),'COMPLEX_EMAIL_OBSERVER_CLASSIFICATION');
}

export function validateComplexEmailStoredClassification(rows,observed,context) {
  assert(context?.owner&&/^[a-f0-9]{64}$/.test(context.namespace)&&Number.isSafeInteger(context.version)&&context.version>0,'COMPLEX_EMAIL_RUNTIME_IDENTITY');
  assert(['baseline','email-type'].includes(observed.variant)&&typeof observed.actorId==='string'&&observed.actorId.length>0,'COMPLEX_EMAIL_STORED_CONTEXT');
  const journeys=[observed.healthy,observed.probe];
  assert(journeys.every(j=>/^\d{16}$/.test(j.caseId))&&new Set(journeys.map(j=>j.caseId)).size===2,'COMPLEX_EMAIL_STORED_CASES');
  assert(Array.isArray(rows)&&rows.length===2,'COMPLEX_EMAIL_STORED_CASES');
  for(const [index,journey] of journeys.entries()) {
    validateComplexEmailObserver(journey.before.state);validateComplexEmailObserver(journey.after.state);
    const matches=rows.filter(row=>row.reference===journey.caseId);assert.equal(matches.length,1,'COMPLEX_EMAIL_STORED_CASES');const row=matches[0];
    assert.equal(row.case_type,'HarnessNestedPRL','COMPLEX_EMAIL_STORED_CASE_TYPE');assert.equal(row.jurisdiction,'HARNESS','COMPLEX_EMAIL_STORED_CASE_TYPE');
    assert.equal(row.version,journey.after.state.version,'COMPLEX_EMAIL_STORED_VERSION');
    assert.deepEqual(row.data,journey.after.state.case_data,'COMPLEX_EMAIL_STORED_DATA');
    const rejected=index===1&&observed.variant==='email-type';
    assert.deepEqual(row.events.map(e=>e.event_id),rejected?['create']:['create','update'],'COMPLEX_EMAIL_STORED_EVENTS');
    assert(row.events.every(e=>e.case_type_version===context.version&&e.case_type_id==='HarnessNestedPRL'&&e.user_id===observed.actorId),'COMPLEX_EMAIL_STORED_EVENTS');
    const classification=row.data_classification?.sodAdditionalRecipientsList;
    assert(classification&&classification.classification==='PUBLIC'&&Array.isArray(classification.value),'COMPLEX_EMAIL_GENERATED_CLASSIFICATION');
    const saved=row.data.sodAdditionalRecipientsList;
    assert.equal(saved.length,rejected?0:2,'COMPLEX_EMAIL_STORED_RECIPIENTS');
    assert.equal(classification.value.length,saved.length,'COMPLEX_EMAIL_GENERATED_CLASSIFICATION');
    assert.equal(new Set(saved.map(item=>item.id)).size,saved.length,'COMPLEX_EMAIL_STORED_RECIPIENTS');
    for(const recipient of saved) {
      assert(typeof recipient.id==='string'&&recipient.id.length>0,'COMPLEX_EMAIL_STORED_RECIPIENTS');
      const selected=classification.value.filter(item=>item.id===recipient.id);assert.equal(selected.length,1,'COMPLEX_EMAIL_CLASSIFICATION_ASSOCIATION');
      assert.equal(selected[0].value?.emailInformation?.classification,'PUBLIC','COMPLEX_EMAIL_GENERATED_CLASSIFICATION');
      assert.equal(selected[0].value?.emailInformation?.value?.emailAddress,'PUBLIC','COMPLEX_EMAIL_GENERATED_CLASSIFICATION');
    }
  }
  return {schemaVersion:1,kind:'complex-email-generated-classification',owner:context.owner,namespace:context.namespace,definitionVersion:context.version,variant:observed.variant,rows:structuredClone(rows),runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
}

export function readComplexEmailStoredClassification(state,imported,observed,{inspect=verifyCcdContainerIdentity,runDocker=docker}={}) {
  assert.equal(imported.owner,state.owner,'COMPLEX_EMAIL_RUNTIME_IDENTITY');assert.equal(imported.namespace,state.namespace,'COMPLEX_EMAIL_RUNTIME_IDENTITY');assert.deepEqual(imported.images,state.images,'COMPLEX_EMAIL_RUNTIME_IDENTITY');
  assert.equal(imported.status,'import-and-complex-metadata-observed','COMPLEX_EMAIL_STORED_IMPORT');
  const refs=[observed.healthy?.caseId,observed.probe?.caseId];assert(refs.every(ref=>typeof ref==='string'&&/^\d{16}$/.test(ref))&&new Set(refs).size===2,'COMPLEX_EMAIL_STORED_CASES');
  const sql=`BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (
SELECT c.reference::text, c.case_type_id AS case_type, c.jurisdiction, c.version, c.data, c.data_classification,
(SELECT json_agg(json_build_object('event_id',e.event_id,'case_type_id',e.case_type_id,'case_type_version',e.case_type_version,'user_id',e.user_id) ORDER BY e.id) FROM case_event e WHERE e.case_data_id=c.id) AS events
FROM case_data c WHERE c.case_type_id='HarnessNestedPRL' AND c.jurisdiction='HARNESS' AND c.reference IN (${refs.join(',')}) ORDER BY c.reference) r; ROLLBACK;`;
  inspect(state);const raw=runDocker(['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_data'],sql);inspect(state);
  assert(typeof raw==='string'&&Buffer.byteLength(raw)<131072,'COMPLEX_EMAIL_STORED_RESPONSE');
  const output=path.join(state.output,'complex-email-import');
  const rawPath=path.join(output,'stored-classification-rows.json');fs.writeFileSync(rawPath,raw,{flag:'wx',mode:0o600});
  const receipt=validateComplexEmailStoredClassification(JSON.parse(raw),observed,{owner:state.owner,namespace:state.namespace,version:imported.descriptor.version});
  receipt.rawDigest=digestBytes(raw);receipt.importDigest=digestBytes(JSON.stringify(imported));receipt.observationDigest=digestBytes(JSON.stringify(observed));receipt.images=state.images;
  writeJsonAtomic(path.join(output,'stored-classification.json'),receipt);return receipt;
}
