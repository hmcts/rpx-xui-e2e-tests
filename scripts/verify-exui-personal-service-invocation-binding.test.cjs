const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {parentPacket}=require('./fixtures/exui-personal-service-parent.mock.cjs');
const tmp=()=>fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'personal-parent-test-'));
const api=()=>import('./lib/exui-personal-service-invocation-binding.mjs');
test('complete parent-bound raw pair is review-ready only; all acceptance flags false',async()=>{const d=tmp();try{const p=await parentPacket(d),m=await api();const r=m.readPersonalCohort(d,p.expected);assert.equal(r.status,'fresh-cohort-ready-for-independent-review');for(const k of Object.keys(m.PERSONAL_NO_CREDIT))assert.equal(r[k],false);assert.equal(r.obligationId,'configuration-shape:9ac2fb1c2dec3b07cd2dfb2bafcb2aa9fd4a0adfe8745e202e5616335f291df8');}finally{fs.rmSync(d,{recursive:true,force:true});}});
const negatives={
 'child-coherent input and receipt replacement':(p,m,d)=>{const input=m.personalJson(d+'/baseline','input.json');input.runId='ccd-99999999-1234-1234-1234-999999999999';p.put('baseline/input.json',input);const record=m.personalJson(d,'baseline-expected.json');record.binding.runId=input.runId;record.binding.files['input.json']=m.personalFile(d+'/baseline','input.json').digest;p.put('baseline-expected.json',record);},
 'coherent producer replacement':(p,m)=>{p.cohort.producer.commit='b'.repeat(40);p.put('parent-input.json',p.cohort);},
 'coherent candidate replacement':(p,m)=>{p.cohort.artifact.payloadDigest='sha256:'+'b'.repeat(64);p.put('parent-input.json',p.cohort);},
 'changed held expected file':(p,m)=>{p.bindings.baseline.plan.candidate.mounts[0].writable=true;p.put('baseline-expected.json',{binding:p.bindings.baseline,cohort:p.cohort});},
 'wrong independently observed terminal':p=>{p.expected.invocations.baseline.observedTerminal.code=2;},
 'zero exit missing raw report':(p,m,d)=>fs.unlinkSync(d+'/baseline/baseline/report.json'),
 'missing invocation':p=>{delete p.expected.invocations.optional;},
 'coherent foreign row':(p,m,d)=>{const b=p.bindings.baseline;const input=m.personalJson(b.directory,'input.json');input.personalServiceBinding.pageOrder=4;p.put('baseline/input.json',input);b.files['input.json']=m.personalFile(b.directory,'input.json').digest;p.put('baseline-expected.json',{binding:b,cohort:p.cohort});},
 'changed launch script':(p,m,d)=>{const launch=m.personalJson(d,'baseline-launch.json');launch.command.script='/tmp/unrelated.mjs';p.put('baseline-launch.json',launch);p.expected.invocations.baseline.launchDigest=m.personalFile(d,'baseline-launch.json').digest;},
 'private workspace residue':p=>fs.mkdirSync(p.bindings.baseline.privateWorkspace),
 'cleanup false':(p,m,d)=>{const r=m.personalJson(d,'baseline-removal.json');r.containersAbsent=false;p.put('baseline-removal.json',r);p.expected.invocations.baseline.removalDigest=m.personalFile(d,'baseline-removal.json').digest;},
};
for(const [name,mutate]of Object.entries(negatives))test('parent cohort rejects '+name,async()=>{const d=tmp();let p;try{p=await parentPacket(d);const m=await api();mutate(p,m,d);assert.throws(()=>m.readPersonalCohort(d,p.expected));}finally{if(p)for(const b of Object.values(p.bindings))fs.rmSync(b.privateWorkspace,{recursive:true,force:true});fs.rmSync(d,{recursive:true,force:true});}});
for(const [name,mutate]of Object.entries({
 'validation moved before trigger':(o,j)=>j.unshift(j.splice(1,1)[0]),
 'healthy empty CYA missing':o=>{delete o.empty.cyaControl;},
 'candidate wrong mounts':(o,j,p,m)=>{const v=m.personalJson(p.bindings.optional.directory,'baseline/candidate-lifecycle.json');v.after.Mounts[0].RW=true;p.put('optional/baseline/candidate-lifecycle.json',v);},
 'wrong actual runtime image':(o,j,p,m)=>{const v=m.personalJson(p.bindings.optional.directory,'baseline/runtime-identity.json');v.observedImageId='sha256:'+'c'.repeat(64);p.put('optional/baseline/runtime-identity.json',v);},
}))test('raw pair rejects coherently rehashed '+name,async()=>{const d=tmp();try{const p=await parentPacket(d),m=await api(),b=p.bindings.optional,o=m.personalJson(b.directory,'baseline/personal-service-observation.json'),j=m.personalFile(b.directory,'baseline/ccd-requests.jsonl').bytes.toString().trim().split('\n').map(JSON.parse);mutate(o,j,p,m);p.put('optional/baseline/personal-service-observation.json',o);fs.writeFileSync(b.directory+'/baseline/ccd-requests.jsonl',j.map(JSON.stringify).join('\n')+'\n');const completion=m.personalJson(d,'optional-completion.json');completion.files=m.personalFiles(b.directory,m.PERSONAL_FINAL_FILES);p.put('optional-completion.json',completion);p.expected.invocations.optional.completionDigest=m.personalFile(d,'optional-completion.json').digest;assert.throws(()=>m.readPersonalCohort(d,p.expected));}finally{fs.rmSync(d,{recursive:true,force:true});}});
test('reader rejects traversal and symlink evidence',async()=>{const d=tmp();try{const m=await api();fs.writeFileSync(d+'/actual','{}');fs.symlinkSync(d+'/actual',d+'/alias');assert.throws(()=>m.personalFile(d,'alias'),/ALIAS/);assert.throws(()=>m.personalFile(d,'../actual'),/PATH/);}finally{fs.rmSync(d,{recursive:true,force:true});}});
test('fixed child command has explicit Node PATH and captures actual terminal',async()=>{
 const m=await api(),{executePersonalChild}=await import('./run-harness-personal-service-cohort.mjs'),target=new EventEmitter(),child=new EventEmitter();let options;
 const command=m.personalChildCommand('/tmp/baseline-expected.json','sha256:'+'a'.repeat(64));const result=await executePersonalChild(command,{signalTarget:target,launch:(file,args,opts)=>{assert.equal(file,process.execPath);assert.deepEqual(args,[command.script,...command.args]);options=opts;queueMicrotask(()=>child.emit('exit',0,null));return child;}});
 assert.equal(result.observed,true);assert.equal(result.code,0);assert.deepEqual(Object.keys(options.env).sort(),['HOME','PATH','TMPDIR']);assert(options.env.PATH.startsWith(path.dirname(process.execPath)+path.delimiter));assert.equal(target.listenerCount('SIGTERM'),0);
 await assert.rejects(executePersonalChild({...command,script:'/tmp/other.mjs'},{launch:()=>{throw Error('must not launch');}}));
});
test('cancellation waits for observed child and retains forced terminal',async()=>{
 const m=await api(),{executePersonalChild}=await import('./run-harness-personal-service-cohort.mjs'),target=new EventEmitter(),child=new EventEmitter();let terminated=false;
 const r=await executePersonalChild(m.personalChildCommand('/tmp/baseline-expected.json','sha256:'+'a'.repeat(64)),{signalTarget:target,launch:()=>{queueMicrotask(()=>target.emit('SIGTERM'));return child;},terminate:async()=>{terminated=true;queueMicrotask(()=>child.emit('exit',null,'SIGKILL'));return {observed:true,forced:true};}});assert(terminated);assert.equal(r.cancelled,true);assert.equal(r.forced,true);assert.equal(r.signal,'SIGKILL');
});
test('cleanup refuses unobserved child and foreign recovery without removing CCD',async()=>{
 const {cleanupPersonalInvocation}=await import('./run-harness-personal-service-cohort.mjs');let cleaned=false;
 await assert.rejects(cleanupPersonalInvocation({},undefined,{cleanupCcd:()=>{cleaned=true;}}),/UNOBSERVED/);assert.equal(cleaned,false);
 const d=tmp();try{const p=await parentPacket(d);p.put('baseline/runtime/recovery.json',{owner:'foreign'});await assert.rejects(cleanupPersonalInvocation(p.bindings.baseline,{observed:true},{inspect:()=>null,cleanupCcd:()=>{cleaned=true;}}),/RECOVERY_DRIFT/);assert.equal(cleaned,false);}finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('partial native cleanup rejects uncertainty before touching CCD or private workspace',async()=>{
 const {cleanupPersonalInvocation}=await import('./run-harness-personal-service-cohort.mjs'),d=tmp();try{const p=await parentPacket(d);let ccd=false,workspace=false;await assert.rejects(cleanupPersonalInvocation(p.bindings.baseline,{observed:true},{inspect:()=>({Id:'foreign'}),cleanupNative:async()=>{throw Error('partial cleanup rejected');},cleanupCcd:()=>{ccd=true;},removeWorkspace:()=>{workspace=true;}}),/partial cleanup rejected/);assert.equal(ccd,false);assert.equal(workspace,false);}finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('observed no-child launch failure is retained without inventing an exit code',async()=>{
 const m=await api(),{executePersonalChild}=await import('./run-harness-personal-service-cohort.mjs');
 const result=await executePersonalChild(m.personalChildCommand('/tmp/baseline-expected.json','sha256:'+'a'.repeat(64)),{launch:()=>{throw Error('spawn unavailable');}});
 assert.deepEqual(result,{started:false,observed:true,forced:false,cancelled:false,code:null,signal:null});
});
test('unobserved termination rejects and cannot yield a cleanup-authorizing terminal',async()=>{
 const m=await api(),{executePersonalChild}=await import('./run-harness-personal-service-cohort.mjs'),target=new EventEmitter(),child=new EventEmitter();
 await assert.rejects(executePersonalChild(m.personalChildCommand('/tmp/baseline-expected.json','sha256:'+'a'.repeat(64)),{signalTarget:target,launch:()=>{queueMicrotask(()=>target.emit('SIGTERM'));return child;},terminate:async()=>{throw Error('OWNED_CHILD_TERMINATION_UNOBSERVED');}}),/UNOBSERVED/);assert.equal(target.listenerCount('SIGTERM'),0);
});
test('successful parent cleanup checks every held CCD/native name and CID',async()=>{
 const d=tmp();try{const p=await parentPacket(d),{cleanupPersonalInvocation}=await import('./run-harness-personal-service-cohort.mjs');const seen=[];let cleaned=0;
 const result=await cleanupPersonalInvocation(p.bindings.baseline,{observed:true},{inspect:name=>{seen.push(name);return null;},cleanupCcd:()=>{cleaned++;}});
 assert.equal(cleaned,1);for(const item of [...result.names,...result.cids])assert(seen.includes(item));assert.equal(result.containersAbsent,true);
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('retained CCD inspection rejects coherently rehashed foreign owner or stopped service',async()=>{
 for(const mutation of [r=>{r.Config.Labels['exui.harness.owner']='foreign';},r=>{r.State.Running=false;}]){
 const d=tmp();try{const p=await parentPacket(d),m=await api(),b=p.bindings.baseline;mutation(b.ccdInspection.database);const input=m.personalJson(b.directory,'input.json');assert.throws(()=>m.validatePersonalInput(input,b,p.cohort),/CCD_RUNTIME/);}finally{fs.rmSync(d,{recursive:true,force:true});}
 }
});
for(const phase of ['before','after'])for(const field of ['Entrypoint','Cmd'])test(`event scope without optional plan process rejects wrong ${phase} ${field}`,async()=>{
 const d=tmp();try{const p=await parentPacket(d),m=await api(),b=p.bindings.baseline;assert.equal(b.plan.candidate.launchProcess,undefined);m.validatePersonalNativeFinalization(b);const lifecycle=m.personalJson(b.directory,'baseline/candidate-lifecycle.json');lifecycle[phase].Config[field]=['foreign-process'];p.put('baseline/baseline/candidate-lifecycle.json',lifecycle);assert.throws(()=>m.validatePersonalNativeFinalization(b),/OCI_CONTAINER_(ENTRYPOINT|COMMAND)_MISMATCH/);}finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('live revalidation preserves parent receipt bytes across harmless CCD array ordering and still rejects semantic drift',async()=>{
 const {verifyCallbackUiRuntime}=await import('./run-harness-recipient-callback-ui.mjs'),{deriveRecipientCallbackFixture}=await import('./lib/exui-recipient-callback-fixture.mjs'),{binding}=deriveRecipientCallbackFixture(),d=tmp();
 try{
  fs.mkdirSync(d+'/recipient-callback-import');const state={output:d,owner:'harness-fixture',namespace:'owned-fixture',images:{data:{id:'fixed'}}};
  const definition={id:'HarnessNestedPRL',version:{number:2},events:[{id:binding.eventId}]},pages={case_type_id:'HarnessNestedPRL',event_id:binding.eventId,wizard_pages:[{id:'serviceOfDocuments2',wizard_page_fields:[{case_field_id:binding.fieldId,order:8},{case_field_id:'protectedValue',order:2}],callback_url_mid_event:binding.normalizedUrl}]};
  const imported={kind:'recipient-callback-import-feasibility',status:'import-and-callback-descriptor-observed',owner:state.owner,namespace:state.namespace,images:state.images,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,seal:{binding},observations:{definition:{status:200,body:definition},pages:{status:200,body:pages}}};
  fs.writeFileSync(d+'/recipient-callback-import/receipt.json',JSON.stringify(imported));let live=structuredClone(pages),calls=0;
  const request=(_state,_port,route)=>{calls++;if(route==='/testing-support/accounts')return {status:201,body:{}};if(route==='/o/token')return {status:200,body:{access_token:'synthetic-fixture'}};if(route==='/details')return {status:200,body:{id:'fixture-observer'}};if(route==='/testing-support/lease')return {status:200,body:'fixture-service'};return {status:200,body:route.includes('/wizard-page-structure/')?live:definition};};
  const expected=verifyCallbackUiRuntime(state,imported,{request,inspect:()=>{}}),held=fs.readFileSync(d+'/recipient-callback-import/runtime-verification.json');const oldCalls=calls;live.wizard_pages[0].wizard_page_fields.reverse();
  assert.deepEqual(verifyCallbackUiRuntime(state,imported,{request,inspect:()=>{},writeReceipt:false}),expected);assert(calls>oldCalls);assert.deepEqual(fs.readFileSync(d+'/recipient-callback-import/runtime-verification.json'),held);
  live.wizard_pages[0].callback_url_mid_event=null;assert.throws(()=>verifyCallbackUiRuntime(state,imported,{request,inspect:()=>{},writeReceipt:false}),/CALLBACK_UI_IMPORT_DRIFT/);assert.deepEqual(fs.readFileSync(d+'/recipient-callback-import/runtime-verification.json'),held);
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
for(const mode of ['precreation','closed-reader','pending','unknown-create','forced','unobserved','cancelled','signalled','foreign-registry','missing-finalization','cleanup-failure'])test('actual parent closure branding for '+mode,async t=>{
 const {personalClosure}=require('./fixtures/exui-personal-service-closure.mock.cjs'),r=await personalClosure(t,mode);
 assert(r.error);assert.equal(r.closed,['precreation','closed-reader'].includes(mode));
 if(mode==='precreation')assert.equal(r.state.calls.some(x=>x.startsWith('child:')||x==='ccd-cleanup'),false);
 if(mode==='closed-reader')assert.deepEqual(r.state.calls,['prepare:baseline','child:baseline','ccd-cleanup','prepare:optional','child:optional','ccd-cleanup']);
 else assert.equal(r.state.calls.includes('prepare:optional'),false);
});
test('controlled terminal-plus-absence shortcut wrongly brands a pending creator and is rejected by current parent',async t=>{
 const {personalClosure}=require('./fixtures/exui-personal-service-closure.mock.cjs');
 assert.equal((await personalClosure(t,'pending')).closed,false);
 assert.equal((await personalClosure(t,'pending',{unsafeOld:true})).closed,true,'controlled old-code defect must expose false closure');
});

test('first parent cleanup failure cannot be erased by successful finally retry',async t=>{
 const {personalClosure}=require('./fixtures/exui-personal-service-closure.mock.cjs'),r=await personalClosure(t,'cleanup-retry');assert(r.error);assert.equal(r.state.calls.filter(x=>x==='ccd-cleanup').length,2);assert.equal(r.closed,false,'first failed cleanup must stay unsafe');assert.equal(r.state.calls.includes('prepare:optional'),false);
});
