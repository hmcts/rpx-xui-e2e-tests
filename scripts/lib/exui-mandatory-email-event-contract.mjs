import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes} from './exui-evidence-io.mjs';
import {deriveMandatoryEmailEventRows} from './exui-mandatory-email-event-rows.mjs';
import {loadCommittedConfigurationCatalogue} from './exui-configuration-runtime-coverage.mjs';
import {validateNativeContextBinding} from './exui-st-cic-profile-admission.mjs';
import {DIVORCE_NATIVE_BINDING_PATH,divorceCandidateContent} from './exui-divorce-native-binding.mjs';
import {ccdImagePins} from './exui-ccd-runtime.mjs';

export const MANDATORY_EMAIL_ADMISSION_POLICY='mandatory-email-two-source-rows-v1';
export const MANDATORY_EMAIL_NATIVE_PATH='private/mandatory-email-native-binding.json';
const failure='MANDATORY_EMAIL_ADMISSION_CONTEXT_INVALID';
const hash=/^sha256:[a-f0-9]{64}$/;
const keys=(value,names)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),failure);assert.deepEqual(Object.keys(value).sort(),names.slice().sort(),failure);};
export const mandatoryEmailSerialized=value=>JSON.stringify(value,null,2)+'\n';
export function mandatoryEmailAdmissionContract(){
 const {binding}=deriveMandatoryEmailEventRows('baseline'),{catalogue}=loadCommittedConfigurationCatalogue();
 const sourceKey='prl-ccd-definitions:'+binding.sourcePath;
 assert.equal(catalogue.obligations.length,112,failure);assert.equal(binding.rows.length,2,failure);
 for(const row of binding.rows){
  assert.deepEqual(catalogue.obligations.filter(item=>item.id===row.obligationId),[{id:row.obligationId,family:'PRIVATELAW',kind:'definition-shape',requiredBoundary:'candidate',sourceKeys:[sourceKey]}],failure);
  const features=catalogue.features.filter(item=>item.id===row.obligationId);assert.equal(features.length,1,failure);
  const feature=features[0];assert.equal(feature.sourceKey,sourceKey,failure);assert.equal('sha256:'+feature.rowDigest,row.sourceRowDigest,failure);assert.equal(feature.family,'PRIVATELAW',failure);assert.equal(feature.kind,'CaseEventToComplexTypes',failure);assert.equal(feature.caseType,binding.sourceCaseType,failure);assert.equal(feature.event,row.sourceRow.CaseEventID,failure);assert.equal(feature.field,row.sourceRow.CaseFieldID,failure);assert.equal(feature.element,row.sourceRow.ListElementCode,failure);assert.equal(feature.display,row.sourceRow.DisplayContext,failure);assert.equal(row.facets.length,10,failure);
 }
 return {schemaVersion:1,policy:MANDATORY_EMAIL_ADMISSION_POLICY,obligationIds:binding.rows.map(row=>row.obligationId),boundary:'candidate',family:'PRIVATELAW',catalogueSize:112,sourceKey,source:binding,releaseCredit:false,activationClaim:false};
}
export const mandatoryEmailAdmissionDigest=()=>digestBytes(JSON.stringify(mandatoryEmailAdmissionContract()));
export function mandatoryEmailReadFile(file){
 assert(typeof file==='string'&&path.isAbsolute(file)&&path.normalize(file)===file&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile(),failure);
 const bytes=fs.readFileSync(file);assert(bytes.length<=16*1024*1024,failure);return{bytes,value:JSON.parse(bytes),digest:digestBytes(bytes)};
}
function reference(value,wanted){keys(value,['path','digest']);assert.equal(value.path,wanted,failure);assert(hash.test(value.digest),failure);}
export function mandatoryEmailImageProjection(images){return Object.fromEntries(Object.entries(images).map(([service,image])=>[service,{image:image.id,os:'linux',architecture:image.architecture}]));}
function validateImages(images,platform){
 keys(images,Object.keys(ccdImagePins(platform)));
 for(const image of Object.values(images)){keys(image,['image','os','architecture']);assert(hash.test(image.image),failure);assert.equal(image.os,'linux',failure);assert.equal(image.architecture,platform.split('/')[1],failure);}
}
function validateCapsule(binding,nativeDigest,platform){
 keys(binding,['schemaVersion','kind','policy','contractDigest','obligationIds','nativeBindingDigest','ccdImages']);
 assert.deepEqual({...binding,ccdImages:undefined},{schemaVersion:1,kind:'mandatory-email-native-binding',policy:MANDATORY_EMAIL_ADMISSION_POLICY,contractDigest:mandatoryEmailAdmissionDigest(),obligationIds:mandatoryEmailAdmissionContract().obligationIds,nativeBindingDigest:nativeDigest,ccdImages:undefined},failure);
 assert(hash.test(nativeDigest),failure);validateImages(binding.ccdImages,platform);
}
export function captureMandatoryEmailNativeBinding(context,output,ccdImages){
 const captured=context.nativeCohortCapture;keys(captured,['binding','reference']);validateNativeContextBinding(captured.binding);reference(captured.reference,DIVORCE_NATIVE_BINDING_PATH);assert.equal(captured.reference.digest,digestBytes(mandatoryEmailSerialized(captured.binding)),failure);validateImages(ccdImages,captured.binding.runtime.platform);
 const binding={schemaVersion:1,kind:'mandatory-email-native-binding',policy:MANDATORY_EMAIL_ADMISSION_POLICY,contractDigest:mandatoryEmailAdmissionDigest(),obligationIds:mandatoryEmailAdmissionContract().obligationIds,nativeBindingDigest:captured.reference.digest,ccdImages:structuredClone(ccdImages)};
 const file=path.join(output,MANDATORY_EMAIL_NATIVE_PATH);assert(path.isAbsolute(output)&&fs.realpathSync(output)===output&&fs.realpathSync(path.dirname(file))===path.dirname(file),failure);
 fs.writeFileSync(file,mandatoryEmailSerialized(binding),{flag:'wx',mode:0o444});return{binding,reference:{path:MANDATORY_EMAIL_NATIVE_PATH,digest:mandatoryEmailReadFile(file).digest}};
}
export function verifyMandatoryEmailNativeCapture(directory,captured){
 keys(captured,['binding','reference']);reference(captured.reference,MANDATORY_EMAIL_NATIVE_PATH);const actual=mandatoryEmailReadFile(path.join(directory,MANDATORY_EMAIL_NATIVE_PATH));assert.equal(actual.digest,captured.reference.digest,failure);assert.deepEqual(actual.value,captured.binding,failure);return structuredClone(captured.reference);
}
export function readMandatoryEmailNativeBinding(directory,expected,native){
 if(!Object.hasOwn(expected,'mandatoryEmailNativeBinding'))return undefined;
 reference(expected.mandatoryEmailNativeBinding,MANDATORY_EMAIL_NATIVE_PATH);reference(expected.nativeCohortBinding,DIVORCE_NATIVE_BINDING_PATH);validateNativeContextBinding(native);assert.equal(digestBytes(mandatoryEmailSerialized(native)),expected.nativeCohortBinding.digest,failure);assert.equal(native.producer.commit,expected.harnessCommit,failure);assert.equal(native.candidate.identity.artifactDigest,expected.candidateArtifactDigest,failure);
 const actual=mandatoryEmailReadFile(path.join(directory,MANDATORY_EMAIL_NATIVE_PATH));assert.equal(actual.digest,expected.mandatoryEmailNativeBinding.digest,failure);validateCapsule(actual.value,expected.nativeCohortBinding.digest,native.runtime.platform);
 for(const phase of ['ccd','eventCapability','recipientCallback','selectorEventRow']){
  const input=mandatoryEmailReadFile(path.join(directory,'private',phase,'input.json')).value;
  assert.deepEqual(mandatoryEmailImageProjection(input.ccd.images),actual.value.ccdImages,failure);
  const selected=expected.phases.find(row=>row.phase===phase).expected;
  for(const [service,name]of [['data','ccd'],['definition','ccd-definition']])assert.equal(selected.identity.dependencyIdentities[name].artifactDigest,actual.value.ccdImages[service].image,failure);
 }
 return actual.value;
}
export function mandatoryEmailExpectedWithoutRequests(expected){const copy=structuredClone(expected);for(const key of ['divorceProfileRequest','personalServiceRequest','complexEmailRequest','stCicProfileRequest','mandatoryEmailRequest'])delete copy[key];return copy;}
export function validateMandatoryEmailAdmissionContext(value){
 try{
 keys(value,['native','capture','expected']);const context=structuredClone(value);context.expected=mandatoryEmailExpectedWithoutRequests(context.expected);const{native,capture,expected}=context;
 const optional={personalServiceNativeBinding:'private/personal-service-native-binding.json',complexEmailNativeBinding:'private/complex-email-native-binding.json',stCicNativeBinding:'private/st-cic-native-binding.json'};
 keys(expected,['jobRunId','harnessCommit','candidateArtifactDigest','ciResultDigest','phases','nativeCohortBinding','mandatoryEmailNativeBinding',...Object.keys(optional).filter(key=>Object.hasOwn(expected,key))]);
 validateNativeContextBinding(native);reference(expected.nativeCohortBinding,DIVORCE_NATIVE_BINDING_PATH);assert.equal(expected.nativeCohortBinding.digest,digestBytes(mandatoryEmailSerialized(native)),failure);
 keys(capture,['binding','reference']);reference(capture.reference,MANDATORY_EMAIL_NATIVE_PATH);validateCapsule(capture.binding,expected.nativeCohortBinding.digest,native.runtime.platform);assert.equal(capture.reference.digest,digestBytes(mandatoryEmailSerialized(capture.binding)),failure);assert.deepEqual(expected.mandatoryEmailNativeBinding,capture.reference,failure);
 assert(/^ci-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(expected.jobRunId),failure);assert(hash.test(expected.ciResultDigest),failure);assert.equal(expected.harnessCommit,native.producer.commit,failure);assert.equal(expected.candidateArtifactDigest,native.candidate.identity.artifactDigest,failure);
 assert.deepEqual(expected.phases.map(row=>row.phase),['family','scope','ccd','eventCapability','routing','recipientCallback','selectorEventRow'],failure);
 for(const row of expected.phases){keys(row,['phase','expected','policy','terminal']);for(const[key,wanted]of Object.entries({harnessCommit:native.producer.commit,harnessSourceDigest:native.producer.sourceDigest,harnessDependencyDigest:native.dependencies.digest,browserDigest:native.browser.digest}))assert.equal(row.expected[key],wanted,failure);}
 for(const[key,file]of Object.entries(optional))if(Object.hasOwn(expected,key))reference(expected[key],file);
 return context;
 }catch{throw Error(failure);}
}
export function verifyMandatoryEmailContextCohort(value,cohort){
 const context=validateMandatoryEmailAdmissionContext(value),{native,capture}=context;
 assert.equal(cohort.producer.commit,native.producer.commit,failure);assert.deepEqual(Object.fromEntries(cohort.producer.files),native.producer.files,failure);assert.equal(cohort.producer.digest,native.producer.sourceDigest,failure);
 assert.deepEqual(divorceCandidateContent(cohort.artifact),native.candidate,failure);assert.deepEqual(cohort.nativeRuntime,native.runtime,failure);assert.deepEqual({image:cohort.browser.image,digest:cohort.browser.digest},native.browser,failure);assert.deepEqual({digest:cohort.dependencies.digest,playwrightVersion:cohort.dependencies.playwrightVersion},native.dependencies,failure);assert.deepEqual(mandatoryEmailImageProjection(cohort.ccdImages),capture.binding.ccdImages,failure);
 return context;
}
// The immutable CI-result marker preserves preflight intent; it cannot grant credit.
export function assertMandatoryEmailIntent(ci,expected,descriptor,directory){
 const hasFile=Boolean(fs.lstatSync(path.join(directory,MANDATORY_EMAIL_NATIVE_PATH),{throwIfNoEntry:false}));
 const selected=hasFile||Object.hasOwn(ci,'mandatoryEmailNativeBinding')||Object.hasOwn(expected,'mandatoryEmailNativeBinding')||Object.hasOwn(expected,'mandatoryEmailRequest')||Object.hasOwn(descriptor,'mandatoryEmailAdmission');
 if(!selected)return false;
 for(const value of [ci.mandatoryEmailNativeBinding,expected.mandatoryEmailNativeBinding])reference(value,MANDATORY_EMAIL_NATIVE_PATH);
 assert.deepEqual(ci.mandatoryEmailNativeBinding,expected.mandatoryEmailNativeBinding,failure);keys(expected.mandatoryEmailRequest,['runId','digest']);assert(/^mandatory-admission-[a-f0-9-]{36}$/.test(expected.mandatoryEmailRequest.runId)&&hash.test(expected.mandatoryEmailRequest.digest),failure);assert(typeof descriptor.mandatoryEmailAdmission==='string'&&path.isAbsolute(descriptor.mandatoryEmailAdmission),failure);assert(hasFile,failure);return true;
}

