const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {fixture}=require('./fixtures/exui-complex-email-admission.mock.cjs');
test('fixed Complex row accounts for all seven attributes and explicitly unconsumed date',async()=>{
 const m=await import('./lib/exui-complex-email-admission.mjs'),c=m.complexAdmissionContract();assert.equal(c.catalogueSize,112);assert.deepEqual(Object.keys(c.facets),m.COMPLEX_PUBLIC_FACETS);assert.equal(c.facets.LiveFrom,'unconsumed-by-byte-matched-importer-entity-and-DTO-path');assert.deepEqual(c.mutations,[{attribute:'FieldType',from:'Text',to:'Email'},{attribute:'Searchable',from:'N',to:'Y'}]);for(const k of ['activationClaim','retentionClaim','normativeDateClaim','releaseCredit'])assert.equal(c[k],false);
});
test('fixed source byte replay portable guards run without compiler, fixtures or downloads',()=>{
 const result=spawnSync('python3',['scripts/verify-complex-email-source-replay.test.py'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.stderr);assert.match(result.stderr,/Ran 6 tests/);assert.match(result.stderr,/OK/);
});
test('complete four-context raw reader joins one candidate row without counting mappings or Java classes as requirements',async t=>{
 const x=await fixture(t),packet=await x.read();assert.equal(x.calls.length,1);const joint=x.m.complexNativeJointAdmission(x.f.native,x.capture.binding,packet,x.f.descriptor.expected);assert.equal(joint.status,'included');assert.equal(joint.nativeRunId,x.f.descriptor.expected.jobRunId);
 const {creditComplexEmailRow,loadCommittedConfigurationCatalogue}=await import('./lib/exui-configuration-runtime-coverage.mjs');const coverage={selected:112,candidate:36,ccd:2,missing:74,creditedObligationIds:[]};const admission={...packet.admission,joint};creditComplexEmailRow(coverage,loadCommittedConfigurationCatalogue().catalogue,[admission.obligationId],admission);assert.deepEqual([coverage.selected,coverage.candidate,coverage.ccd,coverage.missing],[112,37,2,73]);assert.equal(coverage.creditedObligationIds.length,1);assert.throws(()=>creditComplexEmailRow(coverage,loadCommittedConfigurationCatalogue().catalogue,[admission.obligationId],admission),/DUPLICATE/);assert.equal(packet.admission.browserContexts,2);assert.equal(packet.admission.mappingContexts,2);assert.equal(packet.admission.applicationClasses,635);assert(packet.admission.invocations.every(row=>row.configuredWorkers===null));
});
test('held request rejects substitutions; fresh admission refuses historical unbound feasibility',async t=>{
 const x=await fixture(t),saved=fs.readFileSync(x.requestPath);
 for(const change of [r=>r.expected.inputDigest='sha256:'+'e'.repeat(64),r=>r.expected.contexts['browser-baseline'].closed.observedAbsent=false,r=>r.expected.sourceProof.terminal.code=1,r=>delete r.expected.admissionContext,r=>r.contractDigest='sha256:'+'f'.repeat(64)]){const r=JSON.parse(saved);change(r);x.write(x.requestPath,r);await assert.rejects(x.read);fs.writeFileSync(x.requestPath,saved);}
 const old=JSON.parse(saved);delete old.expected.admissionContext;const pin={runId:old.expected.runId,digest:x.write(x.requestPath,old)};await assert.rejects(()=>x.readWithPin(pin));fs.writeFileSync(x.requestPath,saved);assert.equal((await x.read()).admission.status,'passed');
});
test('coherently rehashed raw shape, fault, transport, classification and terminal changes reject before compatibility',async t=>{
 const x=await fixture(t),savedRequest=fs.readFileSync(x.requestPath);
 for(const [key,name,change]of [
  ['browser-email-type','baseline/report.json',r=>r.suites[0].specs[0].tests[0].results[0].status='passed'],
  ['browser-baseline','baseline/complex-email-text-observation.json',r=>r.healthy.controls[0].label='Wrong'],
  ['browser-baseline','baseline/framework-terminal.json',r=>r.code=1],
  ['browser-baseline','runtime/complex-email-import/stored-classification-rows.json',r=>r[0].data_classification.sodAdditionalRecipientsList.value[0].value.emailInformation.value.emailAddress='PRIVATE'],
  ['mapping-searchable','mapping.json',r=>{r.variant='baseline';}],
 ]){const context=x.expected.contexts[key],file=path.join(context.directory,name),saved=fs.readFileSync(file),value=JSON.parse(saved);change(value);x.write(file,value);const r=JSON.parse(savedRequest);for(const stage of ['prepared','completed','closed'])if(Object.hasOwn(r.expected.contexts[key][stage].files,name))r.expected.contexts[key][stage].files[name]=x.raw.complexPin(context.directory,name);const pin={runId:r.expected.runId,digest:x.write(x.requestPath,r)};await assert.rejects(()=>x.readWithPin(pin),undefined,name);fs.writeFileSync(file,saved);fs.writeFileSync(x.requestPath,savedRequest);}
 assert.equal((await x.read()).admission.status,'passed');
});
test('same-context pins reject replacement capsule, while valid different main candidate stays separate',async t=>{
 const x=await fixture(t),packet=await x.read();const changed=structuredClone(x.f.native);changed.candidate.identity.artifactDigest='sha256:'+'f'.repeat(64);assert.equal(x.m.complexNativeJointAdmission(changed,x.capture.binding,packet,x.f.descriptor.expected).status,'separate');
 const substituted=structuredClone(packet);substituted.expected.admissionContext.expected.jobRunId='ci-00000000-0000-4000-8000-000000000000';assert.throws(()=>x.m.complexNativeJointAdmission(x.f.native,x.capture.binding,substituted,x.f.descriptor.expected));
 const cap=structuredClone(x.capture);cap.binding.ccdImages.definition.image='sha256:'+'f'.repeat(64);x.write(path.join(x.f.directory,x.m.COMPLEX_NATIVE_PATH),cap.binding);assert.throws(()=>x.m.verifyComplexNativeCapture(x.f.directory,x.capture));
});
test('no configured source is visible NOT_RUN; malformed specified input never silently skips on Linux',async()=>{
 const m=await import('./lib/exui-complex-email-admission.mjs');assert.equal(m.prepareComplexAdmissionInputs(undefined).attempt.reason,'SOURCE_INPUTS_NOT_CONFIGURED');assert.throws(()=>m.prepareComplexAdmissionInputs('/missing/configured-input',{host:'linux',arch:'x64'}));
});
test('canonical sequence awaits Complex after personal and passes its exact request to one collector',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs'),order=[],pin={path:'/owned/complex/request.json',digest:'sha256:'+'a'.repeat(64),runId:'complex-00000000-0000-4000-8000-000000000000'},personal={path:'/owned/personal/request.json',digest:'sha256:'+'b'.repeat(64),runId:'personal'};
 const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),personal:async()=>{order.push('personal');return{status:'passed',reportRequest:personal};},complex:async()=>{order.push('complex');return{status:'passed',reportRequest:pin};},descriptor:async(_v,_p,p,c)=>{assert.equal(p,personal);assert.equal(c,pin);order.push('descriptor');return'/descriptor';},collect:async()=>{order.push('collector');return{status:'passed',exitCode:0,personalServiceInclusion:'included',complexEmailInclusion:'included'};}});assert.deepEqual(order,['personal','complex','descriptor','collector']);assert.equal(result.complexStatus,'PASS');assert.equal(result.exitCode,0);assert.equal(result.releaseApproval,false);
});
test('unknown cleanup, cancellation, malformed result and late descriptor failure cannot reach collector',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs');
 for(const mode of ['throw','blocked','bad-pin','descriptor']){let collected=0,withdrawn=0;const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),complex:async()=>{if(mode==='throw')throw new Error('PRIVATE-CANARY');if(mode==='blocked')return{status:'BLOCKED',cleanupComplete:true};return{status:'passed',reportRequest:{path:'/request',digest:mode==='bad-pin'?'bad':'sha256:'+'a'.repeat(64),runId:'complex-00000000-0000-4000-8000-000000000000'}};},descriptor:async()=>{throw Error('late');},collect:async()=>{collected++;return{status:'passed',exitCode:0};},withdraw:()=>withdrawn++});assert.equal(result.exitCode,2);assert.equal(collected,0);assert.equal(withdrawn,1);assert(!JSON.stringify(result).includes('CANARY'));}
});
test('unsupported fixed source capability stays visible with core reporting and no catalogue increment',async()=>{
 const {runAssuranceSequence}=await import('./run-harness-assurance.mjs'),attempt={schemaVersion:1,kind:'complex-email-attempt',status:'NOT_RUN',reason:'SOURCE_PROOF_PLATFORM_UNSUPPORTED'};let calls=0;
 const result=await runAssuranceSequence({native:async()=>({status:'PASS',exitCode:0,continuationSafe:true}),complexAttempt:attempt,descriptor:async()=>'/descriptor',collect:async(_p,options)=>{calls++;assert.deepEqual(options.complexEmailAttempt,attempt);return{status:'passed',exitCode:0};}});assert.equal(calls,1);assert.equal(result.complexStatus,'NOT_RUN');assert.equal(result.exitCode,0);
});
test('owned request cannot reuse any validated main context owner, name, container or namespace',async t=>{
 const x=await fixture(t),packet=await x.read();assert.equal(x.m.assertComplexOwnership(x.f.directory,x.f.descriptor.expected,packet),true);
 const registryPath=path.join(x.f.directory,'private/eventCapability/owned-resources.json'),registry=JSON.parse(fs.readFileSync(registryPath));
 // Older main fixture projects only service/image. This ownership-unit control
 // supplies explicit held registry fields; full phase validation is separate.
 Object.assign(registry[0],{owner:'held-main-owner',id:'e'.repeat(64),name:'held-main-owner-candidate',namespace:'f'.repeat(64)});x.write(registryPath,registry);
 for(const key of ['owner','id','name','namespace'])assert.equal(typeof registry[0][key],'string');
 for(const change of [p=>p.expected.contexts['browser-baseline'].prepared.state.owner=registry[0].owner,p=>p.expected.contexts['browser-baseline'].closed.ids[0]=registry[0].id,p=>p.expected.contexts['browser-baseline'].closed.names[0]=registry[0].name,p=>p.expected.contexts['mapping-baseline'].prepared.state.namespace=registry[0].namespace]){const p=structuredClone(packet);change(p);assert.throws(()=>x.m.assertComplexOwnership(x.f.directory,x.f.descriptor.expected,p));}
});
test('capability gate validates specified inputs first and distinguishes qualified host/runtime from unsupported',()=>{
 const {functionBody}=require('./fixtures/exui-complex-email-admission.mock.cjs'),os=require('node:os'),crypto=require('node:crypto'),directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-capability-'));
 try{const inputs={};for(const key of ['python','sourceArchive','definitionArchive','javaHome','lombok','mapstruct']){inputs[key]=path.join(directory,key);if(key==='javaHome')fs.mkdirSync(inputs[key]);else fs.writeFileSync(inputs[key],'fixture');}const descriptor=path.join(directory,'input.json');fs.writeFileSync(descriptor,JSON.stringify(inputs));let prepared=0,pythonDigest='sha256:33b0527cec869e6b4a142219462cd28e1628ebaa899abd3c9b54cb40b87b008e';
 const gate=functionBody('prepareComplexAdmissionInputs',{assert,fs,path,fail:'INPUT_INVALID',COMPLEX_QUALIFIED_PYTHON_DIGEST:'sha256:33b0527cec869e6b4a142219462cd28e1628ebaa899abd3c9b54cb40b87b008e',digestBytes:bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),absent:reason=>({schemaVersion:1,kind:'complex-email-attempt',status:'NOT_RUN',reason}),prepareComplexSourceInputs:value=>{prepared++;assert.deepEqual(value,inputs);return{prepared:{python:{digest:pythonDigest}}};}});
 assert.equal(gate(descriptor,{host:'darwin',arch:'arm64',runtime:'linux/arm64'}).attempt,undefined);
 for(const platform of [{host:'linux',arch:'arm64',runtime:'linux/arm64'},{host:'darwin',arch:'arm64',runtime:'linux/amd64'},{host:'linux',arch:'x64'}])assert.equal(gate(descriptor,platform).attempt.reason,'SOURCE_PROOF_PLATFORM_UNSUPPORTED');assert.equal(prepared,4);
 pythonDigest='sha256:b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9';assert.throws(()=>gate(descriptor,{host:'darwin',arch:'arm64'}));assert.throws(()=>gate(descriptor,{host:'linux',arch:'x64'}));
 fs.writeFileSync(descriptor,'{');assert.throws(()=>gate(descriptor,{host:'linux',arch:'x64'}));assert.equal(prepared,6);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('actual admission wrapper retains API expectations and refuses partial closure, forced compiler, cancellation and late write',async t=>{
 const x=await fixture(t),{functionBody}=require('./fixtures/exui-complex-email-admission.mock.cjs'),io=await import('./lib/exui-evidence-io.mjs');
 for(const mode of ['pass','missing-context','uncertain-close','forced','cancel','late-write','expected-file-only']){
  const controller=new AbortController();let captures=0;
  const run=functionBody('runComplexEmailAdmission',{assert,path,randomUUID:require('node:crypto').randomUUID,performance,COMPLEX_CONTEXTS:x.raw.COMPLEX_CONTEXTS,complexPin:x.raw.complexPin,complexProducer:()=>x.expected.producer,verifyComplexNativeCapture:()=>{captures++;return x.capture.reference;},validateComplexAdmissionContext:x.m.validateComplexAdmissionContext,recheckComplexAdmissionInputs:()=>({}),complexAdmissionDigest:x.m.complexAdmissionDigest,writeJsonAtomic:(file,value)=>{if(mode==='late-write'&&file.endsWith('request.json'))throw Error('disk-write');io.writeJsonAtomic(file,value);},runComplexEmailCohort:async options=>{const expected=structuredClone(x.expected);expected.runId=options.runId;expected.admissionContext=options.admissionContext;if(mode==='missing-context')delete expected.contexts['mapping-searchable'];if(mode==='uncertain-close')expected.contexts['mapping-baseline'].closed.observedAbsent=false;if(mode==='forced')expected.sourceProof.terminal.forced=true;if(mode==='cancel')controller.abort();return{result:{status:'OBSERVATIONS_VERIFIED'},...(mode==='expected-file-only'?{expectedFile:'/fake'}:{expected})};}},{file:'scripts/run-harness-complex-email-admission.mjs'});
  const promise=run({candidate:'/candidate',browser:'/browser',output:x.directory,signal:controller.signal,nativeContext:x.context,nativeOutput:x.f.directory,sourceConfiguration:x.sourceConfiguration});
  if(mode==='pass'){const returned=await promise;assert.equal(returned.status,'passed');assert.equal(captures,2);assert.equal(returned.reportRequest.digest,x.raw.complexPin(x.directory,path.basename(returned.reportRequest.path)));const saved=JSON.parse(fs.readFileSync(returned.reportRequest.path));assert.equal(saved.expected.runId,returned.reportRequest.runId);assert.deepEqual(saved.expected.admissionContext,x.context);}
  else await assert.rejects(promise,undefined,mode);
 }
});
test('controlled removal of held request-byte guard fails the regression at the claimed mechanism',async t=>{
 const x=await fixture(t),sourcePath=path.resolve(__dirname,'lib/exui-complex-email-admission.mjs'),source=fs.readFileSync(sourcePath,'utf8');
 const guard='assert.equal(complexPin(directory,path.basename(requestPath)),requestPin.digest,fail);';assert(source.includes(guard));
 const request=JSON.parse(fs.readFileSync(x.requestPath));request.expected.sourceProof.terminal.pid++;x.write(x.requestPath,request);await assert.rejects(x.read);
 // The old body still runs all actual raw gates, but loses the independent request pin.
 const start=source.indexOf('export async function readComplexAdmissionPacket('),end=source.indexOf('export function complexNativeJointAdmission(',start),body=source.slice(start,end).replace(/^export /,'').replace(guard,'').replace("await import('../run-harness-complex-email-cohort.mjs')",'controller');
 const controller=await import('./run-harness-complex-email-cohort.mjs'),dependencies={assert,path,root:path.resolve(__dirname,'..'),fail:'COMPLEX_EMAIL_ADMISSION_INVALID',hash:/^sha256:[a-f0-9]{64}$/,keys:(v,n)=>assert.deepEqual(Object.keys(v??{}).sort(),n.slice().sort()),controller,...x.raw,...x.m,inspectHostContainer:()=>null,hostDocker:()=>'',replayComplexSource:()=>({}),recheckComplexAdmissionInputs:v=>v.inputs};
 const old=new Function(...Object.keys(dependencies),body+';return readComplexAdmissionPacket;')(...Object.values(dependencies));
 await assert.rejects(async()=>assert.rejects(()=>old(x.requestPath,x.pin)),/Missing expected rejection/);
});
test('full seven-phase native reader admits exactly one Complex row only after complete raw gate; missing request fails closed',async t=>{
 const x=await fixture(t),joined=await x.readNative();assert.equal(joined.complexEmailAdmission.joint.status,'included');assert.equal(joined.catalogueCoverage.complexEmailAdmission.obligationId,joined.complexEmailAdmission.obligationId);assert.equal(joined.releaseApproval,false);
 const saved=fs.readFileSync(x.f.descriptorPath),descriptor=JSON.parse(saved);delete descriptor.complexEmailAdmission;x.write(x.f.descriptorPath,descriptor);await assert.rejects(x.readNative);
 delete descriptor.expected.complexEmailRequest;x.write(x.f.descriptorPath,descriptor);const before=await x.readNative();assert.equal(joined.catalogueCoverage.candidate,before.catalogueCoverage.candidate+1);assert.equal(joined.catalogueCoverage.ccd,before.catalogueCoverage.ccd);assert.equal(joined.catalogueCoverage.missing,before.catalogueCoverage.missing-1);assert.equal(joined.catalogueCoverage.selected,112);assert.deepEqual(joined.phases,before.phases);assert.deepEqual(joined.divorceProfileAdmission,before.divorceProfileAdmission);fs.writeFileSync(x.f.descriptorPath,saved);
 const request=JSON.parse(fs.readFileSync(x.requestPath));request.expected.contexts['mapping-searchable'].closed.observedAbsent=false;const digest=x.write(x.requestPath,request),changed=JSON.parse(saved);changed.expected.complexEmailRequest.digest=digest;delete changed.expected.complexEmailNativeBinding;x.write(x.f.descriptorPath,changed);await assert.rejects(x.readNative);
});
test('full native reader ignores unused optional capsule files but still verifies a requested capsule',async t=>{
 const x=await fixture(t),descriptor=JSON.parse(fs.readFileSync(x.f.descriptorPath));delete descriptor.complexEmailAdmission;delete descriptor.expected.complexEmailRequest;
 descriptor.expected.personalServiceNativeBinding={path:'private/personal-service-native-binding.json',digest:'sha256:'+'f'.repeat(64)};x.write(x.f.descriptorPath,descriptor);
 const before=await x.readNative(),file=path.join(x.f.directory,x.m.COMPLEX_NATIVE_PATH),saved=fs.readFileSync(file);fs.unlinkSync(file);
 assert.deepEqual(await x.readNative(),before);x.write(file,{changed:'unused'});assert.deepEqual(await x.readNative(),before);
 descriptor.complexEmailAdmission=x.requestPath;descriptor.expected.complexEmailRequest=x.pin;x.write(x.f.descriptorPath,descriptor);await assert.rejects(x.readNative);
 fs.writeFileSync(file,saved);
});
