import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
import {deriveComplexEmailFixture,COMPLEX_EMAIL_OBLIGATION} from './exui-complex-email-text.mjs';
import {COMPLEX_CONTEXTS,COMPLEX_FLAGS,complexJson,complexPin,readComplexCohort} from './exui-complex-email-cohort.mjs';
import {prepareComplexSourceInputs} from './exui-complex-source-inputs.mjs';
import {loadCommittedConfigurationCatalogue} from './exui-configuration-runtime-coverage.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './exui-native-sources.mjs';
import {divorceCandidateContent,nativeInventoryDigest} from './exui-divorce-native-binding.mjs';
import {ccdImagePins} from './exui-ccd-runtime.mjs';
import {inspectHostContainer,hostDocker} from './exui-host-invocation.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const fail='COMPLEX_EMAIL_ADMISSION_INVALID',hash=/^sha256:[a-f0-9]{64}$/;
const keys=(value,names)=>assert.deepEqual(Object.keys(value??{}).sort(),names.slice().sort(),fail);
const digest=value=>digestBytes(JSON.stringify(value));
export const COMPLEX_NATIVE_PATH='private/complex-email-native-binding.json';
export const COMPLEX_ADMISSION_POLICY='complex-email-exact-row-v1';
export const COMPLEX_QUALIFIED_PYTHON_DIGEST='sha256:33b0527cec869e6b4a142219462cd28e1628ebaa899abd3c9b54cb40b87b008e';
export const COMPLEX_PUBLIC_FACETS=Object.freeze(['ID','ListElementCode','FieldType','ElementLabel','SecurityClassification','Searchable','LiveFrom']);
const standardPhases=['ccd','eventCapability','recipientCallback','selectorEventRow'];
const absent=reason=>({schemaVersion:1,kind:'complex-email-attempt',status:'NOT_RUN',reason});
export function complexAdmissionContract(){
 const {binding}=deriveComplexEmailFixture();const {catalogue}=loadCommittedConfigurationCatalogue(),sourceKey='prl-ccd-definitions:'+binding.sourcePath;
 assert.equal(catalogue.obligations.length,112,fail);
 assert.deepEqual(catalogue.obligations.filter(row=>row.id===COMPLEX_EMAIL_OBLIGATION),[{id:COMPLEX_EMAIL_OBLIGATION,family:'PRIVATELAW',kind:'definition-shape',requiredBoundary:'candidate',sourceKeys:[sourceKey]}],fail);
 const features=catalogue.features.filter(row=>row.id===COMPLEX_EMAIL_OBLIGATION);assert.equal(features.length,1,fail);assert.equal(features[0].sourceKey,sourceKey,fail);assert.equal('sha256:'+features[0].rowDigest,binding.sourceRowDigest,fail);
 return {policy:COMPLEX_ADMISSION_POLICY,obligationId:COMPLEX_EMAIL_OBLIGATION,boundary:'candidate',family:'PRIVATELAW',catalogueSize:112,sourceKey,sourceRevision:binding.sourceRevision,sourceFileDigest:binding.sourceFileDigest,sourceRowDigest:binding.sourceRowDigest,sourceIndex:binding.sourceIndex,
  facets:{ID:'source-type-import-and-nested-association',ListElementCode:'exact-leaf-import-render-and-persistence',FieldType:'Text-accepts-arbitrary-text-Email-fault-rejects-leaf-422',ElementLabel:'accessible-label-and-summary',SecurityClassification:'generated-PUBLIC-associated-with-persisted-recipient-IDs',Searchable:'unmasked-direct-parent-import-generated-mapping-N-to-Y-only',LiveFrom:'unconsumed-by-byte-matched-importer-entity-and-DTO-path'},
  mutations:[{attribute:'FieldType',from:'Text',to:'Email'},{attribute:'Searchable',from:'N',to:'Y'}],
  sourceProof:{sourceCommit:'120b9a232f7b617d03faf68ad2d8e63a0afb0442',image:'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52',jar:'sha256:8c4d4e13a61a7d2486e45631fc81d542a3ee8cc02689ae460b45ba9d7d768432',applicationClasses:635,sourceFiles:560},
  hostPlatform:'darwin/arm64',runtimePlatform:'linux/arm64',activationClaim:false,retentionClaim:false,normativeDateClaim:false,supportingSourceCredit:false,releaseCredit:false};
}
export const complexAdmissionDigest=()=>digest(complexAdmissionContract());
function imageProjection(images){return Object.fromEntries(Object.entries(images).filter(([name])=>name!=='elasticsearch').map(([name,image])=>[name,{image:image.id,os:'linux',architecture:image.architecture}]));}
function validateImages(images,platform){keys(images,Object.keys(ccdImagePins(platform)));for(const image of Object.values(images)){keys(image,['image','os','architecture']);assert(hash.test(image.image),fail);assert.equal(image.os,'linux',fail);assert.equal(image.architecture,platform.split('/')[1],fail);}}
export function captureComplexNativeBinding(context,output,ccdImages,sourceConfiguration=null){
 const captured=context.nativeCohortCapture;assert(captured?.binding&&captured.reference,fail);validateImages(ccdImages,captured.binding.runtime.platform);
 const binding={schemaVersion:1,kind:'complex-email-native-binding',policy:COMPLEX_ADMISSION_POLICY,contractDigest:complexAdmissionDigest(),nativeBindingDigest:captured.reference.digest,ccdImages:structuredClone(ccdImages),sourceConfiguration:structuredClone(sourceConfiguration)};
 writeJsonAtomic(path.join(output,COMPLEX_NATIVE_PATH),binding);return{binding,reference:{path:COMPLEX_NATIVE_PATH,digest:complexPin(output,COMPLEX_NATIVE_PATH)}};
}
export function verifyComplexNativeCapture(directory,captured){keys(captured,['binding','reference']);assert.deepEqual(captured.reference,{path:COMPLEX_NATIVE_PATH,digest:complexPin(directory,COMPLEX_NATIVE_PATH)},fail);assert.deepEqual(complexJson(directory,COMPLEX_NATIVE_PATH),captured.binding,fail);return structuredClone(captured.reference);}
export function readComplexNativeBinding(directory,expected,native){
 const reference=expected.complexEmailNativeBinding;if(reference===undefined)return undefined;
 keys(reference,['path','digest']);assert.equal(reference.path,COMPLEX_NATIVE_PATH,fail);assert.equal(complexPin(directory,reference.path),reference.digest,fail);
 const binding=complexJson(directory,reference.path);keys(binding,['schemaVersion','kind','policy','contractDigest','nativeBindingDigest','ccdImages','sourceConfiguration']);assert.equal(binding.schemaVersion,1,fail);assert.equal(binding.kind,'complex-email-native-binding',fail);assert.equal(binding.policy,COMPLEX_ADMISSION_POLICY,fail);assert.equal(binding.contractDigest,complexAdmissionDigest(),fail);
 assert(native&&expected.nativeCohortBinding,fail);assert.equal(binding.nativeBindingDigest,expected.nativeCohortBinding.digest,fail);validateImages(binding.ccdImages,native.runtime.platform);
 for(const phase of standardPhases){const input=complexJson(directory,'private/'+phase+'/input.json');assert.equal(input.ccd.localCcdProfile,undefined,fail);assert.equal(input.ccd.elasticsearch??false,false,fail);assert.deepEqual(imageProjection(input.ccd.images),binding.ccdImages,fail);const pin=expected.phases.find(row=>row.phase===phase).expected;for(const [service,dependency]of [['data','ccd'],['definition','ccd-definition']])assert.equal(pin.identity.dependencyIdentities[dependency].artifactDigest,binding.ccdImages[service].image,fail);}
 return binding;
}
export function validateComplexAdmissionContext(context){
 if(Object.hasOwn(context.expected,'mandatoryEmailNativeBinding')){const ref=context.expected.mandatoryEmailNativeBinding;keys(ref,['path','digest']);assert.equal(ref.path,'private/mandatory-email-native-binding.json',fail);assert(/^sha256:[a-f0-9]{64}$/.test(ref.digest),fail);}
 keys(context,['native','capture','expected']);keys(context.capture,['binding','reference']);const {binding}=context.capture;
 assert.deepEqual(context.capture.reference,{path:COMPLEX_NATIVE_PATH,digest:digestBytes(JSON.stringify(binding,null,2)+'\n')},fail);
 keys(binding,['schemaVersion','kind','policy','contractDigest','nativeBindingDigest','ccdImages','sourceConfiguration']);assert.equal(binding.schemaVersion,1,fail);assert.equal(binding.kind,'complex-email-native-binding',fail);assert.equal(binding.policy,COMPLEX_ADMISSION_POLICY,fail);assert.equal(binding.contractDigest,complexAdmissionDigest(),fail);
 assert.deepEqual(context.expected.complexEmailNativeBinding,context.capture.reference,fail);assert.equal(binding.nativeBindingDigest,context.expected.nativeCohortBinding.digest,fail);
 assert.equal(context.native.producer.commit,context.expected.harnessCommit,fail);assert.equal(context.native.candidate.identity.artifactDigest,context.expected.candidateArtifactDigest,fail);
 keys(context.native.producer.files,NATIVE_HARNESS_SOURCE_FILES);for(const name of NATIVE_HARNESS_SOURCE_FILES)assert.equal(context.native.producer.files[name],complexPin(root,name),fail);assert.equal(context.native.producer.sourceDigest,nativeInventoryDigest(context.native.producer.files),fail);
 const {catalogue,snapshot}=loadCommittedConfigurationCatalogue(),source=snapshot.sources.find(row=>row.repository==='rpx-xui-webapp'&&row.path==='config/default.json');
 assert.deepEqual(context.native.sourceDefault,{path:'config/default.json',revision:source.revision,digest:'sha256:'+source.fileDigest},fail);
 assert.deepEqual(context.native.catalogue,{obligationsDigest:digest(catalogue.obligations),projectionDigest:complexPin(root,'scripts/fixtures/exui-configuration-source.json'),reviewDigest:complexPin(root,'scripts/fixtures/exui-configuration-review.json'),size:112},fail);
 assert.deepEqual(context.expected.phases.map(row=>row.phase),['family','scope','ccd','eventCapability','routing','recipientCallback','selectorEventRow'],fail);validateImages(binding.ccdImages,context.native.runtime.platform);return context;
}
// Configured input errors are fatal even on an unsupported host. No flag enables execution.
export function prepareComplexAdmissionInputs(file,platform={host:process.platform,arch:process.arch}){
 if(file===undefined)return{attempt:absent('SOURCE_INPUTS_NOT_CONFIGURED')};
 assert(typeof file==='string'&&path.isAbsolute(file)&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile(),fail);assert(fs.statSync(file).size<16*1024,fail);
 const bytes=fs.readFileSync(file),inputs=JSON.parse(bytes);const source=prepareComplexSourceInputs(inputs);
 const paths=Object.values(inputs);assert.equal(new Set(paths).size,paths.length,fail);
 for(const [i,a]of paths.entries())for(const b of paths.slice(i+1))assert(!a.startsWith(b+path.sep)&&!b.startsWith(a+path.sep),fail);
 const prepared={descriptor:{path:file,digest:digestBytes(bytes)},inputs:structuredClone(inputs),source};
 // This is the interpreter from the actual qualified 635-class source run.
 // A specified different binary is invalid, even when the host cannot execute it.
 assert.equal(source.prepared.python.digest,COMPLEX_QUALIFIED_PYTHON_DIGEST,fail);
 if(platform.host!=='darwin'||platform.arch!=='arm64'||(platform.runtime!==undefined&&platform.runtime!=='linux/arm64'))return{...prepared,attempt:absent('SOURCE_PROOF_PLATFORM_UNSUPPORTED')};
 return prepared;
}
export function recheckComplexAdmissionInputs(prepared){
 assert(prepared?.descriptor,fail);assert.equal(complexPin(path.dirname(prepared.descriptor.path),path.basename(prepared.descriptor.path)),prepared.descriptor.digest,fail);
 assert.deepEqual(prepareComplexSourceInputs(prepared.inputs),prepared.source,fail);return prepared.inputs;
}
export function replayComplexSource(expected){
 const {sourceProof,sourcePreparation,producer,commonImages}=expected;
 const python=sourcePreparation.prepared.python;assert.equal(digestBytes(fs.readFileSync(python.path)),python.digest,fail);assert.equal(python.digest,COMPLEX_QUALIFIED_PYTHON_DIGEST,fail);
 const input=JSON.stringify({schemaVersion:1,sourceProof,sourcePreparation,definitionImage:commonImages.definition.id,producerRoot:root,producerFiles:producer.files});
 const result=spawnSync(python.path,[path.join(root,'scripts/replay-complex-email-application-source.py'),'--expected-digest',digestBytes(input)],{input,encoding:'utf8',maxBuffer:64*1024,timeout:5*60_000,env:{HOME:os.homedir(),PATH:path.dirname(python.path)+':/usr/bin:/bin',TMPDIR:fs.realpathSync(os.tmpdir()),PYTHONDONTWRITEBYTECODE:'1'}});
 assert(!result.error&&result.status===0&&result.signal===null,'COMPLEX_SOURCE_REPLAY_FAILED');const value=JSON.parse(result.stdout);
 assert.deepEqual(value,{kind:'complex-email-source-replay',status:'PASS',applicationClasses:635,sourceFiles:560,compiledInputs:772,imageIndexDigest:commonImages.definition.id,sourceCommit:complexAdmissionContract().sourceProof.sourceCommit,...COMPLEX_FLAGS},fail);return value;
}
function withoutRequests(expected){const copy=structuredClone(expected);delete copy.divorceProfileRequest;delete copy.personalServiceRequest;delete copy.complexEmailRequest;delete copy.stCicProfileRequest;delete copy.mandatoryEmailRequest;return copy;}
export function complexCohortCompatibility(context,expected){
 validateComplexAdmissionContext(context);const {native,capture}=context,separate=reason=>({policy:COMPLEX_ADMISSION_POLICY,status:'separate',reason});
 if(native.producer.commit!==expected.producer.commit)return separate('different-producer');
 assert.deepEqual(Object.fromEntries(NATIVE_HARNESS_SOURCE_FILES.map(name=>[name,Object.fromEntries(expected.producer.files)[name]])),native.producer.files,fail);
 if(native.candidate.identity.artifactDigest!==expected.candidate.identity.artifactDigest)return separate('different-candidate');assert.deepEqual(divorceCandidateContent(expected.candidate),native.candidate,fail);
 const common=expected.commonBrowser;if(!isDeepStrictEqual(common.nativeRuntime,native.runtime))return separate('different-runtime');
 if(!isDeepStrictEqual(native.browser,{image:common.browserRuntimeImage,digest:common.browserDigest}))return separate('different-browser');
 if(!isDeepStrictEqual(native.dependencies,{digest:common.harnessDependencies.digest,playwrightVersion:common.harnessDependencies.playwrightVersion}))return separate('different-dependencies');
 if(!isDeepStrictEqual(capture.binding.ccdImages,imageProjection(expected.commonImages)))return separate('different-ccd-dependencies');
 for(const variant of ['browser-baseline','browser-email-type'])for(const phase of standardPhases){const input=expected.contexts[variant].prepared.input,pin=context.expected.phases.find(row=>row.phase===phase).expected;for(const [service,dependency]of [['data','ccd'],['definition','ccd-definition']])assert.deepEqual(pin.identity.dependencyIdentities[dependency],{artifactDigest:expected.commonImages[service].id,apiContractDigest:input.apiContracts[service]},fail);}
 return{policy:COMPLEX_ADMISSION_POLICY,status:'included'};
}
export async function readComplexAdmissionPacket(requestPath,requestPin){
 const {COMPLEX_COHORT_SOURCES}=await import('../run-harness-complex-email-cohort.mjs');
 assert(typeof requestPath==='string'&&path.isAbsolute(requestPath),fail);keys(requestPin,['runId','digest']);assert(hash.test(requestPin.digest),fail);
 const directory=path.dirname(requestPath);assert.equal(complexPin(directory,path.basename(requestPath)),requestPin.digest,fail);const request=complexJson(directory,path.basename(requestPath));
 keys(request,['schemaVersion','kind','directory','expected','contractDigest','receiptDigest','timingDigest']);assert.equal(request.schemaVersion,1,fail);assert.equal(request.kind,'complex-email-admission-request',fail);assert.equal(request.directory,directory,fail);assert.equal(request.contractDigest,complexAdmissionDigest(),fail);
 const expected=request.expected;assert.equal(expected.runId,requestPin.runId,fail);assert(/^complex-[a-f0-9-]{36}$/.test(expected.runId),fail);
 // Raw evidence and full class bytes are checked before any compatibility classification.
 const raw=readComplexCohort(directory,expected,{inspect:inspectHostContainer,ownerEmpty:owner=>hostDocker(['ps','-aq','--filter','label=exui.harness.owner='+owner]).trim()===''});
 replayComplexSource(expected);assert.equal(complexPin(directory,'complex-cohort-result.json'),request.receiptDigest,fail);assert.deepEqual(complexJson(directory,'complex-cohort-result.json'),raw,fail);
 assert.equal(complexPin(directory,'parent-input.json'),expected.inputDigest,fail);const input=complexJson(directory,'parent-input.json');assert.deepEqual(input,{producer:expected.producer,candidate:expected.candidate,runId:expected.runId,admissionContext:expected.admissionContext,admissionContractDigest:complexAdmissionDigest(),...COMPLEX_FLAGS},fail);
 assert.deepEqual(expected.producer.files.map(([name])=>name),COMPLEX_COHORT_SOURCES,fail);for(const [name,pin]of expected.producer.files)assert.equal(complexPin(root,name),pin,fail);
 validateComplexAdmissionContext(expected.admissionContext);const sourceConfiguration=expected.admissionContext.capture.binding.sourceConfiguration;assert(sourceConfiguration&&!sourceConfiguration.attempt,fail);recheckComplexAdmissionInputs(sourceConfiguration);assert.deepEqual(expected.sourcePreparation,sourceConfiguration.source,fail);assert.deepEqual(expected.sourceProof.prepared,sourceConfiguration.source.prepared,fail);assert.deepEqual(expected.sourceProof.tools,sourceConfiguration.source.tools,fail);assert.deepEqual(Object.keys(expected.contexts).sort(),[...COMPLEX_CONTEXTS].sort(),fail);
 for(const key of ['browser-baseline','browser-email-type']){
  const p=expected.contexts[key].prepared;assert.deepEqual(p.input.artifact,expected.candidate,fail);assert.deepEqual(p.input.ccd,p.state,fail);
  assert.equal(p.plan.candidate.image,expected.commonBrowser.nativeRuntime.imageId,fail);assert.equal(p.plan.tools.image,expected.commonBrowser.browserRuntimeImage,fail);
 }
 const nativeOwners=new Set(expected.admissionContext.expected.phases.map(row=>row.expected.runId));
 for(const context of Object.values(expected.contexts)){assert(!nativeOwners.has(context.prepared.state.owner),fail);if(context.prepared.input)assert(!nativeOwners.has(context.prepared.input.runId),fail);}
 assert.equal(complexPin(directory,'cohort-timing.json'),request.timingDigest,fail);const timing=complexJson(directory,'cohort-timing.json');keys(timing,['startedAt','endedAt','durationMs','telemetryOnly']);assert.equal(timing.telemetryOnly,true,fail);for(const key of ['startedAt','endedAt'])assert.equal(new Date(timing[key]).toISOString(),timing[key],fail);assert(Number.isSafeInteger(timing.durationMs)&&timing.durationMs>=0&&timing.durationMs<=24*60*60_000,fail);assert(Math.abs(Date.parse(timing.endedAt)-Date.parse(timing.startedAt)-timing.durationMs)<=1000,fail);
 const invocations=['baseline','email-type'].map(variant=>{const c=expected.contexts['browser-'+variant],workers=complexJson(c.directory,'baseline/report.json').config?.workers;assert(workers===undefined||Number.isSafeInteger(workers)&&workers>0,fail);return{invocationId:variant,runId:c.prepared.input.runId,configuredWorkers:workers??null};});
 const contract=complexAdmissionContract();return{expected,admission:{schemaVersion:1,kind:'complex-email-row-admission',status:'passed',obligationId:contract.obligationId,boundary:'candidate',family:'PRIVATELAW',selected:1,accepted:1,catalogueSize:112,runId:expected.runId,producerCommit:expected.producer.commit,candidateCommit:expected.candidate.provenance.webappCommit,candidateArtifactDigest:expected.candidate.identity.artifactDigest,sourceKey:contract.sourceKey,sourceRowDigest:contract.sourceRowDigest,facets:[...COMPLEX_PUBLIC_FACETS],browserContexts:2,mappingContexts:2,effectiveFaults:2,applicationClasses:635,hostPlatform:'darwin/arm64',runtimePlatform:'linux/arm64',contractDigest:request.contractDigest,inputDigest:expected.inputDigest,receiptDigest:request.receiptDigest,sourceComplete:true,activationClaim:false,retentionClaim:false,normativeDateClaim:false,releaseCredit:false,releaseApproval:false,timing,invocations}};
}
export function complexNativeJointAdmission(native,capsule,packet,expected){
 const separate=reason=>({policy:COMPLEX_ADMISSION_POLICY,status:'separate',reason});if(!native||!capsule||!expected.complexEmailRequest)return separate('missing-native-binding');
 const held=packet.expected,context=held.admissionContext;
 if(native.producer.commit!==held.producer.commit)return separate('different-producer');if(native.candidate.identity.artifactDigest!==held.candidate.identity.artifactDigest)return separate('different-candidate');
 assert.deepEqual(context.expected,withoutRequests(expected),fail);assert.deepEqual(context.native,native,fail);assert.deepEqual(context.capture,{binding:capsule,reference:expected.complexEmailNativeBinding},fail);
 const result=complexCohortCompatibility(context,held);return result.status==='included'?{...result,obligationId:COMPLEX_EMAIL_OBLIGATION,nativeRunId:expected.jobRunId,complexRunId:held.runId,nativeBindingDigest:expected.complexEmailNativeBinding.digest,requestDigest:expected.complexEmailRequest.digest,contractDigest:packet.admission.contractDigest}:result;
}

