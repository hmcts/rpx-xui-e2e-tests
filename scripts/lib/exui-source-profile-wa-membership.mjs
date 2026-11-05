import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sourceProfileJurisdictionConfiguration} from './exui-source-profile-jurisdictions.mjs';
import {CANDIDATE_URL} from './exui-candidate-runtime.mjs';
import {digestBytes} from './exui-evidence-io.mjs';

export const WA_MEMBERSHIP_SCOPE = 'exui-source-profile-wa-membership-feasibility';
export const WA_MEMBERSHIP_FAULT = 'source-profile-add-cmc-wa-membership';
export const DIVORCE_WA_SCOPE='exui-source-profile-divorce-wa-feasibility';
export const DIVORCE_WA_FAULT='source-profile-add-divorce-wa-membership';
const sourceMembership = 'IA,CIVIL,PRIVATELAW,PUBLICLAW,EMPLOYMENT,ST_CIC,PCS';
const cmcCalls = [
  {route:'case-event',family:'CMC',caseId:'9999000011112222',caseType:'HarnessMembershipCMC',eventId:'profileRouteCMC',marker:'membership-cmc-route'},
  {route:'case-event',family:'IA',caseId:'3333444455556666',caseType:'HarnessMembershipIA',eventId:'profileRouteIA',marker:'membership-ia-route'},
  {route:'post',family:'CMC',caseId:'1111222233334444',caseType:'HarnessMembershipCMC',eventId:'profilePostCMC',marker:'membership-cmc-post'},
  {route:'post',family:'IA',caseId:'5555666677778888',caseType:'HarnessMembershipIA',eventId:'profilePostIA',marker:'membership-ia-post'},
];
const callsFor=family=>{assert(['CMC','DIVORCE'].includes(family),'SOURCE_PROFILE_MEMBERSHIP_CONFIG');return family==='CMC'?cmcCalls:cmcCalls.map(call=>call.family==='CMC'?{...call,family:'DIVORCE',caseType:'HarnessMembershipDIVORCE',marker:call.marker.replace('cmc','divorce')}:call);};
const faultFor=family=>{callsFor(family);return family==='DIVORCE'?DIVORCE_WA_FAULT:WA_MEMBERSHIP_FAULT;};
const credits = {runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false};

export function sourceProfileWaMembershipConfiguration(candidateRoot, mutation = null, family='CMC') {
  const fault=faultFor(family);assert(mutation===null||mutation===fault,'SOURCE_PROFILE_UNKNOWN_FAULT');
  const original=sourceProfileJurisdictionConfiguration(candidateRoot),config=original.config;
  assert.equal(config.waSupportedJurisdictions,sourceMembership,'SOURCE_PROFILE_MEMBERSHIP_CONFIG');
  assert.equal(config.feature.workAllocationEnabled,false,'SOURCE_PROFILE_WA_DEFAULT');
  if(mutation)config.waSupportedJurisdictions+=','+family;
  return {config,digest:digestBytes(JSON.stringify(config)),contract:{
    ...original.contract,scope:family==='DIVORCE'?DIVORCE_WA_SCOPE:WA_MEMBERSHIP_SCOPE,families:[family,'IA'],facet:'WA completable-task jurisdiction membership',mutation,
    entrypoints:['POST /workallocation/searchForCompletable','GET /workallocation/case/tasks/:caseId/event/:eventId/caseType/:caseType/jurisdiction/:jurisdiction'],
    exclusions:['Synthetic authentication and upstream task data','No CCD case creation or authorization proof','No case-view tabs or whole-family configuration proof'],
    unresolved:['Remaining source-profile capabilities and reviewed whole-profile admission'],...credits,
  }};
}

