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
import {CMC_PROFILE_FACET,cmcProfileContract,cmcProfileContractDigest,assertCmcProfileArtifact} from './lib/exui-cmc-profile-contract.mjs';
import {admitCmcProfile,cmcNativeProfileCompatibility} from './lib/exui-cmc-profile-admission.mjs';
import {loadCommittedConfigurationCatalogue} from './lib/exui-configuration-runtime-coverage.mjs';
import {runSourceProfileFeasibility} from './run-harness-source-profile-jurisdictions.mjs';
import {validateCmcProfileContrast} from './lib/exui-cmc-profile-consumer.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''),fail='CMC_PROFILE_RUN_INVALID';
const read=file=>{assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,fail);return fs.readFileSync(file);};

export async function runCmcProfileAdmission({artifactPath,output,signal,nativeContext},{runFacet=runSourceProfileFeasibility,verifyArtifact=verifyCandidateArtifact,inspectRuntime=inspectNativeApiRuntime}={}){
 assert([artifactPath,output].every(value=>typeof value==='string'&&path.isAbsolute(value)),fail);assert(nativeContext?.binding&&nativeContext?.expected,fail);assert(!fs.existsSync(output),fail);assert.equal(fs.realpathSync(path.dirname(output)),path.dirname(output),fail);
 const artifact=await verifyArtifact(artifactPath);assertCmcProfileArtifact(artifact);const binding=nativeContext.binding,expected=nativeContext.expected;
 assert.equal(binding.producer.commit,expected.harnessCommit,fail);assert.equal(binding.candidate.identity.artifactDigest,expected.candidateArtifactDigest,fail);
 const runtime=inspectRuntime(artifact.provenance.platform);assert(!signal?.aborted,fail);fs.mkdirSync(output,{mode:0o700});assert.equal(fs.realpathSync(output),output,fail);
 try{
  const {facet,fault}=CMC_PROFILE_FACET,directory=path.join(output,facet),signalTarget=new EventEmitter();signalTarget.stderr=process.stderr;signalTarget.exit=()=>{};
  const cancel=()=>signalTarget.emit('SIGTERM');signal?.addEventListener('abort',cancel,{once:true});let receipt;try{receipt=await runFacet({artifactPath,output:directory,facet,browserRoot:null,signal},{signalTarget});}finally{signal?.removeEventListener('abort',cancel);}
  if(receipt.status!=='feasibility-observed'){
   const code=receipt.failure?.code,error=new Error(/^(?:CMC_PROFILE|SOURCE_PROFILE)_[A-Z0-9_]+$/.test(code??'')?code:fail);
   if(receipt.cleanup?.complete===true&&receipt.privateStateRemoved===true){error.cmcProfileCleanupVerified=true;error.cmcProfileAttempt={schemaVersion:1,kind:'cmc-profile-attempt',status:'BLOCKED',reason:error.message,...(receipt.failure?.diagnostic?{consumerRevision:artifact.identity.webappCommit,diagnostic:receipt.failure.diagnostic}:{})};}
   throw error;
  }
  assert.equal(receipt.cleanup?.complete,true,fail);assert.equal(receipt.privateStateRemoved,true,fail);assert(/^[a-f0-9]{40}$/.test(receipt.harnessCommit),fail);assert.deepEqual(Object.keys(receipt.sources.files).sort(),Object.keys(binding.producer.files).sort(),fail);assert.deepEqual(receipt.runtime,runtime,fail);
  const producer={commit:receipt.harnessCommit,files:receipt.sources.files,sourceDigest:nativeInventoryDigest(receipt.sources.files)};assert.equal(JSON.stringify(producer),JSON.stringify({commit:binding.producer.commit,files:binding.producer.files,sourceDigest:binding.producer.sourceDigest}),fail);
  const raw=read(path.join(directory,'profile-feasibility.json')),baseline=receipt.invocations.find(row=>row.invocationId==='baseline'),effectiveFault=receipt.invocations.find(row=>row.invocationId===fault);assert(baseline&&effectiveFault,fail);verifyCmcProfileObservationDigests(directory,receipt);
  const contract=cmcProfileContract(),catalogue=loadCommittedConfigurationCatalogue().catalogue,facets=[{facet,fault,receiptDigest:digestBytes(raw),baseline:{status:baseline.status,configDigest:receipt.configuration.baseline.digest,observationsDigest:baseline.observationsDigest,journalDigest:baseline.journalDigest},faultEvidence:{status:effectiveFault.status,configDigest:receipt.configuration[fault].digest,observationsDigest:effectiveFault.observationsDigest,journalDigest:effectiveFault.journalDigest}}];
  const profile={schemaVersion:1,kind:'cmc-profile-cohort',status:'validated-for-admission',runId:'cmc-'+randomUUID(),obligationId:contract.obligationId,family:'CMC',contract,contractDigest:cmcProfileContractDigest(),candidate:{identity:artifact.identity,payloadDigest:artifact.payloadDigest,provenance:artifact.provenance},producer,sourceDefault:{revision:contract.sourceRevision,digest:contract.sourceDigest},runtime,facets,nativeBindingDigest:expected.nativeCohortBinding?.digest??digestBytes(JSON.stringify(binding)),catalogueDigest:digestBytes(JSON.stringify(catalogue.obligations)),cohortDigest:digestBytes(JSON.stringify(facets))};
  const admission=admitCmcProfile(profile,nativeContext,catalogue);writeJsonAtomic(path.join(output,'cmc-profile-cohort.json'),profile);writeJsonAtomic(path.join(output,'cmc-profile-admission.json'),admission);
  const requestPath=path.join(output,'admission-request.json');writeJsonAtomic(requestPath,{schemaVersion:1,kind:'cmc-profile-admission-request',directory:output,runId:profile.runId,cohortDigest:profile.cohortDigest,nativeBindingDigest:profile.nativeBindingDigest,profileDigest:digestBytes(read(path.join(output,'cmc-profile-cohort.json'))),admissionDigest:digestBytes(read(path.join(output,'cmc-profile-admission.json')))});
  return {...admission,reportRequest:{path:requestPath,digest:digestBytes(read(requestPath)),runId:profile.runId}};
 }catch(error){const failure=new Error(error?.message?.startsWith('CMC_PROFILE_')?error.message:fail);if(error?.cmcProfileCleanupVerified===true&&error.cmcProfileAttempt)Object.assign(failure,{cmcProfileCleanupVerified:true,cmcProfileAttempt:error.cmcProfileAttempt});throw failure;}
}

