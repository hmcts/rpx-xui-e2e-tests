const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./exui-native-report-packet.mock.cjs');
const {completeCohort,temp}=require('./exui-divorce-cohort-packet.mock.cjs');
const {createHash,randomUUID}=require('node:crypto');
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const hash=x=>'sha256:'+x.repeat(64);
const read=f=>JSON.parse(fs.readFileSync(f));
const write=(f,value)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(value));return digest(fs.readFileSync(f));};
async function jointFixture(t,{profileContext={}}={}){
 const {NATIVE_HARNESS_SOURCE_FILES}=await import('../lib/exui-native-sources.mjs');
 const {DIVORCE_COHORT_FILES}=await import('../lib/exui-divorce-profile-cohort.mjs');
 const contract=await import('../lib/exui-divorce-profile-contract.mjs');
 const bindingApi=await import('../lib/exui-divorce-native-binding.mjs');
 const files=Object.fromEntries(DIVORCE_COHORT_FILES.map(name=>[name,digest(fs.readFileSync(path.join(__dirname,'../..',name)))]));
 const nativeFiles=Object.fromEntries(NATIVE_HARNESS_SOURCE_FILES.map(name=>[name,files[name]])),sourceDigest=bindingApi.nativeInventoryDigest(nativeFiles);
 const identity=structuredClone(require('./exui-release-evidence.mock.cjs').completeRun().manifest.identity);identity.webappCommit=contract.divorceProfileContract().consumerRevision;
 const candidate={identity,payloadDigest:hash('c'),provenance:{webappCommit:identity.webappCommit,platform:'linux/arm64',runtimeNodeVersion:'v24.22.2',sourceTree:'d'.repeat(40)}};
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
  const {nativeInvocations}=await import('../lib/exui-native-contract.mjs');
  for(const {invocationId}of nativeInvocations(selected.expected.releaseScopeId)){
   const file=path.join(dir,invocationId,'candidate-lifecycle.json'),lifecycle=read(file);for(const state of [lifecycle.before,lifecycle.after])state.Image=runtime.imageId;write(file,lifecycle);
  }
  if(!fs.existsSync(path.join(dir,'owned-resources.json')))write(path.join(dir,'owned-resources.json'),[{service:'candidate',image:runtime.imageId},{service:'browser-provider',image:browser.image}]);
 }
 // Re-seal the independently captured input/lifecycle references after fixture construction.
 for(const item of [f.event,f.callback,f.selector]){item.write();const selected=f.descriptor.expected.phases.find(x=>x.phase===path.basename(item.directory));Object.assign(selected.expected,item.expected);}
 const ciFile=path.join(f.directory,'private/ci-result.json'),ci=read(ciFile);for(const phase of ci.phaseResults){const selected=f.descriptor.expected.phases.find(x=>x.phase===phase.phase);phase.receiptArtifactDigest=selected.expected.receiptArtifactDigest;if(phase.phase==='eventCapability')phase.eventTransition=selected.expected.eventTransition;if(phase.phase==='recipientCallback')phase.callbackTransition=selected.expected.callbackTransition;}
 f.descriptor.expected.ciResultDigest=write(ciFile,ci);
 const projection=read(path.join(__dirname,'exui-configuration-source.json')),source=projection.sources.find(x=>x.repository==='rpx-xui-webapp'&&x.path==='config/default.json');
 const {catalogue}=await import('../lib/exui-configuration-runtime-coverage.mjs').then(m=>m.loadCommittedConfigurationCatalogue());
 const native={schemaVersion:1,kind:'divorce-native-candidate-binding',policy:bindingApi.DIVORCE_NATIVE_POLICY,producer:{commit:'b'.repeat(40),files:nativeFiles,sourceDigest},candidate,runtime,browser,dependencies,sourceDefault:{path:'config/default.json',revision:source.revision,digest:'sha256:'+source.fileDigest},catalogue:{obligationsDigest:digest(JSON.stringify(catalogue.obligations)),projectionDigest:files['scripts/fixtures/exui-configuration-source.json'],reviewDigest:files['scripts/fixtures/exui-configuration-review.json'],size:112},profileContractDigest:contract.divorceProfileContractDigest()};
 const nativeFile=path.join(f.directory,bindingApi.DIVORCE_NATIVE_BINDING_PATH);f.descriptor.expected.nativeCohortBinding={path:bindingApi.DIVORCE_NATIVE_BINDING_PATH,digest:write(nativeFile,native)};
 const parent=temp(t),c=await completeCohort(t,{directory:path.join(parent,'cohort'),content:{artifact:candidate,producer:{commit:'b'.repeat(40),files},runtime,browser:{...browser,dependencies},...profileContext}});
 const m=await import('../lib/exui-divorce-profile-admission.mjs'),{divorceControllerCommand}=await import('../run-harness-divorce-profile-admission.mjs');
 const runId='divorce-'+randomUUID(),binding=read(path.join(c.directory,'cohort-input.json'));
 const inputDigest=write(path.join(parent,'expected-input.json'),{schemaVersion:1,runId,binding});
 write(path.join(parent,'independent-controller-launch.json'),{schemaVersion:1,runId,inputDigest,producer:binding.producer,command:divorceControllerCommand({artifactPath:'/synthetic/artifact.json',browserRoot:binding.browser.root,output:parent})});
 write(path.join(parent,'independent-controller-terminal.json'),{schemaVersion:1,runId,inputDigest,started:true,observed:true,forced:false,cancelled:false,code:0,signal:null});
 write(path.join(parent,'independent-controller-cleanup.json'),{schemaVersion:1,runId,inputDigest,observedAfterController:true,containers:contract.DIVORCE_PROFILE_FACETS.flatMap(({facet,fault})=>['baseline',fault].flatMap(id=>['candidate','tools'].map(role=>({name:`${binding.owners[facet]}-${id}-${role}`,absent:true}))))});
 write(path.join(c.directory,'divorce-profile-cohort.json'),c.m.readDivorceCohort(c.directory,c.expected,{configurationFor:c.configurationFor}));
 const requestFile=path.join(parent,'admission-request.json');const request={schemaVersion:1,kind:'divorce-profile-admission-request',directory:parent,expected:m.divorceAdmissionPins(parent)};
 f.descriptor.divorceProfileAdmission=requestFile;f.descriptor.expected.divorceProfileRequest={runId,digest:write(requestFile,request)};f.save();
 const api=await import('../lib/exui-native-report-evidence.mjs');return {...f,c,parent,native,nativeFile,requestFile,request,api,read:()=>api.readNativeReportEvidence(f.descriptorPath,{profileConfigurationFor:c.configurationFor})};
}
module.exports={jointFixture};
