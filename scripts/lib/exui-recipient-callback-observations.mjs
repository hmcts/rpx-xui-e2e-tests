import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes} from './exui-evidence-io.mjs';
import {CALLBACK_MUTATION,callbackCanonicalImport} from './exui-recipient-callback-contract.mjs';
import {RECIPIENT_CALLBACK_PATH} from './exui-recipient-callback-fixture.mjs';
const postal=()=>({postalName:null,postalAddress:{AddressLine1:null,AddressLine2:null,AddressLine3:null,PostTown:null,County:null,PostCode:null,Country:null}});
export const callbackSeedData=()=>({protectedValue:'synthetic-callback-ui',sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:[
 {id:'11111111-1111-4111-8111-111111111111',value:{serveByPostOrEmail:'email',emailInformation:{emailName:'HARNESS_CALLBACK_ORIGINAL',emailAddress:'first@harness.example.com'},postalInformation:postal()}},
 {id:'22222222-2222-4222-8222-222222222222',value:{serveByPostOrEmail:'email',emailInformation:{emailName:'Synthetic sibling',emailAddress:'second@harness.example.com'},postalInformation:postal()}},
]});
const renamed=name=>{const result=callbackSeedData();result.sodAdditionalRecipientsList[0].value.emailInformation.emailName=name;return result;};
const fixedRead=(directory,name)=>{const file=path.join(directory,name);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'CALLBACK_OBSERVATION_ALIAS');const bytes=fs.readFileSync(file);assert(bytes.length<=1024*1024,'CALLBACK_OBSERVATION_LIMIT');return bytes;};
export function callbackObservationReferences(directory) {
 return Object.fromEntries([['baseline','baseline/callback-ui-observation.json'],['baselineJournal','baseline/recipient-callback.jsonl'],['mutant',`${CALLBACK_MUTATION}/callback-ui-observation.json`],['mutantJournal',`${CALLBACK_MUTATION}/recipient-callback.jsonl`]].map(([key,name])=>[key,{path:name,digest:digestBytes(fixedRead(directory,name))}]));
}
export function validateCallbackInvocationObservation(observation,journal,selected,invocationId) {
 assert(['baseline',CALLBACK_MUTATION].includes(invocationId),'CALLBACK_OBSERVATION_INVOCATION');
 const baseline=invocationId==='baseline';
 assert.equal(observation.schemaVersion,1,'CALLBACK_OBSERVATION_SCHEMA');assert.equal(observation.kind,'native-recipient-callback-observation','CALLBACK_OBSERVATION_NATIVE_REQUIRED');assert.equal(observation.invocationId,invocationId,'CALLBACK_OBSERVATION_INVOCATION');
 assert(/^\d{16}$/.test(observation.caseId),'CALLBACK_OBSERVATION_CASE_ID');
 const before=observation.before;
 assert.equal(String(before.state.id),observation.caseId,'CALLBACK_OBSERVATION_CASE_ID');
 assert.equal(before.state.case_type_id,'HarnessNestedPRL','CALLBACK_OBSERVATION_CASE_TYPE');assert.equal(before.state.jurisdiction,'HARNESS','CALLBACK_OBSERVATION_JURISDICTION');assert.equal(before.state.state,'JUDICIAL_REVIEW','CALLBACK_OBSERVATION_STATE');
 assert(Number.isSafeInteger(before.state.version)&&before.state.version>0,'CALLBACK_OBSERVATION_VERSION');assert(Array.isArray(before.history)&&before.history.length>0,'CALLBACK_OBSERVATION_HISTORY');
 assert.deepEqual(before.state.case_data,callbackSeedData(),'CALLBACK_OBSERVATION_SEED');assert.deepEqual(observation.afterRejected,before,'CALLBACK_OBSERVATION_REJECTION_PERSISTED');
 const ui=observation.ui;
 assert.equal(ui.predecessor.label?.trim(),'Protected value','CALLBACK_OBSERVATION_PREDECESSOR_LABEL');assert.equal(ui.predecessor.editableControlCount,0,'CALLBACK_OBSERVATION_PREDECESSOR_CONTEXT');
 const navigation=ui.predecessor.navigation;assert(Array.isArray(navigation)&&navigation.length===4,'CALLBACK_OBSERVATION_PAGE_SEQUENCE');
 for(const [index,pageId] of ['serviceOfDocumentsharnessBefore','serviceOfDocuments2','serviceOfDocumentsharnessBefore','serviceOfDocuments2'].entries())assert(typeof navigation[index]==='string'&&navigation[index].startsWith('/')&&navigation[index].includes(observation.caseId)&&navigation[index].endsWith('/'+pageId),'CALLBACK_OBSERVATION_PAGE_SEQUENCE');
 assert.equal(navigation[0],navigation[2],'CALLBACK_OBSERVATION_PREVIOUS_PAGE');assert.equal(navigation[1],navigation[3],'CALLBACK_OBSERVATION_NEXT_PAGE');
 assert.equal(ui.recipientLabel?.trim(),'Recipient','CALLBACK_OBSERVATION_LABEL');
 for(const field of ['selectorPrecedesRecipient','selectorInitiallyChecked','hiddenWhenDeselected','visibleWhenReselected'])assert.equal(ui[field],true,'CALLBACK_OBSERVATION_CONDITION_ORDER');
 assert.deepEqual(observation.journal,journal,'CALLBACK_OBSERVATION_JOURNAL_MISMATCH');
 if(!baseline){
  assert.equal(observation.completed,false,'CALLBACK_OBSERVATION_FAULT_COMPLETE');assert.equal(observation.faultEffective,true,'CALLBACK_OBSERVATION_FAULT_EFFECTIVE');assert.equal(observation.witness,'valid-CYA-without-callback','CALLBACK_OBSERVATION_FAULT_WITNESS');
  assert.deepEqual(observation.validation,[{pageId:'serviceOfDocuments2',status:200}],'CALLBACK_OBSERVATION_FAULT_VALIDATION');assert.deepEqual(journal,[],'CALLBACK_OBSERVATION_FAULT_CALLBACK');
  assert.equal(ui.faultCyaHeading?.trim(),'Check your answers','CALLBACK_OBSERVATION_FAULT_CYA');assert(typeof ui.faultCyaPathname==='string'&&ui.faultCyaPathname.startsWith('/')&&ui.faultCyaPathname.includes(observation.caseId)&&!navigation.includes(ui.faultCyaPathname),'CALLBACK_OBSERVATION_FAULT_CYA_PATH');
  return;
 }
 assert.equal(observation.completed,true,'CALLBACK_OBSERVATION_INCOMPLETE');assert.deepEqual(observation.beforeSubmit,before,'CALLBACK_OBSERVATION_PREMATURE_PERSISTENCE');
 assert.equal(observation.validation?.length,3,'CALLBACK_OBSERVATION_VALIDATION_SEQUENCE');assert(observation.validation[0].status>=400&&observation.validation[0].status<500,'CALLBACK_OBSERVATION_BUSINESS_REJECTION');assert.equal(observation.validation[0].pageId,'serviceOfDocuments2','CALLBACK_OBSERVATION_CALLBACK_PAGE');assert.deepEqual(observation.validation.slice(1),[{pageId:'serviceOfDocuments2',status:200},{pageId:'serviceOfDocuments2',status:200}],'CALLBACK_OBSERVATION_CORRECTION_SEQUENCE');
 assert.equal(ui.cya.recipientLabel?.trim(),'Recipient','CALLBACK_OBSERVATION_CYA_LABEL');assert.equal(ui.cya.changeAccessibleName,'Change Recipient','CALLBACK_OBSERVATION_CYA_CHANGE');
 for(const field of ['summaryRecipientNames','changedRecipientNames'])assert.deepEqual(ui.cya[field].map(value=>value.trim()),['HARNESS_CALLBACK_NORMALIZED','Synthetic sibling'],'CALLBACK_OBSERVATION_CYA_VALUES');
 const after=observation.after,intended=renamed('HARNESS_CALLBACK_NORMALIZED');assert.deepEqual(after.state.case_data,intended,'CALLBACK_OBSERVATION_PERSISTED_DATA');assert.equal(after.state.version,before.state.version+1,'CALLBACK_OBSERVATION_PERSISTED_VERSION');
 const stable=state=>Object.fromEntries(Object.entries(state).filter(([key])=>!['version','case_data','last_modified'].includes(key)));assert.deepEqual(stable(after.state),stable(before.state),'CALLBACK_OBSERVATION_UNRELATED_STATE');
 assert(Number.isFinite(Date.parse(after.state.last_modified))&&Date.parse(after.state.last_modified)>=Date.parse(before.state.last_modified),'CALLBACK_OBSERVATION_MODIFIED_DATE');
 assert.equal(after.history.length,before.history.length+1,'CALLBACK_OBSERVATION_HISTORY_COUNT');
 const old=entry=>before.history.some(prior=>prior.id===entry.id&&prior.created_date===entry.created_date);assert.deepEqual(after.history.filter(old),before.history,'CALLBACK_OBSERVATION_PRIOR_HISTORY');
 const added=after.history.filter(entry=>!old(entry));assert.equal(added.length,1,'CALLBACK_OBSERVATION_AUDIT_COUNT');
 for(const [key,value] of Object.entries({id:'serviceOfDocuments',case_type_id:'HarnessNestedPRL',state_id:'JUDICIAL_REVIEW',user_id:selected.credentials.courtadmin.userId}))assert.equal(added[0][key],value,'CALLBACK_OBSERVATION_AUDIT_EVENT');
 assert.deepEqual(selected.credentials.courtadmin.roles?.slice().sort(),['caseworker','caseworker-harness','caseworker-privatelaw-courtadmin'],'CALLBACK_OBSERVATION_ACTOR_ROLES');
 assert.equal(journal.length,3,'CALLBACK_OBSERVATION_CALLBACK_COUNT');
 const bindingDigest=digestBytes(JSON.stringify(callbackCanonicalImport().binding));
 for(const [index,record] of journal.entries()){
  assert.equal(record.schemaVersion,1,'CALLBACK_JOURNAL_SCHEMA');assert.equal(record.sequence,index+1,'CALLBACK_JOURNAL_SEQUENCE');assert.equal(record.invocationId,'recipient-callback-native','CALLBACK_JOURNAL_NATIVE');assert.equal(record.authenticatedService,'ccd_data','CALLBACK_JOURNAL_SERVICE');assert.equal(record.path,RECIPIENT_CALLBACK_PATH,'CALLBACK_JOURNAL_PATH');assert.equal(record.method,'POST','CALLBACK_JOURNAL_METHOD');assert.equal(record.bindingDigest,bindingDigest,'CALLBACK_JOURNAL_BINDING');assert.equal(record.recipientCount,2,'CALLBACK_JOURNAL_RECIPIENTS');assert.equal(record.status,200,'CALLBACK_JOURNAL_STATUS');assert.equal(record.outcome,['business-rejected','normalized','normalization-unchanged'][index],'CALLBACK_JOURNAL_OUTCOME');
  for(const [raw,digest] of [['rawRequest','requestDigest'],['rawResponse','responseDigest']]){assert(typeof record[raw]==='string'&&Buffer.byteLength(record[raw])<=65536,'CALLBACK_JOURNAL_BYTES');assert.equal(digestBytes(record[raw]),record[digest],'CALLBACK_JOURNAL_DIGEST');}
  const request=JSON.parse(record.rawRequest),response=JSON.parse(record.rawResponse);
  assert.deepEqual(Object.keys(request).sort(),['case_details','case_details_before','event_id','ignore_warning'],'CALLBACK_JOURNAL_REQUEST_FIELDS');assert.equal(request.event_id,'serviceOfDocuments','CALLBACK_JOURNAL_EVENT');assert.equal(request.ignore_warning,false,'CALLBACK_JOURNAL_WARNING');
  for(const details of [request.case_details,request.case_details_before]){assert.equal(String(details.id),observation.caseId,'CALLBACK_JOURNAL_CASE');assert.equal(details.case_type_id,'HarnessNestedPRL','CALLBACK_JOURNAL_CASE_TYPE');assert.equal(details.jurisdiction,'HARNESS','CALLBACK_JOURNAL_JURISDICTION');assert.equal(details.state,'JUDICIAL_REVIEW','CALLBACK_JOURNAL_STATE');}
  assert.deepEqual(request.case_details_before.case_data,before.state.case_data,'CALLBACK_JOURNAL_BEFORE');
  const current=index===0?renamed('HARNESS_CALLBACK_REJECT'):index===1?callbackSeedData():intended;
  assert.deepEqual(request.case_details.case_data,current,'CALLBACK_JOURNAL_REQUEST_DATA');assert.deepEqual(response,{data:index===0?current:intended,errors:index===0?['HARNESS_CALLBACK_BUSINESS_REJECTION']:[],warnings:[]},'CALLBACK_JOURNAL_RESPONSE_DATA');
 }
}
export function validateCallbackNativeObservations(directory,input,faultInput,references) {
 const actual=callbackObservationReferences(directory);assert.deepEqual(references,actual,'CALLBACK_OBSERVATION_ARTIFACT_BINDING');
 for(const [invocationId,selected,key,journalKey] of [['baseline',input,'baseline','baselineJournal'],[CALLBACK_MUTATION,faultInput,'mutant','mutantJournal']]){
  const observation=JSON.parse(fixedRead(directory,actual[key].path));
  const journal=fixedRead(directory,actual[journalKey].path).toString('utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
  validateCallbackInvocationObservation(observation,journal,selected,invocationId);
 }
 return actual;
}
