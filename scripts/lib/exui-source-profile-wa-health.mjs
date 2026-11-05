import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sourceProfileJurisdictionConfiguration} from './exui-source-profile-jurisdictions.mjs';
import {digestBytes} from './exui-evidence-io.mjs';
import {CANDIDATE_URL} from './exui-candidate-runtime.mjs';
export const WA_HEALTH_SCOPE='exui-source-profile-wa-health-feasibility';
export const WA_HEALTH_FAULT='source-profile-enable-wa-health';
export const BASE_HEALTH=['ccdComponentApi','ccdDataApi','docassemblyApi','documentsApi','documentsApiV2','idamApi','idamWeb','s2s'].sort();
export const WA_HEALTH=['workAllocationApi','caseworkerRefApi','roleApi','judicialApi'].sort();
export function sourceProfileWaHealthConfiguration(candidateRoot,mutation=null) {
 assert(mutation===null||mutation===WA_HEALTH_FAULT,'SOURCE_PROFILE_UNKNOWN_FAULT');
 const original=sourceProfileJurisdictionConfiguration(candidateRoot);
 const config=original.config;
 assert.equal(config.feature.termsAndConditionsEnabled,false,'SOURCE_PROFILE_HEALTH_CONFIG');
 assert.equal(config.feature.redisEnabled,false,'SOURCE_PROFILE_HEALTH_CONFIG');
 config.feature.workAllocationEnabled=mutation!==null;
 return {config,digest:digestBytes(JSON.stringify(config)),contract:{...original.contract,scope:WA_HEALTH_SCOPE,families:'all source-default families',facet:'workAllocationEnabled health dependency selection',mutation,baseDependencies:BASE_HEALTH,optionalDependencies:WA_HEALTH,transport:'Existing isolated provider URL is shared; candidate response identifies dependencies and independent journal counts outbound checks.',unresolved:['Other profile consumers','services.hearings.*.caseTypes consumer/disposition','Whole-profile native policy acceptance'],wholeProfileSatisfied:false,catalogueCredit:false}};
}
export function validateWaHealthObservations(observation,journal,mutation=null) {
 assert(mutation===null||mutation===WA_HEALTH_FAULT,'SOURCE_PROFILE_UNKNOWN_FAULT');
 assert.equal(observation.status,200,'SOURCE_PROFILE_HEALTH_TRANSPORT');
 const expected=[...BASE_HEALTH,...(mutation?WA_HEALTH:[])].sort();
 assert.deepEqual(Object.keys(observation.body).filter(k=>!['status','buildInfo'].includes(k)).sort(),expected,'SOURCE_PROFILE_HEALTH_DEPENDENCIES');
 assert.equal(observation.body.status,'UP','SOURCE_PROFILE_HEALTH_UNHEALTHY');
 for(const name of expected)assert.equal(observation.body[name]?.status,'UP','SOURCE_PROFILE_HEALTH_UNHEALTHY');
 assert.deepEqual(journal,expected.map(()=>({method:'GET',path:'/health'})),'SOURCE_PROFILE_HEALTH_DESTINATIONS');
 if(mutation)throw Error('SOURCE_PROFILE_WA_HEALTH_ASSERTION');
 return {facet:'WA health dependency selection',wholeProfileSatisfied:false,catalogueCredit:false};
}
export async function probeWaHealth({output,readJournal,mutation=null,request=fetch}) {
 const before=readJournal();
 const response=await request(CANDIDATE_URL+'/health',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,'SOURCE_PROFILE_HEALTH_TRANSPORT');
 const body=await response.json();
 const journal=readJournal();assert.deepEqual(journal.slice(0,before.length),before,'SOURCE_PROFILE_HEALTH_JOURNAL_CHANGED');
 const observed={status:response.status,body};
 const delta=journal.slice(before.length);
 fs.writeFileSync(path.join(output,'profile-health-observations.json'),JSON.stringify({observation:observed,journal:delta,mutation,catalogueCredit:false}),{mode:0o600});
 return validateWaHealthObservations(observed,delta,mutation);
}
