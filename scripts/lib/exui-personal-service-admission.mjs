import assert from 'node:assert/strict';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
import {derivePersonalServiceFixture,PERSONAL_SERVICE_ID,PERSONAL_SERVICE_ATTRIBUTES,PERSONAL_SERVICE_FAILURE} from './exui-personal-service-contract.mjs';
import {PERSONAL_ROOT,personalFile,personalJson,personalDigest,readPersonalCohort} from './exui-personal-service-invocation-binding.mjs';
import {loadCommittedConfigurationCatalogue} from './exui-configuration-runtime-coverage.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './exui-native-sources.mjs';
import {divorceCandidateContent,nativeInventoryDigest} from './exui-divorce-native-binding.mjs';
import {ccdImagePins} from './exui-ccd-runtime.mjs';
const fail='PERSONAL_SERVICE_ADMISSION_INVALID';
const hash=/^sha256:[a-f0-9]{64}$/;
const keys=(value,names)=>assert.deepEqual(Object.keys(value??{}).sort(),names.slice().sort(),fail);
export const PERSONAL_NATIVE_PATH='private/personal-service-native-binding.json';
export const PERSONAL_ADMISSION_POLICY='personal-service-exact-row-v1';
const standardPhases=['ccd','eventCapability','recipientCallback','selectorEventRow'];
export function personalAdmissionContract(){
 const {binding}=derivePersonalServiceFixture();
 const {catalogue}=loadCommittedConfigurationCatalogue(),sourceKey='prl-ccd-definitions:'+binding.sourcePath;
 assert.equal(catalogue.obligations.length,112,fail);
 assert.deepEqual(catalogue.obligations.filter(row=>row.id===PERSONAL_SERVICE_ID),[{id:PERSONAL_SERVICE_ID,family:'PRIVATELAW',kind:'definition-shape',requiredBoundary:'candidate',sourceKeys:[sourceKey]}],fail);
 const features=catalogue.features.filter(row=>row.id===PERSONAL_SERVICE_ID);assert.equal(features.length,1,fail);assert.equal(features[0].sourceKey,sourceKey,fail);assert.equal('sha256:'+features[0].rowDigest,binding.sourceRowDigest,fail);
 const facets={CaseTypeID:'PRLAPPS-to-HarnessNestedPRL-only',CaseEventID:'unchanged-serviceOfDocuments',CaseFieldID:'descriptor-form-validation-submission-state-history',DisplayContext:'mandatory-empty-blocks-optional-empty-healthy-cya',PageID:'2-to-serviceOfDocuments2-navigation-change',PageDisplayOrder:'order-2-after-healthy-predecessor-1',PageFieldDisplayOrder:'order-2-before-visible-selector-7',ShowSummaryChangeOption:'Y-filled-No-cya-change-return-and-persistence',LiveFrom:'typed-import-retention-only'};
 assert.deepEqual(Object.keys(facets).sort(),PERSONAL_SERVICE_ATTRIBUTES,fail);
 return {policy:PERSONAL_ADMISSION_POLICY,obligationId:PERSONAL_SERVICE_ID,boundary:'candidate',family:'PRIVATELAW',catalogueSize:112,sourceKey,sourceRevision:binding.sourceRevision,sourceFileDigest:binding.sourceFileDigest,sourceRowDigest:binding.sourceRowDigest,sourceIndex:binding.sourceIndex,sourceSnapshotDigest:binding.sourceSnapshotDigest,supportingSources:binding.supportingSources,facets,mutation:{attribute:'DisplayContext',from:'MANDATORY',to:'OPTIONAL',failure:PERSONAL_SERVICE_FAILURE},activationClaim:false,supportingSourceCredit:false,releaseCredit:false};
}
export const personalAdmissionDigest=()=>personalDigest(personalAdmissionContract());
function ccdProjection(images){return Object.fromEntries(Object.entries(images).map(([name,image])=>[name,{image:image.id,os:'linux',architecture:image.architecture}]));}
function validateCcdProjection(images,platform){
 keys(images,Object.keys(ccdImagePins(platform)));
 for(const image of Object.values(images)){keys(image,['image','os','architecture']);assert(hash.test(image.image),fail);assert.equal(image.os,'linux',fail);assert.equal(image.architecture,platform.split('/')[1],fail);}
}
// Parent preflight already verified candidate, native/browser images and standard CCD images.
export function capturePersonalNativeBinding(context,output,ccdImages){
 const captured=context.nativeCohortCapture;assert(captured?.binding&&captured.reference,fail);
 validateCcdProjection(ccdImages,captured.binding.runtime.platform);
 const binding={schemaVersion:1,kind:'personal-service-native-binding',policy:PERSONAL_ADMISSION_POLICY,contractDigest:personalAdmissionDigest(),nativeBindingDigest:captured.reference.digest,ccdImages:structuredClone(ccdImages)};
 writeJsonAtomic(path.join(output,PERSONAL_NATIVE_PATH),binding);
 return {binding,reference:{path:PERSONAL_NATIVE_PATH,digest:personalFile(output,PERSONAL_NATIVE_PATH).digest}};
}
export function verifyPersonalNativeCapture(directory,captured){
 keys(captured,['binding','reference']);assert.deepEqual(captured.reference,{path:PERSONAL_NATIVE_PATH,digest:personalFile(directory,PERSONAL_NATIVE_PATH).digest},fail);assert.deepEqual(personalJson(directory,PERSONAL_NATIVE_PATH),captured.binding,fail);return structuredClone(captured.reference);
}
export function readPersonalNativeBinding(directory,expected,native){
 const reference=expected.personalServiceNativeBinding;if(reference===undefined)return undefined;
 keys(reference,['path','digest']);assert.equal(reference.path,PERSONAL_NATIVE_PATH,fail);assert.equal(personalFile(directory,reference.path).digest,reference.digest,fail);
 const binding=personalJson(directory,reference.path);keys(binding,['schemaVersion','kind','policy','contractDigest','nativeBindingDigest','ccdImages']);assert.equal(binding.schemaVersion,1,fail);assert.equal(binding.kind,'personal-service-native-binding',fail);assert.equal(binding.policy,PERSONAL_ADMISSION_POLICY,fail);assert.equal(binding.contractDigest,personalAdmissionDigest(),fail);
 assert(native&&expected.nativeCohortBinding,fail);assert.equal(binding.nativeBindingDigest,expected.nativeCohortBinding.digest,fail);validateCcdProjection(binding.ccdImages,native.runtime.platform);
 for(const phase of standardPhases){const input=personalJson(directory,'private/'+phase+'/input.json');assert.equal(input.ccd.localCcdProfile,undefined,fail);assert.equal(input.ccd.elasticsearch??false,false,fail);assert.deepEqual(ccdProjection(input.ccd.images),binding.ccdImages,fail);const pin=expected.phases.find(row=>row.phase===phase).expected;for(const [service,dependency]of [['data','ccd'],['definition','ccd-definition']])assert.equal(pin.identity.dependencyIdentities[dependency].artifactDigest,binding.ccdImages[service].image,fail);}
 return binding;
}
// This fixed context is held by the canonical caller and bound into the pair before resources start.
export function validatePersonalAdmissionContext(context){
 keys(context,['native','capture','expected']);keys(context.capture,['binding','reference']);
 assert.deepEqual(context.capture.reference,{path:PERSONAL_NATIVE_PATH,digest:digestBytes(JSON.stringify(context.capture.binding,null,2)+'\n')},fail);
 keys(context.capture.binding,['schemaVersion','kind','policy','contractDigest','nativeBindingDigest','ccdImages']);assert.equal(context.capture.binding.schemaVersion,1,fail);assert.equal(context.capture.binding.kind,'personal-service-native-binding',fail);
 assert.equal(context.capture.binding.policy,PERSONAL_ADMISSION_POLICY,fail);assert.equal(context.capture.binding.contractDigest,personalAdmissionDigest(),fail);
 assert.deepEqual(context.expected.personalServiceNativeBinding,context.capture.reference,fail);assert.equal(context.capture.binding.nativeBindingDigest,context.expected.nativeCohortBinding.digest,fail);
 assert.equal(context.native.producer.commit,context.expected.harnessCommit,fail);assert.equal(context.native.candidate.identity.artifactDigest,context.expected.candidateArtifactDigest,fail);
 keys(context.native.producer.files,NATIVE_HARNESS_SOURCE_FILES);
 for(const name of NATIVE_HARNESS_SOURCE_FILES)assert.equal(context.native.producer.files[name],personalFile(PERSONAL_ROOT,name).digest,fail);
 assert.equal(context.native.producer.sourceDigest,nativeInventoryDigest(context.native.producer.files),fail);
 const {catalogue,snapshot}=loadCommittedConfigurationCatalogue();const source=snapshot.sources.find(row=>row.repository==='rpx-xui-webapp'&&row.path==='config/default.json');
 assert.deepEqual(context.native.sourceDefault,{path:'config/default.json',revision:source.revision,digest:'sha256:'+source.fileDigest},fail);
 assert.deepEqual(context.native.catalogue,{obligationsDigest:personalDigest(catalogue.obligations),projectionDigest:personalFile(PERSONAL_ROOT,'scripts/fixtures/exui-configuration-source.json').digest,reviewDigest:personalFile(PERSONAL_ROOT,'scripts/fixtures/exui-configuration-review.json').digest,size:112},fail);
 assert.deepEqual(context.expected.phases.map(row=>row.phase),['family','scope','ccd','eventCapability','routing','recipientCallback','selectorEventRow'],fail);validateCcdProjection(context.capture.binding.ccdImages,context.native.runtime.platform);
 return context;
}
export function personalCohortCompatibility(context,cohort){
 validatePersonalAdmissionContext(context);const {native,capture}=context;
 const separate=reason=>({policy:PERSONAL_ADMISSION_POLICY,status:'separate',reason});
 if(native.producer.commit!==cohort.producer.commit)return separate('different-producer');
 const files=Object.fromEntries(cohort.producer.files),projection=Object.fromEntries(NATIVE_HARNESS_SOURCE_FILES.map(name=>[name,files[name]]));assert.deepEqual(projection,native.producer.files,fail);
 if(native.candidate.identity.artifactDigest!==cohort.artifact.identity.artifactDigest)return separate('different-candidate');
 assert.deepEqual(divorceCandidateContent(cohort.artifact),native.candidate,fail);
 if(!isDeepStrictEqual(native.runtime,cohort.nativeRuntime))return separate('different-runtime');
 if(!isDeepStrictEqual(native.browser,{image:cohort.browser.image,digest:cohort.browser.digest}))return separate('different-browser');
 if(!isDeepStrictEqual(native.dependencies,{digest:cohort.dependencies.digest,playwrightVersion:cohort.dependencies.playwrightVersion}))return separate('different-dependencies');
 if(!isDeepStrictEqual(capture.binding.ccdImages,ccdProjection(cohort.ccdImages)))return separate('different-ccd-dependencies');
 return {policy:PERSONAL_ADMISSION_POLICY,status:'included'};
}
export function readPersonalAdmissionPacket(requestPath,requestPin){
 assert(typeof requestPath==='string'&&path.isAbsolute(requestPath),fail);
 const directory=path.dirname(requestPath),request=personalJson(directory,path.basename(requestPath));
 keys(requestPin,['runId','digest']);assert(hash.test(requestPin.digest),fail);assert.equal(personalFile(directory,path.basename(requestPath)).digest,requestPin.digest,fail);
 keys(request,['schemaVersion','kind','directory','expected','contractDigest','receiptDigest','timingDigest']);assert.equal(request.schemaVersion,1,fail);assert.equal(request.kind,'personal-service-admission-request',fail);assert.equal(request.directory,directory,fail);assert.equal(request.expected.runId,requestPin.runId,fail);assert.equal(request.contractDigest,personalAdmissionDigest(),fail);
 // Validate raw evidence even if the eventual main-cohort comparison will be separate.
 const raw=readPersonalCohort(directory,request.expected),cohort=personalJson(directory,'parent-input.json');
 assert.equal(personalFile(directory,'personal-service-cohort.json').digest,request.receiptDigest,fail);assert.deepEqual(personalJson(directory,'personal-service-cohort.json'),raw,fail);
 assert(/^personal-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(cohort.runId),fail);assert(/^[a-f0-9]{40}$/.test(cohort.producer.commit),fail);
 for(const [name,digest]of cohort.producer.files)assert.equal(personalFile(PERSONAL_ROOT,name).digest,digest,fail);
 assert.equal(cohort.admissionContractDigest,personalAdmissionDigest(),fail);validatePersonalAdmissionContext(cohort.admissionContext);
 const owners=new Set(cohort.admissionContext.expected.phases.map(row=>row.expected.runId));
 const invocations=[];const invocationIds=Object.keys(request.expected.invocations).sort();assert.deepEqual(invocationIds,['baseline','optional'],fail);
 for(const variant of invocationIds){const held=request.expected.invocations[variant];const bindingFile=personalFile(directory,variant+'-expected.json');assert.equal(bindingFile.digest,held.bindingDigest,fail);const {binding}=JSON.parse(bindingFile.bytes);const completionFile=personalFile(directory,variant+'-completion.json');assert.equal(completionFile.digest,held.completionDigest,fail);const completion=JSON.parse(completionFile.bytes),report=personalFile(binding.directory,'baseline/report.json');assert.equal(report.digest,completion.files['baseline/report.json'],fail);const workers=JSON.parse(report.bytes).config?.workers;assert(workers===undefined||Number.isSafeInteger(workers)&&workers>0,'PERSONAL_SERVICE_CONFIGURED_WORKERS');invocations.push({invocationId:variant,runId:binding.runId,configuredWorkers:workers??null});assert(!owners.has(binding.runId)&&!owners.has(binding.ccd.owner),fail);for(const phase of standardPhases){const pin=cohort.admissionContext.expected.phases.find(row=>row.phase===phase).expected;for(const [service,dependency]of [['data','ccd'],['definition','ccd-definition']])assert.deepEqual(pin.identity.dependencyIdentities[dependency],{artifactDigest:cohort.ccdImages[service].id,apiContractDigest:binding.apiContracts[service]},fail);}}
 assert.equal(personalFile(directory,'cohort-timing.json').digest,request.timingDigest,fail);const timing=personalJson(directory,'cohort-timing.json');keys(timing,['startedAt','endedAt','durationMs','telemetryOnly']);assert.equal(timing.telemetryOnly,true,fail);for(const key of ['startedAt','endedAt'])assert.equal(new Date(timing[key]).toISOString(),timing[key],fail);assert(Number.isSafeInteger(timing.durationMs)&&timing.durationMs>=0&&timing.durationMs<=24*60*60*1000,fail);assert(Math.abs(Date.parse(timing.endedAt)-Date.parse(timing.startedAt)-timing.durationMs)<=1000,fail);
 const contract=personalAdmissionContract();
 return {cohort,admission:{schemaVersion:1,kind:'personal-service-row-admission',status:'passed',obligationId:PERSONAL_SERVICE_ID,boundary:'candidate',family:'PRIVATELAW',selected:1,accepted:1,catalogueSize:112,baselineProofs:1,effectiveFaults:1,runId:cohort.runId,producerCommit:cohort.producer.commit,producerDigest:cohort.producer.digest,candidateArtifactDigest:cohort.artifact.identity.artifactDigest,candidateCommit:cohort.artifact.provenance.webappCommit,inputDigest:request.expected.inputDigest,bindingDigest:request.expected.bindingDigest,receiptDigest:request.receiptDigest,contractDigest:request.contractDigest,sourceKey:contract.sourceKey,sourceRowDigest:contract.sourceRowDigest,facets:contract.facets,sourceComplete:true,activationClaim:false,supportingSourceCredit:false,releaseCredit:false,releaseApproval:false,timing,invocations}};
}
export function personalNativeJointAdmission(native,personalNative,packet,expected){
 const separate=reason=>({policy:PERSONAL_ADMISSION_POLICY,status:'separate',reason});
 if(!native||!personalNative||!expected.personalServiceRequest)return separate('missing-native-binding');
 const context=packet.cohort.admissionContext;
 if(native.producer.commit!==packet.cohort.producer.commit)return separate('different-producer');
 if(native.candidate.identity.artifactDigest!==packet.cohort.artifact.identity.artifactDigest)return separate('different-candidate');
 // Held main context cannot be replaced even by mutually consistent child records.
 assert.deepEqual(context.expected,expectedWithoutRequests(expected),fail);assert.deepEqual(context.native,native,fail);assert.deepEqual(context.capture,{binding:personalNative,reference:expected.personalServiceNativeBinding},fail);
 const compatibility=personalCohortCompatibility(context,packet.cohort);if(compatibility.status!=='included')return compatibility;
 return {...compatibility,obligationId:PERSONAL_SERVICE_ID,nativeRunId:expected.jobRunId,personalRunId:packet.admission.runId,nativeBindingDigest:expected.personalServiceNativeBinding.digest,requestDigest:expected.personalServiceRequest.digest,inputDigest:packet.admission.inputDigest,contractDigest:packet.admission.contractDigest};
}
export function expectedWithoutRequests(expected){const copy=structuredClone(expected);delete copy.divorceProfileRequest;delete copy.personalServiceRequest;delete copy.complexEmailRequest;return copy;}
