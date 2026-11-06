import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sourceProfileJurisdictionConfiguration} from './exui-source-profile-jurisdictions.mjs';
import {CANDIDATE_URL} from './exui-candidate-runtime.mjs';
import {digestBytes} from './exui-evidence-io.mjs';

export const IA_WA_SCOPE='exui-source-profile-ia-wa-positive-feasibility';
export const IA_WA_FAULT='source-profile-remove-ia-wa-membership';
const membership='IA,CIVIL,PRIVATELAW,PUBLICLAW,EMPLOYMENT,ST_CIC,PCS';
const calls=[
  {route:'case-event',family:'IA',caseId:'3333444455556666',caseType:'HarnessPositiveIA',eventId:'positiveRouteIA',marker:'positive-ia-route'},
  {route:'case-event',family:'CIVIL',caseId:'7777888899990000',caseType:'HarnessPositiveCIVIL',eventId:'positiveRouteCIVIL',marker:'positive-civil-route'},
  {route:'post',family:'IA',caseId:'5555666677778888',caseType:'HarnessPositiveIA',eventId:'positivePostIA',marker:'positive-ia-post'},
  {route:'post',family:'CIVIL',caseId:'8888999900001111',caseType:'HarnessPositiveCIVIL',eventId:'positivePostCIVIL',marker:'positive-civil-post'},
];
const credits={runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false};
const assertMutation=mutation=>assert(mutation===null||mutation===IA_WA_FAULT,'SOURCE_PROFILE_UNKNOWN_FAULT');
export function iaWaConfiguration(candidateRoot,mutation=null) {
  assertMutation(mutation);
  const base=sourceProfileJurisdictionConfiguration(candidateRoot),config=base.config;
  assert.equal(config.waSupportedJurisdictions,membership,'SOURCE_PROFILE_IA_WA_CONFIG');
  assert.equal(config.feature.workAllocationEnabled,false,'SOURCE_PROFILE_WA_DEFAULT');
  if(mutation)config.waSupportedJurisdictions=config.waSupportedJurisdictions.split(',').filter(id=>id!=='IA').join(',');
  return {config,digest:digestBytes(JSON.stringify(config)),contract:{scope:IA_WA_SCOPE,sourceRevision:base.contract.sourceRevision,sourceDigest:base.contract.sourceDigest,families:['IA','CIVIL'],facet:'IA positive WA membership with CIVIL control',mutation,entrypoints:['POST /workallocation/searchForCompletable','GET /workallocation/case/tasks/:caseId/event/:eventId/caseType/:caseType/jurisdiction/:jurisdiction'],exclusions:['Synthetic authentication and upstream task data','No case-view tabs, CCD permissions or deployed IA service claim'],...credits}};
}
export function validateIaWaObservations(observations,journal,mutation=null) {
  assertMutation(mutation);
  assert.equal(observations.length,calls.length,'SOURCE_PROFILE_IA_WA_OBSERVATIONS');
  for(const [index,call]of calls.entries()) {
    assert.equal(observations[index].status,200,'SOURCE_PROFILE_IA_WA_TRANSPORT');
    const body=mutation&&call.family==='IA'?[]:[{id:call.marker,name:'Synthetic positive membership task'}];
    assert.deepEqual(observations[index],{route:call.route,family:call.family,status:200,body},'SOURCE_PROFILE_IA_WA_RESPONSE');
  }
  const expected=calls.filter(call=>!mutation||call.family==='CIVIL').map(call=>({method:'POST',path:'/task/search-for-completable',body:{case_id:call.caseId,case_jurisdiction:call.family,case_type:call.caseType,event_id:call.eventId}}));
  assert.deepEqual(journal,expected,'SOURCE_PROFILE_IA_WA_JOURNAL');
  if(mutation)throw Error('SOURCE_PROFILE_IA_WA_ASSERTION');
  return {facet:'IA positive WA membership with CIVIL control',families:['IA','CIVIL'],...credits};
}
export async function probeIaWa({cookie,output,readJournal,mutation=null,request=fetch}) {
  assertMutation(mutation);
  assert(typeof cookie==='string'&&cookie.length>0,'SOURCE_PROFILE_SESSION_REQUIRED');
  assert(typeof readJournal==='function','SOURCE_PROFILE_JOURNAL_REQUIRED');
  assert.deepEqual(readJournal(),[],'SOURCE_PROFILE_IA_WA_JOURNAL');
  const observations=[];let csrfToken;
  for(const call of calls) {
    const post=call.route==='post',route=post?'/workallocation/searchForCompletable':`/workallocation/case/tasks/${call.caseId}/event/${call.eventId}/caseType/${call.caseType}/jurisdiction/${call.family}`;
    const response=await request(CANDIDATE_URL+route,{method:post?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{cookie:`xui-webapp=${encodeURIComponent(cookie)}`,...(post?{'content-type':'application/json','x-xsrf-token':csrfToken}:{})},...(post?{body:JSON.stringify({searchRequest:{ccdId:call.caseId,jurisdiction:call.family,caseTypeId:call.caseType,eventId:call.eventId}})}:{})});
    if(response.status!==200)fs.writeFileSync(path.join(output,'profile-ia-wa-transport.json'),JSON.stringify({route:call.route,family:call.family,status:Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null}),{mode:0o600});
    assert.equal(response.status,200,'SOURCE_PROFILE_IA_WA_TRANSPORT');
    if(!post) {
      const tokens=response.headers.getSetCookie().filter(value=>value.startsWith('XSRF-TOKEN='));
      assert.equal(tokens.length,1,'SOURCE_PROFILE_IA_WA_CSRF');
      csrfToken=decodeURIComponent(tokens[0].split(';',1)[0].slice('XSRF-TOKEN='.length));
      assert(/^[A-Za-z0-9_-]{1,512}$/.test(csrfToken),'SOURCE_PROFILE_IA_WA_CSRF');
    }
    observations.push({route:call.route,family:call.family,status:response.status,body:await response.json()});
  }
  const journal=readJournal();
  fs.writeFileSync(path.join(output,'profile-ia-wa-observations.json'),JSON.stringify({observations,journal,mutation,catalogueCredit:false}),{mode:0o600});
  return validateIaWaObservations(observations,journal,mutation);
}
