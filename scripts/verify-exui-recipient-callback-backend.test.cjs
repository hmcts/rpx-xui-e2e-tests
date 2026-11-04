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

test('support only: staged worker loads its complete module graph outside checkout and safely rejects invalid input',async t=>{
 const {stageCallbackProbe}=await import('./run-harness-recipient-callback-backend.mjs');
 const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-worker-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const staged=path.join(temp,'sources');stageCallbackProbe(staged);
 const run=()=>require('node:child_process').spawnSync(process.execPath,[path.join(staged,'scripts/recipient-callback-backend-worker.mjs')],{cwd:temp,input:'not-json-private-credential',encoding:'utf8',timeout:5000,maxBuffer:65536});
 const result=run();assert.equal(result.status,2);assert.equal(result.stderr,'');assert.deepEqual(JSON.parse(result.stdout),{status:'failed',phase:'read-input',code:'CALLBACK_PROBE_INPUT_INVALID'});assert(!result.stdout.includes('private-credential'));
 // Simulate an omitted transitive file without failing the earlier seal check.
 const sealsPath=path.join(staged,'source-seals.json'),seals=JSON.parse(fs.readFileSync(sealsPath));const missing='scripts/lib/exui-ccd-role-transition.mjs';delete seals[missing];fs.writeFileSync(sealsPath,JSON.stringify(seals));fs.unlinkSync(path.join(staged,missing));
 const absent=run();assert.equal(absent.status,2);assert.equal(absent.stderr,'');assert.deepEqual(JSON.parse(absent.stdout),{status:'failed',phase:'load-modules',code:'CALLBACK_PROBE_MODULE_MISSING'});
});
test('support only: worker terminal preserves structured failure before observation copying and sanitizes startup errors',async()=>{
 const {parseCallbackWorkerTerminal}=await import('./lib/exui-recipient-callback-diagnostics.mjs');
 assert.deepEqual(parseCallbackWorkerTerminal({code:2,text:JSON.stringify({status:'failed',phase:'read-input',code:'CALLBACK_PROBE_INPUT_INVALID',secret:'private'})}),{status:'failed',phase:'read-input',code:'CALLBACK_PROBE_INPUT_INVALID'});
 for(const [stderr,code] of [['ERR_MODULE_NOT_FOUND private/token','CALLBACK_PROBE_MODULE_MISSING'],['SyntaxError: private/token','CALLBACK_PROBE_STARTUP_SYNTAX'],['EACCES private/token','CALLBACK_PROBE_STARTUP_PERMISSION'],['private/token','CALLBACK_PROBE_TERMINAL_INVALID']])assert.throws(()=>parseCallbackWorkerTerminal({code:1,text:'',stderr}),error=>error.message===code);
 assert.throws(()=>parseCallbackWorkerTerminal({code:1,text:'{"status":"completed"}'}),/CALLBACK_PROBE_WORKER_FAILED/);
});
test('support only: missing module identity is restricted to the exact staged allowlist operand',async()=>{
 const {parseCallbackWorkerTerminal}=await import('./lib/exui-recipient-callback-diagnostics.mjs');const files=['scripts/recipient-callback-backend-worker.mjs'];
 for(const [operand,expected] of [['/tmp/recipient-probe/'+files[0],files[0]],['/private/credential',undefined],['/tmp/recipient-probe/'+files[0]+'/secret',undefined]]){
  assert.throws(()=>parseCallbackWorkerTerminal({text:'',stderr:`Error: Cannot find module '${operand}'\nMODULE_NOT_FOUND\nprivate-credential`},files),error=>error.message==='CALLBACK_PROBE_MODULE_MISSING'&&error.moduleIdentity===expected&&!error.message.includes('credential'));
 }
});
