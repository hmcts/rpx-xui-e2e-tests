import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
// Provider fixtures deliberately do not import the browser/profile oracle.
const services=['IA','CIVIL','PRIVATELAW','PUBLICLAW','EMPLOYMENT','ST_CIC','PROBATE','PCS','DIVORCE'];
const labels={IA:'Immigration',CIVIL:'Civil',PRIVATELAW:'Private Law',PUBLICLAW:'Public Law',EMPLOYMENT:'Employment',ST_CIC:'Special Tribunals',PROBATE:'Probate',PCS:'Possession',DIVORCE:'Divorce',SSCS:'Excluded SSCS'};
const bodyFor=ids=>({searchCriteria:{CCDCaseTypeIds:null,CCDJurisdictionIds:ids,caseManagementBaseLocationIds:null,caseManagementRegionIds:null,caseReferences:['1111222233334444'],otherReferences:null,parties:[],stateIds:null},sortCriteria:null,maxReturnRecordCount:25,startRecordNumber:1});
export async function handleDivorceBrowserProvider(request,response,{facet,journal,output,support}) {
 const method=request.method,path=request.url;
 const organisation=method==='GET'&&path==='/refdata/external/v1/organisations';
 const global=facet==='divorce-global-search';
 if(!organisation&&!(global&&['/refdata/location/orgServices','/globalSearch','/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read'].includes(path)))return false;
 let raw='',size=0;for await(const chunk of request){size+=chunk.length;if(size<=4096)raw+=chunk;}if(size>4096)return false;
 let body;if(method==='POST')try{body=JSON.parse(raw);}catch{return false;}else if(raw!=='')return false;
 let result,entry={method,path,...(method==='POST'?{body}:{})};
 if(organisation){result={};support.push({method,path,status:200,body:{}});fs.writeFileSync(`${output}/profile-browser-support.json`,JSON.stringify(support),{mode:0o600});}
 else if(method==='GET'&&path==='/refdata/location/orgServices')result=['SSCS','DIVORCE','PCS','IA','PROBATE','ST_CIC','EMPLOYMENT','PUBLICLAW','PRIVATELAW','CIVIL'].map(id=>({ccd_service_name:id,service_short_description:`Synthetic ${labels[id]}`}));
 else if(method==='GET'&&path==='/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read')result=[];
 else if(method==='POST'&&path==='/globalSearch'){
  const normalized=structuredClone(body);if(!Array.isArray(normalized?.searchCriteria?.CCDJurisdictionIds))return false;normalized.searchCriteria.CCDJurisdictionIds.sort();
  if(![services,services.filter(id=>id!=='DIVORCE')].some(ids=>isDeepStrictEqual(normalized,bodyFor([...ids].sort()))))return false;
  result={resultInfo:{casesReturned:0,caseStartRecord:1,moreResultsToGo:false},results:[]};
 }else return false;
 if(!organisation){journal.push(entry);fs.writeFileSync(`${output}/profile-global-destinations.json`,JSON.stringify(journal),{mode:0o600});}
 response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(result));return true;
}
