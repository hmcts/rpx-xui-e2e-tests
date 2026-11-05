import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { effectiveCandidateConfiguration, CANDIDATE_URL } from './exui-candidate-runtime.mjs';
import { digestBytes } from './exui-evidence-io.mjs';

export const SOURCE_PROFILE_JURISDICTION_SCOPE = 'exui-source-profile-jurisdictions-feasibility';
export const SOURCE_PROFILE_JURISDICTION_FAULT = 'source-profile-drop-divorce-jurisdiction';
export const SOURCE_PROFILE_FAMILIES = ['CMC', 'FR', 'DIVORCE'];
export const SOURCE_JURISDICTIONS = ['DIVORCE','PROBATE','FR','PUBLICLAW','IA','SSCS','EMPLOYMENT','HRS','CIVIL','CMC','PRIVATELAW','PCS'];
const accesses = ['read','create','default'];
const revision = '3734db2bb8f4f6de62db3b42ade9ef6538b65eb0';
const source = JSON.parse(fs.readFileSync(new URL('../fixtures/exui-configuration-source.json',import.meta.url))).sources.find(item=>item.repository==='rpx-xui-webapp'&&item.path==='config/default.json');

export function sourceProfileJurisdictionConfiguration(candidateRoot, mutation = null) {
  assert(mutation === null || mutation === SOURCE_PROFILE_JURISDICTION_FAULT, 'SOURCE_PROFILE_UNKNOWN_FAULT');
  const bytes = fs.readFileSync(path.join(candidateRoot,'config/default.json'));
  assert.equal(digestBytes(bytes),`sha256:${source.fileDigest}`,'SOURCE_PROFILE_CONFIG_DRIFT');
  assert.equal(source.revision,revision,'SOURCE_PROFILE_REVISION_DRIFT');
  const original = JSON.parse(bytes);
  assert.deepEqual(original.jurisdictions.split(','),SOURCE_JURISDICTIONS,'SOURCE_PROFILE_JURISDICTION_SOURCE');
  assert.equal(original.feature.workAllocationEnabled,false,'SOURCE_PROFILE_WA_DEFAULT');
  const {config} = effectiveCandidateConfiguration(candidateRoot);
  // Restore the source-default semantic value; other existing adaptations are transport/security only.
  config.feature.workAllocationEnabled = original.feature.workAllocationEnabled;
  if(mutation) config.jurisdictions = config.jurisdictions.split(',').filter(id=>id!=='DIVORCE').join(',');
  return {config,digest:digestBytes(JSON.stringify(config)),contract:{scope:SOURCE_PROFILE_JURISDICTION_SCOPE,sourceRevision:revision,sourceDigest:`sha256:${source.fileDigest}`,families:SOURCE_PROFILE_FAMILIES,facet:'jurisdiction filtering and read/create/default session partitions',mutation,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,unresolved:['Remaining family capabilities and shared policy consumers','Hearing caseTypes consumer disposition','Native process/artifact/replay wiring','Actual visible selector interpretation']}};
}
export function profileJurisdictionRows(access) {
  assert(accesses.includes(access),'SOURCE_PROFILE_ACCESS');
  return ['ST_CIC','CMC','FR','DIVORCE','UNREVIEWED',...SOURCE_JURISDICTIONS.filter(id=>!SOURCE_PROFILE_FAMILIES.includes(id)).reverse()].map(id=>({id,name:`Synthetic ${access} ${id}`,caseTypes:[]}));
}
export function validateProfileJurisdictionObservations(observations,journal,mutation=null) {
  assert(mutation===null||mutation===SOURCE_PROFILE_JURISDICTION_FAULT,'SOURCE_PROFILE_UNKNOWN_FAULT');
  assert.equal(observations.length,6,'SOURCE_PROFILE_OBSERVATION_COUNT');
  assert.equal(journal.length,3,'SOURCE_PROFILE_UPSTREAM_COUNT');
  for(const access of accesses) {
    const pair=observations.filter(item=>item.access===access);
    assert.equal(pair.length,2,'SOURCE_PROFILE_ACCESS_PARTITION');
    assert(pair.every(item=>item.status===200),'SOURCE_PROFILE_TRANSPORT');
    assert.deepEqual(pair[0].body,pair[1].body,'SOURCE_PROFILE_CACHE_CHANGED');
    const calls=journal.filter(item=>item.access===access);
    assert.deepEqual(calls,[{method:'GET',path:'/aggregated/caseworkers/harness-supervisor/jurisdictions',access}],'SOURCE_PROFILE_UID_OR_CACHE');
    const ids=mutation?SOURCE_JURISDICTIONS.filter(id=>id!=='DIVORCE'):SOURCE_JURISDICTIONS;
    const effective=profileJurisdictionRows(access).filter(item=>ids.includes(item.id));
    assert.deepEqual(pair[0].body,effective,mutation?'SOURCE_PROFILE_FAULT_NOT_EFFECTIVE':'SOURCE_PROFILE_INTERPRETATION');
  }
  // The fault must be observed after valid application transport, before the independent baseline oracle fails.
  if(mutation) {
    assert(observations.every(item=>!item.body.some(row=>row.id==='DIVORCE')),'SOURCE_PROFILE_FAULT_NOT_EFFECTIVE');
    throw new Error('SOURCE_PROFILE_JURISDICTION_ASSERTION');
  }
  return {families:SOURCE_PROFILE_FAMILIES,facet:'jurisdiction-filter-and-cache',catalogueCredit:false,wholeProfileSatisfied:false};
}
export async function probeProfileJurisdictions({cookie,output,readJournal,mutation=null,request=fetch}) {
  assert(typeof cookie==='string'&&cookie.length>0,'SOURCE_PROFILE_SESSION_REQUIRED');
  assert(typeof readJournal==='function','SOURCE_PROFILE_JOURNAL_REQUIRED');
  const observations=[];
  for(let repeat=0;repeat<2;repeat++) for(const access of accesses) {
    const query=access==='default'?'':`?access=${access}`;
    // api/auth/index.ts selects this cookie name for the candidate's file-session store.
    const response=await request(`${CANDIDATE_URL}/aggregated/caseworkers/:uid/jurisdictions${query}`,{method:'GET',headers:{cookie:`xui-webapp=${encodeURIComponent(cookie)}`},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(response.status!==200)fs.writeFileSync(path.join(output,'profile-jurisdiction-transport.json'),JSON.stringify({schemaVersion:1,access,attempt:repeat+1,status:Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null},null,2)+'\n',{mode:0o600});
    assert.equal(response.status,200,'SOURCE_PROFILE_TRANSPORT');
    observations.push({access,status:response.status,body:await response.json()});
  }
  const journal=readJournal();
  fs.writeFileSync(path.join(output,'profile-jurisdiction-observations.json'),JSON.stringify({observations,journal,mutation,catalogueCredit:false},null,2),{mode:0o600});
  return validateProfileJurisdictionObservations(observations,journal,mutation);
}
