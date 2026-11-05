import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {probeProfileJurisdictions,validateProfileJurisdictionObservations} from './exui-source-profile-jurisdictions.mjs';
import {digestBytes} from './exui-evidence-io.mjs';
const read=file=>JSON.parse(fs.readFileSync(file));
const ids=['CMC','FR','DIVORCE','PCS','PRIVATELAW','CIVIL','HRS','EMPLOYMENT','SSCS','IA','PUBLICLAW','PROBATE'];
const services=[['IA','Immigration'],['CIVIL','Civil'],['PRIVATELAW','Private Law'],['PUBLICLAW','Public Law'],['EMPLOYMENT','Employment'],['ST_CIC','Special Tribunals'],['PROBATE','Probate'],['PCS','Possession'],['DIVORCE','Divorce']];
export function validateDivorceBrowserObservation(facet,observation,journal,mutation=null) {
 assert(['divorce-jurisdiction','divorce-global-search'].includes(facet),'DIVORCE_PROFILE_FACET');
 const fault=facet==='divorce-jurisdiction'?'source-profile-drop-divorce-jurisdiction':'source-profile-drop-divorce-global-search';assert(mutation===null||mutation===fault,'SOURCE_PROFILE_UNKNOWN_FAULT');
 if(facet==='divorce-jurisdiction'){
  const expected=ids.filter(id=>!mutation||id!=='DIVORCE');
  assert.deepEqual(observation,{facet,url:'http://127.0.0.1:3100/cases/case-search',status:200,delivered:expected.map(id=>({id,name:`Synthetic read ${id}`,caseTypes:[]})),rendered:expected.map(id=>`Synthetic read ${id}`),selectedLabel:`Synthetic read ${mutation?'IA':'DIVORCE'}`,enabled:true},'DIVORCE_PROFILE_BROWSER_OBSERVATION');
  assert.deepEqual(journal,['read','create','default'].map(access=>({method:'GET',path:'/aggregated/caseworkers/harness-supervisor/jurisdictions',access})),'DIVORCE_PROFILE_BROWSER_JOURNAL');
 }else{
  const selected=services.filter(([id])=>!mutation||id!=='DIVORCE').map(([id,label])=>({id,label:`Synthetic ${label}`}));
  const body={searchCriteria:{CCDCaseTypeIds:null,CCDJurisdictionIds:selected.map(x=>x.id),caseManagementBaseLocationIds:null,caseManagementRegionIds:null,caseReferences:['1111222233334444'],otherReferences:null,parties:[],stateIds:null},sortCriteria:null,maxReturnRecordCount:25,startRecordNumber:1};
  // Compare service order independently from request order; reject duplicates and extra keys.
  const normalized=structuredClone(observation),normalizedJournal=structuredClone(journal);normalized.upstream.searchCriteria.CCDJurisdictionIds.sort();
  normalized.delivered.sort((a,b)=>a.serviceId.localeCompare(b.serviceId));normalized.warm.sort((a,b)=>a.serviceId.localeCompare(b.serviceId));normalized.rendered.sort((a,b)=>a.id.localeCompare(b.id));
  const delivered=selected.map(x=>({serviceId:x.id,serviceName:x.label})).sort((a,b)=>a.serviceId.localeCompare(b.serviceId));
  body.searchCriteria.CCDJurisdictionIds.sort();
  assert.deepEqual(normalized,{facet,url:'http://127.0.0.1:3100/search',status:200,delivered,warm:delivered,rendered:[...selected].sort((a,b)=>a.id.localeCompare(b.id)),selected:'ALL',postStatus:200,csrfHeaderPresent:true,upstream:body},'DIVORCE_PROFILE_BROWSER_OBSERVATION');
  const posts=normalizedJournal.filter(x=>x.method==='POST');assert.equal(posts.length,1,'DIVORCE_PROFILE_BROWSER_JOURNAL');posts[0].body.searchCriteria.CCDJurisdictionIds.sort();
  assert.deepEqual(normalizedJournal,[{method:'GET',path:'/refdata/location/orgServices'},{method:'POST',path:'/globalSearch',body},{method:'GET',path:'/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read'}],'DIVORCE_PROFILE_BROWSER_JOURNAL');
 }
 if(mutation)throw Error(facet==='divorce-jurisdiction'?'SOURCE_PROFILE_JURISDICTION_ASSERTION':'DIVORCE_PROFILE_GLOBAL_ASSERTION');
 return {catalogueCredit:false,wholeProfileSatisfied:false};
}
export function validateDivorceFlagEvidence(evidence) {
 const {calls,...policy}=evidence;
 assert.deepEqual(policy,{flag:'feature-global-search',evaluationFlags:{},routeFallback:true,liveProvider:false},'DIVORCE_PROFILE_BROWSER_FLAGS');
 assert(Array.isArray(calls)&&calls.some(call=>call.host==='clientsdk.launchdarkly.com'&&call.kind==='evaluation'&&call.method==='REPORT'),'DIVORCE_PROFILE_BROWSER_FLAGS');
 for(const call of calls){
  assert(['clientstream.launchdarkly.com','clientsdk.launchdarkly.com','events.launchdarkly.com','app.launchdarkly.com'].includes(call.host),'DIVORCE_PROFILE_BROWSER_FLAGS');
  assert(['goals','evaluation','auxiliary'].includes(call.kind)&&['GET','POST','REPORT','OPTIONS'].includes(call.method),'DIVORCE_PROFILE_BROWSER_FLAGS');
  if(call.kind==='evaluation')assert(call.host==='clientsdk.launchdarkly.com'&&call.method==='REPORT','DIVORCE_PROFILE_BROWSER_FLAGS');
  assert.deepEqual(call,{host:call.host,kind:call.kind,method:call.method,...(call.kind==='evaluation'?{path:'/sdk/evalx/synthetic-flags/context'}:{}),response:call.kind==='goals'?[]:{}},'DIVORCE_PROFILE_BROWSER_FLAGS');
 }
}
export function readDivorceBrowserEvidence(directory,facet,mutation) {
 validateDivorceFlagEvidence(read(path.join(directory,'profile-browser-flags.json')));
 const report=read(path.join(directory,'profile-browser-report.json'));
 assert.deepEqual(read(path.join(directory,'profile-browser-terminal.json')),{code:0,signal:null},'DIVORCE_PROFILE_BROWSER_TERMINAL');
 assert.equal(report.errors?.length,0,'DIVORCE_PROFILE_BROWSER_REPORT');
 const specs=[];const visit=suite=>{specs.push(...(suite.specs??[]));for(const child of suite.suites??[])visit(child);};for(const suite of report.suites??[])visit(suite);
 assert.equal(specs.length,1,'DIVORCE_PROFILE_BROWSER_REPORT');assert.equal(specs[0].title,'DIVORCE profile browser consumer','DIVORCE_PROFILE_BROWSER_REPORT');assert.equal(specs[0].tests?.length,1,'DIVORCE_PROFILE_BROWSER_REPORT');
 const test=specs[0].tests[0];assert.equal(test.status,'expected','DIVORCE_PROFILE_BROWSER_REPORT');assert.equal(test.expectedStatus,'passed','DIVORCE_PROFILE_BROWSER_REPORT');assert.equal(test.results.length,1,'DIVORCE_PROFILE_BROWSER_REPORT');assert.equal(test.results[0].status,'passed','DIVORCE_PROFILE_BROWSER_REPORT');assert.equal(test.results[0].retry,0,'DIVORCE_PROFILE_BROWSER_REPORT');
 const support=read(path.join(directory,'profile-browser-support.json'));assert(Array.isArray(support),'DIVORCE_PROFILE_BROWSER_JOURNAL');for(const call of support)assert.deepEqual(call,{method:'GET',path:'/refdata/external/v1/organisations',status:200,body:{}},'DIVORCE_PROFILE_BROWSER_JOURNAL');
 const observation=read(path.join(directory,'profile-browser-observation.json'));
 const journal=read(path.join(directory,facet==='divorce-jurisdiction'?'profile-jurisdiction-destinations.json':'profile-global-destinations.json'));
 if(facet==='divorce-jurisdiction'){
  const api=read(path.join(directory,'profile-jurisdiction-observations.json'));assert.equal(api.mutation,mutation,'DIVORCE_PROFILE_BROWSER_JOURNAL');assert.deepEqual(api.journal,journal,'DIVORCE_PROFILE_BROWSER_JOURNAL');
  try{validateProfileJurisdictionObservations(api.observations,journal,mutation);}catch(error){if(!mutation||error.message!=='SOURCE_PROFILE_JURISDICTION_ASSERTION')throw error;}
 }
 const assets=read(path.join(directory,'profile-browser-assets.json'));assert(assets.length>0&&assets.every(x=>typeof x.path==='string'&&/^sha256:[a-f0-9]{64}$/.test(x.digest)),'DIVORCE_PROFILE_BROWSER_ASSETS');
 assert.deepEqual(read(path.join(directory,'profile-browser-rejections.json')),[],'DIVORCE_PROFILE_BROWSER_EGRESS');
 validateDivorceBrowserObservation(facet,observation,journal,mutation);
 return {observation,journal,assets};
}
export async function probeDivorceBrowser({facet,cookie,output,readJournal,mutation,browser}) {
 if(facet==='divorce-jurisdiction')try{await probeProfileJurisdictions({cookie,output,readJournal,mutation});}catch(error){if(!mutation||error.message!=='SOURCE_PROFILE_JURISDICTION_ASSERTION')throw error;}
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',EXUI_DIVORCE_BROWSER:'true',EXUI_DIVORCE_FACET:facet,EXUI_DIVORCE_OUTPUT:output,EXUI_SESSION_COOKIE:cookie,EXUI_CHROMIUM_EXECUTABLE:browser.executable,...(mutation?{EXUI_HARNESS_MUTATION:mutation}:{})};
 const child=spawn(process.execPath,['/harness/node_modules/@playwright/test/cli.js','test','--config','/harness/playwright.divorce-profile.config.mjs'],{cwd:'/harness',env,stdio:'inherit'});
 const terminal=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});fs.writeFileSync(path.join(output,'profile-browser-terminal.json'),JSON.stringify(terminal),{mode:0o600});
 readDivorceBrowserEvidence(output,facet,mutation);
}
export const divorceBrowserEvidenceDigest=directory=>digestBytes(JSON.stringify(['profile-browser-flags.json','profile-browser-report.json','profile-browser-terminal.json','profile-browser-observation.json','profile-browser-assets.json','profile-browser-rejections.json','profile-browser-support.json'].map(name=>[name,digestBytes(fs.readFileSync(path.join(directory,name)))])));