export function verifyCmcProfileObservationDigests(directory,receipt){
 const ids=['baseline',CMC_PROFILE_FACET.fault];assert.deepEqual(receipt.invocations.map(item=>item.invocationId),ids,fail);
 const observations=[];
 for(const id of ids){const invocation=receipt.invocations.find(item=>item.invocationId===id),folder=path.join(directory,id),file=path.join(folder,'cmc-profile-observations.json'),raw=read(file);assert.equal(digestBytes(raw),invocation.observationsDigest,fail);assert.equal(digestBytes(read(path.join(folder,'profile-jurisdiction-destinations.json'))),invocation.journalDigest,fail);observations.push(JSON.parse(raw).observations);}
 validateCmcProfileContrast(...observations);
}

export function readCmcProfileAdmissionPacket(requestPath,requestPin,nativeContext,catalogue=loadCommittedConfigurationCatalogue().catalogue){
 assert(typeof requestPath==='string'&&path.isAbsolute(requestPath)&&path.normalize(requestPath)===requestPath,fail);const requestBytes=read(requestPath),request=JSON.parse(requestBytes),directory=request.directory;
 assert.deepEqual(Object.keys(request).sort(),['admissionDigest','cohortDigest','directory','kind','nativeBindingDigest','profileDigest','runId','schemaVersion'].sort(),fail);assert.equal(request.schemaVersion,1,fail);assert.equal(request.kind,'cmc-profile-admission-request',fail);
 if(requestPin){assert.deepEqual(Object.keys(requestPin).sort(),['digest','runId'],fail);assert.equal(digestBytes(requestBytes),requestPin.digest,fail);assert.equal(request.runId,requestPin.runId,fail);}
 assert(path.isAbsolute(directory)&&path.normalize(directory)===directory&&fs.realpathSync(directory)===directory,fail);const profileBytes=read(path.join(directory,'cmc-profile-cohort.json')),admissionBytes=read(path.join(directory,'cmc-profile-admission.json'));assert.equal(digestBytes(profileBytes),request.profileDigest,fail);assert.equal(digestBytes(admissionBytes),request.admissionDigest,fail);
 const profile=JSON.parse(profileBytes),stored=JSON.parse(admissionBytes);assert.equal(digestBytes(JSON.stringify(profile.facets)),profile.cohortDigest,fail);assert.equal(profile.runId,request.runId,fail);assert.equal(profile.cohortDigest,request.cohortDigest,fail);assert.equal(profile.nativeBindingDigest,request.nativeBindingDigest,fail);
 const row=profile.facets[0],raw=read(path.join(directory,row.facet,'profile-feasibility.json'));assert.equal(digestBytes(raw),row.receiptDigest,fail);const receipt=JSON.parse(raw);assert.equal(receipt.status,'feasibility-observed',fail);assert.equal(receipt.cleanup?.complete,true,fail);assert.equal(receipt.privateStateRemoved,true,fail);assert.deepEqual(receipt.artifact,profile.candidate.identity,fail);assert.equal(receipt.harnessCommit,profile.producer.commit,fail);assert.deepEqual(receipt.sources.files,profile.producer.files,fail);assert.equal(nativeInventoryDigest(receipt.sources.files),profile.producer.sourceDigest,fail);assert.deepEqual(receipt.runtime,profile.runtime,fail);verifyCmcProfileObservationDigests(path.join(directory,row.facet),receipt);
 const baseline=receipt.invocations.find(item=>item.invocationId==='baseline'),fault=receipt.invocations.find(item=>item.invocationId===row.fault);for(const [actual,expected]of [[baseline,row.baseline],[fault,row.faultEvidence]]){assert(actual,fail);for(const key of ['status','configDigest','observationsDigest','journalDigest'])assert.equal(actual[key],expected[key],fail);}
 const admission=admitCmcProfile(profile,nativeContext,catalogue);assert.deepEqual(stored,admission,fail);const joint=cmcNativeProfileCompatibility(nativeContext,profile);assert.equal(stored.accepted,joint.status==='included'?1:0,fail);assert.deepEqual(stored.joint,joint,fail);return {admission,joint,profile};
}
