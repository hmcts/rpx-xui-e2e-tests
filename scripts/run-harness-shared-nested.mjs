#!/usr/bin/env node
import collector from './run-harness-local-aat.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCiJob,prepareCiJob,createCiOutput} from './lib/exui-candidate-ci-inputs.mjs';
import {startCcdRuntime,importCcdDefinition,verifyCcdRuntimeIdentity,ccdRequest} from './lib/exui-ccd-runtime.mjs';
import {captureCiPhaseExpectation,captureCiOwnership,validateCiPhase} from './lib/exui-candidate-ci-evidence.mjs';
import {executeCiProcess,cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {cleanupNativeOwnership} from './lib/exui-native-ci-ownership.mjs';
import {inspectHostContainer,hostDocker} from './lib/exui-host-invocation.mjs';
import {effectiveCandidateConfiguration} from './lib/exui-candidate-runtime.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {SHARED_NESTED_SCOPE} from './lib/exui-shared-nested-contract.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const ref=file=>digestBytes(fs.readFileSync(file));
export async function runSharedNestedAttempt(value) {
 const job=validateCiJob(value),output=createCiOutput(job.output,[job.candidateManifest,job.browserCache,root,path.join(root,'node_modules')]);
 const directory=path.join(output,'sharedNested'),runtime=path.join(output,'ccd-runtime');
 let child,context,expected,ownership,terminal,cancelled=false,cleanupComplete=false;
 const cancel=()=>{cancelled=true;child?.kill('SIGTERM');};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 const startedAt=new Date().toISOString();
 const summary={startedAt,kind:'standalone-shared-nested-attempt',status:'BLOCKED',catalogueCredit:false,releaseCredit:false,cleanupComplete:false};
 writeJsonAtomic(path.join(output,'summary.json'),summary);
 try {
  context=await prepareCiJob(job,output);assert(!cancelled,'SHARED_NESTED_CANCELLED');
  context.ccd=await startCcdRuntime(runtime,{platform:context.artifact.provenance.platform,isCancelled:()=>cancelled});importCcdDefinition(context.ccd);
  const observed=verifyCcdRuntimeIdentity(context.ccd),config=effectiveCandidateConfiguration(context.artifact.candidateRoot).config;
  config.now=false;config.jurisdictions=`${config.jurisdictions},HARNESS`;
  const apiContracts=Object.fromEntries([['data',4452],['definition',4451]].map(([name,port])=>{const response=ccdRequest(context.ccd,port,'/v3/api-docs');assert.equal(response.status,200,'SHARED_NESTED_API_REQUIRED');return [name,digestBytes(JSON.stringify(response.body))];}));
  context.ccdIdentity={...context.artifact.identity,configurationDigest:digestBytes(JSON.stringify({config,gatewayDigest:digestBytes(fs.readFileSync(path.join(root,'scripts/lib/exui-ccd-browser-runtime.mjs'))),mutation:null})),definitionDigests:{HarnessNestedPRL:observed.fixtureDigest},dependencyIdentities:Object.fromEntries([['data','ccd'],['definition','ccd-definition']].map(([name,key])=>[key,{artifactDigest:context.ccd.images[name].id,apiContractDigest:apiContracts[name]}]))};
  terminal=await executeCiProcess({script:path.join(root,'scripts/run-harness-ccd-candidate.mjs'),args:['--candidate',job.candidateManifest,'--browser',job.browserCache,'--output',directory,'--ccd-state',path.join(runtime,'runtime.json'),'--scope',SHARED_NESTED_SCOPE],output:directory,onChild:running=>child=running,onLaunch:(input,handoff)=>{
   assert(!cancelled,'SHARED_NESTED_CANCELLED');
   expected=captureCiPhaseExpectation('sharedNested',input,handoff,context,directory);
   ownership=captureCiOwnership(input,handoff,context,directory,'sharedNested');
   writeJsonAtomic(path.join(output,'independent-before.json'),{schemaVersion:1,capturedBeforeExecution:true,expected,candidateManifest:job.candidateManifest,ccd:context.ccd,ownership});
  }});
  child=null;writeJsonAtomic(path.join(output,'independent-terminal.json'),{terminal});
  if(terminal.code===0){const verified=validateCiPhase(directory,expected,terminal);assert.equal(verified.status,'PASS','SHARED_NESTED_COMPLETE_GATE_REQUIRED');}
  summary.status=terminal.code===0?'PASS':'BLOCKED';
 } finally {
  let clean=!child;
  if(ownership)try{
   await cleanupNativeOwnership(ownership,{inspect:inspectHostContainer,remove:id=>hostDocker(['rm','-f',id])});
   const registry=read(path.join(directory,'owned-resources.json'));
   const checkedNames=ownership.invocations.flatMap(({plan})=>[plan.tools.name,plan.candidate.name]);
   const checkedContainerIds=[...new Set(registry.map(row=>row.id).filter(Boolean))].sort();
   for(const identifier of [...checkedNames,...checkedContainerIds])assert.equal(inspectHostContainer(identifier),null,'SHARED_NESTED_CONTAINER_STILL_PRESENT');
   removeSharedNestedState(read(path.join(directory,'container-launch.json')),ownership);
   writeJsonAtomic(path.join(output,'native-cleanup.json'),{owner:ownership.owner,cleanupComplete:true,privateStateRemoved:true,checkedNames,checkedContainerIds});
  }catch{clean=false;}
  try{const cleanup=cleanupCiCcd(runtime);if(cleanup)writeJsonAtomic(path.join(output,'ccd-cleanup.json'),cleanup);else clean=false;}catch{clean=false;}
  cleanupComplete=clean;summary.cleanupComplete=clean;summary.completedAt=new Date().toISOString();summary.durationMs=Date.parse(summary.completedAt)-Date.parse(summary.startedAt);writeJsonAtomic(path.join(output,'summary.json'),summary);
  process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
 }
 assert(expected&&terminal&&cleanupComplete&&!cancelled,'SHARED_NESTED_ATTEMPT_INCOMPLETE');
 const request={schemaVersion:1,kind:'shared-nested-attempt-request',directory:output,expected:{runId:expected.runId,producerCommit:expected.harnessCommit,candidateArtifactDigest:expected.identity.artifactDigest,beforeDigest:ref(path.join(output,'independent-before.json')),terminalDigest:ref(path.join(output,'independent-terminal.json')),cleanupDigest:ref(path.join(output,'ccd-cleanup.json')),nativeCleanupDigest:ref(path.join(output,'native-cleanup.json')),summaryDigest:ref(path.join(output,'summary.json'))}};
 const descriptor=path.join(output,'attempt-request.json');writeJsonAtomic(descriptor,request);
 const report=await collector.runHarnessCollection(process.env,{profile:'harness',sharedNestedAttemptPath:descriptor});
 return {status:report.sharedNestedStatus,catalogueCredit:false,reportStatus:report.status,exitCode:Math.max(terminal.code,report.exitCode)};
}
export function removeSharedNestedState(handoff,ownership) {
 assert.equal(handoff.owner,ownership.owner,'SHARED_NESTED_STATE_OWNER');assert.equal(handoff.mode,'native-separate-api','SHARED_NESTED_STATE_MODE');assert.equal(handoff.output,ownership.directory,'SHARED_NESTED_STATE_OUTPUT');
 const state=handoff.stateRoot;
 assert(typeof state==='string'&&path.isAbsolute(state)&&fs.realpathSync(state)===state&&fs.lstatSync(state).isDirectory()&&state.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&path.basename(state).startsWith('harness-native-state-'),'SHARED_NESTED_STATE_PATH');
 const ids=['baseline','ccd-drop-child','ccd-drop-postal-optional-child','shared-nested-drop-second-recipient'];assert.deepEqual(ownership.invocations.map(row=>row.invocationId),ids,'SHARED_NESTED_STATE_INVOCATIONS');
 for(const {invocationId,plan}of ownership.invocations) {
  for(const mounts of [plan.tools.mounts,plan.candidate.mounts])assert(mounts.some(row=>row.source===path.join(state,invocationId,'sessions')&&row.target==='/tmp/.sessions'&&row.writable===true),'SHARED_NESTED_STATE_MOUNT');
  assert(plan.candidate.mounts.some(row=>row.source===path.join(state,invocationId,'diagnostics')&&row.target==='/diagnostics'&&row.writable===true),'SHARED_NESTED_STATE_MOUNT');
 }
 fs.rmSync(state,{recursive:true,force:false});assert(!fs.existsSync(state),'SHARED_NESTED_STATE_REMAINS');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
 assert.equal(process.argv.length,4,'SHARED_NESTED_INPUT_REQUIRED');assert.equal(process.argv[2],'--input','SHARED_NESTED_INPUT_REQUIRED');
 const job=read(process.argv[3]),result=await runSharedNestedAttempt(job);
 console.log(JSON.stringify({status:result.status,catalogueCredit:false,reportStatus:result.reportStatus}));process.exitCode=result.exitCode;
}catch{console.log(JSON.stringify({status:'BLOCKED',catalogueCredit:false,code:'SHARED_NESTED_ATTEMPT_REJECTED'}));process.exitCode=2;}
