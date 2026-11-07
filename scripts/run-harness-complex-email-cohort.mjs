#!/usr/bin/env node
import {prepareComplexSourceInputs} from './lib/exui-complex-source-inputs.mjs';
export {prepareComplexSourceInputs} from './lib/exui-complex-source-inputs.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runCallbackUi,CALLBACK_UI_SOURCES} from './run-harness-recipient-callback-ui.mjs';
import {runComplexEmailMappingPair} from './run-harness-complex-email-mapping.mjs';
import {verifyCandidateArtifact} from './lib/exui-candidate-artifact.mjs';
import {createFreshHarnessRuntimeOutput} from './lib/exui-output-boundary.mjs';
import {inspectHostContainer,hostDocker} from './lib/exui-host-invocation.mjs';
import {terminateOwnedChild} from './lib/exui-candidate-runtime.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {COMPLEX_FLAGS,createComplexCapture,complexPins,complexPin,readComplexCohort} from './lib/exui-complex-email-cohort.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),fail='COMPLEX_COHORT';
export const COMPLEX_COHORT_SOURCES=Object.freeze([...new Set([...CALLBACK_UI_SOURCES,
 'scripts/lib/exui-complex-email-transport.mjs','scripts/run-harness-complex-email-cohort.mjs','scripts/lib/exui-complex-email-cohort.mjs','scripts/run-harness-complex-email-mapping.mjs','scripts/lib/exui-complex-email-mapping.mjs',
 'scripts/verify-complex-email-application-source.py','scripts/verify-definition-image-binding.py','scripts/verify-local-ccd-oci.py','scripts/verify-shared-role-ccd-source.py','scripts/fixtures/ccd/complex-email-application-class-witnesses.json'])]);
