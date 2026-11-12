#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {verifyCandidateArtifact} from './lib/exui-candidate-artifact.mjs';
import {inspectNativeApiRuntime} from './lib/exui-native-containers.mjs';
import {nativeInventoryDigest} from './lib/exui-divorce-native-binding.mjs';
import {FR_PROFILE_FACETS,frProfileContract,frProfileContractDigest,assertFrProfileArtifact} from './lib/exui-fr-profile-contract.mjs';
import {admitFrProfile,frNativeProfileCompatibility} from './lib/exui-fr-profile-admission.mjs';
import {loadCommittedConfigurationCatalogue} from './lib/exui-configuration-runtime-coverage.mjs';
import {runSourceProfileFeasibility} from './run-harness-source-profile-jurisdictions.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const fail='FR_PROFILE_RUN_INVALID';
const read=file=>{assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,fail);return fs.readFileSync(file);};

// Runs three isolated source-profile slices against one immutable candidate, then binds their raw receipts to the held native cohort.
export async function runFrProfileAdmission({artifactPath,browserRoot=null,output,signal,nativeContext},{runFacet=runSourceProfileFeasibility,verifyArtifact=verifyCandidateArtifact,inspectRuntime=inspectNativeApiRuntime,beforeNextBatch}={}){
 assert([artifactPath,output].every(value=>typeof value==='string'&&path.isAbsolute(value)),fail);
 assert(browserRoot===null||typeof browserRoot==='string'&&path.isAbsolute(browserRoot),fail);
 assert(nativeContext?.binding&&nativeContext?.expected,fail);
 assert(beforeNextBatch===undefined||typeof beforeNextBatch==='function',fail);
 assert(!fs.existsSync(output),fail);assert.equal(fs.realpathSync(path.dirname(output)),path.dirname(output),fail);
 const artifact=await verifyArtifact(artifactPath);assertFrProfileArtifact(artifact);
 const binding=nativeContext.binding,expected=nativeContext.expected;
 assert.equal(binding.producer.commit,expected.harnessCommit,fail);
 assert.equal(binding.candidate.identity.artifactDigest,expected.candidateArtifactDigest,fail);
 const runtime=inspectRuntime(artifact.provenance.platform);
 assert(!signal?.aborted,fail);fs.mkdirSync(output,{mode:0o700});assert.equal(fs.realpathSync(output),output,fail);
 const facets=[],producers=[],runtimes=[];
 try{
  const runFacetAdmission=async({facet,fault})=>{
   assert(!signal?.aborted,fail);
   const directory=path.join(output,facet),signalTarget=new EventEmitter();signalTarget.stderr=process.stderr;signalTarget.exit=()=>{};
   const cancel=()=>signalTarget.emit('SIGTERM');signal?.addEventListener('abort',cancel,{once:true});
   let receipt;try{receipt=await runFacet({artifactPath,output:directory,facet,browserRoot:null,signal},{signalTarget});}finally{signal?.removeEventListener('abort',cancel);}
   if(receipt.status!=='feasibility-observed'){
    assert.equal(receipt.cleanup?.complete,true,fail);assert.equal(receipt.privateStateRemoved,true,fail);
    const code=receipt.failure?.code,error=new Error(/^(?:FR_PROFILE|SOURCE_PROFILE)_[A-Z0-9_]+$/.test(code??'')?code:fail);error.frProfileCleanupVerified=true;error.frProfileAttempt={schemaVersion:1,kind:'fr-profile-attempt',status:'BLOCKED',reason:error.message,...(receipt.failure?.diagnostic?{diagnostic:receipt.failure.diagnostic}:{})};if(receipt.failure?.diagnostic)error.frProfileDiagnostic=receipt.failure.diagnostic;throw error;
   }
   assert.equal(receipt.cleanup?.complete,true,fail);assert.equal(receipt.privateStateRemoved,true,fail);
   assert(/^[a-f0-9]{40}$/.test(receipt.harnessCommit),fail);assert.deepEqual(Object.keys(receipt.sources.files).sort(),Object.keys(binding.producer.files).sort(),fail);
   assert.deepEqual(receipt.runtime,runtime,fail);const producer={commit:receipt.harnessCommit,files:receipt.sources.files,sourceDigest:nativeInventoryDigest(receipt.sources.files)};
   const raw=read(path.join(directory,'profile-feasibility.json'));
   const baseline=receipt.invocations.find(row=>row.invocationId==='baseline'),effectiveFault=receipt.invocations.find(row=>row.invocationId===fault);
   assert(baseline&&effectiveFault,fail);
   return {facet:{facet,fault,receiptDigest:digestBytes(raw),baseline:{status:baseline.status,configDigest:receipt.configuration.baseline.digest,observationsDigest:baseline.observationsDigest,journalDigest:baseline.journalDigest},fault:{status:effectiveFault.status,configDigest:receipt.configuration[fault].digest,observationsDigest:effectiveFault.observationsDigest,journalDigest:effectiveFault.journalDigest}},producer,runtime:receipt.runtime};
  };
  const appendBatch=async selected=>{
   const batch=await Promise.allSettled(selected.map(runFacetAdmission));
   const failures=batch.filter(result=>result.status==='rejected');if(failures.length)throw failures.find(result=>result.reason?.frProfileCleanupVerified!==true)?.reason??failures[0].reason;
   for(const result of batch.map(item=>item.value)){facets.push(result.facet);producers.push(result.producer);runtimes.push(result.runtime);}
  };
  // One FR facet can share the Jenkins 8-CPU worker with the 4-CPU CMC proof; afterward two FR facets fill it.
  let offset=0;
  if(beforeNextBatch){await appendBatch(FR_PROFILE_FACETS.slice(0,1));offset=1;await beforeNextBatch();}
  for(;offset<FR_PROFILE_FACETS.length;offset+=2){
   await appendBatch(FR_PROFILE_FACETS.slice(offset,offset+2));
  }
  assert(producers.every(row=>JSON.stringify(row)===JSON.stringify(producers[0])),fail);assert(runtimes.every(row=>JSON.stringify(row)===JSON.stringify(runtimes[0])),fail);
  const contract=frProfileContract(),catalogue=loadCommittedConfigurationCatalogue().catalogue,profile={schemaVersion:1,kind:'fr-profile-cohort',status:'validated-for-admission',runId:'fr-'+randomUUID(),obligationId:contract.obligationId,family:'FR',contract,contractDigest:frProfileContractDigest(),candidate:{identity:artifact.identity,payloadDigest:artifact.payloadDigest,provenance:artifact.provenance},producer:producers[0],sourceDefault:{revision:contract.sourceRevision,digest:contract.sourceDigest},runtime:runtimes[0],facets,nativeBindingDigest:expected.nativeCohortBinding?.digest??digestBytes(JSON.stringify(binding)),catalogueDigest:digestBytes(JSON.stringify(catalogue.obligations)),cohortDigest:digestBytes(JSON.stringify(facets))};
  const admission=admitFrProfile(profile,nativeContext,catalogue);
  writeJsonAtomic(path.join(output,'fr-profile-cohort.json'),profile);writeJsonAtomic(path.join(output,'fr-profile-admission.json'),admission);
  const requestPath=path.join(output,'admission-request.json');writeJsonAtomic(requestPath,{schemaVersion:1,kind:'fr-profile-admission-request',directory:output,runId:profile.runId,cohortDigest:profile.cohortDigest,nativeBindingDigest:profile.nativeBindingDigest,profileDigest:digestBytes(read(path.join(output,'fr-profile-cohort.json'))),admissionDigest:digestBytes(read(path.join(output,'fr-profile-admission.json')))});
  return {...admission,reportRequest:{path:requestPath,digest:digestBytes(read(requestPath)),runId:profile.runId}};
 }catch(error){const code=error?.message?.startsWith('FR_PROFILE_')||error?.message?.startsWith('SOURCE_PROFILE_')?error.message:fail,failure=new Error(code);if(['FR_PROFILE_OBSERVATIONS','FR_PROFILE_MEMBERSHIP'].includes(code)&&error?.frProfileDiagnostic)failure.frProfileDiagnostic=error.frProfileDiagnostic;if(error?.frProfileCleanupVerified===true&&error.frProfileAttempt?.kind==='fr-profile-attempt'&&error.frProfileAttempt.reason===code){failure.frProfileCleanupVerified=true;failure.frProfileAttempt=error.frProfileAttempt;}throw failure;}
}

