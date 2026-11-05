import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sourceProfileJurisdictionConfiguration} from './exui-source-profile-jurisdictions.mjs';
import {CANDIDATE_URL} from './exui-candidate-runtime.mjs';
import {digestBytes} from './exui-evidence-io.mjs';

export const DIVORCE_CONSUMERS=Object.freeze({
 staff:{scope:'exui-source-profile-divorce-staff-feasibility',fault:'source-profile-drop-divorce-staff'},
 mapping:{scope:'exui-source-profile-divorce-mapping-feasibility',fault:'source-profile-change-divorce-code'},
});
const staff='ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS';
const roles=['hearing-centre-admin','case-manager','ctsc','tribunal-caseworker','hmcts-legal-operations','task-supervisor','hmcts-admin','national-business-centre','senior-tribunal-caseworker','case-allocator','regional-centre-admin'];
const credits={runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false};
function selection(facet,mutation) {assert(Object.hasOwn(DIVORCE_CONSUMERS,facet),'SOURCE_PROFILE_INPUT_INVALID');assert(mutation===null||mutation===DIVORCE_CONSUMERS[facet].fault,'SOURCE_PROFILE_UNKNOWN_FAULT');}
export function divorceConsumerConfiguration(candidateRoot,facet,mutation=null) {
 selection(facet,mutation);
 const original=sourceProfileJurisdictionConfiguration(candidateRoot),config=original.config;
 assert.equal(config.staffSupportedJurisdictions,staff,'SOURCE_PROFILE_DIVORCE_CONFIG');
 assert.deepEqual(config.serviceRefDataMapping.filter(row=>row.service==='DIVORCE'),[{service:'DIVORCE',serviceCodes:['ABA1']}],'SOURCE_PROFILE_DIVORCE_CONFIG');
 if(mutation)applyDivorceConsumerFault(config,facet);
 return {config,digest:digestBytes(JSON.stringify(config)),contract:{...original.contract,scope:DIVORCE_CONSUMERS[facet].scope,facet,families:['DIVORCE'],mutation,
  exclusions:['Synthetic identity, system authentication and reference providers','No case-view WA tabs, CCD, production authorization, cache TTL/locking or whole-profile admission'],...credits}};
}
export function applyDivorceConsumerFault(config,facet) {
 assert(Object.hasOwn(DIVORCE_CONSUMERS,facet),'SOURCE_PROFILE_INPUT_INVALID');
 if(facet==='staff')config.staffSupportedJurisdictions=config.staffSupportedJurisdictions.split(',').filter(id=>id!=='DIVORCE').join(',');
 else config.serviceRefDataMapping.find(row=>row.service==='DIVORCE').serviceCodes=['ZZZ1'];
 return config;
}
const staffUser=family=>({email:`${family.toLowerCase()}@example.invalid`,firstName:`Synthetic ${family}`,idamId:`profile-${family.toLowerCase()}`,lastName:'Staff',location:{id:'100001',locationName:'Synthetic staff location'},roleCategories:[family==='DIVORCE'?'ADMIN':'LEGAL_OPERATIONS'],service:family});
const judicial=code=>({idamId:`judicial-${code}`,fullName:`Synthetic ${code}`,emailId:`${code.toLowerCase()}@example.invalid`});
const venue=code=>({epimms_id:code==='ABA1'?'100001':'100002',site_name:`Synthetic ${code}`,region_id:'1',court_type_id:'18',service_code:code,is_case_management_location:'Y',is_hearing_location:'Y'});
const get=(path)=>({method:'GET',path});
const post=(path,body)=>({method:'POST',path,body});
// Literal oracle requests are separate from the provider's admitted fixture table.
export function divorceConsumerEvidence(facet,mutation=null) {
 selection(facet,mutation);
 const jurisdictions=(facet==='staff'&&mutation?staff.split(',').filter(x=>x!=='DIVORCE'):staff.split(','));
 const observation=(entrypoint,body,outboundCount)=>({entrypoint,status:200,body,outboundCount});
 const observations=[observation('/api/staff-supported-jurisdiction/get',jurisdictions,0)];
 let journal;
 if(facet==='staff') {
  journal=[get(`/refdata/internal/staff/usersByServiceName?ccd_service_names=${jurisdictions.join(',')}&page_size=100000`),post('/am/role-assignments/query',{attributes:{jurisdiction:jurisdictions},roleName:roles,roleType:['ORGANISATION']})];
  const users=(mutation?['IA']:['DIVORCE','IA']).map(staffUser);
  for(let i=0;i<2;i++)observations.push(observation('/workallocation/caseworker/getUsersByServiceName',users,2));
 } else {
  const code=mutation?'ZZZ1':'ABA1',person=judicial(code),location=venue(code);
  const locationCall=get(`/refdata/location/court-venues/services?service_code=${code}`);
  journal=[post('/refdata/judicial/users/search',{searchString:'Synthetic',serviceCode:code}),post('/refdata/judicial/users',{sidam_ids:['profile-judge'],serviceCode:code}),locationCall,locationCall,locationCall,post('/am/bookings/query',{queryRequest:{userIds:['profile-judge']}}),locationCall,get(`/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=&service_code=${code}`)];
  const bodies=[[{...person,name:person.fullName,email:person.emailId,id:person.idamId}],[person],[{id:location.epimms_id,locationName:location.site_name}],[location],[{regionId:'1',locations:[location.epimms_id]}],['100001','100002'].map(id=>({id:`booking-${id}`,locationId:id,locationName:id===location.epimms_id?location.site_name:null})),[location]];
  mappingCalls.forEach((call,i)=>observations.push(observation(call.path,bodies[i],[1,2,3,4,5,7,8][i])));
 }
 return {observations,journal,mutation,catalogueCredit:false};
}
const mappingCalls=[
 {path:'/workallocation/findPerson',body:{searchOptions:{searchTerm:'Synthetic',userRole:'Judicial',services:['DIVORCE']}}},
 {path:'/workallocation/getJudicialUsers',body:{userIds:['profile-judge'],services:['DIVORCE']}},
 {path:'/workallocation/location?serviceCodes=DIVORCE'},
 {path:'/workallocation/full-location?serviceCodes=DIVORCE'},
 {path:'/workallocation/region-location',body:{serviceIds:['DIVORCE']}},
 {path:'/am/getBookings',body:{userId:'profile-judge',bookableServices:['DIVORCE']}},
 {path:'/api/locations/getLocations',body:{searchTerm:'Synthetic',serviceIds:['DIVORCE'],locationType:'case_management',userLocations:[]}},
];
export function validateDivorceConsumerObservations(facet,observations,journal,mutation=null) {
 const expected=divorceConsumerEvidence(facet,mutation);
 assert.deepEqual(observations,expected.observations,'SOURCE_PROFILE_DIVORCE_OBSERVATIONS');
 assert.deepEqual(journal,expected.journal,'SOURCE_PROFILE_DIVORCE_JOURNAL');
 if(mutation)throw Error(facet==='staff'?'SOURCE_PROFILE_DIVORCE_STAFF_ASSERTION':'SOURCE_PROFILE_DIVORCE_MAPPING_ASSERTION');
 return {facet,families:['DIVORCE'],...credits};
}
export async function probeDivorceConsumers({facet,cookie,output,readJournal,mutation=null,request=fetch}) {
 selection(facet,mutation);assert(typeof cookie==='string'&&cookie.length>0,'SOURCE_PROFILE_SESSION_REQUIRED');
 assert(typeof readJournal==='function','SOURCE_PROFILE_JOURNAL_REQUIRED');assert.deepEqual(readJournal(),[],'SOURCE_PROFILE_DIVORCE_JOURNAL');
 const calls=[{path:'/api/staff-supported-jurisdiction/get'},...(facet==='staff'?Array.from({length:2},()=>({path:'/workallocation/caseworker/getUsersByServiceName',body:{services:['DIVORCE','IA'],term:''}})):mappingCalls)];
 const observations=[];let token;
 for(const [index,call] of calls.entries()) {
  const response=await request(CANDIDATE_URL+call.path,{method:call.body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{cookie:`xui-webapp=${encodeURIComponent(cookie)}`,...(call.body?{'content-type':'application/json','x-xsrf-token':token}:{})},...(call.body?{body:JSON.stringify(call.body)}:{})});
  if(response.status!==200)fs.writeFileSync(path.join(output,'profile-divorce-transport.json'),JSON.stringify({facet,index,status:Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null}),{mode:0o600});
  assert.equal(response.status,200,'SOURCE_PROFILE_DIVORCE_TRANSPORT');
  if(index===0){const tokens=response.headers.getSetCookie().filter(x=>x.startsWith('XSRF-TOKEN='));assert.equal(tokens.length,1,'SOURCE_PROFILE_DIVORCE_CSRF');token=decodeURIComponent(tokens[0].split(';',1)[0].slice(11));assert(/^[A-Za-z0-9_-]{1,512}$/.test(token),'SOURCE_PROFILE_DIVORCE_CSRF');}
  observations.push({entrypoint:call.path,status:200,body:await response.json(),outboundCount:readJournal().length});
 }
 const journal=readJournal();fs.writeFileSync(path.join(output,'profile-divorce-observations.json'),JSON.stringify({observations,journal,mutation,catalogueCredit:false}),{mode:0o600});
 return validateDivorceConsumerObservations(facet,observations,journal,mutation);
}
