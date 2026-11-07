const {reviewedCsrfDetailChildren}=require('./fixtures/harness-reviewed-csrf-details.mock.cjs');
// Fake presentation events use the independently reviewed literal IDs, not validator output.
function reviewedFixtureSteps(test) {
  const path = require('node:path');
  const file = path.relative(process.cwd(), test.location.file).split(path.sep).join('/');
  const method = require('./fixtures/harness-public-check-methods.json').checks.find(row => row.file === file && JSON.stringify(row.titlePath.slice(3)) === JSON.stringify(test.titlePath().slice(3)));
  if (!method) throw new Error('REVIEWED_PRESENTATION_FIXTURE_IDENTITY_MISSING');
  return method.steps.map(({id}) => ({title:'harness-check:' + id, category:'test.step', duration:1, steps:reviewedCsrfDetailChildren(id)}));
}
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {temp}=require('./fixtures/exui-divorce-cohort-packet.mock.cjs');
const {createHash}=require('node:crypto');
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const hash=x=>'sha256:'+x.repeat(64);
const read=f=>JSON.parse(fs.readFileSync(f));
const write=(f,value)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(value));return digest(fs.readFileSync(f));};
const {jointFixture}=require('./fixtures/exui-divorce-joint-packet.mock.cjs');
test('complete native seven plus raw DIVORCE twelve admits exactly one candidate ID while native remains BLOCKED',async t=>{
 const f=await jointFixture(t),joined=await f.read();assert.equal(joined.status,'BLOCKED');assert.equal(joined.divorceProfileAdmission.joint.status,'included');assert.equal(joined.releaseApproval,false);assert.equal(joined.catalogueCoverage.selected,112);
 const original=fs.readFileSync(f.descriptorPath);delete f.descriptor.divorceProfileAdmission;delete f.descriptor.expected.divorceProfileRequest;f.save();const base=await f.read();fs.writeFileSync(f.descriptorPath,original);
 assert.equal(joined.catalogueCoverage.candidate,base.catalogueCoverage.candidate+1);assert.equal(joined.catalogueCoverage.missing,base.catalogueCoverage.missing-1);assert.equal(joined.catalogueCoverage.ccd,base.catalogueCoverage.ccd);assert.deepEqual(joined.phases,base.phases);assert.deepEqual(joined.catalogueCoverage.creditedObligationIds.slice(0,-1),base.catalogueCoverage.creditedObligationIds);
 const render=require('./harness-native-report.cjs');const html=render.renderNativeEvidence(joined);assert.match(html,/1 requirement included in main candidate coverage/);assert.match(html,/already included once/);
 const reportRoot=temp(t),previous=process.cwd();process.chdir(reportRoot);
 try{
  const Reporter=require('./fixtures/exui-native-report-packet.mock.cjs').reporterForReaderOptions(t,{profileConfigurationFor:f.c.configurationFor}),overview=require('./harness-public-overview.cjs'),reporter=new Reporter({selection:'harness'});await reporter.prepareNativeEvidence(f.descriptorPath);
  const tests=overview.entries.map(entry=>({location:{file:path.join(reportRoot,entry.file)},titlePath:()=>entry.titlePath,retries:0,expectedStatus:'passed'}));reporter.onBegin({}, {allTests:()=>tests});
  const startTime=new Date('2026-11-05T12:00:00Z');for(const item of tests)reporter.onTestEnd(item,{steps:reviewedFixtureSteps(item),status:'passed',retry:0,duration:1,startTime,workerIndex:0,parallelIndex:0});await reporter.onEnd({status:'passed',startTime,duration:1000});
  const recorded=Reporter.validatePublicReport();assert.equal(recorded.tests,tests.length);assert.deepEqual(recorded.nativeEvidence.catalogueCoverage,joined.catalogueCoverage);
  const published=fs.readFileSync(path.join(reportRoot,'functional-output/tests/harness/public/odhin/index.html'),'utf8');assert.equal((published.match(/id="harness-divorce-profile-admission"/g)||[]).length,1);assert.match(published,/DIVORCE profile: 1 requirement included in main candidate coverage/);assert.match(published,/data-profile-inclusion="included"/);assert.match(published,/Postal proof BLOCKED/);
 const recordFile=path.join(reportRoot,'functional-output/tests/harness/private/public-odhin-harness.json'),htmlFile=path.join(reportRoot,'functional-output/tests/harness/public/odhin/index.html'),recordBytes=fs.readFileSync(recordFile),htmlBytes=fs.readFileSync(htmlFile,'utf8');
 for(const mode of ['copied-scalar','withdraw-intent']){const value=JSON.parse(recordBytes),page=require('node-html-parser').parse(htmlBytes);if(mode==='copied-scalar'){value.nativeEvidence.phases.find(p=>p.phase==='ccd').baselineProofs.find(p=>p.proofId==='ccd-nested-roundtrip').businessScalars=require('./fixtures/exui-business-scalar-detail.mock.cjs').recorded('ccd-nested-roundtrip');page.querySelector('#harness-native-evidence').replaceWith(render.renderNativeEvidence(value.nativeEvidence));}else delete value.nativeBusinessScalarHeld;const changed=page.toString();value.sha256=createHash('sha256').update(changed).digest('hex');fs.writeFileSync(htmlFile,changed);fs.writeFileSync(recordFile,JSON.stringify(value));assert.throws(()=>Reporter.validatePublicReport(),/PUBLIC_ODHIN/,mode);fs.writeFileSync(htmlFile,htmlBytes);fs.writeFileSync(recordFile,recordBytes);}
 Reporter.validatePublicReport();
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
test('local joint caller explicitly selects the profile in the canonical assurance API',async t=>{
 const {spawnSync}=require('node:child_process'),root=temp(t);fs.mkdirSync(path.join(root,'scripts'));
 fs.copyFileSync(path.join(__dirname,'run-harness-divorce-joint-assurance.mjs'),path.join(root,'scripts/run-harness-divorce-joint-assurance.mjs'));
 fs.writeFileSync(path.join(root,'scripts/run-harness-assurance.mjs'),`import fs from 'node:fs';export async function runHarnessAssurance(job,options){fs.writeFileSync('calls.json',JSON.stringify([{job,options}]));return {nativeStatus:'BLOCKED',profileStatus:'PASS',diagnosticStatus:'passed',exitCode:2,releaseApproval:false};}`);
 const job=path.join(root,'job.json'),profileOutput=path.join(root,'profile');
 const child=spawnSync(process.execPath,[path.join(root,'scripts/run-harness-divorce-joint-assurance.mjs'),'--input',job,'--profile-output',profileOutput],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.equal(child.status,2,child.stderr);assert.deepEqual(read(path.join(root,'calls.json')),[{job,options:{profileOutput}}]);assert.equal(JSON.parse(child.stdout).releaseApproval,false);
});
test('native preflight capture rejects different raw source-default bytes before writing authority',async t=>{
 const root=temp(t),candidateRoot=path.join(root,'candidate');fs.mkdirSync(path.join(candidateRoot,'config'),{recursive:true});fs.writeFileSync(path.join(candidateRoot,'config/default.json'),'{"source":"foreign"}');
 const {captureDivorceNativeBinding}=await import('./lib/exui-divorce-native-binding.mjs');
 assert.throws(()=>captureDivorceNativeBinding({commit:'b'.repeat(40),artifact:{candidateRoot,identity:{artifactDigest:hash('a')},payloadDigest:hash('b'),provenance:{platform:'linux/arm64'}},nativeRuntime:{reference:'synthetic',imageId:hash('8'),platform:'linux/arm64'},browserRuntimeImage:hash('9'),browserDigest:hash('b'),dependencies:{digest:hash('a'),playwrightVersion:'1.62.1'},sourceDigests:{}},root),/DIVORCE_NATIVE_BINDING_INVALID/);
 assert.equal(fs.existsSync(path.join(root,'private/native-cohort-binding.json')),false);
});
