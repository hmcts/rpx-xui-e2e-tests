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
   assert.deepEqual(options.body.event_data,options.body.data);assert.deepEqual(Object.keys(options.body.event_data).sort(),['sodAdditionalRecipients','sodAdditionalRecipientsList']);
   const data={...structuredClone(current.case_data),...structuredClone(options.body.event_data)};
   if(defect==='persist-validation')current.version++;
   if(mode==='reject'){assert.equal(data.sodAdditionalRecipientsList[0].value.emailInformation.emailName,'HARNESS_CALLBACK_REJECT');return {status:422,body:{errors:['HARNESS_CALLBACK_BUSINESS_REJECTION']}};}
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
 assert.deepEqual(Object.keys(seals),callbackProbeFiles);
 for(const name of [...callbackProbeFiles,'source-seals.json'])assert.equal(fs.statSync(path.join(temp,'valid',name)).mode&0o777,0o444);
 for(const directory of ['', 'scripts', 'scripts/lib', 'scripts/fixtures/ccd'])assert.equal(fs.statSync(path.join(temp,'valid',directory)).mode&0o777,0o755);assert(callbackProbeFiles.every(name=>!name.includes('.env')&&!name.includes('node_modules')));
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
 const sealsPath=path.join(staged,'source-seals.json'),seals=JSON.parse(fs.readFileSync(sealsPath));const missing='scripts/lib/exui-ccd-role-transition.mjs';delete seals[missing];fs.unlinkSync(sealsPath);fs.writeFileSync(sealsPath,JSON.stringify(seals),{mode:0o444});fs.unlinkSync(path.join(staged,missing));
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
test('support only: failed-worker observation recovery copies only bounded regular allowlisted files privately',async t=>{
 const {collectCallbackProbeObservations}=await import('./run-harness-recipient-callback-backend.mjs');
 const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-observe-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));let inspections=0,copies=[];
 const inventory=[{name:'recipient-callback.jsonl',file:true,size:12},{name:'validation.json',file:true,size:24},{name:'submission.json',missing:true}];
 const runDocker=args=>{if(args[0]==='exec')return JSON.stringify(inventory);copies.push(args);fs.writeFileSync(args.at(-1),'synthetic');return '';};
 const result=collectCallbackProbeObservations({containers:{client:'owned-client'}},temp,{runDocker,inspect:()=>inspections++});
 assert.deepEqual(result,{status:'collected',files:['recipient-callback.jsonl','validation.json']});assert.equal(inspections,3);assert.equal(copies.length,2);for(const name of result.files)assert.equal(fs.statSync(path.join(temp,'observations',name)).mode&0o777,0o600);
 inventory[0].file=false;assert.throws(()=>collectCallbackProbeObservations({containers:{client:'owned-client'}},temp,{runDocker,inspect:()=>{}}),/CALLBACK_PROBE_OBSERVATIONS_COPY_FAILED/);
 inventory[0].file=true;inventory[0].size=1048577;assert.throws(()=>collectCallbackProbeObservations({containers:{client:'owned-client'}},temp,{runDocker,inspect:()=>{}}),/CALLBACK_PROBE_OBSERVATIONS_COPY_FAILED/);
 assert.equal(copies.length,2);
});