export function complexProducer(){
 const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,fail);return r.stdout.trim();};
 assert.equal(git(['status','--porcelain']),'',fail);
 return {commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),files:COMPLEX_COHORT_SOURCES.map(name=>{const file=path.join(root,name);assert.equal(fs.realpathSync(file),file,fail);assert(fs.lstatSync(file).isFile(),fail);return [name,digestBytes(fs.readFileSync(file))];})};
}
export async function executeComplexSourceProof(inputs,output,{signal,log,launch=spawn,terminate=terminateOwnedChild}={}){
 const names=['python','sourceArchive','definitionArchive','javaHome','lombok','mapstruct'];
 for(const key of names){assert(path.isAbsolute(inputs[key]),fail);assert.equal(fs.realpathSync(inputs[key]),inputs[key],fail);}
 const args=[path.join(root,'scripts/verify-complex-email-application-source.py'),'--source-archive',inputs.sourceArchive,'--definition-archive',inputs.definitionArchive,'--java-home',inputs.javaHome,'--lombok',inputs.lombok,'--mapstruct',inputs.mapstruct,'--output',output];
 let child,termination,cancelled=false,rejectCancellation;
 const cancellationFailed=new Promise((_,reject)=>{rejectCancellation=reject;});
 const cancel=()=>{cancelled=true;if(child&&!termination){termination=terminate(child,{graceMs:30_000,killMs:2000});termination.catch(rejectCancellation);}};
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  assert(!signal?.aborted,fail);
  child=launch(inputs.python,args,{cwd:root,env:{HOME:os.homedir(),PATH:path.dirname(inputs.python)+':/usr/bin:/bin',TMPDIR:fs.realpathSync(os.tmpdir()),PYTHONDONTWRITEBYTECODE:'1',LANG:'en_US.UTF-8'},stdio:['ignore',log,log]});
  if(signal?.aborted)cancel();
  const terminal=await Promise.race([new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));}),cancellationFailed]);
  const stopped=termination?await termination:{observed:true,forced:false};
  return {started:true,observed:stopped.observed===true,forced:stopped.forced===true,cancelled,...terminal,pid:child.pid};
 }catch(error){if(child){const stopped=await(termination??terminate(child,{graceMs:30_000,killMs:2000}));assert(stopped.observed===true&&!stopped.forced,fail);}throw error;}
 finally{signal?.removeEventListener('abort',cancel);}
}
export async function runComplexEmailCohort({candidate,browser,output,sourceInputs,signal,admissionContext,admissionContractDigest,runId},operations={}){
 let ownedOutput,phase='preflight';
 const controller=new AbortController();let cancelled=false;const cancel=()=>{cancelled=true;controller.abort();},expected={contexts:{}},summary={kind:'complex-email-noncredit-cohort',status:'BLOCKED',...COMPLEX_FLAGS};
 process.once('SIGINT',cancel);process.once('SIGTERM',cancel);signal?.addEventListener('abort',cancel,{once:true});
 const active=()=>assert(!controller.signal.aborted&&!signal?.aborted,'COMPLEX_COHORT_CANCELLED');
 const producer=operations.producer??complexProducer,inspect=operations.inspect??inspectHostContainer;
 const ownerEmpty=operations.ownerEmpty??(owner=>hostDocker(['ps','-aq','--filter','label=exui.harness.owner='+owner]).trim()==='');
 const browserRun=operations.browser??runCallbackUi,mappingRun=operations.mapping??runComplexEmailMappingPair,sourceRun=operations.source??executeComplexSourceProof;
 try{
  active();expected.producer=producer();const artifact=await(operations.verifyCandidate??verifyCandidateArtifact)(candidate);active();assert.equal(artifact.provenance.platform,'linux/arm64',fail);expected.candidate=artifact;expected.sourcePreparation=(operations.prepareSource??prepareComplexSourceInputs)(sourceInputs);
  phase='create-output';output=createFreshHarnessRuntimeOutput(output,root,[path.resolve(candidate),artifact.candidateRoot,fs.realpathSync(browser),...Object.values(sourceInputs)]);expected.directory=output;ownedOutput=output;
  if(admissionContext){assert(/^complex-[a-f0-9-]{36}$/.test(runId)&&/^sha256:[a-f0-9]{64}$/.test(admissionContractDigest),fail);expected.runId=runId;expected.admissionContext=structuredClone(admissionContext);}
  writeJsonAtomic(path.join(output,'parent-input.json'),{producer:expected.producer,candidate:artifact,...(admissionContext?{runId,admissionContext:expected.admissionContext,admissionContractDigest}:{}),...COMPLEX_FLAGS});
  if(admissionContext)expected.inputDigest=complexPin(output,'parent-input.json');
  let sourcePhase='source-input-verification',firstFailure;
  const noteFailure=(stage,error)=>{firstFailure??={stage,error};controller.abort();};
  for(const variant of ['baseline','email-type']){
   active();const directory=path.join(output,'browser-'+variant);
   await browserRun({candidate,browser,output:directory,variant,scenario:'complex-email-text',signal:controller.signal,complexLifecycle:createComplexCapture('browser',expected,{active,inspect,ownerEmpty})});
   active();assert(expected.contexts['browser-'+variant]?.closed?.observedAbsent===true,fail);
  }
  active();const mapping=path.join(output,'mapping');fs.mkdirSync(mapping,{mode:0o700});
  const sourceOutput=path.join(output,'source-proof'),{prepared,tools}=expected.sourcePreparation;
  try{for(const item of [...Object.values(prepared),...tools])if(item.digest!==null)assert.equal(digestBytes(fs.readFileSync(item.path)),item.digest,fail);}catch(error){throw Object.assign(error,{failedStage:sourcePhase});}
  assert.deepEqual(producer(),expected.producer,fail);
  active();sourcePhase='source-proof';const log=fs.openSync(path.join(output,'source-proof.log'),'wx',0o600);
  const source=async()=>{try{
    const terminal=await sourceRun(sourceInputs,sourceOutput,{signal:controller.signal,log});active();
    assert(terminal.started===true&&Number.isSafeInteger(terminal.pid)&&terminal.pid>0&&terminal.observed===true&&terminal.forced===false&&!terminal.cancelled&&terminal.code===0&&terminal.signal===null,fail);
    expected.sourceProof={directory:sourceOutput,prepared,tools,terminal,files:complexPins(sourceOutput,['definition-image-binding.json','image-inputs.json','class-proof/preexecution.json','class-proof/result.json','class-proof/compiler-shutdown.json','class-proof/compiler-version-shutdown.json'])};
  }catch(error){noteFailure(sourcePhase,error);throw error;}finally{fs.closeSync(log);}};
  const runtime=async()=>{try{const result=await mappingRun(mapping,{isCancelled:()=>controller.signal.aborted,complexLifecycle:createComplexCapture('mapping',expected,{active,inspect,ownerEmpty})});assert.equal(result?.status,'observed',fail);active();assert(['mapping-baseline','mapping-searchable'].every(key=>expected.contexts[key]?.closed?.observedAbsent),fail);}catch(error){noteFailure('mapping-pair',error);throw error;}};
  const outcomes=await Promise.allSettled([source(),runtime()]);
  if(firstFailure)throw Object.assign(firstFailure.error,{failedStage:firstFailure.stage});
  const rejected=outcomes.find(outcome=>outcome.status==='rejected');if(rejected)throw rejected.reason;
  phase='runtime-join';active();assert.deepEqual(producer(),expected.producer,fail);
  phase='raw-reader';await new Promise(resolve=>setImmediate(resolve));active();const verdict=(operations.read??readComplexCohort)(output,expected,{active,inspect,ownerEmpty});await new Promise(resolve=>setImmediate(resolve));active();Object.assign(summary,verdict);
 }catch(error){summary.failedStage=error.failedStage??phase;summary.status=cancelled||signal?.aborted?'CANCELLED':'BLOCKED';}
 finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);signal?.removeEventListener('abort',cancel);}
 if(ownedOutput)writeJsonAtomic(path.join(ownedOutput,'complex-cohort-result.json'),summary);
 return {result:summary,expected};
}
