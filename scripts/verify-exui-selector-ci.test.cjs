const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const hash=c=>'sha256:'+c.repeat(64);
async function setup(){
 const api=await import('./run-harness-ci.mjs');
 const context={commit:'a'.repeat(40),browserRoot:'/browser',sourceDigests:{selectorEventRow:hash('b')},dependencies:{digest:hash('c')},browserDigest:hash('d')};
 const job={candidateManifest:'/candidate.json',expectedArtifactDigest:hash('e')};
 const authority={expected:{harnessCommit:context.commit,harnessSourceDigest:hash('b'),harnessDependencyDigest:hash('c'),browserDigest:hash('d'),identity:{artifactDigest:hash('e')}},terminal:{code:0,signal:null}};
 const result={status:'PASS',nativeRuntimeAcceptance:true,cleanupComplete:true,receiptArtifactDigest:hash('f')};
 return {api,context,job,authority,result,resource:{kind:'selector',controller:new AbortController()}};
}
test('seventh-phase adapter passes exact job inputs and parent cancellation signal, then independently validates authority',async()=>{
 const f=await setup(),calls=[];
 const selected=await f.api.runSelectorCiPhase(f.job,f.context,'/phase',f.resource,{
  run:async(args,{signal})=>{assert.deepEqual(args,{candidate:'/candidate.json',browser:'/browser',output:'/phase'});assert.equal(signal,f.resource.controller.signal);calls.push('run');return f.result;},
  readAuthority:directory=>{assert.equal(directory,'/phase');calls.push('read');return f.authority;},
  validate:(directory,expected,terminal)=>{assert.equal(directory,'/phase');assert.deepEqual(expected,f.authority.expected);assert.deepEqual(terminal,f.authority.terminal);calls.push('validate');return {status:'PASS',exitCode:0,receiptArtifactDigest:hash('f')};},
 });
 assert.deepEqual(calls,['run','read','validate']);assert.equal(selected.expected.receiptArtifactDigest,hash('f'));await f.api.stopSelectorCiResource(f.resource);
});
test('selector cancellation waits for observed controller cleanup and never removes an incomplete resource',async()=>{
 const f=await setup();let finish,stopped=false;
 f.resource.completion=new Promise(resolve=>{finish=resolve;});
 const removing=f.api.stopSelectorCiResource(f.resource).then(()=>{stopped=true;});
 assert.equal(f.resource.controller.signal.aborted,true);await Promise.resolve();assert.equal(stopped,false);
 finish({cleanupComplete:true});await removing;assert.equal(stopped,true);
 for(const cleanupComplete of [false,undefined])await assert.rejects(f.api.stopSelectorCiResource({controller:new AbortController(),completion:Promise.resolve({cleanupComplete})}),/CLEANUP_INCOMPLETE/);
});
test('selector adapter rejects missing capture, unaccepted proof, cleanup failure and every stale job identity before publication',async()=>{
 for(const alter of [x=>{x.result.status='BLOCKED';},x=>{x.result.nativeRuntimeAcceptance=false;},x=>{x.result.cleanupComplete=false;},...['harnessCommit','harnessSourceDigest','harnessDependencyDigest','browserDigest'].map(key=>x=>{x.authority.expected[key]='stale';}),x=>{x.authority.expected.identity.artifactDigest=hash('0');}]){
  const f=await setup();alter(f);let validated=false;
  await assert.rejects(f.api.runSelectorCiPhase(f.job,f.context,'/phase',f.resource,{run:async()=>f.result,readAuthority:()=>f.authority,validate:()=>{validated=true;}}),/CI_SELECTOR_/);assert.equal(validated,false);
 }
 const f=await setup();await assert.rejects(f.api.runSelectorCiPhase(f.job,f.context,'/phase',f.resource,{run:async()=>f.result,readAuthority:()=>{throw Error('MISSING_CAPTURE');},validate:()=>assert.fail('must not publish')}),/MISSING_CAPTURE/);
});
test('selector authority extends an immutable pre-execution capture only with bound final capture and observed terminal',async t=>{
 const {readSelectorPhaseAuthority}=await import('./lib/exui-selector-event-row-evidence.mjs');const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'selector-authority-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const put=(name,value)=>{const bytes=JSON.stringify(value);fs.writeFileSync(path.join(root,name),bytes);return {path:name,digest:digestBytes(bytes)};};
 const initial={runId:'ccd-owned',nativeAuthority:true,harnessCommit:'a'.repeat(40)},terminal={code:0,signal:null};
 put('independent-preexecution.json',{...initial,capturedBeforeGate:true,capturedAt:'2026-11-05T12:00:00.000Z'});
 const expected={...initial,selectorEventCapture:put('independent-selector-capture.json',{schemaVersion:1}),selectorControllerTerminal:put('independent-controller-terminal.json',{schemaVersion:1,runId:initial.runId,terminal})};
 const admission={schemaVersion:1,completedAfterController:true,expected};put('independent-selector-admission.json',admission);
 assert.deepEqual(readSelectorPhaseAuthority(root),{expected,terminal});
 for(const change of [x=>{x.expected.harnessCommit='b'.repeat(40);},x=>{x.expected.selectorEventCapture.digest=hash('0');},x=>{x.expected.selectorControllerTerminal.digest=hash('0');},x=>{x.completedAfterController=false;}]){const bad=structuredClone(admission);change(bad);put('independent-selector-admission.json',bad);assert.throws(()=>readSelectorPhaseAuthority(root),/SELECTOR_PHASE_/);}
});