test('support only: omission feasibility requires a completed named assertion after real positive witness, never timeout',async()=>{
 const {assertCallbackUiOutcome}=await import('./run-harness-recipient-callback-ui.mjs');
 const observed={catalogueCredit:false,faultEffective:true,witness:'valid-CYA-without-callback'};
 const report={errors:[],stats:{skipped:0,unexpected:1,expected:0},suites:[{specs:[{tests:[{results:[{status:'failed',error:{message:'CALLBACK_BINDING_OMISSION_DETECTED'}}]}]}]}]};
 assert.equal(assertCallbackUiOutcome('binding-omitted',{code:1,signal:null},observed,report),'callback-binding-omission-detected');
 for(const change of [r=>r.suites[0].specs[0].tests[0].results[0].status='timedOut',r=>r.suites[0].specs[0].tests[0].results[0].error.message='unrelated failure',r=>r.stats.skipped=1,r=>r.errors.push({message:'global error'})]){const changed=structuredClone(report);change(changed);assert.throws(()=>assertCallbackUiOutcome('binding-omitted',{code:1,signal:null},observed,changed));}
 assert.throws(()=>assertCallbackUiOutcome('binding-omitted',{code:1,signal:null},{...observed,faultEffective:false},report));
 assert.throws(()=>assertCallbackUiOutcome('binding-omitted',{code:1,signal:'SIGTERM'},observed,report));
});
test('support only: callback UI checks its distinct receipt and actual descriptor without baseline import receipt',async t=>{
 const {verifyCallbackUiRuntime,callbackUiFailureCode}=await import('./run-harness-recipient-callback-ui.mjs');
 const {deriveRecipientCallbackFixture}=await import('./lib/exui-recipient-callback-fixture.mjs');const {binding}=deriveRecipientCallbackFixture();
 const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-ui-receipt-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));fs.mkdirSync(output+'/recipient-callback-import');
 const state={output,owner:'harness-callback-test',namespace:'owned-namespace',images:{data:{id:'image'}}};
 const definition={id:'HarnessNestedPRL',version:{number:2},events:[{id:binding.eventId}]},pages={case_type_id:'HarnessNestedPRL',event_id:binding.eventId,wizard_pages:[{id:'serviceOfDocuments2',wizard_page_fields:[{case_field_id:binding.fieldId,order:8}],callback_url_mid_event:binding.normalizedUrl}]};
 const imported={kind:'recipient-callback-import-feasibility',status:'import-and-callback-descriptor-observed',owner:state.owner,namespace:state.namespace,images:state.images,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,seal:{binding},observations:{definition:{status:200,body:definition},pages:{status:200,body:pages}}};
 const receiptPath=output+'/recipient-callback-import/receipt.json';fs.writeFileSync(receiptPath,JSON.stringify(imported));let inspected=0;
 const request=(_state,_port,route)=>{
  if(route==='/testing-support/accounts')return {status:201,body:{}};
  if(route==='/o/token')return {status:200,body:{access_token:'synthetic-private'}};
  if(route==='/details')return {status:200,body:{id:'observer-id'}};
  if(route==='/testing-support/lease')return {status:200,body:'synthetic-service'};
  return {status:200,body:route.includes('/wizard-page-structure/')?pages:definition};
 };
 const result=verifyCallbackUiRuntime(state,imported,{request,inspect:()=>inspected++});assert.equal(inspected,1);assert.match(result.definition,/^sha256:/);assert(!fs.existsSync(output+'/definition-import.json'));
 pages.wizard_pages[0].callback_url_mid_event=null;
 assert.throws(()=>verifyCallbackUiRuntime(state,JSON.parse(fs.readFileSync(receiptPath)),{request,inspect:()=>{}}),/CALLBACK_UI_IMPORT_DRIFT/);
 const retainedVerification=JSON.parse(fs.readFileSync(output+'/recipient-callback-import/runtime-verification.json'));assert.equal(retainedVerification.status,'descriptor-drift');assert.equal(retainedVerification.failedDescriptor,'pages');assert.equal(retainedVerification.observations.pages.body.wizard_pages[0].callback_url_mid_event,null);assert.equal(fs.statSync(output+'/recipient-callback-import/runtime-verification.json').mode&0o777,0o600);assert(!JSON.stringify(retainedVerification).includes('synthetic-private'));
 assert.equal(callbackUiFailureCode(Error('CALLBACK_UI_IMPORT_DRIFT\nprivate details')),'CALLBACK_UI_IMPORT_DRIFT');
 assert.equal(callbackUiFailureCode(Error('CALLBACK_PAGE_URL')),'CALLBACK_PAGE_URL');
 assert.equal(callbackUiFailureCode(Error('CALLBACK_UI_PRIVATE_SECRET')),'CALLBACK_UI_PHASE_FAILED');
});
test('support only: callback native staging and sessions cannot alias writable output or candidate evidence',async t=>{
 const {createCallbackNativeWorkspace,callbackUiFailureCode}=await import('./run-harness-recipient-callback-ui.mjs');
 const {assertReadOnlyMountIsolation}=await import('./lib/exui-oci-runtime.mjs');
 const {workspace,stagedHarness,stateRoot}=createCallbackNativeWorkspace();t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
 const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-native-output-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 assert.equal(fs.statSync(workspace).mode&0o777,0o700);
 assertReadOnlyMountIsolation([stagedHarness],[output,stateRoot+'/baseline/sessions']);
 assertReadOnlyMountIsolation([output,stagedHarness],[stateRoot+'/baseline/sessions',stateRoot+'/baseline/diagnostics']);
 fs.mkdirSync(output+'/sources');assert.throws(()=>assertReadOnlyMountIsolation([output+'/sources'],[output]),/OCI_READONLY_MOUNT_WRITABLE_ALIAS/);
 assert.equal(callbackUiFailureCode(Error('OCI_READONLY_MOUNT_WRITABLE_ALIAS\nprivate details')),'OCI_READONLY_MOUNT_WRITABLE_ALIAS');
});
