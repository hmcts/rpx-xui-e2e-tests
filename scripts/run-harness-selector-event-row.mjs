#!/usr/bin/env node
import {classifyNativeFailure} from './lib/exui-native-failure-diagnostics.mjs';
import {createFreshHarnessOutput} from './lib/exui-output-boundary.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifyCandidateArtifact,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './lib/exui-native-sources.mjs';
import {inspectNativeApiRuntime,inspectNativeBrowserRuntime} from './lib/exui-native-containers.mjs';
import {nativeIdentity} from './lib/exui-native-contract.mjs';
import {prepareSelectorRuntime,copySelectorRuntimeEvidence,assertCopiedSelectorRuntimeEvidence} from './lib/exui-selector-event-row-runtime.mjs';
import {SELECTOR_EVENT_SCOPE,SELECTOR_EVENT_MUTATION} from './lib/exui-selector-event-row-contract.mjs';
import {validateSelectorRuntimeInput,publishSelectorRuntime} from './lib/exui-selector-event-row-transition.mjs';
import {readSelectorCheckpoint,assertSelectorInvocationRemoved} from './lib/exui-selector-event-row-evidence.mjs';
import {captureCiPhaseExpectation,captureCiOwnership,captureCiSelectorFaultOwnership,validateCiPhase} from './lib/exui-candidate-ci-evidence.mjs';
import {executeCiProcess,cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {cleanupNativeOwnership} from './lib/exui-native-ci-ownership.mjs';
import {inspectHostContainer,hostDocker} from './lib/exui-host-invocation.mjs';
import {terminateOwnedChild} from './lib/exui-candidate-runtime.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const reference=(directory,file)=>({path:path.relative(directory,file),digest:digestBytes(fs.readFileSync(file))});
export async function afterSelectorChildStopped(child,cleanup,terminate=terminateOwnedChild) {
 const terminal=await terminate(child,{graceMs:10000});
 assert.equal(terminal.observed,true,'SELECTOR_CHILD_TERMINATION_UNOBSERVED');
 await cleanup();return terminal;
}
export async function runSelectorEventPhase({candidate,browser,output}, {signal} = {}) {
 const phaseStarted={startedAt:new Date().toISOString(),start:performance.now()};
 assert(path.isAbsolute(output),'SELECTOR_JOB_FRESH_OUTPUT');
 const artifact=await verifyCandidateArtifact(candidate),browserRoot=fs.realpathSync(browser);
 const directory=path.resolve(output);assert(!fs.existsSync(directory),'SELECTOR_JOB_FRESH_OUTPUT');
 output=createFreshHarnessOutput(directory+'-runtime',[artifact.candidateRoot,candidate,browserRoot,path.resolve(root),root+'node_modules']);
 const runtimes=new Map();let child,cancelled=false,ownership,context,baseline,expected,priorInput,priorExpected;
 const captures=[],cancel=()=>{cancelled=true;child?.kill('SIGTERM');};signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 const alive=()=>assert(!cancelled,'SELECTOR_TRANSITION_CANCELLED');
 const summary={phaseTimings:[],kind:'standalone-selector-event-row-pilot',status:'BLOCKED',nativeRuntimeAcceptance:false,catalogueCredit:false,releaseCredit:false,cleanupComplete:false};let phase='verify-inputs';
 let timing;
 const finishTiming=status=>{if(timing){summary.phaseTimings.push({label:timing.label,startedAt:timing.startedAt,durationMs:Math.round(performance.now()-timing.start),status});timing=undefined;}};
 const startTiming=label=>{finishTiming('completed');timing={label,startedAt:new Date().toISOString(),start:performance.now()};};
 timing={label:'Selector CCD baseline preparation',...phaseStarted};
 const persist=()=>writeJsonAtomic(path.join(output,'summary.json'),summary);persist();
 const runtimePath=variant=>path.join(output,`selector-${variant}-runtime`);
 const removeRuntime=variant=>{const removed=cleanupCiCcd(runtimePath(variant));runtimes.delete(variant);return removed;};
 const actors=credentials=>Object.fromEntries(Object.entries(credentials).map(([name,value])=>[name,{userId:value.userId,roles:value.roles??[]}]));
 const captureBefore=(input,handoff,known)=>{
  assert.deepEqual(actors(input.credentials),actors(known.credentials),'SELECTOR_PARENT_ACTORS');
  for(const key of ['ccd','definition','definitionImportDigest','selectorEventBinding','apiContracts'])assert.deepEqual(input[key],known[key],'SELECTOR_PARENT_PREPARATION_DRIFT');
  validateSelectorRuntimeInput(input,input.selectorInvocation);assertCopiedSelectorRuntimeEvidence(directory,input,input.selectorInvocation);
  const variantContext={...context,ccd:input.ccd,ccdIdentity:nativeIdentity(input,{invocationId:input.selectorInvocation,mutation:input.selectorInvocation==='baseline'?null:input.selectorInvocation},context.artifact.candidateRoot).identity};
  const current=captureCiPhaseExpectation('selectorEventRow',input,handoff,variantContext,directory);
  const plan=input.selectorInvocation==='baseline'?captureCiOwnership(input,handoff,variantContext,directory,'selectorEventRow'):captureCiSelectorFaultOwnership(input,handoff,variantContext,directory);
  const file=path.join(directory,`independent-selector-${input.selectorInvocation}.json`);
  writeJsonAtomic(file,{schemaVersion:1,invocationId:input.selectorInvocation,capturedBeforeExecution:true,capturedAt:new Date().toISOString(),expected:current,actors:actors(known.credentials),ccd:input.ccd,definition:input.definition,selectorEventBinding:known.selectorEventBinding,apiContracts:known.apiContracts,definitionImportDigest:known.definitionImportDigest,runtimeEvidence:Object.fromEntries(Object.entries(input).filter(([key])=>/^selector.*Receipt$/.test(key)))});
  captures.push({invocationId:input.selectorInvocation,identity:current.identity,expectation:reference(directory,file)});
  return {current,plan};
 };
 const removePrior=()=>{
  readSelectorCheckpoint(directory,priorExpected,priorInput.selectorInvocation,priorInput);
  const native=assertSelectorInvocationRemoved(ownership,priorInput.selectorInvocation,inspectHostContainer),ccd=removeRuntime(priorInput.selectorInvocation);
  const file=path.join(directory,`independent-selector-${priorInput.selectorInvocation}-removal.json`);writeJsonAtomic(file,{invocationId:priorInput.selectorInvocation,native,ccd});captures.at(-1).removal=reference(directory,file);
 };
 try{
  const dependencies=await verifyHarnessDependencies(root+'node_modules',root+'package.json',root+'yarn.lock');
  const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(result.status,0,'SELECTOR_SOURCE_GIT');return result.stdout.trim();};assert.equal(git(['status','--porcelain']),'','SELECTOR_SOURCE_NOT_CLEAN');
  const sourceDigest=digestBytes(JSON.stringify(NATIVE_HARNESS_SOURCE_FILES.map(file=>[file,digestBytes(fs.readFileSync(path.join(root,file)))])));
  context={commit:git(['rev-parse','HEAD']),artifact,browserRoot,browserDigest:await digestCandidateTree(browserRoot),dependencies,sourceDigests:{selectorEventRow:sourceDigest},nativeRuntime:inspectNativeApiRuntime(artifact.provenance.platform),browserRuntimeImage:inspectNativeBrowserRuntime(artifact.provenance.platform)};
  phase='prepare-baseline';runtimes.set('baseline',runtimePath('baseline'));baseline=await prepareSelectorRuntime(runtimePath('baseline'),{platform:artifact.provenance.platform,isCancelled:()=>cancelled});alive();
  startTiming('Selector baseline proof and cleanup');
  phase='native-execution';const execution=await executeCiProcess({script:root+'scripts/run-harness-ccd-candidate.mjs',args:['--candidate',candidate,'--browser',browserRoot,'--ccd-state',path.join(runtimePath('baseline'),'runtime.json'),'--scope',SELECTOR_EVENT_SCOPE,'--output',directory],output:directory,onChild:value=>{child=value;},
   onPrepared:(input,handoff)=>{input.selectorInvocation="baseline";const captured=captureBefore(input,handoff,baseline);ownership=captured.plan;expected=captured.current;priorInput=input;priorExpected=expected;return expected;},
   onSelectorTransition:async(request,{input,handoff,isTerminated})=>{
    const running=()=>{alive();assert(!isTerminated(),'SELECTOR_TRANSITION_CHILD_TERMINATED');};running();removePrior();running();startTiming('Selector CCD fault preparation');
    phase=`prepare-${SELECTOR_EVENT_MUTATION}`;runtimes.set(SELECTOR_EVENT_MUTATION,runtimePath(SELECTOR_EVENT_MUTATION));
    const known=await prepareSelectorRuntime(runtimePath(SELECTOR_EVENT_MUTATION),{invocationId:SELECTOR_EVENT_MUTATION,platform:artifact.provenance.platform,isCancelled:()=>cancelled||isTerminated()});running();
    const runtime={...input,...known,selectorInvocation:SELECTOR_EVENT_MUTATION};Object.assign(runtime,copySelectorRuntimeEvidence(directory,runtime,SELECTOR_EVENT_MUTATION));
    const captured=captureBefore(runtime,handoff,known);ownership.invocations.push(...captured.plan.invocations);priorInput=runtime;priorExpected=captured.current;
    const record={schemaVersion:1,runId:input.runId,invocationId:SELECTOR_EVENT_MUTATION,request,requestDigest:digestBytes(JSON.stringify(request)),runtime};
    captures.at(-1).runtimeRecord=publishSelectorRuntime(directory,record);startTiming('Selector fault proof and cleanup');phase='native-execution';return record;
   }});
  alive();const terminalFile=path.join(directory,'independent-controller-terminal.json');writeJsonAtomic(terminalFile,{schemaVersion:1,runId:expected.runId,terminal:execution.terminal});expected.selectorControllerTerminal=reference(directory,terminalFile);
  assert.deepEqual(execution.terminal,{code:0,signal:null},'SELECTOR_CONTROLLER_FAILED');
  phase='validate-final-cleanup';removePrior();
  await cleanupNativeOwnership(ownership,{inspect:inspectHostContainer,remove:id=>hostDocker(['rm','-f',id])});
  const file=path.join(directory,'independent-selector-capture.json');writeJsonAtomic(file,{schemaVersion:1,completedAfterController:true,baselineInputDigest:digestBytes(fs.readFileSync(path.join(directory,'input.json'))),invocations:captures});expected.selectorEventCapture=reference(directory,file);
  writeJsonAtomic(path.join(directory,'independent-selector-admission.json'),{schemaVersion:1,completedAfterController:true,expected});
  startTiming('Selector evidence verification');phase='independent-admission';const verdict=validateCiPhase(directory,expected,execution.terminal);
  summary.status=verdict.status;summary.nativeRuntimeAcceptance=verdict.status==='PASS';summary.invocations=2;summary.proposedCatalogueRows=1;summary.receiptArtifactDigest=verdict.receiptArtifactDigest;
 }catch(error){summary.status='BLOCKED';summary.nativeRuntimeAcceptance=false;summary.diagnostic=classifyNativeFailure(error);summary.phase=phase;summary.failure=cancelled?'SELECTOR_JOB_CANCELLED':'SELECTOR_JOB_FAILED';}
 finally{
  finishTiming(summary.status==='PASS'?'PASS':'stopped');startTiming('Selector final cleanup');
  let clean=false;
  try{
   const stopped=await afterSelectorChildStopped(child,async()=>{
    if(!ownership&&context&&baseline&&fs.existsSync(path.join(directory,"container-launch.json"))){
     const launched=JSON.parse(fs.readFileSync(path.join(directory,"input.json"),"utf8")),handoff=JSON.parse(fs.readFileSync(path.join(directory,"container-launch.json"),"utf8"));
     ownership=captureCiOwnership(launched,handoff,{...context,ccd:baseline.ccd},directory,"selectorEventRow");
    }
    if(ownership)await cleanupNativeOwnership(ownership,{inspect:inspectHostContainer,remove:id=>hostDocker(['rm','-f',id])});
    for(const variant of [...runtimes.keys()].reverse())removeRuntime(variant);
   });clean=!stopped.forced;
  }catch{clean=false;}
  finishTiming(clean?'completed':'stopped');summary.cleanupComplete=clean;if(!clean){summary.status='BLOCKED';summary.nativeRuntimeAcceptance=false;}signal?.removeEventListener('abort',cancel);persist();
 }

 return summary;
}
export async function runSelectorEventRow({candidate,browser,output}) {
 const artifact=await verifyCandidateArtifact(candidate);
 const rootOutput=createFreshHarnessOutput(output,[artifact.candidateRoot,candidate,fs.realpathSync(browser),path.resolve(root),root+'node_modules']);
 const controller=new AbortController(),cancel=()=>controller.abort();
 process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 try{
  const result=await runSelectorEventPhase({candidate,browser,output:path.join(rootOutput,'native')},{signal:controller.signal});
  writeJsonAtomic(path.join(rootOutput,'summary.json'),result);return result;
 }finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);assert.equal(args.length,6);assert.deepEqual(args.filter((_,i)=>i%2===0),['--candidate','--browser','--output']);const result=await runSelectorEventRow({candidate:args[1],browser:args[3],output:args[5]});console.log(JSON.stringify(result));process.exitCode=result.status==='PASS'&&result.cleanupComplete?0:2;}catch{console.error('SELECTOR_JOB_ARGUMENTS_REJECTED');process.exitCode=2;}
}