test('the actual CI cancellation handler waits for selector cleanup before exit and retains incomplete ownership',async t=>{
 const {EventEmitter}=require('node:events');const {installCiCancellation}=await import('./lib/exui-candidate-ci-process.mjs');
 for(const complete of [true,false]){
  const f=await setup(),output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'selector-ci-cancel-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));fs.mkdirSync(path.join(output,'private'));fs.mkdirSync(path.join(output,'public'));
  let finish,exit;f.resource.completion=new Promise(resolve=>{finish=resolve;});const resources=new Map([['selectorEventRow',f.resource]]),target=new EventEmitter();target.stderr={write:()=>{}};target.exit=code=>{exit=code;};
  const uninstall=installCiCancellation({resources,output,target,onCancel:()=>{},remove:async(id,resource)=>{await f.api.stopSelectorCiResource(resource);resources.delete(id);}});t.after(uninstall);
  target.emit('SIGTERM');assert.equal(f.resource.controller.signal.aborted,true);assert.equal(exit,undefined);assert.equal(resources.size,1);
  finish({cleanupComplete:complete});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(exit,2);assert.equal(resources.size,complete?0:1);
  const receipt=JSON.parse(fs.readFileSync(path.join(output,'private/ci-result.json')));assert.equal(receipt.cleanupComplete,complete);assert.equal(receipt.status,'BLOCKED');
 }
});

test('fixed runner replaces selector aggregate timing with ordered preparation, proof and cleanup spans',async()=>{
 const {runFixedCiPilots}=await import('./run-harness-ci.mjs');
 const labels=['Selector CCD baseline preparation','Selector baseline proof and cleanup','Selector CCD fault preparation','Selector fault proof and cleanup','Selector evidence verification','Selector final cleanup','Selector cohort admission'];
 const phaseTimings=labels.map((label,index)=>({label,status:[4,6].includes(index)?'PASS':'completed',startedAt:'2026-11-05T12:00:00.000Z',durationMs:10}));const observed=[];
 const result=await runFixedCiPilots({phase:async name=>({status:'PASS',exitCode:0,...(name==='selectorEventRow'?{phaseTimings}:{})}),derive:async()=>{},start:async()=>{},stop:async()=>{},startEvent:async()=>{},stopEvent:async()=>{},startCallback:async()=>{},stopCallback:async()=>{},onTiming:item=>observed.push(item)});
 assert.deepEqual(result.results.map(item=>item.phase),['family','scope','ccd','eventCapability','routing','recipientCallback','selectorEventRow']);
 assert.equal(result.timings.length,20);assert.deepEqual(result.timings.slice(-7),phaseTimings);assert.deepEqual(observed,result.timings);assert(!observed.some(item=>item.label==='Selector Page2 preparation, proofs and cleanup'));
});

