const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const load=()=>import('./run-harness-mandatory-email-event-cohort.mjs');
const binding=()=>import('./lib/exui-mandatory-email-event-invocation-binding.mjs');
const {fakeChild,campaign,runnerCreationGate,materialPrepared,completeMaterial}=require('./fixtures/exui-mandatory-email-cohort.mock.cjs');
test('mandatory child command is fixed and rejects foreign expected paths/digests',async()=>{
  const api=await binding();
  const x=api.mandatoryEmailChildCommand('/private/tmp/owned/baseline-expected.json','sha256:'+'a'.repeat(64));
  assert.equal(x.script,api.MANDATORY_EMAIL_ROOT+'/scripts/run-harness-mandatory-email-event-invocation.mjs');
  assert.deepEqual(x.environmentKeys,['HOME','PATH','TMPDIR']);
  for(const name of ['relative','/private/tmp/foreign.json'])assert.throws(()=>api.mandatoryEmailChildCommand(name,'sha256:'+'a'.repeat(64)));
});
test('owned child exit alone never resolves before actual close',async()=>{
  const api=await load(),b=await binding(),child=fakeChild();let finished=false;
  const promise=api.executeMandatoryEmailChild(b.mandatoryEmailChildCommand('/private/tmp/owned/baseline-expected.json','sha256:'+'a'.repeat(64)),{log:1,launch:()=>child,onCreation:async()=>{},onPrepared:async()=>{}}).then(r=>{finished=true;return r;});
  child.emit('spawn');child.emit('exit',0,null);await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);
  child.emit('close',0,null);const result=await promise;assert.equal(result.closed,true);assert.equal(result.protocolComplete,false);
});
test('finite owned IPC messages are snapshotted, ACKed in order and joined before close',async()=>{
  const api=await load(),b=await binding(),child=fakeChild(),seen=[];
  const command=b.mandatoryEmailChildCommand('/private/tmp/owned/baseline-expected.json','sha256:'+'a'.repeat(64));
  const promise=api.executeMandatoryEmailChild(command,{log:1,launch:()=>child,onCreation:async packet=>{await new Promise(resolve=>setImmediate(resolve));seen.push(packet.owner);},onPrepared:async packet=>seen.push(packet.runId)});
  child.emit('spawn');const first={kind:'mandatory-email-creation',packet:{owner:'held-owner'}};child.emit('message',first);first.packet.owner='mutated-after-send';
  await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  child.emit('message',{kind:'mandatory-email-prepared',packet:{runId:'held-run'}});
  await new Promise(resolve=>setImmediate(resolve));child.emit('exit',0,null);child.emit('close',0,null);
  const result=await promise;assert.deepEqual(seen,['held-owner','held-run']);assert.equal(result.protocolComplete,true);assert.equal(result.cancelled,false);
});
test('finite three-invocation campaign closes/replays/proves absence before advancing',async t=>{
 const api=await load(),output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-campaign-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const f=await campaign(output);const result=await api.runMandatoryEmailSequence(f.cohort,f.options);
 assert.deepEqual(f.events,['start:baseline','creation:baseline','prepared:baseline','close:baseline','start:name-optional','creation:name-optional','prepared:name-optional','close:name-optional','start:address-optional','creation:address-optional','prepared:address-optional','close:address-optional']);
 assert.equal(result.baselineProofs,2);assert.equal(result.effectiveFaults,2);assert.equal(result.catalogueCredit,false);
});
for(const mode of ['failed-start','unknown-absence','cancel','owner-reuse'])test(`campaign ${mode} cannot authorize a later invocation`,async t=>{
 const api=await load(),output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-stop-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const controller=new AbortController(),f=await campaign(output,{mode,abort:()=>controller.abort()});
 await assert.rejects(api.runMandatoryEmailSequence(f.cohort,{...f.options,signal:controller.signal}));
 assert.equal(f.events.filter(e=>e.startsWith('start:')).length,mode==='owner-reuse'?2:1);
 assert(fs.existsSync(path.join(output,'cohort-failure.json')));
});
test('owned transport latches repeated cancellation and joins termination plus close',async()=>{
 const api=await load(),b=await binding(),child=fakeChild(),signals=new EventEmitter();let terminations=0;
 const promise=api.executeMandatoryEmailChild(b.mandatoryEmailChildCommand('/private/tmp/owned/baseline-expected.json','sha256:'+'a'.repeat(64)),{log:1,launch:()=>child,signalTarget:signals,onCreation:async()=>{},onPrepared:async()=>{},terminate:async()=>{terminations++;child.emit('exit',null,'SIGTERM');setImmediate(()=>child.emit('close',null,'SIGTERM'));return{observed:true,forced:false};}});
 child.emit('spawn');signals.emit('SIGTERM');signals.emit('SIGTERM');const result=await promise;assert.equal(terminations,1);assert.equal(result.cancelled,true);assert.equal(result.closed,true);assert.equal(signals.listenerCount('SIGTERM'),0);
});
test('child ACK waits for send callback, rejects disconnect/missing reply and publishes no fallback',async()=>{
 const {mandatoryEmailParentAck}=await import('./run-harness-mandatory-email-event-invocation.mjs'),b=await binding();
 const channel=new EventEmitter();channel.connected=true;let sent,sendDone,finished=false;
 channel.send=(message,callback)=>{sent=message;sendDone=callback;};
 const packet={owner:'held'},promise=mandatoryEmailParentAck('mandatory-email-creation',packet,{channel,timeoutMs:1000}).then(()=>{finished=true;});packet.owner='mutated';
 channel.emit('message',{kind:'mandatory-email-creation-ack',digest:b.mandatoryEmailDigest({owner:'held'})});await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.equal(sent.packet.owner,'held');sendDone();await promise;
 const missing=new EventEmitter();missing.connected=true;missing.send=(_message,callback)=>callback();await assert.rejects(mandatoryEmailParentAck('mandatory-email-creation',{}, {channel:missing,timeoutMs:5}),/ACK_TIMEOUT/);
 const disconnected=new EventEmitter();disconnected.connected=true;disconnected.send=(_message,callback)=>callback();const pending=mandatoryEmailParentAck('mandatory-email-prepared',{}, {channel:disconnected,timeoutMs:1000});disconnected.emit('disconnect');await assert.rejects(pending,/DISCONNECTED/);
});
test('actual runner rejects misplaced or non-finite lifecycle hooks before any preflight',async()=>{
 const {runCallbackUi}=await import('./run-harness-recipient-callback-ui.mjs');
 const hooks={creationStarted:async()=>{},prepared:async()=>{}};
 for(const input of [{scenario:'recipient-callback',mandatoryLifecycle:hooks},{scenario:'mandatory-email-event',mandatoryLifecycle:{...hooks,unexpected:()=>{}}},{scenario:'mandatory-email-event',mandatoryLifecycle:{creationStarted:()=>{}}}])await assert.rejects(runCallbackUi({...input,candidate:'/must-not-read',browser:'/must-not-read',output:'/must-not-create',variant:'baseline'}),/MANDATORY_EMAIL_LIFECYCLE/);
});
test('failure reconciliation rejects an unjoined creator before any ownership/resource action',async()=>{
 const {reconcileMandatoryEmailFailure}=await load();
 await assert.rejects(reconcileMandatoryEmailFailure({terminal:{observed:true,closed:false},binding:{}},{cleanupBinding:()=>assert.fail('must not cleanup'),inspect:()=>assert.fail('must not inspect')}),/CREATOR_UNJOINED/);
});
test('actual R1 caller forwards/joins creation hook before allocation and preserves exact native run identity',async t=>{
 for(const mode of ['ack','reject','pending']){
  const x=await runnerCreationGate(t,mode);await x.observed;
  assert.match(x.state.packet.runId,/^ccd-[a-f0-9-]{36}$/);assert.deepEqual(x.state.packet.nativeNames,[x.state.packet.runId+'-baseline-candidate',x.state.packet.runId+'-baseline-tools']);
  if(mode==='pending'){assert.equal(x.state.allocations,0);x.state.abort.abort();x.state.abort.abort();x.release();}
  await x.running;assert.equal(x.state.allocations,mode==='ack'?1:0);assert.equal(x.state.cleanup,1);
 }
});
test('actual R1 prepared barrier snapshots data and joins rejection/cancellation before proof can advance',async()=>{
 const {awaitMandatoryEmailPrepared}=await import('./run-harness-recipient-callback-ui.mjs');
 let release,seen,proof=false,cancelled=false;const barrier=new Promise(r=>release=r),observed=new Promise(r=>seen=r),packet={input:{runId:'held'}};
 const pending=(async()=>{await awaitMandatoryEmailPrepared({prepared:async snapshot=>{snapshot.input.runId='mutated-copy';seen();await barrier;}},packet,()=>cancelled);proof=true;})();
 await observed;assert.equal(packet.input.runId,'held');assert.equal(proof,false);cancelled=true;release();await assert.rejects(pending,/CALLBACK_UI_CANCELLED/);assert.equal(proof,false);
 await assert.rejects(awaitMandatoryEmailPrepared({prepared:async()=>{throw Error('CONTROLLED_PREPARED_REJECTED');}},packet,()=>false),/CONTROLLED_PREPARED_REJECTED/);
});
test('prepared IPC snapshot serializes the real native plan function without executing or mutating it',async()=>{
 const {awaitMandatoryEmailPrepared}=await import('./run-harness-recipient-callback-ui.mjs');
 let called=false,observed;const packet={input:{runId:'held'},plan:{candidate:{name:'held-candidate',arguments:()=>{called=true;throw Error('must not invoke');}},proofArguments:['fixed']}};
 await awaitMandatoryEmailPrepared({prepared:async value=>{observed=value;}},packet,()=>false);
 assert.equal(called,false);assert.equal(typeof packet.plan.candidate.arguments,'function');
 assert.deepEqual(observed.plan,{candidate:{name:'held-candidate'},proofArguments:['fixed']});
});
test('actual parent preparation validator accepts source-bound material input/plan/import/date and fresh proof boundary',async t=>{
 const api=await binding(),x=await materialPrepared(t);
 const observed=api.captureMandatoryEmailBinding(x.prepared,x.cohort,x.creation,{inspect:x.inspect});
 assert.equal(observed.runId,x.creation.runId);assert.equal(observed.noCredit.catalogueCredit,false);
 const changed=structuredClone(x.prepared);changed.manifest.kind='foreign';assert.throws(()=>api.captureMandatoryEmailBinding(changed,x.cohort,x.creation,{inspect:x.inspect}),/PREPROOF_MANIFEST/);
 x.put('baseline/report.json',{});assert.throws(()=>api.captureMandatoryEmailBinding(x.prepared,x.cohort,x.creation,{inspect:x.inspect}),/PROOF_STARTED_BEFORE_HOLD/);
});
test('coherently resealed malformed stored DATE is rejected before parent permits proof',async t=>{
 const api=await binding(),x=await materialPrepared(t),{captureMandatoryEmailPrepared}=await import('./lib/exui-mandatory-email-event-evidence.mjs');
 api.captureMandatoryEmailBinding(x.prepared,x.cohort,x.creation,{inspect:x.inspect});
 x.prepared.input.mandatoryEmailEventFacets.date.rows[0].live_from='1900-01-01';
 x.put('runtime/recipient-callback-import/mandatory-email-stored-dates.json',x.prepared.input.mandatoryEmailEventFacets.date);x.put('input.json',x.prepared.input);
 x.prepared.held=captureMandatoryEmailPrepared(x.prepared.handoff.output);x.prepared.manifest.runtimeMetadata.rowFacetDigest=api.mandatoryEmailDigest(x.prepared.input.mandatoryEmailEventFacets);
 assert.throws(()=>api.captureMandatoryEmailBinding(x.prepared,x.cohort,x.creation,{inspect:x.inspect}),/MANDATORY_EMAIL_STORED_DATES/);
});
test('actual final raw/lifecycle replay binds child completion and late evidence instead of framework counts alone',async t=>{
 const api=await binding(),x=await materialPrepared(t),held=api.captureMandatoryEmailBinding(x.prepared,x.cohort,x.creation,{inspect:x.inspect}),expectedDigest='sha256:'+'f'.repeat(64);
 await completeMaterial(x,held,expectedDigest);
 const terminal={started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null,protocolComplete:true};
 const result=api.replayMandatoryEmailInvocation(held,x.cohort,terminal,expectedDigest);assert.equal(result.result.baselineProofs,2);assert.equal(result.result.catalogueCredit,false);assert(result.files['baseline/report.json']);
 const lifecycle=JSON.parse(fs.readFileSync(path.join(held.directory,'baseline/candidate-lifecycle.json')));lifecycle.after.State.OOMKilled=true;x.put('baseline/candidate-lifecycle.json',lifecycle);
 assert.throws(()=>api.replayMandatoryEmailInvocation(held,x.cohort,terminal,expectedDigest),/PERSONAL_SERVICE_PARENT_BINDING/);lifecycle.after.State.OOMKilled=false;x.put('baseline/candidate-lifecycle.json',lifecycle);
 const completion=JSON.parse(fs.readFileSync(path.join(held.directory,'mandatory-email-child-completion.json')));completion.frameworkTerminal.code=1;x.put('mandatory-email-child-completion.json',completion);
 assert.throws(()=>api.replayMandatoryEmailInvocation(held,x.cohort,terminal,expectedDigest),/CHILD_COMPLETION/);
});
for(const variant of ['name-optional','address-optional'])test(`actual ${variant} raw replay keeps framework1 distinct from observed controller0`,async t=>{
 const api=await binding(),x=await materialPrepared(t,variant),held=api.captureMandatoryEmailBinding(x.prepared,x.cohort,x.creation,{inspect:x.inspect}),digest='sha256:'+'f'.repeat(64);
 await completeMaterial(x,held,digest);
 const terminal={started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null,protocolComplete:true};
 const observed=api.replayMandatoryEmailInvocation(held,x.cohort,terminal,digest);
 assert.deepEqual(observed.frameworkTerminal,{code:1,signal:null});assert.equal(observed.result.effectiveFaults,1);assert.equal(observed.result.catalogueCredit,false);
});
test('parent snapshots supplied cohort before first child can mutate source/candidate context',async t=>{
 const api=await load(),output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-snapshot-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const f=await campaign(output),execute=f.options.execute;
 f.options.execute=async(...args)=>{f.cohort.ccdImages.database.id='sha256:'+'d'.repeat(64);return execute(...args);};
 await assert.rejects(api.runMandatoryEmailSequence(f.cohort,f.options),/MANDATORY_EMAIL_CREATION_IMAGES/);
 assert.equal(f.events.filter(e=>e.startsWith('start:')).length,1);
});
test('different observed exit and close codes cannot become a successful child terminal',async()=>{
 const api=await load(),b=await binding(),child=fakeChild();
 const promise=api.executeMandatoryEmailChild(b.mandatoryEmailChildCommand('/private/tmp/owned/baseline-expected.json','sha256:'+'a'.repeat(64)),{log:1,launch:()=>child,onCreation:async()=>{},onPrepared:async()=>{}});
 child.emit('spawn');child.emit('message',{kind:'mandatory-email-creation',packet:{}});await new Promise(resolve=>setImmediate(resolve));
 child.emit('message',{kind:'mandatory-email-prepared',packet:{}});await new Promise(resolve=>setImmediate(resolve));
 child.emit('exit',1,null);child.emit('close',0,null);const result=await promise;assert.equal(result.protocolComplete,false);
});
test('failed actual child spawn remains unstarted and never gains a protocol/terminal witness',async()=>{
 const api=await load(),b=await binding(),command=b.mandatoryEmailChildCommand('/private/tmp/owned/baseline-expected.json','sha256:'+'a'.repeat(64)),signals=new EventEmitter();
 const thrown=await api.executeMandatoryEmailChild(command,{log:1,signalTarget:signals,launch:()=>{throw Error('synthetic spawn rejection');},onCreation:async()=>assert.fail('must not create'),onPrepared:async()=>assert.fail('must not prepare')});
 assert.equal(thrown.started,false);assert.equal(thrown.observed,false);assert.equal(thrown.protocolComplete,false);assert.equal(signals.listenerCount('SIGTERM'),0);
 const child=fakeChild(),pending=api.executeMandatoryEmailChild(command,{log:1,signalTarget:signals,launch:()=>child,onCreation:async()=>assert.fail('must not create'),onPrepared:async()=>assert.fail('must not prepare')});
 child.emit('error',Error('synthetic ENOENT'));child.emit('close',-2,null);const failed=await pending;assert.equal(failed.started,false);assert.equal(failed.observed,false);assert.equal(failed.closed,true);
});
test('out-of-order IPC cannot ACK a preparation or launch a later creator',async()=>{
 const api=await load(),b=await binding(),child=fakeChild();let acks=0,callbacks=0;
 child.send=(_message,callback)=>{acks++;callback();};
 const pending=api.executeMandatoryEmailChild(b.mandatoryEmailChildCommand('/private/tmp/owned/baseline-expected.json','sha256:'+'a'.repeat(64)),{log:1,launch:()=>child,onCreation:async()=>callbacks++,onPrepared:async()=>callbacks++,terminate:async()=>{child.emit('exit',null,'SIGTERM');setImmediate(()=>child.emit('close',null,'SIGTERM'));return{observed:true,forced:false};}});
 child.emit('spawn');child.emit('message',{kind:'mandatory-email-prepared',packet:{}});const result=await pending;
 assert.equal(acks,0);assert.equal(callbacks,0);assert.equal(result.protocolComplete,false);assert.equal(result.closed,true);
});
test('actual owned Node IPC smoke observes both ACK barriers and OS child close without native resources',async t=>{
 const api=await load(),b=await binding(),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-real-ipc-'));let child;
 t.after(async()=>{if(child&&child.exitCode===null&&child.signalCode===null)await(await import('./lib/exui-candidate-runtime.mjs')).terminateOwnedChild(child);fs.rmSync(root,{recursive:true,force:true});});
 const helper=pathToFileURL(path.join(__dirname,'run-harness-mandatory-email-event-invocation.mjs')).href,script=path.join(root,'child.mjs');
 fs.writeFileSync(script,`import{mandatoryEmailParentAck}from ${JSON.stringify(helper)};try{await mandatoryEmailParentAck('mandatory-email-creation',{owner:'owned-smoke',optional:undefined},{timeoutMs:3000});await mandatoryEmailParentAck('mandatory-email-prepared',{runId:'owned-smoke'},{timeoutMs:3000});}catch{process.exitCode=2;}finally{if(process.connected)process.disconnect();}`);
 const log=fs.openSync(path.join(root,'child.log'),'wx',0o600),seen=[];let result;
 try{result=await api.executeMandatoryEmailChild(b.mandatoryEmailChildCommand(root+'/baseline-expected.json','sha256:'+'a'.repeat(64)),{log,onCreation:async packet=>{assert.deepEqual(packet,{owner:'owned-smoke'});seen.push('creation');},onPrepared:async packet=>{assert.deepEqual(packet,{runId:'owned-smoke'});seen.push('prepared');},launch:(file,_args,options)=>{child=spawn(file,[script],options);return child;}});}finally{fs.closeSync(log);}
 assert.deepEqual(seen,['creation','prepared']);assert.deepEqual(result,{started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null,protocolComplete:true});
 assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
});

test('supplied malformed mandatory main context rejects before first owned child launch',async t=>{
 const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'mandatory-context-reject-'));t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const api=await load(),f=await campaign(output);f.cohort.admissionContext={native:{},capture:{},expected:{}};
 await assert.rejects(api.runMandatoryEmailSequence(f.cohort,f.options),/MANDATORY_EMAIL_ADMISSION_CONTEXT/);
 assert.equal(f.events.filter(event=>event.startsWith('start:')).length,0);
});