export function validateWaMembershipObservations(observations, journal, mutation = null, family='CMC') {
  const fault=faultFor(family);assert(mutation===null||mutation===fault,'SOURCE_PROFILE_UNKNOWN_FAULT');
  const calls=callsFor(family);
  assert.equal(observations.length,calls.length,'SOURCE_PROFILE_MEMBERSHIP_OBSERVATIONS');
  for(const [index,call] of calls.entries()) {
    const observation=observations[index];
    assert.equal(observation.status,200,'SOURCE_PROFILE_MEMBERSHIP_TRANSPORT');
    assert.deepEqual(observation,{route:call.route,family:call.family,status:200,
      body:mutation||call.family==='IA'?[{id:call.marker,name:'Synthetic membership task'}]:[]},'SOURCE_PROFILE_MEMBERSHIP_RESPONSE');
  }
  const expected=calls.filter(call=>mutation||call.family==='IA').map(call=>({method:'POST',path:'/task/search-for-completable',
    body:{case_id:call.caseId,case_jurisdiction:call.family,case_type:call.caseType,event_id:call.eventId}}));
  assert.deepEqual(journal,expected,'SOURCE_PROFILE_MEMBERSHIP_JOURNAL');
  if(mutation)throw Error('SOURCE_PROFILE_WA_MEMBERSHIP_ASSERTION');
  return {facet:'WA completable-task jurisdiction membership',families:[family,'IA'],...credits};
}

export async function probeWaMembership({cookie,output,readJournal,mutation=null,request=fetch,family='CMC'}) {
  const fault=faultFor(family);assert(mutation===null||mutation===fault,'SOURCE_PROFILE_UNKNOWN_FAULT');
  assert(typeof cookie==='string'&&cookie.length>0,'SOURCE_PROFILE_SESSION_REQUIRED');
  assert(typeof readJournal==='function','SOURCE_PROFILE_JOURNAL_REQUIRED');
  assert.deepEqual(readJournal(),[],'SOURCE_PROFILE_MEMBERSHIP_JOURNAL');
  const observations=[];
  let csrfToken;
  for(const call of callsFor(family)) {
    const post=call.route==='post';
    const route=post?'/workallocation/searchForCompletable':`/workallocation/case/tasks/${call.caseId}/event/${call.eventId}/caseType/${call.caseType}/jurisdiction/${call.family}`;
    const response=await request(CANDIDATE_URL+route,{method:post?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),
      headers:{cookie:`xui-webapp=${encodeURIComponent(cookie)}`,...(post?{'content-type':'application/json','x-xsrf-token':csrfToken}:{})},
      ...(post?{body:JSON.stringify({searchRequest:{ccdId:call.caseId,jurisdiction:call.family,caseTypeId:call.caseType,eventId:call.eventId}})}:{})});
    if(response.status!==200)fs.writeFileSync(path.join(output,'profile-wa-membership-transport.json'),JSON.stringify({route:call.route,family:call.family,status:Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null}),{mode:0o600});
    assert.equal(response.status,200,'SOURCE_PROFILE_MEMBERSHIP_TRANSPORT');
    if(!post) {
      // Auth middleware issues the session-bound token on GET, before either task route.
      const tokens=response.headers.getSetCookie().filter(value=>value.startsWith('XSRF-TOKEN='));
      assert.equal(tokens.length,1,'SOURCE_PROFILE_MEMBERSHIP_CSRF');
      csrfToken=decodeURIComponent(tokens[0].split(';',1)[0].slice('XSRF-TOKEN='.length));
      assert(/^[A-Za-z0-9_-]{1,512}$/.test(csrfToken),'SOURCE_PROFILE_MEMBERSHIP_CSRF');
    }
    observations.push({route:call.route,family:call.family,status:response.status,body:await response.json()});
  }
  const journal=readJournal();
  fs.writeFileSync(path.join(output,'profile-wa-membership-observations.json'),JSON.stringify({observations,journal,mutation,catalogueCredit:false}),{mode:0o600});
  return validateWaMembershipObservations(observations,journal,mutation,family);
}