test('selector reported preparation starts before artifact verification so the replaced outer interval loses no setup time',()=>{
 const source=fs.readFileSync(path.join(__dirname,'run-harness-selector-event-row.mjs'),'utf8');
 const entry=source.indexOf('export async function runSelectorEventPhase('),start=source.indexOf('const phaseStarted=',entry),verify=source.indexOf('await verifyCandidateArtifact(candidate)',entry);
 assert(entry>=0&&start>=0&&verify>=0);assert(start<verify);assert(source.includes("timing={label:'Selector CCD baseline preparation',...phaseStarted}"));
});

test('selector phase cannot substitute a summary receipt for the independently recomputed gate',async()=>{
 const f=await setup();await assert.rejects(f.api.runSelectorCiPhase(f.job,f.context,'/phase',f.resource,{run:async()=>f.result,readAuthority:()=>f.authority,validate:()=>({status:'PASS',exitCode:0,receiptArtifactDigest:hash('0')})}),/CI_SELECTOR_RECEIPT_CHANGED/);
});

test('selector diagnostics retain the known phase and causal contract without exposing raw error data',async()=>{
 const {nativePhaseFailure,formatNativeFailure}=await import('./lib/exui-native-failure-diagnostics.mjs');
 const canary='PRIVATE_selector_cookie_canary';
 const value=nativePhaseFailure(new Error('CI_SELECTOR_NATIVE_PHASE_REQUIRED\n'+canary),'selectorEventRow',undefined,{}, {reason:'SELECTOR_CONTROLLER_FAILED',message:canary});
 assert.equal(value.phase,'selectorEventRow');assert.equal(value.reason,'CI_SELECTOR_NATIVE_PHASE_REQUIRED');assert.equal(value.child.reason,'SELECTOR_CONTROLLER_FAILED');assert(!formatNativeFailure(value).includes(canary));
});

test('selector early preparation failure emits the allowed stopped preparation interval from the outer clock',async()=>{
 const {runFixedCiPilots}=await import('./run-harness-ci.mjs');const observed=[];
 const before=Date.now();let reached=false;
 await assert.rejects(runFixedCiPilots({phase:async name=>{if(name==='selectorEventRow'){reached=true;throw Error('SELECTOR_EARLY_ARTIFACT_FAILURE');}return {status:'PASS',exitCode:0};},derive:async()=>{},start:async()=>{},stop:async()=>{},startEvent:async()=>{},stopEvent:async()=>{},startCallback:async()=>{},stopCallback:async()=>{},onTiming:item=>observed.push(item)}),/SELECTOR_EARLY_ARTIFACT_FAILURE/);
 assert.equal(reached,true);assert.equal(observed.length,14);
 const last=observed.at(-1);assert.equal(last.label,'Selector CCD baseline preparation');assert.equal(last.status,'stopped');
 assert(Number.isSafeInteger(last.durationMs)&&last.durationMs>=0);assert(Date.parse(last.startedAt)>=before&&Date.parse(last.startedAt)<=Date.now());
 assert(!observed.some(item=>item.label==='Selector Page2 preparation, proofs and cleanup'));
});

test('tracked selector preparation cannot use missing cleanup metadata as safe continuation',async t=>{
 const {runSelectorController}=require('./fixtures/exui-native-continuation.mock.cjs'),{stopSelectorCiResource}=await import('./run-harness-ci.mjs');
 for(const mode of ['prepare-missing','prepare-complete','before-prepare','cleanup-retry']){
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'selector-missing-cleanup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const observed=await runSelectorController(root,mode),safe=['prepare-complete','before-prepare'].includes(mode);
  assert.equal(observed.result.status,'BLOCKED');assert.equal(observed.result.cleanupComplete,safe,mode);assert.equal(observed.result.nativeRuntimeAcceptance,false);
  const resource={controller:new AbortController(),completion:Promise.resolve(observed.result)};
  if(safe)await stopSelectorCiResource(resource);else await assert.rejects(stopSelectorCiResource(resource),/CLEANUP_INCOMPLETE/,mode);
  if(mode==='before-prepare')assert.deepEqual(observed.calls,[]);
  if(mode==='cleanup-retry'){assert.equal(observed.removals,2);assert.equal(observed.calls.filter(x=>x==='prepare').length,1);}
 }
});
