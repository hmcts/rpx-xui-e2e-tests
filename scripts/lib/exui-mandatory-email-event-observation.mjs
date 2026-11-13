import assert from 'node:assert/strict';
import { validateMandatoryEmailEventDerivation } from './exui-mandatory-email-event-validation.mjs';

const rows = ['name','address'];
const leaf = row => row === 'name' ? 'emailName' : 'emailAddress';
const title = row => `source event row requires email ${row} and preserves a filled value`;
const failure = row => `MANDATORY_EMAIL_${row.toUpperCase()}_REQUIRED_DENIAL`;
const route = id => `/cases/case-details/HARNESS/HarnessNestedPRL/${id}/trigger/serviceOfDocuments/`;
const noCredit = () => ({runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false});
export { title as mandatoryEmailTestTitle, failure as mandatoryEmailFailure };
// Independent literal expectation, never inferred from the submitted observation.
const initialData=()=>({protectedValue:'mandatory-email-control',sodAdditionalRecipients:['additionalRecipients'],sodAdditionalRecipientsList:[{id:'11111111-1111-4111-8111-111111111111',value:{serveByPostOrEmail:'email',emailInformation:{emailName:'Synthetic mandatory recipient',emailAddress:'mandatory@harness.example.com'},postalInformation:{postalName:null,postalAddress:{AddressLine1:null,AddressLine2:null,AddressLine3:null,PostTown:null,County:null,PostCode:null,Country:null}}}}]});
function initialControl(control){
  const {before,caseId}=control;
  assert(/^\d{16}$/.test(caseId),'MANDATORY_EMAIL_CASE_ID');
  assert.equal(String(before.state.id),caseId,'MANDATORY_EMAIL_CASE_ID');
  assert.equal(before.state.case_type_id,'HarnessNestedPRL','MANDATORY_EMAIL_CASE_TYPE');
  assert.equal(before.state.jurisdiction,'HARNESS','MANDATORY_EMAIL_JURISDICTION');
  assert.equal(before.state.state,'JUDICIAL_REVIEW','MANDATORY_EMAIL_STATE');
  assert(Number.isSafeInteger(before.state.version)&&before.state.version>=0,'MANDATORY_EMAIL_VERSION');
  assert(Number.isFinite(Date.parse(before.state.last_modified)),'MANDATORY_EMAIL_INITIAL_DATE');
  assert.deepEqual(before.state.case_data,initialData(),'MANDATORY_EMAIL_INITIAL_DATA');
  assert(Array.isArray(before.history),'MANDATORY_EMAIL_INITIAL_HISTORY');
  for(const event of before.history){
    assert(event&&typeof event==='object'&&!Array.isArray(event),'MANDATORY_EMAIL_INITIAL_HISTORY');
    assert(typeof event.id==='string'&&event.id.length>0&&typeof event.user_id==='string'&&event.user_id.length>0,'MANDATORY_EMAIL_INITIAL_HISTORY_ACTOR');
    assert.equal(event.case_type_id,'HarnessNestedPRL','MANDATORY_EMAIL_INITIAL_HISTORY_TYPE');
    assert.equal(event.state_id,'JUDICIAL_REVIEW','MANDATORY_EMAIL_INITIAL_HISTORY_STATE');
    assert(Number.isFinite(Date.parse(event.created_date)),'MANDATORY_EMAIL_INITIAL_HISTORY_DATE');
  }
}
function saved(control, actorId, omitted) {
  const {before,after,caseId,submission}=control;
  assert.deepEqual(submission,{method:'POST',path:`/data/cases/${caseId}/events`,status:201,eventId:'serviceOfDocuments'},'MANDATORY_EMAIL_SAVE');
  const expected=structuredClone(before.state.case_data);
  const info=expected.sodAdditionalRecipientsList[0].value.emailInformation;
  if(omitted){
    const actual=after.state.case_data.sodAdditionalRecipientsList[0].value.emailInformation;
    assert(Object.hasOwn(actual,leaf(omitted))&&[null,''].includes(actual[leaf(omitted)]),'MANDATORY_EMAIL_EMPTY_PERSISTED');
    info[leaf(omitted)]=actual[leaf(omitted)];
  }
  assert.deepEqual(after.state.case_data,expected,'MANDATORY_EMAIL_UNRELATED_DATA');
  const stable=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!['case_data','version','last_modified'].includes(k)));
  assert.deepEqual(stable(after.state),stable(before.state),'MANDATORY_EMAIL_UNRELATED_STATE');
  assert.equal(after.state.version,before.state.version+1,'MANDATORY_EMAIL_SAVED_VERSION');
  assert(Number.isFinite(Date.parse(after.state.last_modified))&&Date.parse(after.state.last_modified)>=Date.parse(before.state.last_modified),'MANDATORY_EMAIL_SAVED_DATE');
  const prior=event=>before.history.some(old=>old.id===event.id&&old.created_date===event.created_date);
  assert.deepEqual(after.history.filter(prior),before.history,'MANDATORY_EMAIL_PRIOR_HISTORY');
  assert.equal(after.history.length,before.history.length+1,'MANDATORY_EMAIL_HISTORY');
  const added=after.history.filter(event=>!prior(event));assert.equal(added.length,1,'MANDATORY_EMAIL_ONE_NEW_EVENT');
  const event=added[0];
  for(const [key,value] of Object.entries({id:'serviceOfDocuments',case_type_id:'HarnessNestedPRL',state_id:'JUDICIAL_REVIEW',user_id:actorId}))assert.equal(event[key],value,'MANDATORY_EMAIL_SAVED_ACTOR');
}
export function validateMandatoryEmailObservation(value,derivation,actorId){
  validateMandatoryEmailEventDerivation(derivation,value.variant);
  const selected=value.variant==='baseline'?null:value.variant.split('-')[0];
  assert(rows.includes(value.row)&&(!selected||value.row===selected),'MANDATORY_EMAIL_SELECTED_ROW');
  assert.equal(value.schemaVersion,1,'MANDATORY_EMAIL_SCHEMA');
  assert.equal(value.kind,'mandatory-email-event-observation','MANDATORY_EMAIL_KIND');
  assert.deepEqual(value.sourceBinding,derivation.binding,'MANDATORY_EMAIL_SOURCE_BINDING');
  assert.deepEqual(value.credit,noCredit(),'MANDATORY_EMAIL_NO_CREDIT');
  assert.deepEqual(value.controls,{nameLabel:selected==='name'?'Name (Optional)':'Name',addressLabel:selected==='address'?'Email address (Optional)':'Email address',nameBeforeAddress:true,inactivePost:true,emailRestored:true},'MANDATORY_EMAIL_CONTROLS');
  initialControl(value.filled);initialControl(value.empty);
  saved(value.filled,actorId,null);
  const filledInfo=value.filled.before.state.case_data.sodAdditionalRecipientsList[0].value.emailInformation;
  assert.deepEqual(filledInfo,{emailName:'Synthetic mandatory recipient',emailAddress:'mandatory@harness.example.com'},'MANDATORY_EMAIL_FILLED_CONTROL');
  assert.notEqual(value.filled.caseId,value.empty.caseId,'MANDATORY_EMAIL_DISTINCT_CASES');
  assert.deepEqual(value.empty.before.state.case_data,value.filled.before.state.case_data,'MANDATORY_EMAIL_HEALTHY_SIBLING');
  assert.equal(value.empty.inputValue,'','MANDATORY_EMAIL_BLANK_INPUT');
  assert(typeof value.empty.inputId==='string'&&value.empty.inputId.endsWith('_'+leaf(value.row)),'MANDATORY_EMAIL_INPUT_ID');
  if(selected){
    saved(value.empty,actorId,selected);
    assert.equal(value.empty.error,null,'MANDATORY_EMAIL_OPTIONAL_ERROR');
    assert.equal(value.empty.cya,'Check your answers','MANDATORY_EMAIL_OPTIONAL_CYA');
    assert.equal(value.completed,false,'MANDATORY_EMAIL_FAULT_COMPLETED');
    assert.equal(value.faultEffective,true,'MANDATORY_EMAIL_INEFFECTIVE_FAULT');
  }else{
    assert.deepEqual(value.empty.after,value.empty.before,'MANDATORY_EMAIL_REQUIRED_PERSISTENCE');
    assert.equal(value.empty.path,route(value.empty.caseId)+'serviceOfDocuments2','MANDATORY_EMAIL_REQUIRED_ROUTE');
    assert.deepEqual(value.empty.error,{forId:value.empty.inputId,text:(value.row==='name'?'Name':'Email address')+' is required'},'MANDATORY_EMAIL_REQUIRED_ERROR');
    assert.equal(value.empty.cya,null,'MANDATORY_EMAIL_REQUIRED_CYA');
    assert.equal(value.empty.submission,null,'MANDATORY_EMAIL_REQUIRED_SUBMISSION');
    assert.equal(value.completed,true,'MANDATORY_EMAIL_BASELINE_COMPLETED');
    assert.equal(value.faultEffective,false,'MANDATORY_EMAIL_BASELINE_FAULT');
  }
  return {kind:'mandatory-email-event-observation-validated',row:value.row,...noCredit()};
}
export function validateMandatoryEmailFramework(report,terminal,variant){
  assert(['baseline','name-optional','address-optional'].includes(variant),'MANDATORY_EMAIL_VARIANT');
  const expectedRows=variant==='baseline'?rows:[variant.split('-')[0]];
  assert.deepEqual(terminal,{code:variant==='baseline'?0:1,signal:null},'MANDATORY_EMAIL_TERMINAL');
  assert.deepEqual(report.errors??[],[],'MANDATORY_EMAIL_FRAMEWORK_ERRORS');
  const specs=[];const walk=s=>{specs.push(...s.specs??[]);for(const c of s.suites??[])walk(c);};for(const s of report.suites??[])walk(s);
  assert.deepEqual(specs.map(s=>s.title),expectedRows.map(title),'MANDATORY_EMAIL_TEST_SELECTION');
  assert.equal(report.stats.skipped,0,'MANDATORY_EMAIL_SKIPPED');
  assert.equal(report.stats.expected,variant==='baseline'?2:0,'MANDATORY_EMAIL_PASSED_COUNT');
  assert.equal(report.stats.unexpected,variant==='baseline'?0:1,'MANDATORY_EMAIL_FAILED_COUNT');
  for(const [index,spec] of specs.entries()){
    assert.equal(spec.tests.length,1,'MANDATORY_EMAIL_ONE_PROJECT');
    const results=spec.tests[0].results;assert.equal(results.length,1,'MANDATORY_EMAIL_ATTEMPTS');
    const r=results[0];assert.equal(r.retry,0,'MANDATORY_EMAIL_RETRY');
    assert.equal(r.status,variant==='baseline'?'passed':'failed','MANDATORY_EMAIL_STATUS');
    assert.equal(r.errors.length,variant==='baseline'?0:1,'MANDATORY_EMAIL_EXTRA_FAILURE');
    const stages=[];const visit=ss=>{for(const s of ss??[]){stages.push(s);visit(s.steps);}};visit(r.steps);
    if(variant==='baseline'){
      assert.equal(r.error,undefined,'MANDATORY_EMAIL_BASELINE_ERROR');
      assert(stages.every(s=>s.error===undefined),'MANDATORY_EMAIL_BASELINE_FAILED_STAGE');
    }
    if(variant!=='baseline'){
      const id=failure(expectedRows[index]);assert(r.error?.message?.includes(id)&&r.errors[0]?.message?.includes(id),'MANDATORY_EMAIL_FAILURE_ATTRIBUTION');
      assert.equal(stages.filter(s=>s.title===`harness-assertion:source-email-${expectedRows[index]}-required`&&s.error?.message?.includes(id)).length,1,'MANDATORY_EMAIL_NAMED_FAILURE');
      const expectedStage=`harness-assertion:source-email-${expectedRows[index]}-required`;
      assert.deepEqual(stages.filter(s=>s.title?.startsWith('harness-assertion:')).map(s=>s.title),[expectedStage],'MANDATORY_EMAIL_SOLE_FAILED_ORACLE');
      const failedTree=(list,inside=false)=>{let failedBranches=0;for(const s of list??[]){
        const owned=inside||s.title===expectedStage;
        if(s.error)assert(owned&&s.error.message?.includes(id),'MANDATORY_EMAIL_UNRELATED_FAILED_STAGE');
        const childFailed=failedTree(s.steps,owned);
        if(s.error||childFailed)failedBranches++;
      }assert(failedBranches<=1,'MANDATORY_EMAIL_MULTIPLE_FAILURE_BRANCHES');return failedBranches===1;};failedTree(r.steps);
    }
  }
  return {kind:'mandatory-email-event-framework-validated',baselineTests:variant==='baseline'?2:0,effectiveFaultTests:variant==='baseline'?0:1,...noCredit()};
}
