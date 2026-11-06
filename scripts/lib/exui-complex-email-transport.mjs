import assert from 'node:assert/strict';
import {digestBytes} from './exui-evidence-io.mjs';
const fail='COMPLEX_TRANSPORT',plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const addresses=new Set(['alpha@harness.example.com','beta@harness.example.com','Synthetic recipient contact alpha','control@harness.example.com']);
const names=new Set(['Synthetic contact control 1','Synthetic contact control 2','Synthetic contact probe 1','Synthetic contact probe 2']);
const empty=value=>value===null||value===''||plain(value)&&Object.values(value).every(empty);
export function complexTransportData(value){
 assert(plain(value)&&Object.keys(value).every(k=>['protectedValue','sodAdditionalRecipientsList'].includes(k)),fail);
 assert.equal(value.protectedValue,'synthetic-protected-original',fail);assert(Array.isArray(value.sodAdditionalRecipientsList)&&value.sodAdditionalRecipientsList.length<=2,fail);
 for(const row of value.sodAdditionalRecipientsList){assert(plain(row)&&Object.keys(row).every(k=>['id','value'].includes(k)),fail);assert(row.id===null||typeof row.id==='string'&&/^[a-zA-Z0-9-]+$/.test(row.id),fail);
  const v=row.value;assert(plain(v)&&Object.keys(v).every(k=>['serveByPostOrEmail','emailInformation','postalInformation'].includes(k)),fail);assert.equal(v.serveByPostOrEmail,'email',fail);
  assert(plain(v.emailInformation)&&Object.keys(v.emailInformation).sort().join()===['emailAddress','emailName'].join(),fail);
  assert(names.has(v.emailInformation.emailName)&&addresses.has(v.emailInformation.emailAddress),fail);assert(!Object.hasOwn(v,'postalInformation')||empty(v.postalInformation),fail);
 }
 return structuredClone(value);
}
export function complexTransportProjection({method,upstreamPath,path,body,response,status,actorId,ordinal}){
 const create=method==='POST'&&/^\/caseworkers\/[^/]+\/jurisdictions\/HARNESS\/case-types\/HarnessNestedPRL\/cases$/.test(upstreamPath);
 const validate=method==='POST'&&upstreamPath==='/case-types/HarnessNestedPRL/validate';
 const submit=method==='POST'&&/^\/cases\/\d{16}\/events$/.test(upstreamPath);
 const view=method==='GET'&&/^\/internal\/cases\/\d{16}$/.test(upstreamPath);
 if(!create&&!validate&&!submit&&!view)return null;
 assert(Number.isSafeInteger(ordinal)&&ordinal>0&&typeof actorId==='string'&&actorId.length>0,fail);
 const responseBytes=Buffer.from(response),responseBytesDigest=digestBytes(responseBytes);let parsed;
 try{parsed=JSON.parse(responseBytes);}catch{parsed=null;}
 const result={ordinal,kind:create?'create':validate?'validate':submit?'submit':'view',method,path,upstreamPath,status,actorId,
  requestBytesDigest:digestBytes(Buffer.from(body??'')),responseBytesDigest,responseBodyDigest:parsed===null?null:digestBytes(JSON.stringify(parsed))};
 if(view||submit)result.caseId=upstreamPath.match(/\/cases\/(\d{16})/)[1];
 if(create||validate||submit){let request;try{request=JSON.parse(body);}catch{assert.fail(fail);}
  result.request={path,data:complexTransportData(request.data),event:{id:request.event?.id}};
  assert.equal(result.request.event.id,create?'create':'update',fail);
  result.classificationPresent=Object.hasOwn(request,'data_classification');result.dataClassificationPresent=Object.hasOwn(request.data,'data_classification');
 }
 if(create&&status===201){assert(/^\d{16}$/.test(String(parsed?.id)),fail);result.caseId=String(parsed.id);}
 // Response bodies and auth/event tokens never enter this journal. Semantic hashes
 // bind independently captured fixed observations without copying error payloads.
 return result;
}
export function validateComplexTransport(records,observed,{actorId,observerId,observerRecords}){
 assert(Array.isArray(records)&&records.length>0,fail);assert.deepEqual(records.map(r=>r.ordinal),records.map((_,i)=>i+1),fail);
 const journeys=[observed.healthy,observed.probe],windows=[];let current;
 for(const row of records){assert.equal(row.actorId,actorId,fail);assert(['create','view','validate','submit'].includes(row.kind),fail);
  if(row.kind==='create'){assert.equal(row.status,201,fail);assert(/^\d{16}$/.test(row.caseId),fail);current={caseId:row.caseId,validations:[],submits:[]};windows.push(current);assert.deepEqual(row.request.data,{protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[]},fail);assert.equal(row.request.event.id,'create',fail);}
  else if(row.kind==='validate'){assert(current,fail);current.validations.push(row);}
  else {assert(current&&windows.some(w=>w.caseId===row.caseId),fail);if(row.kind==='submit'){assert.equal(row.caseId,current.caseId,fail);current.submits.push(row);}else assert.equal(row.status,200,fail);}
  if(row.request){complexTransportData(row.request.data);assert.equal(row.classificationPresent,false,fail);assert.equal(row.dataClassificationPresent,false,fail);}
 }
 assert.deepEqual(windows.map(w=>w.caseId),journeys.map(j=>j.caseId),fail);
 for(const [index,journey]of journeys.entries()){
  const window=windows[index];assert.equal(window.validations.length,journey.validationResponses.length,fail);
  for(const [vIndex,v]of journey.validationResponses.entries()){
   const row=window.validations[vIndex];assert.equal(row.method,'POST',fail);assert.equal(row.status,v.status,fail);assert.deepEqual(row.request,v.request,fail);assert.equal(row.responseBodyDigest,digestBytes(JSON.stringify(v.body)),fail);
   if(window.submits.length)assert(row.ordinal<window.submits[0].ordinal,fail);
  }
  assert.equal(window.submits.length,journey.status===201?1:0,fail);
  if(journey.status===201){const row=window.submits[0];assert.equal(row.status,201,fail);assert.deepEqual(row.request,{path:journey.outgoing.path,...journey.sent},fail);}
 }
 assert.equal(observerRecords.length,8,fail);assert.deepEqual(observerRecords.map(r=>r.ordinal),[1,2,3,4,5,6,7,8],fail);
 let position=0;
 for(const journey of journeys)for(const stage of ['before','after'])for(const view of ['state','history']){
  const row=observerRecords[position++];assert.deepEqual([row.stage,row.view,row.caseId,row.actorId,row.method,row.status],[stage,view,journey.caseId,observerId,'GET',200],fail);
  const suffix=view==='history'?'/events':'';assert.equal(row.path,`/caseworkers/${encodeURIComponent(observerId)}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${journey.caseId}${suffix}`,fail);
  assert.deepEqual(row.body,journey[stage][view],fail);
 }
 return true;
}
