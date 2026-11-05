import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateRunManifest } from './exui-release-evidence.mjs';
import { SHARED_NESTED_FACETS, SHARED_NESTED_FAULT, SHARED_NESTED_SCOPE, SHARED_NESTED_MUTATIONS, sharedNestedValues } from './exui-shared-nested-contract.mjs';
export { writeJsonAtomic as saveSharedNestedObservation } from './exui-evidence-io.mjs';
const exact = (value,keys,code) => assert.deepEqual(Object.keys(value??{}).sort(),[...keys].sort(),code);
function noCredentials(value){if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){assert(!/authorization|password|cookie|bearer|token|secret/i.test(key),'SHARED_NESTED_CREDENTIAL_KEY');noCredentials(child);}}
const empty = value => value == null || value === '' || (typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(empty));
const uuid = value => typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function sharedNestedBinding(manifest,context) {
  validateRunManifest(manifest);
  assert.equal(manifest.releaseScopeId,SHARED_NESTED_SCOPE,'SHARED_NESTED_SCOPE');
  assert(['baseline',...SHARED_NESTED_MUTATIONS].includes(context?.invocationId),'SHARED_NESTED_INVOCATION');
  const common=Object.fromEntries(['runId','harnessCommit','releaseScopeId','policyDigest','identity'].map(key=>[key,manifest[key]]));
  assert.deepEqual(context,{...common,invocationId:context.invocationId,harnessSourceState:manifest.runtimeMetadata.harnessSourceState,harnessSourceDigest:manifest.runtimeMetadata.harnessSourceDigest},'SHARED_NESTED_CONTEXT');
  assert.equal(manifest.runtimeMetadata.harnessSourceState,'clean','SHARED_NESTED_PRODUCER');
  const metadata=Object.fromEntries(['harnessSourceDigest','definitionImportDigest','observedDefinitionDigest','definitionVersion','ccdNamespace'].map(key=>[key,manifest.runtimeMetadata[key]]));
  for(const key of ['harnessSourceDigest','definitionImportDigest','observedDefinitionDigest'])assert(/^sha256:[a-f0-9]{64}$/.test(metadata[key]??''),'SHARED_NESTED_PROVENANCE');
  assert(/^[1-9][0-9]*$/.test(metadata.definitionVersion??'')&&/^[a-zA-Z0-9-]{1,100}$/.test(metadata.ccdNamespace??''),'SHARED_NESTED_IMPORT');
  return structuredClone({...common,invocationId:context.invocationId,...metadata});
}
export function currentSharedNestedBinding() {
  return sharedNestedBinding(JSON.parse(fs.readFileSync(process.env.EXUI_CANDIDATE_RUN_MANIFEST,'utf8')),JSON.parse(fs.readFileSync(process.env.EXUI_EVIDENCE_CONTEXT,'utf8')));
}
export function assertSharedNestedRecipients(rows,expected,ids) {
  assert(Array.isArray(rows)&&rows.length===expected.length,'SHARED_NESTED_RECIPIENT_COUNT');
  if(ids)assert(rows.every(row=>uuid(row.id))&&new Set(rows.map(row=>row.id)).size===rows.length,'SHARED_NESTED_IDS');
  for(const [index,row] of rows.entries()) {
    exact(row,['id','value'],'SHARED_NESTED_ITEM_SCHEMA');
    assert(row.id===null||uuid(row.id),'SHARED_NESTED_PAYLOAD_ID');
    const active=expected[index].serveByPostOrEmail==='email'?'emailInformation':'postalInformation';
    const inactive=active==='emailInformation'?'postalInformation':'emailInformation';
    assert(Object.keys(row.value).every(key=>['serveByPostOrEmail',active,inactive].includes(key)),'SHARED_NESTED_EXTRA_CHILD');
    assert.deepEqual({serveByPostOrEmail:row.value.serveByPostOrEmail,[active]:row.value[active]},expected[index],'SHARED_NESTED_VALUES');
    if(Object.hasOwn(row.value,inactive))assert(empty(row.value[inactive]),'SHARED_NESTED_INACTIVE_CHILD');
  }
}
function markers(value) {
  return value.serveByPostOrEmail==='email'?[value.emailInformation.emailName,value.emailInformation.emailAddress].filter(Boolean):Object.values(value.postalInformation).flatMap(item=>typeof item==='string'?[item]:Object.values(item).filter(Boolean));
}
function rows(value,expected,code) {
  assert(Array.isArray(value)&&value.length===expected.length,code);
  for(const [index,row] of value.entries()) {
    assert(typeof row==='string'&&row.length<8192,code);
    for(const marker of markers(expected[index]))assert(row.includes(marker),code);
    assert(row.includes(expected[index].serveByPostOrEmail==='email'?'Email':'Post'),code);
    for(const [other,recipient] of expected.entries())if(other!==index)assert(!row.includes(markers(recipient)[0]),code);
  }
}
const labels={emailName:'Name',emailAddress:'Email address',postalName:'Name',AddressLine1:'Building and Street',AddressLine2:'Address Line 2 (Optional)',AddressLine3:'Address Line 3 (Optional)',PostTown:'Town or City (Optional)',County:'County (Optional)',PostCode:'Postcode/Zipcode',Country:'Country (Optional)'};
function fieldOrder(observed,channel,count,expected) {
  const fields=['serveByPostOrEmail',...(channel==='email'?['emailName','emailAddress']:['postalName','AddressLine1','AddressLine2','AddressLine3','PostTown','County','PostCode','Country'])];
  assert(Array.isArray(observed)&&observed.length===count*fields.length,'SHARED_NESTED_CONTROL_SELECTION');
  for(let index=0;index<count;index++) {
    const controls=observed.filter(row=>row.index===index);
    assert.deepEqual(controls.map(row=>row.field),fields,'SHARED_NESTED_CONTROL_SELECTION');
    for(const [position,control] of controls.entries()) {
      const radio=control.field==='serveByPostOrEmail';
      exact(control,['index','field','domId','label','domIndex','visible','value','classes',...(radio?['checked','oppositeChecked']:[])],'SHARED_NESTED_CONTROL_SCHEMA');
      assert(typeof control.domId==='string'&&control.domId.length>0&&control.visible===true,'SHARED_NESTED_CONTROL_VISIBILITY');
      assert.equal(control.label,control.field==='serveByPostOrEmail'?(channel==='email'?'Email':'Post'):labels[control.field],'SHARED_NESTED_SOURCE_LABEL');
      const intended=control.field==='serveByPostOrEmail'?channel:channel==='email'?expected[index].emailInformation[control.field]:control.field==='postalName'?expected[index].postalInformation.postalName:expected[index].postalInformation.postalAddress[control.field];
      if(radio){assert.equal(typeof control.value,'string','SHARED_NESTED_RADIO_DOM_VALUE');assert.equal(control.checked,true,'SHARED_NESTED_RADIO_SELECTED');assert.equal(control.oppositeChecked,false,'SHARED_NESTED_RADIO_OPPOSITE');}
      else assert.equal(control.value,intended,'SHARED_NESTED_VISIBLE_VALUE');
      assert(Number.isSafeInteger(control.domIndex)&&control.domIndex>=0,'SHARED_NESTED_CONTROL_ORDER');
      if(position)assert(control.domIndex>controls[position-1].domIndex,'SHARED_NESTED_CONTROL_ORDER');
    }
  }
}
export function replaySharedNestedObservation(value,{binding,actorId,facetId,mutation=null}) {
  noCredentials(value);
  exact(value,['schemaVersion','binding','facetId','caseId','actorId','before','radioMandatory','legends','visibility','mandatory','postalMandatory','optional','filledControls','cyaRows','request','status','after','savedRows','reread'],'SHARED_NESTED_OBSERVATION_SCHEMA');
  assert.equal(value.schemaVersion,1,'SHARED_NESTED_OBSERVATION_SCHEMA');assert.deepEqual(value.binding,binding,'SHARED_NESTED_BINDING');
  assert.equal(value.actorId,actorId,'SHARED_NESTED_ACTOR');assert.equal(value.facetId,facetId,'SHARED_NESTED_FACET');
  const facet=SHARED_NESTED_FACETS.find(row=>row.id===facetId);assert(facet,'SHARED_NESTED_FACET');
  assert(mutation===null||(SHARED_NESTED_MUTATIONS.includes(mutation)&&facetId===(mutation==='ccd-drop-postal-optional-child'?'nested-post-2':'nested-email-2')),'SHARED_NESTED_FAULT_FACET');
  assert.equal(binding.invocationId,mutation??'baseline','SHARED_NESTED_INVOCATION');
  assert(/^[0-9]{16}$/.test(value.caseId),'SHARED_NESTED_CASE');
  for(const observed of [value.before,value.after,value.reread]) {
    assert.equal(String(observed.state.id),value.caseId,'SHARED_NESTED_CASE');
    assert.equal(observed.state.case_type_id,'HarnessNestedPRL','SHARED_NESTED_CASE_TYPE');
    assert.equal(observed.state.jurisdiction,'HARNESS','SHARED_NESTED_JURISDICTION');
    assert.equal(observed.state.state,'Created','SHARED_NESTED_STATE');
    assert(Number.isSafeInteger(observed.state.version),'SHARED_NESTED_VERSION');
    assert(Array.isArray(observed.history),'SHARED_NESTED_HISTORY');
  }
  assert.deepEqual(value.before.state.case_data,{protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[]},'SHARED_NESTED_BEFORE');
  const expected=sharedNestedValues(facet.channel,facet.recipientCount);
  assert.deepEqual(value.legends,Array(facet.recipientCount).fill('Served by'),'SHARED_NESTED_SOURCE_LEGEND');
  exact(value.radioMandatory,['cyaHeadings','groups'],'SHARED_NESTED_RADIO_SCHEMA');assert.deepEqual(value.radioMandatory.cyaHeadings,[],'SHARED_NESTED_RADIO_CYA');
  assert.equal(value.radioMandatory.groups.length,facet.recipientCount,'SHARED_NESTED_RADIO_SELECTION');
  for(const [index,group] of value.radioMandatory.groups.entries()){assert.equal(group.index,index,'SHARED_NESTED_RADIO_SELECTION');assert.equal(group.selectedEmail,false,'SHARED_NESTED_RADIO_VALUE');assert.equal(group.selectedPost,false,'SHARED_NESTED_RADIO_VALUE');assert(group.classes.includes('form-group-error')&&typeof group.errorText==='string'&&group.errorText.length>0,'SHARED_NESTED_RADIO_VALIDATION');}
  assert.deepEqual(value.visibility,Array.from({length:facet.recipientCount},(_,index)=>({index,email:{emailName:true,emailAddress:true,postalName:false},post:{emailName:false,emailAddress:false,postalName:true}})),'SHARED_NESTED_CONDITIONAL_VISIBILITY');
  exact(value.mandatory,['cyaHeadings','controls'],'SHARED_NESTED_MANDATORY_SCHEMA');assert.deepEqual(value.mandatory.cyaHeadings,[],'SHARED_NESTED_MANDATORY_CYA');
  const required=facet.channel==='email'?['emailName','emailAddress']:['postalName','postcodeLookup'];
  assert.equal(value.mandatory.controls.length,facet.recipientCount*2,'SHARED_NESTED_MANDATORY_SELECTION');
  for(let index=0;index<facet.recipientCount;index++)for(const field of required) {
    const matches=value.mandatory.controls.filter(row=>row.index===index&&row.field===field);assert.equal(matches.length,1,'SHARED_NESTED_MANDATORY_SELECTION');
    const control=matches[0];assert.equal(control.value,'','SHARED_NESTED_MANDATORY_VALUE');assert.equal(control.visible,true,'SHARED_NESTED_MANDATORY_VISIBILITY');assert(control.classes.includes('govuk-input--error'),'SHARED_NESTED_MANDATORY_ERROR');
  }
  assert(Array.isArray(value.postalMandatory),'SHARED_NESTED_POSTCODE_SELECTION');
  assert.equal(value.postalMandatory.length,facet.channel==='post'?facet.recipientCount*2:0,'SHARED_NESTED_POSTCODE_SELECTION');
  for(const [position,check] of value.postalMandatory.entries()) {
    const index=Math.floor(position/2),field=['AddressLine1','PostCode'][position%2];
    exact(check,['index','field','intended','cyaHeadings','controls'],'SHARED_NESTED_POSTCODE_SCHEMA');
    assert.equal(check.index,index,'SHARED_NESTED_POSTCODE_SELECTION');
    assert.equal(check.field,field,'SHARED_NESTED_POSTCODE_SELECTION');
    const blank=structuredClone(expected);blank[index].postalInformation.postalAddress[field]='';
    assert.deepEqual(check.intended,blank,'SHARED_NESTED_POSTCODE_ISOLATION');
    assert.deepEqual(check.cyaHeadings,[],'SHARED_NESTED_POSTCODE_CYA');
    assert.equal(check.controls.length,facet.recipientCount,'SHARED_NESTED_POSTCODE_SELECTION');
    const target=check.controls.find(row=>row.index===index&&row.field===field);
    assert(target&&target.value===''&&target.visible===true&&target.classes.includes('govuk-input--error'),'SHARED_NESTED_POSTCODE_VALIDATION');
  }
  if(facet.channel==='post') {
    const blank=structuredClone(expected);for(const recipient of blank)recipient.postalInformation.postalAddress.AddressLine2='';
    rows(value.optional?.cyaRows,blank,'SHARED_NESTED_OPTIONAL_BLANK_CYA');
    assert.deepEqual(value.optional.restored,blank,'SHARED_NESTED_OPTIONAL_RESTORE');
  } else assert.equal(value.optional,null,'SHARED_NESTED_OPTIONAL_DISPOSITION');
  fieldOrder(value.filledControls,facet.channel,facet.recipientCount,expected);
  rows(value.cyaRows,expected,'SHARED_NESTED_CYA_ASSOCIATION');
  exact(value.request,['method','path','body'],'SHARED_NESTED_REQUEST_SCHEMA');exact(value.request.body,['data','event'],'SHARED_NESTED_REQUEST_BODY');exact(value.request.body.event,['id'],'SHARED_NESTED_REQUEST_EVENT');assert.equal(value.request.method,'POST','SHARED_NESTED_REQUEST');assert.equal(value.request.path,`/data/cases/${value.caseId}/events`,'SHARED_NESTED_REQUEST');assert.equal(value.request.body.event.id,'update','SHARED_NESTED_EVENT');
  const payload=value.request.body.data;exact(payload,['protectedValue','sodAdditionalRecipientsList'],'SHARED_NESTED_PAYLOAD');assert.equal(payload.protectedValue,'synthetic-protected-original','SHARED_NESTED_CONTROL');assertSharedNestedRecipients(payload.sodAdditionalRecipientsList,expected,false);
  assert.equal(value.status,201,'SHARED_NESTED_SUCCESSFUL_WRITE');
  const persistedExpected=structuredClone(mutation===SHARED_NESTED_FAULT?expected.slice(0,1):expected);
  if(mutation==='ccd-drop-child')for(const row of persistedExpected)delete row.emailInformation.emailAddress;
  if(mutation==='ccd-drop-postal-optional-child')delete persistedExpected[1].postalInformation.postalAddress.AddressLine2;
  const actual=value.after.state.case_data;exact(actual,['protectedValue','sodAdditionalRecipientsList'],'SHARED_NESTED_SAVED_DATA');assert.equal(actual.protectedValue,payload.protectedValue,'SHARED_NESTED_CONTROL');assertSharedNestedRecipients(actual.sodAdditionalRecipientsList,persistedExpected,true);
  for(const [index,recipient] of actual.sodAdditionalRecipientsList.entries()) {
    assert.deepEqual(recipient.value,persistedExpected[index],'SHARED_NESTED_SIBLING_INTEGRITY');
    const sent=payload.sodAdditionalRecipientsList[index].id;if(uuid(sent))assert.equal(recipient.id,sent,'SHARED_NESTED_ID_PRESERVATION');
  }
  assert.equal(value.after.state.version,value.before.state.version+1,'SHARED_NESTED_VERSION');
  assert.deepEqual(value.after.history.filter(row=>row.id!=='update'),value.before.history,'SHARED_NESTED_AUDIT_PRESERVATION');assert.equal(value.after.history.filter(row=>row.id==='update').length,1,'SHARED_NESTED_AUDIT_ONCE');
  rows(value.savedRows,persistedExpected,'SHARED_NESTED_SAVED_VIEW');assert.deepEqual(value.reread,value.after,'SHARED_NESTED_INDEPENDENT_REREAD');
  return {facetId,recipientCount:actual.sodAdditionalRecipientsList.length,intendedRecipientCount:facet.recipientCount,mutation};
}
