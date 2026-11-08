import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CANDIDATE_URL } from './exui-candidate-runtime.mjs';
import { frProfileConfiguration as projectFrProfileConfiguration, FR_PROFILE_FACETS } from './exui-fr-profile-contract.mjs';
import { SOURCE_JURISDICTIONS, profileJurisdictionRows, sourceProfileJurisdictionConfiguration } from './exui-source-profile-jurisdictions.mjs';

export { FR_PROFILE_FACETS };
const staff='ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS';
const roles=['hearing-centre-admin','case-manager','ctsc','tribunal-caseworker','hmcts-legal-operations','task-supervisor','hmcts-admin','national-business-centre','senior-tribunal-caseworker','case-allocator','regional-centre-admin'];
const mappings=Object.freeze([
 {path:'/workallocation/findPerson',body:{searchOptions:{searchTerm:'Synthetic',userRole:'Judicial',services:['FR']}}},
 {path:'/workallocation/getJudicialUsers',body:{userIds:['profile-judge'],services:['FR']}},
 {path:'/workallocation/location?serviceCodes=FR'},
 {path:'/workallocation/full-location?serviceCodes=FR'},
 {path:'/workallocation/region-location',body:{serviceIds:['FR']}},
 {path:'/am/getBookings',body:{userId:'profile-judge',bookableServices:['FR']}},
 {path:'/api/locations/getLocations',body:{searchTerm:'Synthetic',serviceIds:['FR'],locationType:'case_management',userLocations:[]}},
]);
const get=path=>({method:'GET',path}),post=(path,body)=>({method:'POST',path,body});
const user=family=>({email:`${family.toLowerCase()}@example.invalid`,firstName:`Synthetic ${family}`,idamId:`profile-${family.toLowerCase()}`,lastName:'Staff',location:{id:'100001',locationName:'Synthetic staff location'},roleCategories:['LEGAL_OPERATIONS'],service:family});
const person=code=>({idamId:`judicial-${code}`,fullName:`Synthetic ${code}`,emailId:`${code.toLowerCase()}@example.invalid`});
const venue=code=>({epimms_id:'100002',site_name:`Synthetic ${code}`,region_id:'1',court_type_id:'18',service_code:code,is_case_management_location:'Y',is_hearing_location:'Y'});
const observation=(entrypoint,body,outboundCount)=>({entrypoint,status:200,body,outboundCount});
const familyList=Object.freeze(staff.split(','));
const select=(facet,mutation)=>{const selected=FR_PROFILE_FACETS.find(item=>item.facet===facet);assert(selected,'FR_PROFILE_FACET_INVALID');assert(mutation===null||mutation===selected.fault,'FR_PROFILE_FAULT_INVALID');return selected;};

export function frProfileConfiguration(candidateRoot,facet,mutation=null){
 const {config}=sourceProfileJurisdictionConfiguration(candidateRoot);
 const projected=projectFrProfileConfiguration(config,facet,mutation);
 return projected;
}

export function frProfileEvidence(facet,mutation=null){
 select(facet,mutation);
 const observations=[];let journal;
 if(facet==='fr-jurisdiction'){
  const ids=mutation?SOURCE_JURISDICTIONS.filter(id=>id!=='FR'):SOURCE_JURISDICTIONS;
  for(let repeat=0;repeat<2;repeat++)for(const access of ['create','read','default'])observations.push({access,status:200,body:profileJurisdictionRows(access).filter(row=>ids.includes(row.id))});
  journal=[0,1].flatMap(()=>['create','read','default'].map(access=>({method:'GET',path:'/aggregated/caseworkers/harness-supervisor/jurisdictions',access})));
 }else if(facet==='fr-staff'){
  const supported=mutation?familyList.filter(id=>id!=='FR'):familyList;
  observations.push(observation('/api/staff-supported-jurisdiction/get',supported,0));
  const returned=(mutation?['IA']:['FR','IA']).map(user);
  for(let i=0;i<2;i++)observations.push(observation('/workallocation/caseworker/getUsersByServiceName',returned,2));
  journal=[get(`/refdata/internal/staff/usersByServiceName?ccd_service_names=${supported.join(',')}&page_size=100000`),post('/am/role-assignments/query',{attributes:{jurisdiction:supported},roleName:roles,roleType:['ORGANISATION']})];
 }else{
  const code=mutation?'ZZZ1':'ABA2',judge=person(code),location=venue(code),locationCall=get(`/refdata/location/court-venues/services?service_code=${code}`);
  observations.push(observation('/api/staff-supported-jurisdiction/get',familyList,0));
  journal=[post('/refdata/judicial/users/search',{searchString:'Synthetic',serviceCode:code}),post('/refdata/judicial/users',{sidam_ids:['profile-judge'],serviceCode:code}),locationCall,locationCall,locationCall,post('/am/bookings/query',{queryRequest:{userIds:['profile-judge']}}),locationCall,get(`/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=&service_code=${code}`)];
  const bodies=[[{...judge,name:judge.fullName,email:judge.emailId,id:judge.idamId}],[judge],[{id:location.epimms_id,locationName:location.site_name}],[location],[{regionId:'1',locations:[location.epimms_id]}],['100001','100002'].map(id=>({id:`booking-${id}`,locationId:id,locationName:id===location.epimms_id?location.site_name:null})),[location]];
  for(let i=0;i<mappings.length;i++)observations.push(observation(mappings[i].path,bodies[i],[1,2,3,4,5,7,8][i]));
 }
 return {observations,journal,mutation,catalogueCredit:false};
}