// All paths are fixed previously validated phase/request artifacts, never a
// recursive directory scan or a receipt-selected ownership inventory.
export function assertComplexOwnership(directory,mainExpected,packet,{personalRequestPath,profileOwners=[]}={}){
 const previous=new Set(profileOwners),add=value=>{if(typeof value==='string'&&value.length)previous.add(value.replace(/^\//,''));};
 for(const {phase,expected}of mainExpected.phases){
  add(expected.runId);const input=complexJson(directory,'private/'+phase+'/input.json');if(input.ccd){add(input.ccd.owner);add(input.ccd.namespace);for(const id of Object.values(input.ccd.containers??{}))add(id);}
  for(const row of complexJson(directory,'private/'+phase+'/owned-resources.json'))for(const key of ['id','name','owner','namespace'])add(row[key]);
 }
 if(personalRequestPath){
  const base=path.dirname(personalRequestPath);assert.equal(complexPin(base,path.basename(personalRequestPath)),mainExpected.personalServiceRequest.digest,fail);const request=complexJson(base,path.basename(personalRequestPath));
  for(const variant of ['baseline','optional']){const held=request.expected.invocations[variant],file=variant+'-expected.json';assert.equal(complexPin(base,file),held.bindingDigest,fail);const {binding}=complexJson(base,file);add(binding.runId);add(binding.ccd.owner);add(binding.ccd.namespace);for(const id of Object.values(binding.ccd.containers))add(id);for(const service of Object.keys(binding.ccd.containers))add(binding.ccd.owner+'-'+service);for(const resource of [binding.plan.candidate,binding.plan.tools])add(resource.name);}
 }
 const newIds=new Set(),newNames=new Set(),newOwners=new Set();
 for(const c of Object.values(packet.expected.contexts)){
  for(const owner of [c.prepared.state.owner,c.prepared.input?.runId].filter(Boolean)){assert(!previous.has(owner)&&!newOwners.has(owner),fail);newOwners.add(owner);}
  for(const id of c.closed.ids){assert(!previous.has(id)&&!newIds.has(id),fail);newIds.add(id);}
  for(const name of c.closed.names){assert(!previous.has(name)&&!newNames.has(name),fail);newNames.add(name);}
  assert(!previous.has(c.prepared.state.namespace),fail);
 }
 return true;
}
