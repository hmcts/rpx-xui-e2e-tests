const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./fixtures/exui-native-report-packet.mock.cjs');
const {completeCohort,temp}=require('./fixtures/exui-divorce-cohort-packet.mock.cjs');
const {createHash,randomUUID}=require('node:crypto');
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const hash=x=>'sha256:'+x.repeat(64);
const read=f=>JSON.parse(fs.readFileSync(f));
const write=(f,value)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(value));return digest(fs.readFileSync(f));};
async function jointFixture(t,{profileContext={}}={}){
 const {NATIVE_HARNESS_SOURCE_FILES}=await import('./lib/exui-native-sources.mjs');
 const {DIVORCE_COHORT_FILES}=await import('./lib/exui-divorce-profile-cohort.mjs');
 const contract=await import('./lib/exui-divorce-profile-contract.mjs');
 const bindingApi=await import('./lib/exui-divorce-native-binding.mjs');
 const files=Object.fromEntries(DIVORCE_COHORT_FILES.map(name=>[name,digest(fs.readFileSync(path.join(__dirname,'..',name)))]));
 const nativeFiles=Object.fromEntries(NATIVE_HARNESS_SOURCE_FILES.map(name=>[name,files[name]])),sourceDigest=bindingApi.nativeInventoryDigest(nativeFiles);
 const identity=structuredClone(require('./fixtures/exui-release-evidence.mock.cjs').completeRun().manifest.identity);identity.webappCommit=contract.divorceProfileContract().consumerRevision;
 const candidate={identity,payloadDigest:hash('c'),provenance:{webappCommit:identity.webappCommit,platform:'linux/arm64',sourceTree:'d'.repeat(40)}};
 const f=await fixture(t,{postalFailure:true,sourceDigest,candidate});
 const runtime={reference:'synthetic-api@'+hash('8'),imageId:hash('8'),platform:'linux/arm64'},browser={image:hash('9'),digest:hash('b')},dependencies={digest:hash('a'),playwrightVersion:'1.62.1'};
 for(const item of [f.event,f.callback,f.selector]){
  Object.assign(item.input.nativeRuntime,runtime);Object.assign(item.input,{harnessSources:NATIVE_HARNESS_SOURCE_FILES});
  if(item.lifecycle)for(const state of [item.lifecycle.before,item.lifecycle.after])state.Image=runtime.imageId;
  item.write();
  const selected=f.descriptor.expected.phases.find(x=>x.phase===path.basename(item.directory));Object.assign(selected.expected,item.expected);
 }
 for(const selected of f.descriptor.expected.phases){
  const dir=path.join(f.directory,'private',selected.phase),inputFile=path.join(dir,'input.json');
  const input=fs.existsSync(inputFile)?read(inputFile):{artifact:{candidateRoot:f.event.input.artifact.candidateRoot,...candidate}};
  Object.assign(input,{nativeRuntime:runtime,browserRuntimeImage:browser.image,harnessSources:NATIVE_HARNESS_SOURCE_FILES,harnessSourceDigest:sourceDigest});write(inputFile,input);
  const {nativeInvocations}=await import('./lib/exui-native-contract.mjs');
  for(const {invocationId}of nativeInvocations(selected.expected.releaseScopeId)){
   const file=path.join(dir,invocationId,'candidate-lifecycle.json'),lifecycle=read(file);for(const state of [lifecycle.before,lifecycle.after])state.Image=runtime.imageId;write(file,lifecycle);
  }
  if(!fs.existsSync(path.join(dir,'owned-resources.json')))write(path.join(dir,'owned-resources.json'),[{service:'candidate',image:runtime.imageId},{service:'browser-provider',image:browser.image}]);
 }
 // Re-seal the independently captured input/lifecycle references after fixture construction.
 for(const item of [f.event,f.callback,f.selector]){item.write();const selected=f.descriptor.expected.phases.find(x=>x.phase===path.basename(item.directory));Object.assign(selected.expected,item.expected);}
 const ciFile=path.join(f.directory,'private/ci-result.json'),ci=read(ciFile);for(const phase of ci.phaseResults){const selected=f.descriptor.expected.phases.find(x=>x.phase===phase.phase);phase.receiptArtifactDigest=selected.expected.receiptArtifactDigest;if(phase.phase==='eventCapability')phase.eventTransition=selected.expected.eventTransition;if(phase.phase==='recipientCallback')phase.callbackTransition=selected.expected.callbackTransition;}
 f.descriptor.expected.ciResultDigest=write(ciFile,ci);
 const projection=read(path.join(__dirname,'fixtures/exui-configuration-source.json')),source=projection.sources.find(x=>x.repository==='rpx-xui-webapp'&&x.path==='config/default.json');
 const {catalogue}=await import('./lib/exui-configuration-runtime-coverage.mjs').then(m=>m.loadCommittedConfigurationCatalogue());
 const native={schemaVersion:1,kind:'divorce-native-candidate-binding',policy:bindingApi.DIVORCE_NATIVE_POLICY,producer:{commit:'b'.repeat(40),files:nativeFiles,sourceDigest},candidate,runtime,browser,dependencies,sourceDefault:{path:'config/default.json',revision:source.revision,digest:'sha256:'+source.fileDigest},catalogue:{obligationsDigest:digest(JSON.stringify(catalogue.obligations)),projectionDigest:files['scripts/fixtures/exui-configuration-source.json'],reviewDigest:files['scripts/fixtures/exui-configuration-review.json'],size:112},profileContractDigest:contract.divorceProfileContractDigest()};
 const nativeFile=path.join(f.directory,bindingApi.DIVORCE_NATIVE_BINDING_PATH);f.descriptor.expected.nativeCohortBinding={path:bindingApi.DIVORCE_NATIVE_BINDING_PATH,digest:write(nativeFile,native)};
 const parent=temp(t),c=await completeCohort(t,{directory:path.join(parent,'cohort'),content:{artifact:candidate,producer:{commit:'b'.repeat(40),files},runtime,browser:{...browser,dependencies},...profileContext}});
 const m=await import('./lib/exui-divorce-profile-admission.mjs'),{divorceControllerCommand}=await import('./run-harness-divorce-profile-admission.mjs');
 const runId='divorce-'+randomUUID(),binding=read(path.join(c.directory,'cohort-input.json'));
 const inputDigest=write(path.join(parent,'expected-input.json'),{schemaVersion:1,runId,binding});
 write(path.join(parent,'independent-controller-launch.json'),{schemaVersion:1,runId,inputDigest,producer:binding.producer,command:divorceControllerCommand({artifactPath:'/synthetic/artifact.json',browserRoot:binding.browser.root,output:parent})});
 write(path.join(parent,'independent-controller-terminal.json'),{schemaVersion:1,runId,inputDigest,started:true,observed:true,forced:false,cancelled:false,code:0,signal:null});
 write(path.join(parent,'independent-controller-cleanup.json'),{schemaVersion:1,runId,inputDigest,observedAfterController:true,containers:contract.DIVORCE_PROFILE_FACETS.flatMap(({facet,fault})=>['baseline',fault].flatMap(id=>['candidate','tools'].map(role=>({name:`${binding.owners[facet]}-${id}-${role}`,absent:true}))))});
 write(path.join(c.directory,'divorce-profile-cohort.json'),c.m.readDivorceCohort(c.directory,c.expected,{configurationFor:c.configurationFor}));
 const requestFile=path.join(parent,'admission-request.json');const request={schemaVersion:1,kind:'divorce-profile-admission-request',directory:parent,expected:m.divorceAdmissionPins(parent)};
 f.descriptor.divorceProfileAdmission=requestFile;f.descriptor.expected.divorceProfileRequest={runId,digest:write(requestFile,request)};f.save();
 const api=await import('./lib/exui-native-report-evidence.mjs');return {...f,c,parent,native,nativeFile,requestFile,request,api,read:()=>api.readNativeReportEvidence(f.descriptorPath,{profileConfigurationFor:c.configurationFor})};
}
test('complete native seven plus raw DIVORCE twelve admits exactly one candidate ID while native remains BLOCKED',async t=>{
 const f=await jointFixture(t),joined=await f.read();assert.equal(joined.status,'BLOCKED');assert.equal(joined.divorceProfileAdmission.joint.status,'included');assert.equal(joined.releaseApproval,false);assert.equal(joined.catalogueCoverage.selected,112);
 const original=fs.readFileSync(f.descriptorPath);delete f.descriptor.divorceProfileAdmission;delete f.descriptor.expected.divorceProfileRequest;f.save();const base=await f.read();fs.writeFileSync(f.descriptorPath,original);
 assert.equal(joined.catalogueCoverage.candidate,base.catalogueCoverage.candidate+1);assert.equal(joined.catalogueCoverage.missing,base.catalogueCoverage.missing-1);assert.equal(joined.catalogueCoverage.ccd,base.catalogueCoverage.ccd);assert.deepEqual(joined.phases,base.phases);assert.deepEqual(joined.catalogueCoverage.creditedObligationIds.slice(0,-1),base.catalogueCoverage.creditedObligationIds);
 const render=require('./harness-native-report.cjs');const html=render.renderNativeEvidence(joined);assert.match(html,/1 requirement included in main candidate coverage/);assert.match(html,/already included once/);
 const reportRoot=temp(t),previous=process.cwd();process.chdir(reportRoot);
 try{
  const Reporter=require('./harness-public-odhin-reporter.cjs'),overview=require('./harness-public-overview.cjs'),reporter=new Reporter({selection:'harness'});reporter.nativeEvidence=joined;
  const tests=overview.entries.map(entry=>({location:{file:path.join(reportRoot,entry.file)},titlePath:()=>entry.titlePath,retries:0,expectedStatus:'passed'}));reporter.onBegin({}, {allTests:()=>tests});
  const startTime=new Date('2026-11-05T12:00:00Z');for(const item of tests)reporter.onTestEnd(item,{status:'passed',retry:0,duration:1,startTime,workerIndex:0,parallelIndex:0});await reporter.onEnd({status:'passed',startTime,duration:1000});
  const recorded=Reporter.validatePublicReport();assert.equal(recorded.tests,tests.length);assert.deepEqual(recorded.nativeEvidence.catalogueCoverage,joined.catalogueCoverage);
  const published=fs.readFileSync(path.join(reportRoot,'functional-output/tests/harness/public/odhin/index.html'),'utf8');assert.equal((published.match(/id="harness-divorce-profile-admission"/g)||[]).length,1);assert.match(published,/DIVORCE profile: 1 requirement included in main candidate coverage/);assert.match(published,/data-profile-inclusion="included"/);assert.match(published,/Postal proof BLOCKED/);
 }finally{process.chdir(previous);}
});
test('parent binding and raw twelve reject coherent substitutions before any separate-context classification',async t=>{
 const f=await jointFixture(t);await f.read();const originalDescriptor=fs.readFileSync(f.descriptorPath),originalNative=fs.readFileSync(f.nativeFile);
 for(const mutate of [x=>x.runtime.imageId=hash('d'),x=>x.browser.digest=hash('d'),x=>x.dependencies.digest=hash('d'),x=>x.sourceDefault.digest=hash('d'),x=>x.sourceDefault.revision='d'.repeat(40),x=>x.catalogue.obligationsDigest=hash('d'),x=>x.profileContractDigest=hash('d'),x=>x.producer.files['scripts/lib/exui-native-report-evidence.mjs']=hash('d'),x=>delete x.producer.files['package.json']]){
  const changed=JSON.parse(originalNative);mutate(changed);const descriptor=JSON.parse(originalDescriptor);descriptor.expected.nativeCohortBinding.digest=write(f.nativeFile,changed);write(f.descriptorPath,descriptor);await assert.rejects(f.read,/NATIVE_REPORT_INVALID_EVIDENCE/);fs.writeFileSync(f.nativeFile,originalNative);fs.writeFileSync(f.descriptorPath,originalDescriptor);
 }
 const raw=fs.readFileSync(f.requestFile);for(const mutate of [x=>x.expected.runId='divorce-ffffffff-ffff-4fff-8fff-ffffffffffff',x=>x.expected.producerCommit='e'.repeat(40),x=>x.expected.inputDigest=hash('e'),x=>x.expected.terminalDigest=hash('e')]){const changed=JSON.parse(raw);mutate(changed);write(f.requestFile,changed);await assert.rejects(f.read,/NATIVE_REPORT_INVALID_EVIDENCE/);fs.writeFileSync(f.requestFile,raw);}
 // Even a complete older request at the same path cannot replace the caller's retained digest.
 const request=JSON.parse(raw);request.standaloneTimingDigest=hash('d');write(f.requestFile,request);await assert.rejects(f.read);fs.writeFileSync(f.requestFile,raw);
 // Invalid raw evidence must fail even when the native context has no join capture.
 const desc=JSON.parse(originalDescriptor);delete desc.expected.nativeCohortBinding;write(f.descriptorPath,desc);
 for(const name of ['cohort/divorce-staff/source-profile-drop-divorce-staff/profile-worker-result.json','independent-controller-terminal.json','independent-controller-cleanup.json']){const file=path.join(f.parent,name),saved=fs.readFileSync(file);fs.unlinkSync(file);await assert.rejects(f.read);fs.writeFileSync(file,saved);}
 const separate=await f.read();assert.equal(separate.divorceProfileAdmission.joint.status,'separate');assert.equal(separate.divorceProfileAdmission.joint.reason,'missing-native-binding');fs.writeFileSync(f.descriptorPath,originalDescriptor);
 const file=path.join(f.directory,'private/family/input.json'),saved=fs.readFileSync(file),input=JSON.parse(saved);input.nativeRuntime.imageId=hash('d');write(file,input);await assert.rejects(f.read);fs.writeFileSync(file,saved);
 const badDescriptor=JSON.parse(originalDescriptor);delete badDescriptor.expected.divorceProfileRequest;write(f.descriptorPath,badDescriptor);await assert.rejects(f.read,/NATIVE_REPORT_PROFILE_REQUEST_REQUIRED/);fs.writeFileSync(f.descriptorPath,originalDescriptor);
 assert.equal((await f.read()).divorceProfileAdmission.joint.status,'included');
});
test('fixed comparator separates independently valid contexts and never admits a same-commit foreign source',async t=>{
 const f=await jointFixture(t),{readDivorceProfileAdmissionPacket,divorceNativeJointAdmission}=await import('./lib/exui-divorce-profile-admission.mjs');
 const packet=readDivorceProfileAdmissionPacket(f.requestFile,f.descriptor.expected.divorceProfileRequest,f.c.configurationFor);
 for(const [reason,mutate]of [['different-producer',x=>x.producer.commit='e'.repeat(40)],['different-candidate',x=>x.candidate.identity.artifactDigest=hash('e')],['different-runtime',x=>x.runtime.imageId=hash('e')],['different-browser',x=>x.browser.digest=hash('e')],['different-dependencies',x=>x.dependencies.digest=hash('e')]]){const native=structuredClone(f.native);mutate(native);assert.equal(divorceNativeJointAdmission(native,packet,f.descriptor.expected).reason,reason);}
 const native=structuredClone(f.native);native.producer.files['package.json']=hash('e');assert.throws(()=>divorceNativeJointAdmission(native,packet,f.descriptor.expected),/DIVORCE_ADMISSION_INVALID/);
 const result=await f.read(),render=require('./harness-native-report.cjs').renderNativeEvidence;
 for(const mutate of [x=>x.catalogueCoverage.creditedObligationIds.push(x.divorceProfileAdmission.obligationId),x=>x.catalogueCoverage.divorceProfileAdmission.obligationId='foreign',x=>x.divorceProfileAdmission.joint.profileRunId='divorce-ffffffff-ffff-4fff-8fff-ffffffffffff',x=>x.catalogueCoverage.ccd++]){const bad=structuredClone(result);mutate(bad);assert.throws(()=>render(bad));}
});
for(const [reason,context]of [['different-producer',{producer:{commit:'e'.repeat(40)}}],['different-candidate',{artifact:{identity:{...require('./fixtures/exui-release-evidence.mock.cjs').completeRun().manifest.identity,webappCommit:'26d17ebea1b7b470b6cc11409564ce296e8ec621',artifactDigest:hash('e')},payloadDigest:hash('e'),provenance:{webappCommit:'26d17ebea1b7b470b6cc11409564ce296e8ec621',platform:'linux/arm64',sourceTree:'d'.repeat(40)}}}],['different-runtime',{runtime:{reference:'synthetic-api@'+hash('e'),imageId:hash('e'),platform:'linux/arm64'}}],['different-browser',{browser:{image:hash('9'),digest:hash('e'),dependencies:{digest:hash('a'),playwrightVersion:'1.62.1'}}}],['different-dependencies',{browser:{image:hash('9'),digest:hash('b'),dependencies:{digest:hash('e'),playwrightVersion:'1.62.1'}}}]])test('both complete raw gates pass but '+reason+' remains separate',async t=>{
 const f=await jointFixture(t,{profileContext:context}),result=await f.read();assert.equal(result.divorceProfileAdmission.joint.status,'separate');assert.equal(result.divorceProfileAdmission.joint.reason,reason);assert.equal(result.divorceProfileAdmission.accepted,1);assert(!result.catalogueCoverage.creditedObligationIds.includes(result.divorceProfileAdmission.obligationId));assert.equal(result.status,'BLOCKED');assert.equal(result.releaseApproval,false);
 const html=require('./harness-native-report.cjs').renderNativeEvidence(result);assert.match(html,/not added to the main cohort accepted count/);
});
test('a fully valid other twelve-invocation request cannot replace the actual wrapper request at the same path',async t=>{
 const first=await jointFixture(t),other=await jointFixture(t);assert.equal((await other.read()).divorceProfileAdmission.joint.status,'included');fs.writeFileSync(first.requestFile,fs.readFileSync(other.requestFile));await assert.rejects(first.read,/NATIVE_REPORT_INVALID_EVIDENCE/);
});
test('fixed repository caller retains actual pins, waits for native shutdown and delegates one replay to the collector',async t=>{
 const {spawnSync}=require('node:child_process'),root=temp(t),put=(name,source)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);};
 fs.mkdirSync(path.join(root,'scripts'));fs.copyFileSync(path.join(__dirname,'run-harness-divorce-joint-assurance.mjs'),path.join(root,'scripts/run-harness-divorce-joint-assurance.mjs'));
 put('scripts/lib/exui-candidate-ci-inputs.mjs',`export const validateCiJob=value=>value;`);
 put('scripts/harness-public-odhin-reporter.cjs',`module.exports={resetPublicReport(){globalThis.calls=['reset'];}};`);
 put('scripts/run-harness-ci.mjs',`export async function runHarnessCi(_job,{captureNativeCohort}){calls.push('native-start');globalThis.heldNative={binding:{preflight:'held'},reference:{digest:'held'}};captureNativeCohort(heldNative);await Promise.resolve();globalThis.nativeStopped=true;calls.push('native-end');return {status:'BLOCKED',exitCode:2,phaseTimings:[]};}`);
 put('scripts/run-harness-divorce-profile-admission.mjs',`import assert from 'node:assert/strict';export async function runDivorceProfileAdmission(){assert.equal(globalThis.nativeStopped,true);calls.push('profile');globalThis.wrapperRequest={path:'/synthetic/request',digest:'held-wrapper-digest',runId:'held-wrapper-run'};return {status:'passed',reportRequest:wrapperRequest};}`);
 put('scripts/run-harness-assurance.mjs',`import assert from 'node:assert/strict';export const captureAssuranceExpectations=()=>({parent:'original'});export function writeNativeDescriptor(_job,captured,_verdict,_source,request){assert.equal(captured.nativeCohortCapture,globalThis.heldNative);assert.equal(request,globalThis.wrapperRequest);calls.push('descriptor');return '/synthetic/descriptor';}`);
 const job=path.join(root,'job.json');write(job,{candidateManifest:'/synthetic/artifact',browserCache:'/synthetic/browser'});
 for(const inclusion of ['included','separate',undefined]){
  put('scripts/run-harness-local-aat.cjs',`const assert=require('node:assert/strict'),fs=require('node:fs');exports.runHarnessCollection=async(_env,input)=>{assert.equal(input.nativeEvidencePath,'/synthetic/descriptor');assert(Number.isSafeInteger(input.nativeElapsedMs));calls.push('collect');fs.writeFileSync('calls.json',JSON.stringify(calls));return {status:'passed',exitCode:2,${inclusion?`divorceProfileInclusion:'${inclusion}'`:''}};};`);
  const result=spawnSync(process.execPath,[path.join(root,'scripts/run-harness-divorce-joint-assurance.mjs'),'--input',job,'--profile-output',path.join(root,'profile')],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.deepEqual(read(path.join(root,'calls.json')),['reset','native-start','native-end','profile','descriptor','collect']);assert.equal(result.status,2);
  if(inclusion==='included'){const output=JSON.parse(result.stdout);assert.equal(output.profileStatus,'passed');assert.equal(output.releaseApproval,false);}else assert.match(result.stderr,/DIVORCE_JOINT_ASSURANCE_FAILED/);
 }
});
test('native preflight capture rejects different raw source-default bytes before writing authority',async t=>{
 const root=temp(t),candidateRoot=path.join(root,'candidate');fs.mkdirSync(path.join(candidateRoot,'config'),{recursive:true});fs.writeFileSync(path.join(candidateRoot,'config/default.json'),'{"source":"foreign"}');
 const {captureDivorceNativeBinding}=await import('./lib/exui-divorce-native-binding.mjs');
 assert.throws(()=>captureDivorceNativeBinding({commit:'b'.repeat(40),artifact:{candidateRoot,identity:{artifactDigest:hash('a')},payloadDigest:hash('b'),provenance:{platform:'linux/arm64'}},nativeRuntime:{reference:'synthetic',imageId:hash('8'),platform:'linux/arm64'},browserRuntimeImage:hash('9'),browserDigest:hash('b'),dependencies:{digest:hash('a'),playwrightVersion:'1.62.1'},sourceDigests:{}},root),/DIVORCE_NATIVE_BINDING_INVALID/);
 assert.equal(fs.existsSync(path.join(root,'private/native-cohort-binding.json')),false);
});
