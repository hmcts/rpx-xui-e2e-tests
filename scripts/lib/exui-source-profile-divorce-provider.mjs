import fs from 'node:fs';
import {handleProfileSystemAuth} from './exui-profile-system-auth-provider.mjs';
import {isDeepStrictEqual} from 'node:util';

// Fixed synthetic transport responses, independent of consumer oracle/configuration code.
const staffCsv='ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS';
const roleNames=['hearing-centre-admin','case-manager','ctsc','tribunal-caseworker','hmcts-legal-operations','task-supervisor','hmcts-admin','national-business-centre','senior-tribunal-caseworker','case-allocator','regional-centre-admin'];
const person=code=>({idamId:`judicial-${code}`,fullName:`Synthetic ${code}`,emailId:`${code.toLowerCase()}@example.invalid`});
const location=code=>({epimms_id:code==='ABA1'?'100001':'100002',site_name:`Synthetic ${code}`,region_id:'1',court_type_id:'18',service_code:code,is_case_management_location:'Y',is_hearing_location:'Y'});
const user=family=>({ccd_service_name:family,staff_profile:{id:`profile-${family.toLowerCase()}`,first_name:`Synthetic ${family}`,last_name:'Staff',email_id:`${family.toLowerCase()}@example.invalid`,base_location:[{location_id:'100001',location:'Synthetic staff location',is_primary:true}]}});
const role=family=>({actorId:`profile-${family.toLowerCase()}`,roleCategory:family==='DIVORCE'?'ADMIN':'LEGAL_OPERATIONS',attributes:{jurisdiction:family}});
async function boundedBody(request) {let raw='',size=0;for await(const chunk of request){size+=chunk.length;if(size<=4096)raw+=chunk;}return size<=4096?raw:null;}
function send(response,body) {response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(body));}
export async function handleDivorceProvider(request,response,{facet,journal,output}) {
 const method=request.method,path=request.url;
 const auth=method==='POST'&&path==='/o/token';
 if(auth)return handleProfileSystemAuth(request,response);
 const possible=facet==='staff'&&(path.startsWith('/refdata/internal/staff/usersByServiceName?')||path==='/am/role-assignments/query')||facet==='mapping'&&(path.startsWith('/refdata/location/')||['/refdata/judicial/users/search','/refdata/judicial/users','/am/bookings/query'].includes(path));
 if(!possible)return false;
 const raw=await boundedBody(request);if(raw===null)return false;
 let body;if(method==='POST')try{body=JSON.parse(raw);}catch{return false;}
 else if(raw!=='')return false;
 const record={method,path,...(method==='POST'?{body}:{})};let result;
 if(facet==='staff') {
  for(const csv of [staffCsv,'ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,FR,PROBATE,HRS,PCS']) {
   const families=csv.includes('DIVORCE')?['DIVORCE','IA']:['IA'];
   if(method==='GET'&&path===`/refdata/internal/staff/usersByServiceName?ccd_service_names=${csv}&page_size=100000`)result=families.map(user);
   if(method==='POST'&&path==='/am/role-assignments/query'&&isDeepStrictEqual(body,{attributes:{jurisdiction:csv.split(',')},roleName:roleNames,roleType:['ORGANISATION']})&&request.headers.pagenumber==='0'&&request.headers.size==='100000')result={roleAssignmentResponse:families.map(role)};
  }
 } else {
  for(const code of ['ABA1','ZZZ1']) {
   if(method==='POST'&&path==='/refdata/judicial/users/search'&&isDeepStrictEqual(body,{searchString:'Synthetic',serviceCode:code}))result=[person(code)];
   if(method==='POST'&&path==='/refdata/judicial/users'&&isDeepStrictEqual(body,{sidam_ids:['profile-judge'],serviceCode:code}))result=[person(code)];
   if(method==='GET'&&path===`/refdata/location/court-venues/services?service_code=${code}`)result={court_venues:[location(code)]};
   if(method==='GET'&&path===`/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=&service_code=${code}`)result=[location(code)];
  }
  if(method==='POST'&&path==='/am/bookings/query'&&isDeepStrictEqual(body,{queryRequest:{userIds:['profile-judge']}}))result={bookings:[{id:'booking-100001',locationId:'100001'},{id:'booking-100002',locationId:'100002'}]};
 }
 if(result===undefined)return false;
 journal.push(record);fs.writeFileSync(`${output}/profile-divorce-destinations.json`,JSON.stringify(journal),{mode:0o600});send(response,result);return true;
}