export function readMandatoryEmailAdmissionInput(pin){
 keys(pin,['path','digest']);assert(hash.test(pin.digest)&&path.basename(pin.path)==='expected-input.json',failure);
 const file=mandatoryEmailReadFile(pin.path);assert.equal(file.digest,pin.digest,failure);const value=file.value;
 keys(value,['schemaVersion','kind','runId','context','candidateManifest','browserRoot']);assert.equal(value.schemaVersion,1,failure);assert.equal(value.kind,'mandatory-email-admission-input',failure);assert(/^mandatory-admission-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.runId),failure);assert([value.candidateManifest,value.browserRoot].every(p=>typeof p==='string'&&path.isAbsolute(p)&&path.normalize(p)===p),failure);
 const context=validateMandatoryEmailAdmissionContext(value.context);assert.deepEqual(context,value.context,failure);return{...value,context};
}
export function readMandatoryEmailRunContext(cohort){
 const supplied=Object.hasOwn(cohort,'admissionContext')||Object.hasOwn(cohort,'admissionInput');
 if(!supplied)return undefined;
 const context=verifyMandatoryEmailContextCohort(cohort.admissionContext,cohort),input=readMandatoryEmailAdmissionInput(cohort.admissionInput);
 assert.deepEqual(context,input.context,failure);assert.equal(input.candidateManifest,cohort.candidateManifest,failure);assert.equal(input.browserRoot,cohort.browser.root,failure);return context;
}
