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
import {prepareApplicantResultRuntime,copyApplicantRuntimeEvidence,assertCopiedApplicantRuntimeEvidence} from './lib/exui-applicant-results-runtime.mjs';
import {APPLICANT_RESULTS_SCOPE} from './lib/exui-applicant-results-contract.mjs';
import {validateApplicantResultRuntime,publishApplicantResultRuntime} from './lib/exui-applicant-results-transition.mjs';
import {readApplicantCheckpoint,assertApplicantInvocationRemoved} from './lib/exui-applicant-results-evidence.mjs';
import {captureCiPhaseExpectation,captureCiOwnership,captureCiApplicantFaultOwnership,validateCiPhase} from './lib/exui-candidate-ci-evidence.mjs';
import {executeCiProcess,cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {cleanupNativeOwnership} from './lib/exui-native-ci-ownership.mjs';
import {inspectHostContainer,hostDocker} from './lib/exui-host-invocation.mjs';
import {terminateOwnedChild} from './lib/exui-candidate-runtime.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const reference=(directory,file)=>({path:path.relative(directory,file),digest:digestBytes(fs.readFileSync(file))});
export async function runApplicantResults({candidate,browser,profile,output}) {
 assert(path.isAbsolute(output),'RESULT_JOB_FRESH_OUTPUT');
 const artifact=await verifyCandidateArtifact(candidate),browserRoot=fs.realpathSync(browser);
 const profileInputs=JSON.parse(fs.readFileSync(profile,'utf8'));for(const key of ['baseArchive','derivedArchive','artifactRoot'])assert(typeof profileInputs[key]==='string'&&path.isAbsolute(profileInputs[key]),'RESULT_PROFILE_INPUT_PATH');
 output=createFreshHarnessOutput(output,[artifact.candidateRoot,candidate,browserRoot,path.resolve(root),root+'node_modules',profile,...['baseArchive','derivedArchive','artifactRoot'].map(key=>profileInputs[key])]);
 const directory=path.join(output,'native'),runtimes=new Map();let child,cancelled=false,ownership,context,baseline,expected,priorInput,priorExpected;
 const captures=[],cancel=()=>{cancelled=true;child?.kill('SIGTERM');};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 const alive=()=>assert(!cancelled,'RESULT_TRANSITION_CANCELLED');
 const summary={kind:'standalone-applicant-results-pilot',status:'BLOCKED',nativeRuntimeAcceptance:false,catalogueCredit:false,releaseCredit:false,cleanupComplete:false};let phase='verify-inputs';
 const persist=()=>writeJsonAtomic(path.join(output,'summary.json'),summary);persist();
 const runtimePath=variant=>path.join(output,`results-${variant}-runtime`);
 const removeRuntime=variant=>{const removed=cleanupCiCcd(runtimePath(variant),{localCcdProfile:profile});runtimes.delete(variant);return removed;};
 const captureBefore=(input,handoff,known)=>{
  for(const key of ['ccd','definition','definitionImportDigest','storedResultDates','resultDatesDigest','resultExpected','resultExpectedDigest','resultDescriptorDigests','correctedDependency','supportingScaffold','supportingScaffoldDigest','apiContracts'])assert.deepEqual(input[key],known[key],'RESULT_PARENT_PREPARATION_DRIFT');
  validateApplicantResultRuntime(input,input.variant);assertCopiedApplicantRuntimeEvidence(directory,input,input.variant);
  const variantContext={...context,ccd:input.ccd,ccdIdentity:nativeIdentity(input,{invocationId:input.variant,mutation:input.variant==='baseline'?null:input.variant},context.artifact.candidateRoot).identity};
  const current=captureCiPhaseExpectation('applicantResults',input,handoff,variantContext,directory);
  const plan=input.variant==='baseline'?captureCiOwnership(input,handoff,variantContext,directory,'applicantResults'):captureCiApplicantFaultOwnership(input,handoff,variantContext,directory,input.variant);
  const file=path.join(directory,`independent-results-${input.variant}.json`);
  writeJsonAtomic(file,{schemaVersion:1,invocationId:input.variant,capturedBeforeExecution:true,capturedAt:new Date().toISOString(),expected:current,ccd:input.ccd,definition:input.definition,correctedDependency:input.correctedDependency,resultDescriptorDigests:known.resultDescriptorDigests,resultExpectedDigest:known.resultExpectedDigest,resultDatesDigest:known.resultDatesDigest,definitionImportDigest:known.definitionImportDigest,runtimeEvidence:Object.fromEntries(Object.entries(input).filter(([key])=>/^result.*Receipt$/.test(key)))});
  captures.push({invocationId:input.variant,identity:current.identity,expectation:reference(directory,file)});
  return {current,plan};
 };
 const removePrior=()=>{
  readApplicantCheckpoint(directory,priorExpected,priorInput.variant);
  const native=assertApplicantInvocationRemoved(ownership,priorInput.variant,inspectHostContainer),ccd=removeRuntime(priorInput.variant);
  const file=path.join(directory,`independent-results-${priorInput.variant}-removal.json`);writeJsonAtomic(file,{invocationId:priorInput.variant,native,ccd});captures.at(-1).removal=reference(directory,file);
 };
 try{
  const dependencies=await verifyHarnessDependencies(root+'node_modules',root+'package.json',root+'yarn.lock');
  const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(result.status,0,'RESULT_SOURCE_GIT');return result.stdout.trim();};assert.equal(git(['status','--porcelain']),'','RESULT_SOURCE_NOT_CLEAN');
  const sourceDigest=digestBytes(JSON.stringify(NATIVE_HARNESS_SOURCE_FILES.map(file=>[file,digestBytes(fs.readFileSync(path.join(root,file)))])));
  context={commit:git(['rev-parse','HEAD']),artifact,browserRoot,browserDigest:await digestCandidateTree(browserRoot),dependencies,sourceDigests:{applicantResults:sourceDigest},nativeRuntime:inspectNativeApiRuntime(artifact.provenance.platform),browserRuntimeImage:inspectNativeBrowserRuntime(artifact.provenance.platform)};
  phase='prepare-baseline';runtimes.set('baseline',runtimePath('baseline'));baseline=await prepareApplicantResultRuntime(runtimePath('baseline'),{profile,platform:artifact.provenance.platform,isCancelled:()=>cancelled});alive();
  phase='native-execution';const execution=await executeCiProcess({script:root+'scripts/run-harness-applicant-results-candidate.mjs',args:['--candidate',candidate,'--browser',browserRoot,'--runtime',runtimePath('baseline'),'--profile',profile,'--output',directory],output:directory,onChild:value=>{child=value;},
   onPrepared:(input,handoff)=>{const captured=captureBefore(input,handoff,baseline);ownership=captured.plan;expected=captured.current;priorInput=input;priorExpected=expected;return expected;},
   onResultsTransition:async(request,{input,handoff,isTerminated})=>{
    const running=()=>{alive();assert(!isTerminated(),'RESULT_TRANSITION_CHILD_TERMINATED');};running();removePrior();running();
    phase=`prepare-${request.invocationId}`;runtimes.set(request.invocationId,runtimePath(request.invocationId));
    const known=await prepareApplicantResultRuntime(runtimePath(request.invocationId),{profile,variant:request.invocationId,platform:artifact.provenance.platform,isCancelled:()=>cancelled||isTerminated()});running();
    const runtime={...input,...known};Object.assign(runtime,copyApplicantRuntimeEvidence(directory,runtime,request.invocationId));
    const captured=captureBefore(runtime,handoff,known);ownership.invocations.push(...captured.plan.invocations);priorInput=runtime;priorExpected=captured.current;
    const record={schemaVersion:1,runId:input.runId,invocationId:request.invocationId,request,requestDigest:digestBytes(JSON.stringify(request)),runtime};
    captures.at(-1).runtimeRecord=publishApplicantResultRuntime(directory,record);phase='native-execution';return record;
   }});
  alive();const terminalFile=path.join(directory,'independent-controller-terminal.json');writeJsonAtomic(terminalFile,{schemaVersion:1,runId:expected.runId,terminal:execution.terminal});expected.applicantControllerTerminal=reference(directory,terminalFile);
  assert.deepEqual(execution.terminal,{code:0,signal:null},'RESULT_CONTROLLER_FAILED');
  phase='validate-final-cleanup';removePrior();
  await cleanupNativeOwnership(ownership,{inspect:inspectHostContainer,remove:id=>hostDocker(['rm','-f',id])});
  const file=path.join(directory,'independent-results-capture.json');writeJsonAtomic(file,{schemaVersion:1,completedAfterController:true,baselineInputDigest:digestBytes(fs.readFileSync(path.join(directory,'input.json'))),invocations:captures});expected.applicantResultsCapture=reference(directory,file);
  writeJsonAtomic(path.join(directory,'independent-results-admission.json'),{schemaVersion:1,completedAfterController:true,expected});
  phase='independent-admission';const verdict=validateCiPhase(directory,expected,execution.terminal);
  summary.status=verdict.status;summary.nativeRuntimeAcceptance=verdict.status==='PASS';summary.invocations=4;summary.proposedCatalogueRows=2;summary.receiptArtifactDigest=verdict.receiptArtifactDigest;
 }catch(error){summary.status='BLOCKED';summary.nativeRuntimeAcceptance=false;summary.diagnostic=classifyNativeFailure(error);summary.phase=phase;summary.failure=cancelled?'RESULT_JOB_CANCELLED':'RESULT_JOB_FAILED';}
 finally{
  let clean=true;
  try{if(child){const terminal=await terminateOwnedChild(child,{graceMs:10000});if(terminal.forced)clean=false;}}catch{clean=false;}
  if(!ownership&&context&&baseline&&fs.existsSync(path.join(directory,"container-launch.json")))try{const launched=JSON.parse(fs.readFileSync(path.join(directory,"input.json"),"utf8")),handoff=JSON.parse(fs.readFileSync(path.join(directory,"container-launch.json"),"utf8"));ownership=captureCiOwnership(launched,handoff,{...context,ccd:baseline.ccd},directory,"applicantResults");}catch{clean=false;}
  if(ownership)try{await cleanupNativeOwnership(ownership,{inspect:inspectHostContainer,remove:id=>hostDocker(['rm','-f',id])});}catch{clean=false;}
  for(const variant of [...runtimes.keys()].reverse())try{removeRuntime(variant);}catch{clean=false;}
  summary.cleanupComplete=clean;if(!clean){summary.status='BLOCKED';summary.nativeRuntimeAcceptance=false;}process.off('SIGINT',cancel);process.off('SIGTERM',cancel);persist();
 }
 return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);assert.equal(args.length,8);assert.deepEqual(args.filter((_,i)=>i%2===0),['--candidate','--browser','--profile','--output']);const result=await runApplicantResults({candidate:args[1],browser:args[3],profile:args[5],output:args[7]});console.log(JSON.stringify(result));process.exitCode=result.status==='PASS'&&result.cleanupComplete?0:2;}catch{console.error('RESULT_JOB_ARGUMENTS_REJECTED');process.exitCode=2;}
}
