import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NATIVE_HARNESS_SOURCE_FILES} from './exui-native-sources.mjs';
import {DIVORCE_NATIVE_BINDING_PATH,DIVORCE_NATIVE_POLICY,nativeInventoryDigest,divorceCandidateContent} from './exui-divorce-native-binding.mjs';
import {divorceProfileContractDigest} from './exui-divorce-profile-contract.mjs';
import {digestBytes} from './exui-evidence-io.mjs';
import {readStCicCohort,ST_CIC_COHORT_FILES} from './exui-st-cic-profile-cohort.mjs';
import {ST_CIC_PROFILE_ID,ST_CIC_PROFILE_FACETS,stCicProfileContractDigest} from './exui-st-cic-profile-contract.mjs';
import {loadCommittedConfigurationCatalogue} from './exui-configuration-runtime-coverage.mjs';
const fail='ST_CIC_ADMISSION_INVALID',hash=/^sha256:[a-f0-9]{64}$/;
const keys=(value,names)=>assert.deepEqual(Object.keys(value??{}).sort(),names.slice().sort(),fail);
export function readStCicAdmissionFile(file){
 assert(typeof file==='string'&&path.isAbsolute(file)&&path.normalize(file)===file&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile(),fail);
 const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),digest:digestBytes(bytes)};
}
export const ST_CIC_NATIVE_PATH='private/st-cic-native-binding.json';
export const ST_CIC_ADMISSION_POLICY='st-cic-profile-joint-v1';
const sourceRoot=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const contextFailure='ST_CIC_ADMISSION_CONTEXT_INVALID';
const phaseNames=['family','scope','ccd','eventCapability','routing','recipientCallback','selectorEventRow'];
const serialized=value=>JSON.stringify(value,null,2)+'\n';
export function validateNativeContextBinding(native){
 keys(native,['schemaVersion','kind','policy','producer','candidate','runtime','browser','dependencies','sourceDefault','catalogue','profileContractDigest']);
 assert.equal(native.schemaVersion,1,contextFailure);assert.equal(native.kind,'divorce-native-candidate-binding',contextFailure);assert.equal(native.policy,DIVORCE_NATIVE_POLICY,contextFailure);
 // This is the common native capsule's original contract, not ST_CIC authority.
 assert.equal(native.profileContractDigest,divorceProfileContractDigest(),contextFailure);
 keys(native.producer,['commit','files','sourceDigest']);keys(native.producer.files,NATIVE_HARNESS_SOURCE_FILES);assert(/^[a-f0-9]{40}$/.test(native.producer.commit),contextFailure);
 for(const name of NATIVE_HARNESS_SOURCE_FILES)assert.equal(native.producer.files[name],readStCicAdmissionFileBytes(path.join(sourceRoot,name)).digest,contextFailure);
 assert.equal(native.producer.sourceDigest,nativeInventoryDigest(native.producer.files),contextFailure);
 keys(native.candidate,['identity','payloadDigest','provenance']);assert(hash.test(native.candidate.identity.artifactDigest)&&hash.test(native.candidate.payloadDigest),contextFailure);
 keys(native.runtime,['reference','imageId','platform']);assert(typeof native.runtime.reference==='string'&&native.runtime.reference.length>0&&hash.test(native.runtime.imageId),contextFailure);assert(['linux/arm64','linux/amd64'].includes(native.runtime.platform),contextFailure);assert.equal(native.runtime.platform,native.candidate.provenance.platform,contextFailure);
 keys(native.browser,['image','digest']);keys(native.dependencies,['digest','playwrightVersion']);for(const value of [native.browser.image,native.browser.digest,native.dependencies.digest])assert(hash.test(value),contextFailure);assert.equal(native.dependencies.playwrightVersion,'1.65.0',contextFailure);
 const {catalogue,snapshot}=loadCommittedConfigurationCatalogue(),source=snapshot.sources.find(row=>row.repository==='rpx-xui-webapp'&&row.path==='config/default.json');
 assert.deepEqual(native.sourceDefault,{path:'config/default.json',revision:source.revision,digest:'sha256:'+source.fileDigest},contextFailure);
 assert.deepEqual(native.catalogue,{obligationsDigest:digestBytes(JSON.stringify(catalogue.obligations)),projectionDigest:readStCicAdmissionFileBytes(path.join(sourceRoot,'scripts/fixtures/exui-configuration-source.json')).digest,reviewDigest:readStCicAdmissionFileBytes(path.join(sourceRoot,'scripts/fixtures/exui-configuration-review.json')).digest,size:112},contextFailure);
}
function readStCicAdmissionFileBytes(file){assert(path.isAbsolute(file)&&path.normalize(file)===file&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile(),contextFailure);const bytes=fs.readFileSync(file);return {bytes,digest:digestBytes(bytes)};}
function validateNativeReference(reference){keys(reference,['path','digest']);assert.equal(reference.path,DIVORCE_NATIVE_BINDING_PATH,contextFailure);assert(hash.test(reference.digest),contextFailure);}
function validateStCicCapsule(binding,nativeDigest){keys(binding,['schemaVersion','kind','policy','contractDigest','nativeBindingDigest']);assert.deepEqual(binding,{schemaVersion:1,kind:'st-cic-native-binding',policy:ST_CIC_ADMISSION_POLICY,contractDigest:stCicProfileContractDigest(),nativeBindingDigest:nativeDigest},contextFailure);assert(hash.test(nativeDigest),contextFailure);}
export function captureStCicNativeBinding(context,output){
 const captured=context.nativeCohortCapture;keys(captured,['binding','reference']);validateNativeContextBinding(captured.binding);validateNativeReference(captured.reference);assert.equal(captured.reference.digest,digestBytes(serialized(captured.binding)),contextFailure);
 const binding={schemaVersion:1,kind:'st-cic-native-binding',policy:ST_CIC_ADMISSION_POLICY,contractDigest:stCicProfileContractDigest(),nativeBindingDigest:captured.reference.digest};
 const file=path.join(output,ST_CIC_NATIVE_PATH);assert(path.isAbsolute(output)&&fs.realpathSync(output)===output&&path.normalize(output)===output&&fs.realpathSync(path.dirname(file))===path.dirname(file),contextFailure);
 fs.writeFileSync(file,serialized(binding),{flag:'wx',mode:0o444});return {binding,reference:{path:ST_CIC_NATIVE_PATH,digest:readStCicAdmissionFile(file).digest}};
}
export function verifyStCicNativeCapture(directory,captured){
 keys(captured,['binding','reference']);keys(captured.reference,['path','digest']);assert.equal(captured.reference.path,ST_CIC_NATIVE_PATH,contextFailure);validateStCicCapsule(captured.binding,captured.binding.nativeBindingDigest);
 const actual=readStCicAdmissionFile(path.join(directory,ST_CIC_NATIVE_PATH));assert.equal(actual.digest,captured.reference.digest,contextFailure);assert.deepEqual(actual.value,captured.binding,contextFailure);return structuredClone(captured.reference);
}
export function readStCicNativeBinding(directory,expected,native){
 if(expected.stCicNativeBinding===undefined)return undefined;
 keys(expected.stCicNativeBinding,['path','digest']);assert.equal(expected.stCicNativeBinding.path,ST_CIC_NATIVE_PATH,contextFailure);assert(hash.test(expected.stCicNativeBinding.digest),contextFailure);validateNativeReference(expected.nativeCohortBinding);validateNativeContextBinding(native);assert.equal(digestBytes(serialized(native)),expected.nativeCohortBinding.digest,contextFailure);assert.equal(native.producer.commit,expected.harnessCommit,contextFailure);assert.equal(native.candidate.identity.artifactDigest,expected.candidateArtifactDigest,contextFailure);
 const actual=readStCicAdmissionFile(path.join(directory,ST_CIC_NATIVE_PATH));assert.equal(actual.digest,expected.stCicNativeBinding.digest,contextFailure);validateStCicCapsule(actual.value,expected.nativeCohortBinding.digest);return actual.value;
}
export function stCicExpectedWithoutRequests(expected){const copy=structuredClone(expected);for(const name of ['divorceProfileRequest','personalServiceRequest','complexEmailRequest','stCicProfileRequest','mandatoryEmailRequest'])delete copy[name];return copy;}
export function validateStCicAdmissionContext(context){
 try{
 keys(context,['native','capture','expected']);const copy=structuredClone(context),{native,capture}=copy;copy.expected=stCicExpectedWithoutRequests(copy.expected);const expected=copy.expected;
 const required=['jobRunId','harnessCommit','candidateArtifactDigest','ciResultDigest','phases','nativeCohortBinding','stCicNativeBinding'],optional=['personalServiceNativeBinding','complexEmailNativeBinding','mandatoryEmailNativeBinding'];keys(expected,[...required,...optional.filter(name=>Object.hasOwn(expected,name))]);
 validateNativeContextBinding(native);validateNativeReference(expected.nativeCohortBinding);assert.equal(digestBytes(serialized(native)),expected.nativeCohortBinding.digest,contextFailure);
 keys(capture,['binding','reference']);keys(capture.reference,['path','digest']);validateStCicCapsule(capture.binding,expected.nativeCohortBinding.digest);assert.deepEqual(capture.reference,{path:ST_CIC_NATIVE_PATH,digest:digestBytes(serialized(capture.binding))},contextFailure);assert.deepEqual(expected.stCicNativeBinding,capture.reference,contextFailure);
 assert(/^ci-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(expected.jobRunId),contextFailure);assert(hash.test(expected.ciResultDigest),contextFailure);assert.equal(expected.harnessCommit,native.producer.commit,contextFailure);assert.equal(expected.candidateArtifactDigest,native.candidate.identity.artifactDigest,contextFailure);
 assert.deepEqual(expected.phases.map(row=>row.phase),phaseNames,contextFailure);
 for(const row of expected.phases){keys(row,['phase','expected','policy','terminal']);for(const [name,value]of Object.entries({harnessCommit:native.producer.commit,harnessSourceDigest:native.producer.sourceDigest,harnessDependencyDigest:native.dependencies.digest,browserDigest:native.browser.digest}))assert.equal(row.expected[name],value,contextFailure);}
 for(const name of optional)if(Object.hasOwn(expected,name)){keys(expected[name],['path','digest']);assert.equal(expected[name].path,name==='personalServiceNativeBinding'?'private/personal-service-native-binding.json':name==='complexEmailNativeBinding'?'private/complex-email-native-binding.json':'private/mandatory-email-native-binding.json',contextFailure);assert(hash.test(expected[name].digest),contextFailure);}
 return copy;
 }catch{throw new Error(contextFailure);}
}
export function verifyStCicAdmissionContextBinding(context,binding){
 const snapshot=validateStCicAdmissionContext(context),native=snapshot.native;
 assert.equal(native.producer.commit,binding.producer.commit,contextFailure);assert.deepEqual(native.producer.files,binding.producer.files,contextFailure);assert.equal(binding.producer.digest,digestBytes(JSON.stringify(binding.producer.files)),contextFailure);
 assert.deepEqual(native.candidate,divorceCandidateContent(binding.artifact),contextFailure);assert.deepEqual(native.runtime,binding.runtime,contextFailure);assert.deepEqual(native.browser,{image:binding.browser.image,digest:binding.browser.digest},contextFailure);assert.deepEqual(native.dependencies,binding.browser.dependencies,contextFailure);
 const nativeOwners=new Set(snapshot.expected.phases.map(row=>row.expected.runId));for(const owner of Object.values(binding.owners))assert(!nativeOwners.has(owner),contextFailure);return snapshot;
}
export function readStCicAdmissionContext(directory,expected,binding){
 const file=path.join(directory,'native-admission-context.json');
 if(expected.admissionContextDigest===undefined){assert(!fs.existsSync(file),contextFailure);return undefined;}
 assert(hash.test(expected.admissionContextDigest),contextFailure);const actual=readStCicAdmissionFile(file);assert.equal(actual.digest,expected.admissionContextDigest,contextFailure);keys(actual.value,['schemaVersion','kind','runId','inputDigest','context']);assert.equal(actual.value.schemaVersion,1,contextFailure);assert.equal(actual.value.kind,'st-cic-parent-context',contextFailure);assert.equal(actual.value.runId,expected.runId,contextFailure);assert.equal(actual.value.inputDigest,expected.inputDigest,contextFailure);
 const snapshot=verifyStCicAdmissionContextBinding(actual.value.context,binding);assert.deepEqual(snapshot,actual.value.context,contextFailure);return snapshot;
}
export function stCicAdmissionPins(directory){
 const input=readStCicAdmissionFile(path.join(directory,'expected-input.json')),binding=input.value.binding;
 const launch=readStCicAdmissionFile(path.join(directory,'independent-controller-launch.json')).value;
 const context=launch.admissionContextDigest===undefined?{}:{admissionContextDigest:launch.admissionContextDigest};
 readStCicAdmissionContext(directory,{...context,runId:input.value.runId,inputDigest:input.digest},binding);
 return {...context,runId:input.value.runId,inputDigest:input.digest,bindingDigest:digestBytes(JSON.stringify(binding)),producerCommit:binding.producer.commit,producerDigest:binding.producer.digest,candidateArtifactDigest:binding.artifact.identity.artifactDigest,receiptDigest:readStCicAdmissionFile(path.join(directory,'cohort/st-cic-profile-cohort.json')).digest,terminalDigest:readStCicAdmissionFile(path.join(directory,'independent-controller-terminal.json')).digest,cleanupDigest:readStCicAdmissionFile(path.join(directory,'independent-controller-cleanup.json')).digest,launchDigest:readStCicAdmissionFile(path.join(directory,'independent-controller-launch.json')).digest};
}
// The caller supplies independently retained pins. No receipt boolean supplies authority.
export function admitStCicProfile(directory,expected){
 assert(fs.realpathSync(directory)===directory&&fs.lstatSync(directory).isDirectory(),fail);
 keys(expected,['runId','inputDigest','bindingDigest','producerCommit','producerDigest','candidateArtifactDigest','receiptDigest','terminalDigest','launchDigest','cleanupDigest',...(Object.hasOwn(expected,'admissionContextDigest')?['admissionContextDigest']:[])]);
 assert(/^st-cic-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(expected.runId)&&/^[a-f0-9]{40}$/.test(expected.producerCommit),fail);
 for(const name of ['inputDigest','bindingDigest','producerDigest','candidateArtifactDigest','receiptDigest','terminalDigest','launchDigest','cleanupDigest'])assert(hash.test(expected[name]),fail);
 assert.deepEqual(stCicAdmissionPins(directory),expected,fail);
 const input=readStCicAdmissionFile(path.join(directory,'expected-input.json')).value,binding=input.binding;
 keys(binding.producer,['commit','files','digest']);keys(binding.producer.files,ST_CIC_COHORT_FILES);assert.equal(digestBytes(JSON.stringify(binding.producer.files)),binding.producer.digest,fail);
 keys(input,['schemaVersion','runId','binding']);assert.equal(input.schemaVersion,1,fail);
 const terminal=readStCicAdmissionFile(path.join(directory,'independent-controller-terminal.json')).value;
 assert.deepEqual(terminal,{schemaVersion:1,runId:expected.runId,inputDigest:expected.inputDigest,started:true,observed:true,forced:false,cancelled:false,code:0,signal:null},fail);
 const launch=readStCicAdmissionFile(path.join(directory,'independent-controller-launch.json')).value;
 keys(launch,['schemaVersion','runId','inputDigest','producer','command',...(Object.hasOwn(expected,'admissionContextDigest')?['admissionContextDigest']:[])]);
 assert.equal(launch.admissionContextDigest,expected.admissionContextDigest,fail);readStCicAdmissionContext(directory,expected,binding);
assert.equal(launch.schemaVersion,1,fail);assert.equal(launch.runId,expected.runId,fail);assert.equal(launch.inputDigest,expected.inputDigest,fail);assert.deepEqual(launch.producer,binding.producer,fail);
 keys(launch.command,['executable','cwd','script','args','environmentKeys']);
 assert(path.isAbsolute(launch.command.executable)&&path.basename(launch.command.executable)==='node',fail);
 assert(path.isAbsolute(launch.command.cwd)&&path.normalize(launch.command.cwd)===launch.command.cwd,fail);
 assert.equal(launch.command.script,path.join(launch.command.cwd,'scripts/run-harness-st-cic-profile.mjs'),fail);
 assert.deepEqual(launch.command.environmentKeys,['HOME','PATH','TMPDIR'],fail);
 const args=launch.command.args;assert(Array.isArray(args)&&args.length===8,fail);
 assert.deepEqual(args.filter((_,index)=>index%2===0),['--artifact','--browser-root','--output','--expected-input'],fail);
 assert(path.isAbsolute(args[1]),fail);assert.equal(args[3],binding.browser.root,fail);assert.equal(args[5],path.join(directory,'cohort'),fail);assert.equal(args[7],path.join(directory,'expected-input.json'),fail);
 const cleanup=readStCicAdmissionFile(path.join(directory,'independent-controller-cleanup.json')).value;
 assert.deepEqual(cleanup,{schemaVersion:1,runId:expected.runId,inputDigest:expected.inputDigest,observedAfterController:true,containers:ST_CIC_PROFILE_FACETS.flatMap(({facet,fault})=>{const rows=readStCicAdmissionFile(path.join(directory,'cohort',facet,'owned-resources.json')).value;return ['baseline',fault].flatMap(id=>['candidate','tools'].map(role=>{const name=`${binding.owners[facet]}-${id}-${role}`,row=rows.find(r=>r.name===name);assert(row,fail);return {name,id:row.id,owner:row.owner,absent:true};}));})},fail);
 const receipt=readStCicAdmissionFile(path.join(directory,'cohort/st-cic-profile-cohort.json')).value;
 const actual=readStCicCohort(path.join(directory,'cohort'),binding);assert.deepEqual(receipt,actual,fail);
 assert.equal(actual.bindingDigest,expected.bindingDigest,fail);assert.equal(actual.obligationId,ST_CIC_PROFILE_ID,fail);assert.equal(actual.contractDigest,stCicProfileContractDigest(),fail);
 const {catalogue}=loadCommittedConfigurationCatalogue();assert.equal(catalogue.obligations.length,112,fail);
 const row=catalogue.obligations.filter(item=>item.id===ST_CIC_PROFILE_ID);assert.equal(row.length,1,fail);assert.equal(row[0].kind,'configuration-profile',fail);assert.equal(row[0].family,'ST_CIC',fail);assert.equal(row[0].requiredBoundary,'candidate',fail);
 return {schemaVersion:1,kind:'st-cic-profile-admission',status:'passed',obligationId:ST_CIC_PROFILE_ID,boundary:'candidate',family:'ST_CIC',baselineProofs:5,effectiveFaults:5,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,selected:1,accepted:1,catalogueSize:112,runId:expected.runId,producerCommit:expected.producerCommit,producerDigest:expected.producerDigest,candidateArtifactDigest:expected.candidateArtifactDigest,candidateCommit:binding.artifact.provenance.webappCommit,inputDigest:expected.inputDigest,bindingDigest:expected.bindingDigest,receiptDigest:expected.receiptDigest,terminalDigest:expected.terminalDigest,launchDigest:expected.launchDigest,cleanupDigest:expected.cleanupDigest,contractDigest:actual.contractDigest,releaseCredit:false,releaseApproval:false};
}
export function readStCicProfileAdmissionPacket(descriptorPath,requestPin){
 const {value,digest}=readStCicAdmissionFile(descriptorPath);
 assert(requestPin!==undefined,fail);{keys(requestPin,['runId','digest']);assert.equal(digest,requestPin.digest,fail);assert.equal(value.expected.runId,requestPin.runId,fail);}
 keys(value,['schemaVersion','kind','directory','expected']);assert.equal(value.schemaVersion,1,fail);assert.equal(value.kind,'st-cic-profile-admission-request',fail);
 const result=admitStCicProfile(value.directory,value.expected);
 const binding=readStCicAdmissionFile(path.join(value.directory,'expected-input.json')).value.binding,admissionContext=readStCicAdmissionContext(value.directory,value.expected,binding);
 return {admission:result,binding,...(admissionContext?{admissionContext}:{})};
}
export function readStCicProfileAdmission(descriptorPath,requestPin){return readStCicProfileAdmissionPacket(descriptorPath,requestPin).admission;}