export function readFrProfileAdmissionPacket(requestPath,requestPin,nativeContext,catalogue=loadCommittedConfigurationCatalogue().catalogue){
 assert(typeof requestPath==='string'&&path.isAbsolute(requestPath)&&path.normalize(requestPath)===requestPath,fail);
 const requestBytes=read(requestPath),request=JSON.parse(requestBytes),directory=request.directory;
 assert.deepEqual(Object.keys(request).sort(),['admissionDigest','cohortDigest','directory','kind','nativeBindingDigest','profileDigest','runId','schemaVersion'].sort(),fail);
 assert.equal(request.schemaVersion,1,fail);assert.equal(request.kind,'fr-profile-admission-request',fail);
 if(requestPin){assert.deepEqual(Object.keys(requestPin).sort(),['digest','runId'],fail);assert.equal(digestBytes(requestBytes),requestPin.digest,fail);assert.equal(request.runId,requestPin.runId,fail);}
 assert(path.isAbsolute(directory)&&path.normalize(directory)===directory&&fs.realpathSync(directory)===directory,fail);
 const profileBytes=read(path.join(directory,'fr-profile-cohort.json')),admissionBytes=read(path.join(directory,'fr-profile-admission.json'));
 assert.equal(digestBytes(profileBytes),request.profileDigest,fail);assert.equal(digestBytes(admissionBytes),request.admissionDigest,fail);
 const profile=JSON.parse(profileBytes),stored=JSON.parse(admissionBytes);
 assert.equal(digestBytes(JSON.stringify(profile.facets)),profile.cohortDigest,fail);
 assert.equal(profile.runId,request.runId,fail);assert.equal(profile.cohortDigest,request.cohortDigest,fail);assert.equal(profile.nativeBindingDigest,request.nativeBindingDigest,fail);
 for(const row of profile.facets){
  const raw=read(path.join(directory,row.facet,'profile-feasibility.json'));assert.equal(digestBytes(raw),row.receiptDigest,fail);
  const receipt=JSON.parse(raw),definition=FR_PROFILE_FACETS.find(item=>item.facet===row.facet);
  assert(definition,fail);assert.equal(receipt.status,'feasibility-observed',fail);assert.equal(receipt.cleanup?.complete,true,fail);assert.equal(receipt.privateStateRemoved,true,fail);
  assert.deepEqual(receipt.artifact,profile.candidate.identity,fail);assert.equal(receipt.harnessCommit,profile.producer.commit,fail);
  assert.deepEqual(receipt.sources.files,profile.producer.files,fail);assert.equal(nativeInventoryDigest(receipt.sources.files),profile.producer.sourceDigest,fail);assert.deepEqual(receipt.runtime,profile.runtime,fail);
  const baseline=receipt.invocations.find(item=>item.invocationId==='baseline'),fault=receipt.invocations.find(item=>item.invocationId===definition.fault);
  for(const [actual,expected] of [[baseline,row.baseline],[fault,row.fault]]){
   assert(actual,fail);assert.equal(actual.status,expected.status,fail);assert.equal(actual.configDigest,expected.configDigest,fail);assert.equal(actual.observationsDigest,expected.observationsDigest,fail);assert.equal(actual.journalDigest,expected.journalDigest,fail);
  }
 }
 const admission=admitFrProfile(profile,nativeContext,catalogue);assert.deepEqual(stored,admission,fail);
 const joint=frNativeProfileCompatibility(nativeContext,profile);assert.equal(stored.accepted,joint.status==='included'?1:0,fail);assert.deepEqual(stored.joint,joint,fail);
 return {admission,joint,profile};
}
