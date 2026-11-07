const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const modulePath='./run-harness-complex-email-cohort.mjs';
const {sourceInputs}=require('./fixtures/exui-complex-cohort.mock.cjs');
test('fixed compiler caller cancellation before launch starts no child',async()=>{
 const {executeComplexSourceProof}=await import(modulePath);const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-test-'));
 try{const controller=new AbortController();controller.abort();let launched=0;
 await assert.rejects(executeComplexSourceProof(sourceInputs(directory),path.join(directory,'output'),{signal:controller.signal,log:1,launch:()=>{launched++;}}));assert.equal(launched,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('fixed compiler caller observes child termination during synchronous spawn cancellation',async()=>{
 const {executeComplexSourceProof}=await import(modulePath);const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-test-'));
 try{const controller=new AbortController(),child=new EventEmitter();child.pid=123;let stopped=0;
 const terminal=await executeComplexSourceProof(sourceInputs(directory),path.join(directory,'output'),{signal:controller.signal,log:1,
 launch:(_file,args,options)=>{assert(args[0].endsWith('verify-complex-email-application-source.py'));assert.equal(options.env.JAVA_TOOL_OPTIONS,undefined);assert.equal(options.env.PYTHONPATH,undefined);controller.abort();return child;},
 terminate:async actual=>{assert.equal(actual,child);stopped++;queueMicrotask(()=>child.emit('exit',null,'SIGTERM'));return {observed:true,forced:false,code:null,signal:'SIGTERM'};}});
 assert.equal(stopped,1);assert.equal(terminal.cancelled,true);assert.equal(terminal.observed,true);assert.equal(terminal.signal,'SIGTERM');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('unobserved compiler parent stop rejects without pretending closure',async()=>{
 const {executeComplexSourceProof}=await import(modulePath);const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-test-'));
 try{const controller=new AbortController(),child=new EventEmitter();child.pid=123;
 await assert.rejects(executeComplexSourceProof(sourceInputs(directory),path.join(directory,'output'),{signal:controller.signal,log:1,launch:()=>{queueMicrotask(()=>controller.abort());return child;},terminate:async()=>{throw Error('OWNED_CHILD_TERMINATION_UNOBSERVED');}}),/OWNED_CHILD_TERMINATION_UNOBSERVED/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('cohort cancelled before preflight does not call producer, browser, mapping or compiler',async()=>{
 const {runComplexEmailCohort}=await import(modulePath);const controller=new AbortController();controller.abort();let calls=0;
 const result=await runComplexEmailCohort({candidate:'/missing',browser:'/missing',output:'/private/tmp/unused-complex',sourceInputs:{},signal:controller.signal},{producer:()=>{calls++;},browser:()=>{calls++;},mapping:()=>{calls++;},source:()=>{calls++;}});
 assert.equal(calls,0);assert.equal(result.result.status,'CANCELLED');for(const key of ['sourceComplete','runtimeAcceptance','catalogueCredit','releaseCredit'])assert.equal(result.result[key],false);
});
test('raw reader cannot accept partial summaries or missing authority',async()=>{
 const {readComplexCohort}=await import('./lib/exui-complex-email-cohort.mjs');
 assert.throws(()=>readComplexCohort('/missing',{contexts:{},summary:{status:'PASS'}}),/COMPLEX_COHORT/);
});
test('old receipt-only browser API cannot start mapping or compiler and cannot grant observations',async()=>{
 const {runComplexEmailCohort}=await import(modulePath),directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-test-'));
 try{const candidate=path.join(directory,'candidate.json');fs.writeFileSync(candidate,'{}');for(const name of ['candidate-root','browser-cache'])fs.mkdirSync(path.join(directory,name));let mapping=0,compiler=0,browsers=0;
 const result=await runComplexEmailCohort({candidate,browser:path.join(directory,'browser-cache'),output:path.join(directory,'output'),sourceInputs:{}},{prepareSource:()=>({prepared:{},tools:[]}),producer:()=>({files:[]}),verifyCandidate:async()=>({candidateRoot:path.join(directory,'candidate-root'),provenance:{platform:'linux/arm64'}}),browser:async()=>{browsers++;return {status:'complex-email-text-feasibility-observed',cleanupComplete:true};},mapping:async()=>{mapping++;},source:async()=>{compiler++;}});
 assert.equal(browsers,1);assert.equal(mapping,0);assert.equal(compiler,0);assert.equal(result.result.status,'BLOCKED');assert.deepEqual(result.expected.contexts,{});
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('coordinator owns cancellation between browser calls, not only per-run listeners',async()=>{
 const {runComplexEmailCohort}=await import(modulePath),directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-test-'));
 try{const candidate=path.join(directory,'candidate.json');fs.writeFileSync(candidate,'{}');for(const name of ['candidate-root','browser-cache'])fs.mkdirSync(path.join(directory,name));const controller=new AbortController();let later=0;
 const result=await runComplexEmailCohort({candidate,browser:path.join(directory,'browser-cache'),output:path.join(directory,'output'),sourceInputs:{},signal:controller.signal},{prepareSource:()=>({prepared:{},tools:[]}),producer:()=>({files:[]}),verifyCandidate:async()=>({candidateRoot:path.join(directory,'candidate-root'),provenance:{platform:'linux/arm64'}}),browser:async()=>{controller.abort();},mapping:async()=>{later++;},source:async()=>{later++;}});
 assert.equal(result.result.status,'CANCELLED');assert.equal(later,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('unsafe close and completion-before-preparation cannot create parent authority',async()=>{
 const {createComplexCapture}=await import('./lib/exui-complex-email-cohort.mjs');const expected={contexts:{}},hooks=createComplexCapture('browser',expected,{active:()=>{},inspect:()=>null,ownerEmpty:()=>true});
 hooks.creationStarted({variant:'baseline',runtimeDirectory:'/owned/runtime'});
 assert.throws(()=>hooks.completed({}),/COMPLEX_COHORT/);assert.throws(()=>hooks.closed({cancelled:false,nativeCleanupComplete:true,workspaceCleanupComplete:true,cleanup:{cleanupComplete:true}}),/COMPLEX_COHORT/);
 assert.equal(expected.contexts['browser-baseline'].closed,undefined);
 assert.throws(()=>hooks.creationStarted({variant:'baseline',runtimeDirectory:'/owned/runtime'}),/COMPLEX_COHORT/);
});
test('actual default ARM state omission is explicit; image, namespace, owner and mount substitutions reject',async()=>{
 const {captureComplexCcd}=await import('./lib/exui-complex-email-cohort.mjs');const {ccdFixture}=require('./fixtures/exui-complex-cohort.mock.cjs');const {state,infos}=await ccdFixture();
 const original=captureComplexCcd(state,id=>infos[id]);assert.equal(Object.keys(original).length,7);assert.equal(state.platform,undefined);
 for(const mutate of [info=>{info.Image='sha256:'+'f'.repeat(64);},info=>{info.Config.Labels['exui.harness.owner']='foreign';},info=>{info.HostConfig.NetworkMode='host';},info=>{info.Mounts=[{Type:'bind'}];},info=>{info.State.Running=false;},info=>{info.RestartCount=1;}]){
  const changed=structuredClone(infos);mutate(changed[state.containers.data]);assert.throws(()=>captureComplexCcd(state,id=>changed[id]));
 }
 const changed=structuredClone(state);changed.images.definition.id='sha256:'+'f'.repeat(64);assert.throws(()=>captureComplexCcd(changed,id=>infos[id]));
});
test('coherent raw file rewrites remain rejected against parent-held byte pins',async()=>{
 const {readComplexCohort,COMPLEX_FILES}=await import('./lib/exui-complex-email-cohort.mjs'),{digestBytes}=await import('./lib/exui-evidence-io.mjs');const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-test-'));
 try{const original=JSON.stringify({owner:'original',status:'PASS'}),contexts={};
 for(const [i,key]of ['browser-baseline','browser-email-type','mapping-baseline','mapping-searchable'].entries()){
  const kind=key.startsWith('browser')?'browser':'mapping',contextDir=kind==='browser'?path.join(directory,key):path.join(directory,'mapping',key.slice(8)),value={key,variant:key.slice(8),directory:contextDir,prepared:{state:{owner:'owner-'+i,namespace:String(i).repeat(64)}},completed:{},closed:{observedAbsent:true}};
  for(const stage of ['prepared','completed','closed']){const names=COMPLEX_FILES[kind+stage[0].toUpperCase()+stage.slice(1)];value[stage].files=Object.fromEntries(names.map(name=>{const file=path.join(contextDir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,original);return[name,digestBytes(original)];}));}contexts[key]=value;
 }
 const changed=JSON.stringify({owner:'coherently-rewritten',status:'PASS'});fs.writeFileSync(path.join(directory,'browser-baseline/input.json'),changed);
 assert.throws(()=>readComplexCohort(directory,{directory,contexts}),error=>error.actual===digestBytes(changed)&&error.expected===digestBytes(original));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('Complex transport projection excludes auth tokens, arbitrary error bodies and foreign data',async()=>{
 const {complexTransportProjection}=await import('./lib/exui-complex-email-transport.mjs');
 const base={method:'POST',upstreamPath:'/caseworkers/actor/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases',path:'/data/create',status:201,actorId:'actor',ordinal:1,body:JSON.stringify({data:{protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[]},event:{id:'create'},event_token:'TOKEN-CANARY',Authorization:'TOKEN-CANARY'}),response:JSON.stringify({id:'1793646213983629',token:'TOKEN-CANARY',unknown:'ERROR-CANARY'})};
 const projection=complexTransportProjection(base);assert.equal(projection.caseId,'1793646213983629');assert(!JSON.stringify(projection).includes('CANARY'));assert(!Object.hasOwn(projection,'body'));
 assert.equal(complexTransportProjection({...base,upstreamPath:'/users/secrets'}),null);
 assert.throws(()=>complexTransportProjection({...base,body:JSON.stringify({data:{protectedValue:'PII-CANARY',sodAdditionalRecipientsList:[]},event:{id:'create'}})}),/COMPLEX_TRANSPORT/);
});
test('whole transport joins case windows and exact validation/read/history bodies, not matching status summaries',async()=>{
 const {fixture}=require('./fixtures/exui-complex-email-observation.mock.cjs'),{transportFixture}=require('./fixtures/exui-complex-cohort.mock.cjs');const {validateComplexTransport}=await import('./lib/exui-complex-email-transport.mjs');
 const f=fixture('baseline');await f.run();const observed=JSON.parse(f.files.get('/owned/complex-email-text-observation.json')),{records,observerRecords}=transportFixture(observed);
 const read=(rs=records,os=observerRecords)=>validateComplexTransport(rs,observed,{actorId:observed.actorId,observerId:'observer-id',observerRecords:os});assert.equal(read(),true);
 for(const mutate of [rs=>{const v=rs.filter(r=>r.kind==='validate');v[1].responseBodyDigest=v[0].responseBodyDigest;},rs=>{rs.find(r=>r.kind==='submit').caseId=observed.probe.caseId;},rs=>{rs.find(r=>r.kind==='validate').request.data.sodAdditionalRecipientsList.reverse();},rs=>{const submit=rs.splice(rs.findIndex(r=>r.kind==='submit'),1)[0];rs.push(submit);rs.forEach((r,i)=>r.ordinal=i+1);},rs=>{rs.find(r=>r.kind==='submit').classificationPresent=true;}]){
  const changed=structuredClone(records);mutate(changed);assert.throws(()=>read(changed),/COMPLEX_TRANSPORT/);
 }
 for(const mutate of [rows=>{rows[0].status=500;},rows=>{rows[1].body=rows[3].body;},rows=>{rows[0].actorId='foreign';},rows=>{rows[0].caseId=observed.probe.caseId;}]){const changed=structuredClone(observerRecords);mutate(changed);assert.throws(()=>read(records,changed),/COMPLEX_TRANSPORT/);}
});
test('Complex-only selection does not change other gateway option shapes',async()=>{
 const {feasibilityGatewaySelection}=await import('./lib/exui-feasibility-gateway.mjs');assert.deepEqual(feasibilityGatewaySelection('complex-email-text-ui-feasibility').options,{complexEmail:true});
 for(const kind of ['recipient-callback-ui-feasibility','selector-event-row-ui-feasibility'])assert.deepEqual(feasibilityGatewaySelection(kind).options,{recipientCallback:{invocationId:'recipient-callback-ui'}});
 assert.deepEqual(feasibilityGatewaySelection('result-columns-ui-feasibility').options,{resultColumns:true});
});
test('actual fixed sequence runs exactly four contexts then one compiler and one raw reader',async()=>{
 const {sequenceFixture}=require('./fixtures/exui-complex-cohort.mock.cjs'),{result,calls}=await sequenceFixture();
 assert(calls.indexOf('browser-email-type')<calls.indexOf('compiler-start'));assert(calls.indexOf('compiler-start')<calls.indexOf('mapping'));assert(calls.indexOf('mapping')<calls.indexOf('compiler-finish'));assert(calls.indexOf('compiler-finish')<calls.indexOf('reader'));assert.equal(result.result.status,'OBSERVATIONS_VERIFIED');
 for(const key of ['sourceComplete','runtimeAcceptance','catalogueCredit','releaseCredit'])assert.equal(result.result[key],false);
});
test('Complex source failure aborts and joins runtime work before returning without raw admission',async()=>{
 const {sequenceFixture}=require('./fixtures/exui-complex-cohort.mock.cjs'),{result,calls}=await sequenceFixture('source-fails');
 assert.equal(result.result.status,'BLOCKED');assert.equal(result.result.failedStage,'source-proof');assert(calls.includes('runtime-joined-after-abort'));assert(!calls.includes('reader'));
});
test('browser proof failures retain their actual stage after the output directory is prepared',async()=>{
 const {sequenceFixture}=require('./fixtures/exui-complex-cohort.mock.cjs'),{result,calls}=await sequenceFixture('email-browser-fails');
 assert.equal(result.result.status,'BLOCKED');assert.equal(result.result.failedStage,'browser-email-type');assert(!calls.includes('mapping'));assert(!calls.includes('reader'));
});
test('blocked mapping aborts and joins source compilation before returning without raw admission',async()=>{
 const {sequenceFixture}=require('./fixtures/exui-complex-cohort.mock.cjs'),{result,calls}=await sequenceFixture('mapping-blocked');
 assert.equal(result.result.status,'BLOCKED');assert.equal(result.result.failedStage,'mapping-pair');assert(calls.includes('compiler-joined-after-abort'));assert(!calls.includes('reader'));
});
test('actual fixed sequence cancellation covers compiler gap, compiler completion and final reader',async()=>{
 const {sequenceFixture}=require('./fixtures/exui-complex-cohort.mock.cjs');
 for(const mode of ['before-compiler','during-compiler','during-final-reader','queued-final-cancel']){const {result,calls}=await sequenceFixture(mode);assert.equal(result.result.status,'CANCELLED');
  if(mode==='before-compiler')assert(calls.includes('compiler'));if(mode==='during-compiler')assert(!calls.includes('reader'));
 }
});
test('unsafe context close or forced Python terminal cannot start later work or verify observations',async()=>{
 const {sequenceFixture}=require('./fixtures/exui-complex-cohort.mock.cjs');
 for(const mode of ['unsafe-close','forced-compiler','unstarted-compiler']){const {result,calls}=await sequenceFixture(mode);assert.equal(result.result.status,'BLOCKED');assert(!calls.includes('reader'));if(mode==='unsafe-close')assert.deepEqual(calls,['browser-baseline']);}
});
test('complete coherent four-context packet passes actual raw reader without resources or compiler',async()=>{
 const {completePacket}=require('./fixtures/exui-complex-cohort.mock.cjs'),{readComplexCohort}=await import('./lib/exui-complex-email-cohort.mjs');const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-packet-'));
 try{const {expected}=await completePacket(directory);const result=readComplexCohort(directory,expected,{inspect:()=>null,ownerEmpty:()=>true});assert.equal(result.status,'OBSERVATIONS_VERIFIED');assert.equal(result.contexts,4);assert.equal(result.catalogueCredit,false);}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('actual complete raw reader rejects coherent lifecycle, source, transport, cleanup and import substitutions',async()=>{
 const {completePacket}=require('./fixtures/exui-complex-cohort.mock.cjs'),{readComplexCohort,complexPin}=await import('./lib/exui-complex-email-cohort.mjs');
 const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-packet-'));
 try{const {expected}=await completePacket(directory),original=structuredClone(expected),baseline=original.contexts['browser-baseline'];
 const check=e=>readComplexCohort(directory,e,{inspect:()=>null,ownerEmpty:()=>true});assert.equal(check(original).status,'OBSERVATIONS_VERIFIED');
 const change=(expected,context,name,mutate)=>{const file=path.join(context.directory,name),before=fs.readFileSync(file),value=JSON.parse(before);mutate(value);fs.writeFileSync(file,JSON.stringify(value));for(const stage of ['prepared','completed','closed'])if(context[stage].files[name])context[stage].files[name]=complexPin(context.directory,name);return()=>fs.writeFileSync(file,before);};
 for(const [name,mutate]of [['baseline/complex-email-transport.jsonl',null],['baseline/candidate-lifecycle.json',v=>{v.after.Config.Cmd=['foreign-process'];}],['owned-resources.json',v=>{v[0].owner='foreign';}],['runtime/recovery.json',v=>{v.resources.definition.image='sha256:'+'f'.repeat(64);} ]]){
  if(!mutate)continue;const e=structuredClone(original),c=e.contexts['browser-baseline'],restore=change(e,c,name,mutate);assert.throws(()=>check(e));restore();
 }
 {const e=structuredClone(original),c=e.contexts['browser-baseline'],file=path.join(c.directory,'baseline/complex-email-transport.jsonl'),before=fs.readFileSync(file),rows=before.toString().trim().split('\n').map(JSON.parse),validations=rows.filter(r=>r.kind==='validate');validations[1].responseBodyDigest=validations[0].responseBodyDigest;fs.writeFileSync(file,rows.map(r=>JSON.stringify(r)).join('\n'));c.completed.files['baseline/complex-email-transport.jsonl']=complexPin(c.directory,'baseline/complex-email-transport.jsonl');assert.throws(()=>check(e),/COMPLEX_TRANSPORT/);fs.writeFileSync(file,before);}
 {const e=structuredClone(original),c=e.contexts['browser-baseline'];c.prepared.imported.observations.import.status=200;assert.throws(()=>check(e),/COMPLEX_COHORT/);}
 {const e=structuredClone(original),c=e.contexts['browser-email-type'];c.prepared.input.browserDigest='sha256:'+'f'.repeat(64);assert.throws(()=>check(e),/COMPLEX_COHORT/);}
 {const e=structuredClone(original),file=path.join(e.sourceProof.directory,'definition-image-binding.json'),before=fs.readFileSync(file),value=JSON.parse(before);value.imageIndexDigest='sha256:'+'f'.repeat(64);fs.writeFileSync(file,JSON.stringify(value));e.sourceProof.files['definition-image-binding.json']=complexPin(e.sourceProof.directory,'definition-image-binding.json');assert.throws(()=>check(e),/COMPLEX_COHORT/);fs.writeFileSync(file,before);}
 {const e=structuredClone(original);delete e.contexts['browser-baseline'].closed.files['owned-resources.json'];assert.throws(()=>check(e),/COMPLEX_COHORT/);}
 assert.equal(check(original).status,'OBSERVATIONS_VERIFIED');assert.equal(baseline.prepared.imported.observations.import.status,201);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('mixed individually valid browser identity is rejected before any second child can launch',async()=>{
 const {createComplexCapture}=await import('./lib/exui-complex-email-cohort.mjs'),{digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const original={browserRoot:'/sealed',browserDigest:'sha256:'+'a'.repeat(64),harnessDependencies:{digest:'dependency'},nativeRuntime:{imageId:'native'},browserRuntimeImage:{imageId:'browser'}};
 const expected={contexts:{},candidate:{},producer:{files:[]},commonBrowser:structuredClone(original)},hooks=createComplexCapture('browser',expected,{active:()=>{},inspect:()=>null,ownerEmpty:()=>true});hooks.creationStarted({variant:'email-type',runtimeDirectory:'/owned/runtime'});
 const changed={...original,browserDigest:'sha256:'+'b'.repeat(64)};
 assert.throws(()=>hooks.prepared({imported:{observations:{import:{status:201}}},ccd:{output:'/owned/runtime'},handoff:{output:'/owned'},input:{...changed,artifact:{},harnessSources:[],harnessSourceDigest:digestBytes('[]')}}),error=>error.actual?.browserDigest===changed.browserDigest&&error.expected?.browserDigest===original.browserDigest);
 assert.equal(expected.contexts['browser-email-type'].prepared,undefined);
});

test('controlled old synchronous-finalization implementation misses queued cancellation while fixed production catches it',async()=>{
 const {sequenceFixture}=require('./fixtures/exui-complex-cohort.mock.cjs');const fixed=await sequenceFixture('queued-final-cancel'),old=await sequenceFixture('queued-final-cancel',{unsafeOld:true});
 assert.equal(fixed.result.result.status,'CANCELLED');assert.equal(old.result.result.status,'OBSERVATIONS_VERIFIED');
});
