const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {completeCohort}=require('./exui-st-cic-cohort-packet.mock.cjs');
const {fixture:nativeFixture}=require('./exui-native-report-packet.mock.cjs');
const hash=x=>'sha256:'+x.repeat(64),digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file));
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');return digest(fs.readFileSync(file));};
// Complete synthetic raw packets exercise the real readers. No runtime was launched.
async function jointPacket(t){
 const root=path.resolve(__dirname,'../..'),bindingApi=await import('../lib/exui-divorce-native-binding.mjs'),m=await import('../lib/exui-st-cic-profile-admission.mjs');
 const {NATIVE_HARNESS_SOURCE_FILES}=await import('../lib/exui-native-sources.mjs');
 const files=Object.fromEntries(NATIVE_HARNESS_SOURCE_FILES.map(name=>[name,digest(fs.readFileSync(path.join(root,name)))])),sourceDigest=bindingApi.nativeInventoryDigest(files);
 const identity=structuredClone(require('./exui-release-evidence.mock.cjs').completeRun().manifest.identity);identity.webappCommit='20c6ec129fc1e81061c733e164198ec63a33e71a';
 const runtime={reference:'synthetic-api@'+hash('8'),imageId:hash('8'),platform:'linux/arm64'},browser={image:hash('9'),digest:hash('b'),dependencies:{digest:hash('a'),playwrightVersion:'1.65.0'}};
 const c=await completeCohort(t,{resourceIdBase:10000,content:{artifact:{identity,provenance:{sourceMethod:'git-archive',webappCommit:identity.webappCommit,sourceTree:'d'.repeat(40),platform:'linux/arm64',runtimeNodeVersion:'v24.22.1'}},producer:{commit:'b'.repeat(40),files},runtime,browser}}),binding=read(path.join(c.directory,'cohort-input.json'));
 const f=await nativeFixture(t,{sourceDigest,candidate:binding.artifact});
 const routingBundle=path.join(binding.artifact.candidateRoot,'dist/rpx-exui/api/server.bundle.js');fs.mkdirSync(path.dirname(routingBundle),{recursive:true});fs.writeFileSync(routingBundle,'synthetic PCS routing API bundle');
 // Match fixed native fixture inputs/lifecycles to the common held candidate binding.
 for(const item of [f.event,f.callback,f.selector]){Object.assign(item.input.nativeRuntime,runtime);item.input.harnessSources=NATIVE_HARNESS_SOURCE_FILES;if(item.lifecycle)for(const state of [item.lifecycle.before,item.lifecycle.after])state.Image=runtime.imageId;item.write();Object.assign(f.descriptor.expected.phases.find(row=>row.phase===path.basename(item.directory)).expected,item.expected);}
 const {nativeInvocations}=await import('../lib/exui-native-contract.mjs');
 for(const selected of f.descriptor.expected.phases){
  const dir=path.join(f.directory,'private',selected.phase),inputFile=path.join(dir,'input.json'),input=fs.existsSync(inputFile)?read(inputFile):{artifact:binding.artifact};
  Object.assign(input,{nativeRuntime:runtime,browserRuntimeImage:browser.image,harnessSources:NATIVE_HARNESS_SOURCE_FILES,harnessSourceDigest:sourceDigest});write(inputFile,input);
  for(const {invocationId}of nativeInvocations(selected.expected.releaseScopeId)){const file=path.join(dir,invocationId,'candidate-lifecycle.json'),lifecycle=read(file);for(const state of [lifecycle.before,lifecycle.after])state.Image=runtime.imageId;write(file,lifecycle);}
  if(!fs.existsSync(path.join(dir,'owned-resources.json')))write(path.join(dir,'owned-resources.json'),[{service:'candidate',image:runtime.imageId},{service:'browser-provider',image:browser.image}]);
 }
 for(const item of [f.event,f.callback,f.selector]){item.write();Object.assign(f.descriptor.expected.phases.find(row=>row.phase===path.basename(item.directory)).expected,item.expected);}
 const ciFile=path.join(f.directory,'private/ci-result.json'),ci=read(ciFile);for(const phase of ci.phaseResults){const selected=f.descriptor.expected.phases.find(row=>row.phase===phase.phase);phase.receiptArtifactDigest=selected.expected.receiptArtifactDigest;if(phase.phase==='eventCapability')phase.eventTransition=selected.expected.eventTransition;if(phase.phase==='recipientCallback')phase.callbackTransition=selected.expected.callbackTransition;}f.descriptor.expected.ciResultDigest=write(ciFile,ci);
 const nativeCapture=bindingApi.captureDivorceNativeBinding({commit:binding.producer.commit,artifact:binding.artifact,nativeRuntime:runtime,browserRuntimeImage:browser.image,browserDigest:browser.digest,dependencies:browser.dependencies,sourceDigests:{all:sourceDigest}},f.directory);
 f.descriptor.expected.nativeCohortBinding=nativeCapture.reference;
 const capture=m.captureStCicNativeBinding({nativeCohortCapture:nativeCapture},f.directory);f.descriptor.expected.stCicNativeBinding=capture.reference;
 const context={native:nativeCapture.binding,capture,expected:structuredClone(f.descriptor.expected)};
 const parent=path.dirname(c.directory),runId='st-cic-'+randomUUID(),inputDigest=write(path.join(parent,'expected-input.json'),{schemaVersion:1,runId,binding});
 const admissionContextDigest=write(path.join(parent,'native-admission-context.json'),{schemaVersion:1,kind:'st-cic-parent-context',runId,inputDigest,context});
 const {stCicControllerCommand}=await import('../run-harness-st-cic-profile-admission.mjs');
 write(path.join(parent,'independent-controller-launch.json'),{schemaVersion:1,runId,inputDigest,producer:binding.producer,command:stCicControllerCommand({artifactPath:'/synthetic/artifact.json',browserRoot:binding.browser.root,output:parent}),admissionContextDigest});
 write(path.join(parent,'independent-controller-terminal.json'),{schemaVersion:1,runId,inputDigest,started:true,observed:true,forced:false,cancelled:false,code:0,signal:null});
 const {ST_CIC_PROFILE_FACETS}=await import('../lib/exui-st-cic-profile-contract.mjs');
 const containers=ST_CIC_PROFILE_FACETS.flatMap(({facet,fault})=>{const rows=read(path.join(c.directory,facet,'owned-resources.json'));return ['baseline',fault].flatMap(id=>['candidate','tools'].map(role=>{const row=rows.find(r=>r.name===`${binding.owners[facet]}-${id}-${role}`);return {name:row.name,id:row.id,owner:row.owner,absent:true};}));});
 write(path.join(parent,'independent-controller-cleanup.json'),{schemaVersion:1,runId,inputDigest,observedAfterController:true,containers});write(path.join(c.directory,'st-cic-profile-cohort.json'),c.replay());
 const expected=m.stCicAdmissionPins(parent),requestPath=path.join(parent,'admission-request.json'),requestPin={runId,digest:write(requestPath,{schemaVersion:1,kind:'st-cic-profile-admission-request',directory:parent,expected})};
 const packet=m.readStCicProfileAdmissionPacket(requestPath,requestPin);f.descriptor.expected.stCicProfileRequest=requestPin;
 // The raw main reader has not been activated for ST_CIC; validate its existing gate separately.
 const rawDescriptor=structuredClone(f.descriptor);delete rawDescriptor.expected.stCicNativeBinding;delete rawDescriptor.expected.stCicProfileRequest;write(f.descriptorPath,rawDescriptor);
 bindingApi.readDivorceNativeBinding(f.directory,rawDescriptor.expected);
 const main=await import('../lib/exui-native-report-evidence.mjs');assert.equal((await main.readNativeReportEvidence(f.descriptorPath)).status,'PASS');
 return {c,f,m,native:nativeCapture.binding,capsule:capture.binding,context,packet,expected:f.descriptor.expected,requestPath,requestPin};
}
module.exports={jointPacket};
