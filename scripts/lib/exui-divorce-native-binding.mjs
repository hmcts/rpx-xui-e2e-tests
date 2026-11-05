import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './exui-native-sources.mjs';
import {loadCommittedConfigurationCatalogue} from './exui-configuration-runtime-coverage.mjs';
import {divorceProfileContractDigest} from './exui-divorce-profile-contract.mjs';
import {nativeInvocations} from './exui-native-contract.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const code='DIVORCE_NATIVE_BINDING_INVALID';
export const DIVORCE_NATIVE_BINDING_PATH='private/native-cohort-binding.json';
export const DIVORCE_NATIVE_POLICY='divorce-native-candidate-joint-v1';
const keys=(value,names)=>assert.deepEqual(Object.keys(value??{}).sort(),names.slice().sort(),code);
const hash=/^sha256:[a-f0-9]{64}$/;
const bytes=file=>{assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,code);return fs.readFileSync(file);};
const read=file=>JSON.parse(bytes(file));
export const divorceCandidateContent=artifact=>({identity:artifact.identity,payloadDigest:artifact.payloadDigest,provenance:artifact.provenance});
export const nativeInventoryDigest=files=>digestBytes(JSON.stringify(NATIVE_HARNESS_SOURCE_FILES.map(name=>[name,files[name]])));
function sourceContract(){
 const projection=bytes(path.join(root,'scripts/fixtures/exui-configuration-source.json')),review=bytes(path.join(root,'scripts/fixtures/exui-configuration-review.json'));
 const source=JSON.parse(projection).sources.find(item=>item.repository==='rpx-xui-webapp'&&item.path==='config/default.json');
 const {catalogue}=loadCommittedConfigurationCatalogue();assert.equal(catalogue.obligations.length,112,code);
 return {sourceDefault:{path:'config/default.json',revision:source.revision,digest:'sha256:'+source.fileDigest},catalogue:{obligationsDigest:digestBytes(JSON.stringify(catalogue.obligations)),projectionDigest:digestBytes(projection),reviewDigest:digestBytes(review),size:112},profileContractDigest:divorceProfileContractDigest()};
}
// Called only after the trusted native preflight verifies the clean producer and immutable assets.
export function captureDivorceNativeBinding(context,output){
 const files=Object.fromEntries(NATIVE_HARNESS_SOURCE_FILES.map(name=>[name,digestBytes(bytes(path.join(root,name)))]));
 const binding={schemaVersion:1,kind:'divorce-native-candidate-binding',policy:DIVORCE_NATIVE_POLICY,producer:{commit:context.commit,files,sourceDigest:nativeInventoryDigest(files)},candidate:divorceCandidateContent(context.artifact),runtime:context.nativeRuntime,browser:{image:context.browserRuntimeImage,digest:context.browserDigest},dependencies:{digest:context.dependencies.digest,playwrightVersion:context.dependencies.playwrightVersion},...sourceContract()};
 assert.equal(digestBytes(bytes(path.join(context.artifact.candidateRoot,'config/default.json'))),binding.sourceDefault.digest,code);
 for(const digest of Object.values(context.sourceDigests))assert.equal(digest,binding.producer.sourceDigest,code);
 const file=path.join(output,DIVORCE_NATIVE_BINDING_PATH);writeJsonAtomic(file,binding);
 return {binding:structuredClone(binding),reference:{path:DIVORCE_NATIVE_BINDING_PATH,digest:digestBytes(bytes(file))}};
}
export function verifyDivorceNativeCapture(output,captured){
 keys(captured,['binding','reference']);assert.deepEqual(captured.reference,{path:DIVORCE_NATIVE_BINDING_PATH,digest:digestBytes(bytes(path.join(output,DIVORCE_NATIVE_BINDING_PATH)))},code);
 assert.deepEqual(read(path.join(output,DIVORCE_NATIVE_BINDING_PATH)),captured.binding,code);return structuredClone(captured.reference);
}
// Replay checks the parent pin first, then ties every native phase's assets to that preflight.
export function readDivorceNativeBinding(directory,expected){
 const reference=expected.nativeCohortBinding;if(reference===undefined)return undefined;
 keys(reference,['path','digest']);assert.equal(reference.path,DIVORCE_NATIVE_BINDING_PATH,code);assert(hash.test(reference.digest),code);
 const raw=bytes(path.join(directory,reference.path));assert.equal(digestBytes(raw),reference.digest,code);const binding=JSON.parse(raw);
 keys(binding,['schemaVersion','kind','policy','producer','candidate','runtime','browser','dependencies','sourceDefault','catalogue','profileContractDigest']);
 assert.equal(binding.schemaVersion,1,code);assert.equal(binding.kind,'divorce-native-candidate-binding',code);assert.equal(binding.policy,DIVORCE_NATIVE_POLICY,code);
 keys(binding.producer,['commit','files','sourceDigest']);keys(binding.producer.files,NATIVE_HARNESS_SOURCE_FILES);for(const value of Object.values(binding.producer.files))assert(hash.test(value),code);
 assert.equal(binding.producer.sourceDigest,nativeInventoryDigest(binding.producer.files),code);assert.equal(binding.producer.commit,expected.harnessCommit,code);
 assert.equal(binding.producer.files['scripts/fixtures/exui-configuration-source.json'],binding.catalogue.projectionDigest,code);assert.equal(binding.producer.files['scripts/fixtures/exui-configuration-review.json'],binding.catalogue.reviewDigest,code);
 assert.deepEqual({sourceDefault:binding.sourceDefault,catalogue:binding.catalogue,profileContractDigest:binding.profileContractDigest},sourceContract(),code);
 keys(binding.candidate,['identity','payloadDigest','provenance']);assert.equal(binding.candidate.identity.artifactDigest,expected.candidateArtifactDigest,code);assert(hash.test(binding.candidate.payloadDigest),code);
 keys(binding.runtime,['reference','imageId','platform']);assert(hash.test(binding.runtime.imageId)&&typeof binding.runtime.reference==='string'&&binding.runtime.reference.length>0,code);assert(['linux/arm64','linux/amd64'].includes(binding.runtime.platform),code);assert.equal(binding.runtime.platform,binding.candidate.provenance.platform,code);
 keys(binding.browser,['image','digest']);assert(hash.test(binding.browser.image)&&hash.test(binding.browser.digest),code);keys(binding.dependencies,['digest','playwrightVersion']);assert(hash.test(binding.dependencies.digest)&&/^\d+\.\d+\.\d+$/.test(binding.dependencies.playwrightVersion),code);
 for(const {phase,expected:pin} of expected.phases){
  assert.equal(pin.harnessCommit,binding.producer.commit,code);assert.equal(pin.harnessSourceDigest,binding.producer.sourceDigest,code);assert.equal(pin.harnessDependencyDigest,binding.dependencies.digest,code);assert.equal(pin.browserDigest,binding.browser.digest,code);
  const folder=path.join(directory,'private',phase),input=read(path.join(folder,'input.json'));
  assert.deepEqual(divorceCandidateContent(input.artifact),binding.candidate,code);assert.deepEqual(input.nativeRuntime,binding.runtime,code);assert.equal(input.browserRuntimeImage,binding.browser.image,code);
  assert.deepEqual(input.harnessSources,NATIVE_HARNESS_SOURCE_FILES,code);assert.equal(input.harnessSourceDigest,binding.producer.sourceDigest,code);
  const resources=read(path.join(folder,'owned-resources.json'));assert(resources.length>0,code);
  for(const resource of resources){assert(['candidate','browser-provider'].includes(resource.service),code);assert.equal(resource.image,resource.service==='candidate'?binding.runtime.imageId:binding.browser.image,code);}
  for(const {invocationId} of nativeInvocations(pin.releaseScopeId)){
   const lifecycle=read(path.join(folder,invocationId,'candidate-lifecycle.json'));
   for(const state of [lifecycle.before,lifecycle.after])assert.equal(state.Image,binding.runtime.imageId,code);
  }
 }
 return binding;
}
