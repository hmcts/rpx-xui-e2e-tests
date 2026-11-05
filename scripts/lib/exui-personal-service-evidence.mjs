import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes} from './exui-evidence-io.mjs';
import {derivePersonalServiceFixture,PERSONAL_SERVICE_FAILURE,PERSONAL_SERVICE_FIELD,PERSONAL_SERVICE_LABEL} from './exui-personal-service-contract.mjs';
import {validatePersonalServiceDate,validatePersonalServiceDescriptors} from './exui-personal-service-facets.mjs';
// The reader declares its data independently of the browser producer.
export const personalServiceSeed = empty => ({protectedValue:empty?'personal-service-empty-control':'personal-service-filled-control',sodAdditionalRecipients:[],sodAdditionalRecipientsList:[],sodServeToRespondentOptions:null});
const eventPath=id=>`/cases/case-details/HARNESS/HarnessNestedPRL/${id}/trigger/serviceOfDocuments/`;
const cya=(value,id)=>{assert.equal(value.heading,'Check your answers','PERSONAL_SERVICE_CYA');assert(typeof value.path==='string'&&value.path.startsWith(eventPath(id))&&!['serviceOfDocuments2','serviceOfDocumentsharnessBefore'].some(p=>value.path.endsWith('/'+p)),'PERSONAL_SERVICE_CYA_PATH');};
const before=(value,id,empty)=>{
 assert(/^\d{16}$/.test(id),'PERSONAL_SERVICE_CASE_ID');assert.equal(String(value.state.id),id,'PERSONAL_SERVICE_CASE_ID');
 for(const [key,want] of Object.entries({case_type_id:'HarnessNestedPRL',jurisdiction:'HARNESS',state:'JUDICIAL_REVIEW'}))assert.equal(value.state[key],want,'PERSONAL_SERVICE_STATE');
 assert(Number.isSafeInteger(value.state.version)&&value.state.version>=0,'PERSONAL_SERVICE_VERSION');
 assert(Array.isArray(value.history),'PERSONAL_SERVICE_HISTORY');assert.deepEqual(value.state.case_data,personalServiceSeed(empty),'PERSONAL_SERVICE_SEED');
};
export function validatePersonalServiceObservation(observed,journal,actorId,variant) {
 assert.equal(observed.schemaVersion,1,'PERSONAL_SERVICE_SCHEMA');assert.equal(observed.kind,'personal-service-observation','PERSONAL_SERVICE_KIND');assert.equal(observed.variant,variant,'PERSONAL_SERVICE_VARIANT');
 assert.deepEqual(observed.sourceBinding,derivePersonalServiceFixture(variant).binding,'PERSONAL_SERVICE_SOURCE_BINDING');
 assert.equal(observed.catalogueCredit,false,'PERSONAL_SERVICE_CREDIT');assert.equal(observed.releaseCredit,false,'PERSONAL_SERVICE_CREDIT');
 const f=observed.filled,e=observed.empty;
 before(f.before,f.caseId,false);before(e.before,e.caseId,true);assert.notEqual(f.caseId,e.caseId,'PERSONAL_SERVICE_DISTINCT_CASES');
 assert.deepEqual(f.beforeSubmit,f.before,'PERSONAL_SERVICE_PREMATURE_PERSISTENCE');assert.deepEqual(e.after,e.before,'PERSONAL_SERVICE_EMPTY_PERSISTENCE');
 assert.deepEqual(f.ui,{initialSelected:0,options:['Yes','No','Not applicable'],selected:'No',label:variant==='optional'?`${PERSONAL_SERVICE_LABEL} (Optional)`:PERSONAL_SERVICE_LABEL,precedesSelector:true,predecessorLabel:'Protected value',predecessorEditable:0,changeName:`Change ${PERSONAL_SERVICE_LABEL}`,changePath:eventPath(f.caseId)+'serviceOfDocuments2',afterChange:'No',healthySibling:'Protected value'},'PERSONAL_SERVICE_FILLED_UI');
 cya(f.cya,f.caseId);
 const expected={...personalServiceSeed(false),[PERSONAL_SERVICE_FIELD]:'No'};
 assert.deepEqual(f.after.state.case_data,expected,'PERSONAL_SERVICE_PERSISTED_DATA');assert.equal(f.after.state.version,f.before.state.version+1,'PERSONAL_SERVICE_PERSISTED_VERSION');
 const stable=s=>Object.fromEntries(Object.entries(s).filter(([key])=>!['case_data','version','last_modified'].includes(key)));
 assert.deepEqual(stable(f.after.state),stable(f.before.state),'PERSONAL_SERVICE_UNRELATED_STATE');
 assert(Number.isFinite(Date.parse(f.after.state.last_modified))&&Date.parse(f.after.state.last_modified)>=Date.parse(f.before.state.last_modified),'PERSONAL_SERVICE_PERSISTED_DATE');
 const old=h=>f.before.history.some(p=>p.id===h.id&&p.created_date===h.created_date);
 assert.equal(f.after.history.length,f.before.history.length+1,'PERSONAL_SERVICE_HISTORY_COUNT');assert.deepEqual(f.after.history.filter(old),f.before.history,'PERSONAL_SERVICE_PRIOR_HISTORY');
 const added=f.after.history.filter(h=>!old(h));assert.equal(added.length,1,'PERSONAL_SERVICE_NEW_EVENT');
 for(const [key,want] of Object.entries({id:'serviceOfDocuments',case_type_id:'HarnessNestedPRL',state_id:'JUDICIAL_REVIEW',user_id:actorId}))assert.equal(added[0][key],want,'PERSONAL_SERVICE_HISTORY_ACTOR');
 assert.deepEqual(f.submission,{method:'POST',path:`/data/cases/${f.caseId}/events`,status:201,eventId:'serviceOfDocuments',data:expected},'PERSONAL_SERVICE_SUBMISSION');
 assert(Array.isArray(journal),'PERSONAL_SERVICE_JOURNAL');
 const triggers=journal.filter(r=>r.method==='GET'&&/^\/data\/internal\/cases\/\d{16}\/event-triggers\/serviceOfDocuments$/.test(r.path));
 assert.deepEqual(triggers.map(r=>[r.path,r.status,r.actorId]),[f.caseId,e.caseId].map(id=>[`/data/internal/cases/${id}/event-triggers/serviceOfDocuments`,200,actorId]),'PERSONAL_SERVICE_TRIGGER_ORDER');
 const submissions=journal.filter(r=>r.method==='POST'&&/^\/data\/cases\/\d{16}\/events$/.test(r.path));
 assert.deepEqual(submissions.map(r=>[r.path,r.status,r.actorId]),[[`/data/cases/${f.caseId}/events`,201,actorId]],'PERSONAL_SERVICE_JOURNAL_SUBMISSION');
 assert(journal.indexOf(submissions[0])<journal.indexOf(triggers[1]),'PERSONAL_SERVICE_FILLED_BEFORE_EMPTY');
 const validate='/data/case-types/HarnessNestedPRL/validate';
 const validations=journal.filter(r=>r.method==='POST'&&r.path===validate);
 const filledStart=journal.indexOf(triggers[0]),filledEnd=journal.indexOf(submissions[0]),emptyStart=journal.indexOf(triggers[1]);
 const filledValidations=journal.slice(filledStart+1,filledEnd).filter(r=>r.method==='POST'&&r.path===validate);
 const emptyValidations=journal.slice(emptyStart+1).filter(r=>r.method==='POST'&&r.path===validate);
 assert.deepEqual(filledValidations.map(r=>r.personalService?.pageId),['serviceOfDocumentsharnessBefore','serviceOfDocuments2','serviceOfDocuments2'],'PERSONAL_SERVICE_FILLED_VALIDATION_WINDOW');
 assert.deepEqual(emptyValidations.map(r=>r.personalService?.pageId),['serviceOfDocumentsharnessBefore',...(variant==='optional'?['serviceOfDocuments2']:[])],'PERSONAL_SERVICE_EMPTY_VALIDATION_WINDOW');
 assert.deepEqual(validations,[...filledValidations,...emptyValidations],'PERSONAL_SERVICE_VALIDATION_OUTSIDE_WINDOW');
 for(const r of validations){assert.equal(r.status,200,'PERSONAL_SERVICE_VALIDATION_STATUS');assert.equal(r.actorId,actorId,'PERSONAL_SERVICE_VALIDATION_ACTOR');assert.equal(r.personalService.eventId,'serviceOfDocuments','PERSONAL_SERVICE_VALIDATION_EVENT');}
 assert.deepEqual(validations.filter(r=>r.personalService.pageId==='serviceOfDocuments2').map(r=>r.personalService.answer),variant==='baseline'?['No','No']:['No','No',null],'PERSONAL_SERVICE_VALIDATION_ANSWER');
 assert.equal(e.initialSelected,0,'PERSONAL_SERVICE_EMPTY_SELECTED');assert.equal(e.healthySibling,'Select additional recipients who needs to be served (Optional)','PERSONAL_SERVICE_EMPTY_SIBLING');
 if(variant==='baseline'){
  assert.equal(e.pagePath,eventPath(e.caseId)+'serviceOfDocuments2','PERSONAL_SERVICE_REQUIRED_PAGE');assert.equal(e.requiredError,`${PERSONAL_SERVICE_LABEL} is required`,'PERSONAL_SERVICE_REQUIRED_ERROR');assert.equal(e.cya,null,'PERSONAL_SERVICE_REQUIRED_CYA');assert.equal(observed.completed,true,'PERSONAL_SERVICE_BASELINE_INCOMPLETE');
 }else{
  assert.equal(variant,'optional','PERSONAL_SERVICE_VARIANT');cya(e.cya,e.caseId);assert.deepEqual(e.cyaControl,{label:'Protected value',value:'personal-service-empty-control',rowCount:1},'PERSONAL_SERVICE_EMPTY_CYA_CONTROL');assert.equal(e.requiredError,null,'PERSONAL_SERVICE_OPTIONAL_ERROR');assert.equal(observed.completed,false,'PERSONAL_SERVICE_FAULT_COMPLETED');assert.equal(observed.faultEffective,true,'PERSONAL_SERVICE_INEFFECTIVE_FAULT');
 }
 return {kind:'personal-service-observation-validated',variant,catalogueCredit:false,releaseCredit:false};
}
export function assertPersonalServiceOutcome(variant,terminal,observation,report) {
 assert.equal(terminal.signal,null,'PERSONAL_SERVICE_TERMINAL');assert.equal(terminal.code,variant==='baseline'?0:1,'PERSONAL_SERVICE_EXIT');
 assert.deepEqual(report.errors??[],[],'PERSONAL_SERVICE_FRAMEWORK_ERRORS');assert.equal(report.stats.skipped,0,'PERSONAL_SERVICE_SKIPPED');
 const specs=[];const visit=s=>{specs.push(...s.specs??[]);for(const child of s.suites??[])visit(child);};for(const suite of report.suites??[])visit(suite);
 assert.equal(specs.length,1,'PERSONAL_SERVICE_ONE_SPEC');assert.equal(specs[0].tests.length,1,'PERSONAL_SERVICE_ONE_TEST');const attempts=specs[0].tests[0].results;assert.equal(attempts.length,1,'PERSONAL_SERVICE_ONE_ATTEMPT');const r=attempts[0];assert.equal(r.retry,0,'PERSONAL_SERVICE_RETRY');
 assert.equal(r.status,variant==='baseline'?'passed':'failed','PERSONAL_SERVICE_TEST_STATUS');assert.equal(report.stats.expected,variant==='baseline'?1:0,'PERSONAL_SERVICE_EXPECTED_COUNT');assert.equal(report.stats.unexpected,variant==='baseline'?0:1,'PERSONAL_SERVICE_FAILURE_COUNT');
 assert.equal(r.errors.length,variant==='baseline'?0:1,'PERSONAL_SERVICE_EXTRA_FAILURE');
 if(variant==='optional'){
  assert.equal(observation.faultEffective,true,'PERSONAL_SERVICE_FAULT_WITNESS');assert(r.error?.message?.includes(PERSONAL_SERVICE_FAILURE)&&r.errors[0]?.message?.includes(PERSONAL_SERVICE_FAILURE),'PERSONAL_SERVICE_FAILURE_ATTRIBUTION');
  const steps=[];const walk=list=>{for(const s of list??[]){steps.push(s);walk(s.steps);}};walk(r.steps);assert.equal(steps.filter(s=>s.title==='harness-assertion:personal-service-required'&&s.error?.message?.includes(PERSONAL_SERVICE_FAILURE)).length,1,'PERSONAL_SERVICE_NAMED_FAILURE');
 }
 return variant==='baseline'?'personal-service-feasibility-observed':'personal-service-required-fault-detected';
}
// This is a non-credit raw reader, not an admission adapter. The caller supplies
// the actual observed framework terminal and held file hashes, never accepted flags.
export function readPersonalServiceEvidence(directory,{variant,actorId,terminal,files,sourceBinding,definitionVersion,owner,namespace,images}) {
 assert.deepEqual(sourceBinding,derivePersonalServiceFixture(variant).binding,'PERSONAL_SERVICE_EXPECTED_SOURCE');
 const names=['input.json','baseline/personal-service-observation.json','baseline/ccd-requests.jsonl','baseline/report.json','runtime/recipient-callback-import/receipt.json','runtime/recipient-callback-import/personal-service-stored-row-date.json'];
 assert.deepEqual(Object.keys(files).sort(),names.slice().sort(),'PERSONAL_SERVICE_EVIDENCE_FILES');
 const raw=Object.fromEntries(names.map(name=>{const file=path.join(directory,name);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'PERSONAL_SERVICE_EVIDENCE_ALIAS');const b=fs.readFileSync(file);assert(b.length<=16*1024*1024,'PERSONAL_SERVICE_EVIDENCE_SIZE');assert.equal(digestBytes(b),files[name],'PERSONAL_SERVICE_EVIDENCE_DIGEST');return[name,b.toString()];}));
 const input=JSON.parse(raw['input.json']),imported=JSON.parse(raw[names[4]]),date=JSON.parse(raw[names[5]]),observed=JSON.parse(raw[names[1]]),journal=raw[names[2]].trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)),report=JSON.parse(raw[names[3]]);
 assert.deepEqual(input.personalServiceBinding,sourceBinding,'PERSONAL_SERVICE_INPUT_BINDING');assert.equal(input.credentials.courtadmin.userId,actorId,'PERSONAL_SERVICE_ACTOR');assert.deepEqual(input.credentials.courtadmin.roles.slice().sort(),['caseworker','caseworker-harness','caseworker-privatelaw-courtadmin'],'PERSONAL_SERVICE_ROLES');
 assert.deepEqual([input.ccd.owner,input.ccd.namespace,input.ccd.images],[owner,namespace,images],'PERSONAL_SERVICE_INPUT_OWNER');assert.equal(input.variant,variant,'PERSONAL_SERVICE_INPUT_VARIANT');
 assert.equal(imported.status,'import-and-callback-descriptor-observed','PERSONAL_SERVICE_IMPORT');assert.equal(imported.observations.import.status,201,'PERSONAL_SERVICE_IMPORT_HTTP');
 assert.deepEqual([imported.owner,imported.namespace,imported.images],[owner,namespace,images],'PERSONAL_SERVICE_IMPORT_OWNER');assert.deepEqual(imported.seal.personalServiceBinding,sourceBinding,'PERSONAL_SERVICE_IMPORT_BINDING');
 assert.equal(imported.seal.definitionDigest,digestBytes(JSON.stringify(derivePersonalServiceFixture(variant).fixture,null,2)+'\n'),'PERSONAL_SERVICE_IMPORT_FIXTURE');
 assert.equal(imported.observations.definition.status,200,'PERSONAL_SERVICE_DESCRIPTOR_STATUS');assert.equal(imported.observations.pages.status,200,'PERSONAL_SERVICE_DESCRIPTOR_STATUS');
 const facets=validatePersonalServiceDescriptors(imported.observations.definition.body,imported.observations.pages.body,variant);assert.equal(facets.definitionVersion,definitionVersion,'PERSONAL_SERVICE_EXPECTED_VERSION');
 assert.deepEqual([date.owner,date.namespace,date.images],[owner,namespace,images],'PERSONAL_SERVICE_DATE_OWNER');validatePersonalServiceDate(date.rows,definitionVersion);
 validatePersonalServiceObservation(observed,journal,actorId,variant);
 return {status:assertPersonalServiceOutcome(variant,terminal,observed,report),obligationId:sourceBinding.obligationId,sourceComplete:false,catalogueCredit:false,releaseCredit:false};
}
