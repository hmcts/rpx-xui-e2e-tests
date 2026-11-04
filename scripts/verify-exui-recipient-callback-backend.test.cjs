const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {test}=require('node:test');
async function execute(mode,defect){
 const {probeRecipientCallbackBackend}=await import('./lib/exui-recipient-callback-backend.mjs');
 const credentials=Object.fromEntries(['allowed','courtadmin','observer'].map(name=>[name,{userId:name}]));
 let current,history=[],submits=0;const observations=[];
 const request=async(route,actor,options={})=>{
  if(route.includes('/event-triggers/'))return {status:200,body:{token:actor.userId+'-token'}};
  if(route.endsWith('/cases')&&options.method==='POST'){assert.equal(actor.userId,'allowed');current={case_data:structuredClone(options.body.data),version:1,state:'JUDICIAL_REVIEW'};return {status:201,body:{id:1234567890123456}};}
  if(route.includes('/validate?')){
   assert.equal(actor.userId,'courtadmin');assert.equal(options.body.event_token,'courtadmin-token');assert.equal(options.body.case_reference,'1234567890123456');assert(options.headers.accept.includes('case-data-validate.v2'));assert.equal(route,'/case-types/HarnessNestedPRL/validate?pageId=serviceOfDocuments2');
   const data=structuredClone(options.body.data);
   if(defect==='persist-validation')current.version++;
   if(mode==='reject')return {status:422,body:{errors:['HARNESS_CALLBACK_BUSINESS_REJECTION']}};
   data.sodAdditionalRecipientsList[0].value.emailInformation.emailName='HARNESS_CALLBACK_NORMALIZED';
   if(defect==='lose-sibling')data.sodAdditionalRecipientsList.pop();
   return {status:200,body:{data}};
  }
  if(route.endsWith('/events')&&options.method==='POST'){submits++;Object.assign(current.case_data,structuredClone(options.body.data));current.version++;history.push({id:'serviceOfDocuments'});if(defect==='lost-write')current.case_data.sodAdditionalRecipientsList[0].value.emailInformation.emailName='lost';return {status:201,body:{}};}
  assert.equal(actor.userId,'observer');return {status:200,body:structuredClone(route.endsWith('/events')?history:current)};
 };
 const result=await probeRecipientCallbackBackend({mode,credentials,request,readJournal:()=>[{invocationId:'recipient-callback-'+mode,recipientCount:2,requestDigest:'sha256:'+'a'.repeat(64),responseDigest:'sha256:'+'b'.repeat(64),outcome:mode==='reject'?'business-rejected':'normalized'}],record:(name,value)=>observations.push({name,value})});
 return {result,submits,observations};
}
test('support only: backend normalize requires actual unchanged validation and persisted normalized data',async()=>{const value=await execute('normalize');assert.equal(value.submits,1);assert.equal(value.result.catalogueCredit,false);assert.equal(value.observations.length,2);});
test('support only: backend business rejection never submits',async()=>{const value=await execute('reject');assert.equal(value.submits,0);assert.equal(value.result.status,'business-rejection-observed');});
for(const defect of ['persist-validation','lose-sibling','lost-write'])test('support only: backend rejects '+defect,async()=>{await assert.rejects(execute('normalize',defect));});
test('support only: source staging copies exact allowlist and rejects aliases, never env or checkout',async t=>{
 const {stageCallbackProbe,callbackProbeFiles}=await import('./run-harness-recipient-callback-backend.mjs');
 const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-stage-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const seals=stageCallbackProbe(path.join(temp,'valid'));
 assert.deepEqual(Object.keys(seals),callbackProbeFiles);assert(callbackProbeFiles.every(name=>!name.includes('.env')&&!name.includes('node_modules')));
 const source=path.join(temp,'source');fs.mkdirSync(source);fs.symlinkSync(path.resolve('scripts'),path.join(source,'scripts'));
 assert.throws(()=>stageCallbackProbe(path.join(temp,'aliased'),source),/CALLBACK_PROBE_SOURCE_ALIAS/);
});

test('support only: diagnostic codes preserve known assertion cause without raw details',async()=>{
 const {callbackFailureCode}=await import('./lib/exui-recipient-callback-diagnostics.mjs');
 assert.equal(callbackFailureCode(Error('CALLBACK_PAGE_REQUIRED\nsecret request details')),'CALLBACK_PAGE_REQUIRED');
 for(const message of ['private bearer token','CALLBACK_PRIVATE_SECRET','CALLBACK_PAGE_REQUIRED secret',''])assert.equal(callbackFailureCode(Error(message)),'CALLBACK_PROBE_UNCLASSIFIED_FAILURE');
});