export function frJurisdictionFilterDiagnostic(observations){
 const expectedIds=frProfileEvidence('fr-jurisdiction').observations[0].body.map(row=>row.id).sort();
 const observedRows=observations?.[0]?.body;
 assert(Array.isArray(observedRows)&&observedRows.every(row=>row&&typeof row.id==='string'&&/^[A-Z][A-Z0-9_]{0,31}$/.test(row.id)),'FR_PROFILE_OBSERVATIONS');
 const observedIds=observedRows.map(row=>row.id).sort();
 assert.equal(new Set(observedIds).size,observedIds.length,'FR_PROFILE_OBSERVATIONS');
 return {schemaVersion:1,kind:'fr-jurisdiction-filter-diagnostic',reasonCode:'FR_PROFILE_OBSERVATIONS',expectedIds,observedIds,unexpectedIds:observedIds.filter(id=>!expectedIds.includes(id)),missingIds:expectedIds.filter(id=>!observedIds.includes(id))};
}

export function validateFrProfileObservations(facet,observations,journal,mutation=null){
 const selected=select(facet,mutation),expected=frProfileEvidence(facet,mutation);
 if(facet==='fr-jurisdiction'){
  assert.equal(observations.length,6,'FR_PROFILE_OBSERVATIONS');
  for(const observation of observations)frJurisdictionFilterDiagnostic([observation]);
  for(const access of ['create','read','default']){
   const pair=observations.filter(item=>item.access===access);
   assert.equal(pair.length,2,'FR_PROFILE_ACCESS_PARTITION');
   assert(pair.every(item=>item.status===200),'FR_PROFILE_TRANSPORT');
   assert.deepEqual(pair[0].body,pair[1].body,'FR_PROFILE_CACHE_CHANGED');
   assert.equal(pair[0].body.some(row=>row.id==='FR'),!mutation,'FR_PROFILE_MEMBERSHIP');
  }
 }else assert.deepEqual(observations,expected.observations,'FR_PROFILE_OBSERVATIONS');
 assert.deepEqual(journal,expected.journal,'FR_PROFILE_JOURNAL');
 if(mutation)throw Error(facet==='fr-mapping'?'FR_PROFILE_MAPPING_ASSERTION':'FR_PROFILE_MEMBERSHIP_ASSERTION');
 return {facet,family:'FR',capability:facet==='fr-jurisdiction'?'jurisdictions':facet==='fr-staff'?'staffSupportedJurisdictions':'serviceRefDataMapping',catalogueCredit:false};
}

export async function probeFrProfileConsumers({facet,cookie,output,readJournal,mutation=null,request=fetch}){
 select(facet,mutation);assert(typeof cookie==='string'&&cookie.length>0,'SOURCE_PROFILE_SESSION_REQUIRED');assert(typeof readJournal==='function','SOURCE_PROFILE_JOURNAL_REQUIRED');
 const calls=facet==='fr-jurisdiction'?
  ['create','read','default','create','read','default'].map(access=>({path:'/aggregated/caseworkers/:uid/jurisdictions'+(access==='default'?'':`?access=${access}`)})):
  facet==='fr-staff'?[{path:'/api/staff-supported-jurisdiction/get'},...Array.from({length:2},()=>({path:'/workallocation/caseworker/getUsersByServiceName',body:{services:['FR','IA'],term:''}}))]:
  [{path:'/api/staff-supported-jurisdiction/get'},...mappings.map(item=>({path:item.path,body:item.body}))];
 const observations=[];let token;
 for(const [index,call] of calls.entries()){
  const response=await request(CANDIDATE_URL+call.path,{method:call.body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{cookie:`xui-webapp=${encodeURIComponent(cookie)}`,...(call.body?{'content-type':'application/json','x-xsrf-token':token}:{})},...(call.body?{body:JSON.stringify(call.body)}:{})});
  if(response.status!==200)fs.writeFileSync(path.join(output,'profile-fr-transport.json'),JSON.stringify({facet,index,status:Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null}),{mode:0o600});
  assert.equal(response.status,200,'FR_PROFILE_TRANSPORT');
  if(index===0){const tokens=response.headers.getSetCookie().filter(value=>value.startsWith('XSRF-TOKEN='));assert.equal(tokens.length,1,'FR_PROFILE_CSRF');token=decodeURIComponent(tokens[0].split(';',1)[0].slice(11));assert(/^[A-Za-z0-9_-]{1,512}$/.test(token),'FR_PROFILE_CSRF');}
  const body=await response.json();observations.push(facet==='fr-jurisdiction'?{access:call.path.includes('?access=')?call.path.split('=').at(-1):'default',status:response.status,body}:{entrypoint:call.path,status:response.status,body,outboundCount:readJournal().length});
 }
 const journal=readJournal();fs.writeFileSync(path.join(output,'profile-fr-observations.json'),JSON.stringify({observations,journal,mutation,catalogueCredit:false}),{mode:0o600});
 return validateFrProfileObservations(facet,observations,journal,mutation);
}
