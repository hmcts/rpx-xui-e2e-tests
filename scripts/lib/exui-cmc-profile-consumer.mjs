import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {CANDIDATE_URL} from './exui-candidate-runtime.mjs';
import {SOURCE_JURISDICTIONS,profileJurisdictionRows} from './exui-source-profile-jurisdictions.mjs';
import {CMC_PROFILE_FACET} from './exui-cmc-profile-contract.mjs';

const accesses=['read','create','default'];

export function cmcJurisdictionFilterDiagnostic(observations,mutation=null){
 assert(Array.isArray(observations)&&observations[0]?.access==='read'&&Array.isArray(observations[0].body),'CMC_PROFILE_DIAGNOSTIC_INVALID');
 const expectedIds=SOURCE_JURISDICTIONS.filter(id=>mutation!==CMC_PROFILE_FACET.fault||id!=='CMC').sort(),observedIds=observations[0].body.map(row=>row?.id);
 assert(observedIds.every(id=>typeof id==='string'&&/^[A-Z][A-Z0-9_]{0,31}$/.test(id)),'CMC_PROFILE_OBSERVATIONS');
 observedIds.sort();assert.equal(new Set(observedIds).size,observedIds.length,'CMC_PROFILE_OBSERVATIONS');
 return {schemaVersion:1,kind:'cmc-jurisdiction-filter-diagnostic',reasonCode:mutation?'CMC_PROFILE_FAULT_NOT_EFFECTIVE':'CMC_PROFILE_OBSERVATIONS',expectedIds,observedIds,missingIds:expectedIds.filter(id=>!observedIds.includes(id)),unexpectedIds:observedIds.filter(id=>!expectedIds.includes(id))};
}

export function cmcProfileEvidence(mutation=null){
 assert(mutation===null||mutation===CMC_PROFILE_FACET.fault,'CMC_PROFILE_FAULT_INVALID');
 const configured=mutation?SOURCE_JURISDICTIONS.filter(id=>id!=='CMC'):SOURCE_JURISDICTIONS;
 const observations=[0,1].flatMap(()=>accesses.map(access=>({access,status:200,body:profileJurisdictionRows(access).filter(row=>configured.includes(row.id))})));
 const journal=[0,1].flatMap(()=>accesses.map(access=>({method:'GET',path:'/aggregated/caseworkers/harness-supervisor/jurisdictions',access})));
 return {observations,journal,mutation,catalogueCredit:false};
}

export function validateCmcProfileObservations(observations,journal,mutation=null){
 const expected=cmcProfileEvidence(mutation);
 try{
  assert.deepEqual(observations.map(item=>item.access),expected.observations.map(item=>item.access),'CMC_PROFILE_OBSERVATIONS');
  for(const access of accesses){
   const pair=observations.filter(item=>item.access===access);
   assert(pair.every(item=>item.status===200&&Array.isArray(item.body)),'CMC_PROFILE_OBSERVATIONS');
   assert.deepEqual(pair[0].body,pair[1].body,'CMC_PROFILE_CACHE_CHANGED');
   assert.equal(pair[0].body.filter(row=>row?.id==='CMC').length,mutation?0:1,mutation?'CMC_PROFILE_FAULT_NOT_EFFECTIVE':'CMC_PROFILE_OBSERVATIONS');
   const diagnostic=cmcJurisdictionFilterDiagnostic([{access:'read',body:pair[0].body}],mutation);
   assert.deepEqual(diagnostic.observedIds,diagnostic.expectedIds,'CMC_PROFILE_OBSERVATIONS');
  }
 }catch(error){
  try{error.cmcProfileDiagnostic=cmcJurisdictionFilterDiagnostic(observations,mutation);}catch{}
  throw error;
 }
 assert.deepEqual(journal,expected.journal,'CMC_PROFILE_JOURNAL');
 if(mutation){
  assert(observations.every(item=>!item.body.some(row=>row.id==='CMC')),'CMC_PROFILE_FAULT_NOT_EFFECTIVE');
  throw new Error('CMC_PROFILE_MEMBERSHIP_ASSERTION');
 }
 return {facet:CMC_PROFILE_FACET.facet,family:'CMC',capability:'jurisdictions',catalogueCredit:false};
}

export function validateCmcProfileContrast(baseline,mutation){
 assert.equal(baseline.length,6,'CMC_PROFILE_FAULT_SCOPE');assert.equal(mutation.length,6,'CMC_PROFILE_FAULT_SCOPE');
 for(let index=0;index<baseline.length;index++){
  const before=baseline[index],after=mutation[index];assert.equal(before.access,after.access,'CMC_PROFILE_FAULT_SCOPE');assert.equal(before.status,200,'CMC_PROFILE_FAULT_SCOPE');assert.equal(after.status,200,'CMC_PROFILE_FAULT_SCOPE');
  assert.deepEqual(before.body.filter(row=>row.id!=='CMC'),after.body,'CMC_PROFILE_FAULT_SCOPE');
 }
}

export async function probeCmcProfileConsumer({cookie,output,readJournal,mutation=null,request=fetch}){
 assert(typeof cookie==='string'&&cookie.length>0,'SOURCE_PROFILE_SESSION_REQUIRED');
 assert(typeof readJournal==='function','SOURCE_PROFILE_JOURNAL_REQUIRED');
 const observations=[];
 for(let repeat=0;repeat<2;repeat++)for(const access of accesses){
  const query=access==='default'?'':`?access=${access}`;
  const response=await request(`${CANDIDATE_URL}/aggregated/caseworkers/:uid/jurisdictions${query}`,{method:'GET',headers:{cookie:`xui-webapp=${encodeURIComponent(cookie)}`},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(response.status!==200)fs.writeFileSync(path.join(output,'cmc-profile-transport.json'),JSON.stringify({schemaVersion:1,access,attempt:repeat+1,status:Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null}),{mode:0o600});
  assert.equal(response.status,200,'CMC_PROFILE_TRANSPORT');
  observations.push({access,status:response.status,body:await response.json()});
 }
 const journal=readJournal();
 fs.writeFileSync(path.join(output,'cmc-profile-observations.json'),JSON.stringify({observations,journal,mutation,catalogueCredit:false},null,2),{mode:0o600});
 return validateCmcProfileObservations(observations,journal,mutation);
}
