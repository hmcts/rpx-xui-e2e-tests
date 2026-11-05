import assert from "node:assert/strict";
// Toolkit CasesService media constants and CCD CaseDataContent reference96eaf99f.
const validateMedia="application/vnd.uk.gov.hmcts.ccd-data-store-api.case-data-validate.v2+json;charset=UTF-8";
const submitMedia="application/vnd.uk.gov.hmcts.ccd-data-store-api.create-event.v2+json;charset=UTF-8";
const base="/caseworkers/";
export async function probeRecipientCallbackBackend({mode,credentials,request,readJournal,record}) {
  assert(["normalize","reject"].includes(mode),"CALLBACK_PROBE_MODE");
  const allowed=credentials.allowed,courtadmin=credentials.courtadmin,observer=credentials.observer;
  assert(new Set([allowed.userId,courtadmin.userId,observer.userId]).size===3,"CALLBACK_PROBE_ACTOR_ISOLATION");
  const prefix=actor=>`${base}${actor.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL`;
  const data={protectedValue:"synthetic-callback-control",sodAdditionalRecipients:["additionalRecipients"],sodAdditionalRecipientsList:[
    {id:"11111111-1111-4111-8111-111111111111",value:{serveByPostOrEmail:"email",emailInformation:{emailName:"HARNESS_CALLBACK_ORIGINAL",emailAddress:"first@harness.example.com"}}},
    {id:"22222222-2222-4222-8222-222222222222",value:{serveByPostOrEmail:"email",emailInformation:{emailName:"Synthetic sibling",emailAddress:"second@harness.example.com"}}},
  ]};
  const token=await request(`${prefix(allowed)}/event-triggers/create/token`,allowed);assert.equal(token.status,200,"CALLBACK_PROBE_CREATE_TOKEN");
  assert.equal(typeof token.body.token,"string","CALLBACK_PROBE_TOKEN_SCHEMA");
  const created=await request(`${prefix(allowed)}/cases`,allowed,{method:"POST",body:{data,event:{id:"create"},event_token:token.body.token,ignore_warning:false}});
  assert.equal(created.status,201,"CALLBACK_PROBE_CREATE");const caseId=String(created.body.id);assert(/^\d{16}$/.test(caseId),"CALLBACK_PROBE_CASE_ID");
  const observe=async()=>{const state=await request(`${prefix(observer)}/cases/${caseId}`,observer),history=await request(`${prefix(observer)}/cases/${caseId}/events`,observer);assert.equal(state.status,200);assert.equal(history.status,200);return {state:state.body,history:history.body};};
  const before=await observe();assert.deepEqual(before.state.case_data.sodAdditionalRecipientsList,data.sodAdditionalRecipientsList);
  const eventToken=await request(`${prefix(courtadmin)}/cases/${caseId}/event-triggers/serviceOfDocuments/token`,courtadmin);assert.equal(eventToken.status,200,"CALLBACK_PROBE_EVENT_TOKEN");
  assert.equal(typeof eventToken.body.token,"string","CALLBACK_PROBE_EVENT_TOKEN_SCHEMA");
  const eventData=structuredClone(before.state.case_data);
  if(mode==="reject")eventData.sodAdditionalRecipientsList[0].value.emailInformation.emailName="HARNESS_CALLBACK_REJECT";
  // Toolkit buildCaseEventData sends full edited form separately as event_data;
  // CCD CaseService overlays that property onto persisted state before mid-event callbacks.
  const formData={sodAdditionalRecipients:eventData.sodAdditionalRecipients,sodAdditionalRecipientsList:eventData.sodAdditionalRecipientsList};
  const validation=await request('/case-types/HarnessNestedPRL/validate?pageId=serviceOfDocuments2',courtadmin,{method:"POST",headers:{accept:validateMedia,experimental:"true"},body:{data:formData,event_data:formData,event:{id:"serviceOfDocuments"},event_token:eventToken.body.token,case_reference:caseId,ignore_warning:false}});
  const afterValidation=await observe();
  record("validation",{caseId,status:validation.status,body:validation.body,before,afterValidation});
  assert.deepEqual(afterValidation,before,"CALLBACK_PROBE_VALIDATION_PERSISTED");
  const journal=readJournal();assert(journal.length>0,"CALLBACK_PROBE_NO_CALLBACK");
  assert(journal.every(item=>item.invocationId===`recipient-callback-${mode}`&&item.recipientCount===2&&/^sha256:[a-f0-9]{64}$/.test(item.requestDigest??"")&&/^sha256:[a-f0-9]{64}$/.test(item.responseDigest??"")),"CALLBACK_PROBE_JOURNAL_BINDING");
  if(mode==="reject"){
    assert(journal.some(item=>item.outcome==="business-rejected"),"CALLBACK_PROBE_NO_BUSINESS_ERROR");
    assert(validation.status>=400&&validation.status<500,"CALLBACK_PROBE_BUSINESS_STATUS");
    assert(JSON.stringify(validation.body).includes("HARNESS_CALLBACK_BUSINESS_REJECTION"),"CALLBACK_PROBE_BUSINESS_MESSAGE");
    return {mode,caseId,status:"business-rejection-observed",runtimeAcceptance:false,catalogueCredit:false};
  }
  assert(journal.some(item=>item.outcome==="normalized"),"CALLBACK_PROBE_NO_NORMALIZATION");
  assert.equal(validation.status,200,"CALLBACK_PROBE_VALIDATE");
  // CCD CaseDataValidatorController/CaseDataResource returns {data,...};
  // AuthorisedValidateCaseFieldsOperation wraps callback-updated/restored data.
  const returned=validation.body.data;assert(returned&&typeof returned==="object","CALLBACK_PROBE_VALIDATION_SCHEMA");
  const intended=structuredClone(eventData);intended.sodAdditionalRecipientsList[0].value.emailInformation.emailName="HARNESS_CALLBACK_NORMALIZED";
  assert.deepEqual(returned,intended,"CALLBACK_PROBE_NORMALIZED_DATA");
  const submitted=await request(`/cases/${caseId}/events`,courtadmin,{method:"POST",headers:{accept:submitMedia,experimental:"true"},body:{data:{sodAdditionalRecipients:returned.sodAdditionalRecipients,sodAdditionalRecipientsList:returned.sodAdditionalRecipientsList},event:{id:"serviceOfDocuments"},event_token:eventToken.body.token,ignore_warning:false}});
  const after=await observe();record("submission",{status:submitted.status,before,after});
  assert.equal(submitted.status,201,"CALLBACK_PROBE_SUBMIT");assert.deepEqual(after.state.case_data,intended,"CALLBACK_PROBE_PERSISTED_NORMALIZATION");
  assert.equal(after.state.version,before.state.version+1,"CALLBACK_PROBE_VERSION");assert.equal(after.history.length,before.history.length+1,"CALLBACK_PROBE_HISTORY");
  return {mode,caseId,status:"normalization-and-persistence-observed",runtimeAcceptance:false,catalogueCredit:false};
}
