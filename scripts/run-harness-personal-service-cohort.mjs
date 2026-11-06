#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PERSONAL_ROOT,PERSONAL_NO_CREDIT,PERSONAL_FINAL_FILES,personalDigest,personalPolicyDigest,personalProducer,personalFiles,personalFile,personalJson,personalChildCommand,capturePersonalPrepared,validatePersonalInvocation,readPersonalCohort} from './lib/exui-personal-service-invocation-binding.mjs';
import {runCallbackUi} from './run-harness-recipient-callback-ui.mjs';
import {verifyCandidateArtifact,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {inspectNativeApiRuntime,inspectNativeBrowserRuntime} from './lib/exui-native-containers.mjs';
import {ccdImagePins,assertCcdImageIdentity,docker,verifyCcdContainerIdentity} from './lib/exui-ccd-runtime.mjs';
import {cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {cleanupNativeOwnership} from './lib/exui-native-ci-ownership.mjs';
import {inspectHostContainer,hostDocker} from './lib/exui-host-invocation.mjs';
import {terminateOwnedChild} from './lib/exui-candidate-runtime.mjs';
import {createFreshHarnessOutput} from './lib/exui-output-boundary.mjs';
import {writeJsonAtomic} from './lib/exui-evidence-io.mjs';
const fail='PERSONAL_SERVICE_COHORT';
// A fixed child only; never execute a command supplied by a packet or environment.
export async function executePersonalChild(command,{log,signal,signalTarget=process,launch=(file,args,options)=>spawn(file,args,options),terminate=terminateOwnedChild}={}) {
 assert.deepEqual(command,personalChildCommand(command.args?.[1],command.args?.[3]),fail);
 let child,cancelled=false,termination,rejectCancellation;
 const cancellationFailed=new Promise((_,reject)=>{rejectCancellation=reject;});
 const cancel=()=>{cancelled=true;if(child&&!termination){termination=terminate(child,{graceMs:30_000,killMs:2000});termination.catch(rejectCancellation);}};
 signalTarget.once('SIGINT',cancel);signalTarget.once('SIGTERM',cancel);signal?.addEventListener('abort',cancel,{once:true});
 try{
  if(signal?.aborted){cancelled=true;throw Error('PERSONAL_SERVICE_CHILD_CANCELLED');}
  child=launch(command.executable,[command.script,...command.args],{cwd:command.cwd,env:{HOME:os.homedir(),PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH,TMPDIR:fs.realpathSync(os.tmpdir())},stdio:['ignore',log,log]});
  if(cancelled)cancel();
  const terminal=await Promise.race([new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));}),cancellationFailed]);
  if(termination){const ended=await termination;assert(ended.observed,'PERSONAL_SERVICE_CHILD_UNOBSERVED');return {started:true,observed:true,forced:ended.forced,cancelled,...terminal};}
  return {started:true,observed:true,forced:false,cancelled,...terminal};
 }catch{
  const ended=child?await(termination??terminate(child,{graceMs:30_000,killMs:2000})):{started:false,observed:true,forced:false};assert(ended.observed,'PERSONAL_SERVICE_CHILD_UNOBSERVED');
  return {started:ended.started??true,observed:true,forced:ended.forced,cancelled,code:ended.code??null,signal:ended.signal??null};
 }
 finally{signalTarget.removeListener('SIGINT',cancel);signalTarget.removeListener('SIGTERM',cancel);signal?.removeEventListener('abort',cancel);}
}
export function cleanupUnlaunchedPersonal(prepared,{inspect=inspectHostContainer,cleanupCcd=cleanupCiCcd,removeWorkspace=dir=>fs.rmSync(dir,{recursive:true,force:true})}={}) {
 const {input,plan,privateWorkspace,handoff}=prepared;assert.equal(input.ccd.output,path.join(handoff.output,'runtime'),fail);
 for(const item of [plan.candidate,plan.tools])assert.equal(inspect(item.name),null,'PERSONAL_SERVICE_PREPARATION_RESOURCE');
 assert.deepEqual(personalJson(handoff.output,'runtime/runtime.json'),input.ccd,'PERSONAL_SERVICE_CCD_STATE_DRIFT');cleanupCcd(input.ccd.output);
 for(const [service,id]of Object.entries(input.ccd.containers)){assert.equal(inspect(id),null,'PERSONAL_SERVICE_RESOURCE_RESIDUE');assert.equal(inspect(input.ccd.owner+'-'+service),null,'PERSONAL_SERVICE_RESOURCE_RESIDUE');}
 assert.equal(path.dirname(privateWorkspace),fs.realpathSync(os.tmpdir()),fail);assert(/^exui-callback-native-[A-Za-z0-9]+$/.test(path.basename(privateWorkspace)),fail);assert.equal(fs.realpathSync(privateWorkspace),privateWorkspace,fail);removeWorkspace(privateWorkspace);assert(!fs.existsSync(privateWorkspace),'PERSONAL_SERVICE_PRIVATE_RESIDUE');
}
export async function cleanupPersonalInvocation(binding,terminal,{inspect=inspectHostContainer,remove=id=>hostDocker(['rm','-f','-v',id]),cleanupNative=cleanupNativeOwnership,cleanupCcd=cleanupCiCcd,exists=fs.existsSync,removeWorkspace=dir=>fs.rmSync(dir,{recursive:true,force:true})}={}) {
 assert(terminal?.observed===true,'PERSONAL_SERVICE_CLEANUP_UNOBSERVED');
 // Authority comes from the parent-held plan, never the child's registry.
 if([binding.plan.candidate,binding.plan.tools].some(resource=>inspect(resource.name)!==null))await cleanupNative({directory:binding.directory,owner:binding.runId,invocations:[{invocationId:'baseline',plan:{...binding.plan,candidate:{...binding.plan.candidate,launchProcess:binding.candidateProcess}}}]},{inspect,remove});
 for(const resource of [binding.plan.candidate,binding.plan.tools])assert.equal(inspect(resource.name),null,'PERSONAL_SERVICE_NATIVE_RESIDUE');
 const state=personalJson(binding.directory,'runtime/runtime.json');assert.deepEqual(state,binding.ccd,'PERSONAL_SERVICE_CCD_STATE_DRIFT');
 assert.equal(personalFile(binding.directory,'runtime/recovery.json').digest,binding.files['runtime/recovery.json'],'PERSONAL_SERVICE_CCD_RECOVERY_DRIFT');
 cleanupCcd(binding.ccd.output);
 const registry=fs.existsSync(path.join(binding.directory,'owned-resources.json'))?personalJson(binding.directory,'owned-resources.json'):[];
 const names=[...Object.keys(binding.ccd.containers).map(s=>binding.ccd.owner+'-'+s),binding.plan.tools.name,binding.plan.candidate.name];
 const cids=[...Object.values(binding.ccd.containers),...registry.map(r=>r.id).filter(Boolean)];
 for(const value of [...names,...cids])assert.equal(inspect(value),null,'PERSONAL_SERVICE_RESOURCE_RESIDUE');
 assert.equal(path.dirname(binding.privateWorkspace),fs.realpathSync(os.tmpdir()),fail);assert(/^exui-callback-native-[A-Za-z0-9]+$/.test(path.basename(binding.privateWorkspace)),fail);
 if(exists(binding.privateWorkspace)){assert.equal(fs.realpathSync(binding.privateWorkspace),binding.privateWorkspace,fail);removeWorkspace(binding.privateWorkspace);}assert(!exists(binding.privateWorkspace),'PERSONAL_SERVICE_PRIVATE_RESIDUE');
 return {schemaVersion:1,runId:binding.runId,bindingDigest:personalDigest(binding),afterObservedTerminal:true,names,cids,containersAbsent:true,privateWorkspace:binding.privateWorkspace,privateWorkspaceAbsent:true};
}
async function preflight(candidate,browser) {
 assert.equal(process.versions.node.split('.')[0],'24','PERSONAL_SERVICE_NODE24_REQUIRED');
 const producer=personalProducer(),artifact=await verifyCandidateArtifact(candidate),browserRoot=fs.realpathSync(browser),platform=artifact.provenance.platform;
 const dependencies=await verifyHarnessDependencies(path.join(PERSONAL_ROOT,'node_modules'),path.join(PERSONAL_ROOT,'package.json'),path.join(PERSONAL_ROOT,'yarn.lock'));
 const ccdImages=Object.fromEntries(Object.entries(ccdImagePins(platform)).map(([name,pin])=>{const info=JSON.parse(docker(['image','inspect',pin.reference]))[0];assertCcdImageIdentity(info,pin,platform);return [name,{id:info.Id,architecture:info.Architecture,repoDigests:info.RepoDigests}];}));
 return {schemaVersion:1,runId:'personal-'+randomUUID(),policyDigest:personalPolicyDigest(),producer,candidateManifest:candidate,candidateManifestDigest:personalFile(path.dirname(candidate),path.basename(candidate)).digest,artifact,browser:{root:browserRoot,digest:await digestCandidateTree(browserRoot),image:inspectNativeBrowserRuntime(platform)},dependencies,nativeRuntime:inspectNativeApiRuntime(platform),ccdImages,noCredit:PERSONAL_NO_CREDIT};
}
export async function runPersonalCohort({candidate,browser,output,signal,admissionContext}) {
 assert([candidate,browser,output].every(p=>typeof p==='string'&&path.isAbsolute(p)),fail);
 assert(!signal?.aborted,'PERSONAL_SERVICE_PARENT_CANCELLED');
 const startedAt=new Date().toISOString(),start=performance.now(),cohort=await preflight(candidate,browser);
 if(admissionContext){const {validatePersonalAdmissionContext,personalAdmissionDigest,personalCohortCompatibility}=await import('./lib/exui-personal-service-admission.mjs');cohort.admissionContext=structuredClone(validatePersonalAdmissionContext(admissionContext));cohort.admissionContractDigest=personalAdmissionDigest();assert.equal(personalCohortCompatibility(cohort.admissionContext,cohort).status,'included','PERSONAL_SERVICE_PREFLIGHT_INCOMPATIBLE');}
 assert(!signal?.aborted,'PERSONAL_SERVICE_PARENT_CANCELLED');
 output=createFreshHarnessOutput(output,[PERSONAL_ROOT,candidate,cohort.artifact.candidateRoot,cohort.browser.root,cohort.dependencies.root??path.join(PERSONAL_ROOT,'node_modules')]);
 writeJsonAtomic(path.join(output,'parent-input.json'),cohort);
 const expected={runId:cohort.runId,inputDigest:personalFile(output,'parent-input.json').digest,bindingDigest:personalDigest(cohort),producer:cohort.producer,artifact:cohort.artifact,invocations:{}};
 const pairCancellation=new AbortController();let cancelled=false;const cancel=()=>{cancelled=true;pairCancellation.abort();};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);signal?.addEventListener('abort',cancel,{once:true});
 try{
  for(const variant of ['baseline','optional']){
   assert(!cancelled&&!signal?.aborted,'PERSONAL_SERVICE_PARENT_CANCELLED');assert.deepEqual(personalProducer(),cohort.producer,fail);
   let prepared,binding,terminal,spawned=false,removed=false;
   try{
    prepared=await runCallbackUi({candidate,browser,output:path.join(output,variant),variant,scenario:'personal-service',preparePersonal:true,signal:pairCancellation.signal});
    assert(prepared?.input,'PERSONAL_SERVICE_PARENT_PREPARATION');binding=capturePersonalPrepared(prepared,cohort);verifyCcdContainerIdentity(binding.ccd);
    for(const resource of [binding.plan.candidate,binding.plan.tools])assert.equal(inspectHostContainer(resource.name),null,'PERSONAL_SERVICE_PARENT_NOT_FRESH');
    const name=variant+'-expected.json';writeJsonAtomic(path.join(output,name),{cohort,binding});fs.chmodSync(path.join(output,name),0o400);
    const bindingDigest=personalFile(output,name).digest,command=personalChildCommand(path.join(output,name),bindingDigest);
    writeJsonAtomic(path.join(output,variant+'-launch.json'),{runId:binding.runId,bindingDigest,command});
    const launchDigest=personalFile(output,variant+'-launch.json').digest;
    assert(!cancelled&&!signal?.aborted,'PERSONAL_SERVICE_PARENT_CANCELLED');const log=fs.openSync(path.join(output,variant+'.log'),'wx',0o600);
    try{spawned=true;terminal=await executePersonalChild(command,{log,signal:pairCancellation.signal});}finally{fs.closeSync(log);}
    writeJsonAtomic(path.join(output,variant+'-terminal.json'),terminal);
    assert.deepEqual(terminal,{started:true,observed:true,forced:false,cancelled:false,code:0,signal:null},'PERSONAL_SERVICE_PARENT_CHILD');
    assert.equal(personalFile(output,name).digest,bindingDigest,fail);assert.equal(personalFile(output,variant+'-launch.json').digest,launchDigest,fail);
    const completion={childTerminal:terminal,files:personalFiles(binding.directory,PERSONAL_FINAL_FILES)};
    validatePersonalInvocation(binding,cohort,completion);writeJsonAtomic(path.join(output,variant+'-completion.json'),completion);
    const removal=await cleanupPersonalInvocation(binding,terminal);removed=true;writeJsonAtomic(path.join(output,variant+'-removal.json'),removal);
    expected.invocations[variant]={bindingDigest,launchDigest,completionDigest:personalFile(output,variant+'-completion.json').digest,removalDigest:personalFile(output,variant+'-removal.json').digest,observedTerminal:terminal};
   }finally{
    // An unobserved child can still be using resources: never remove them.
    if(!spawned&&prepared?.input){cleanupUnlaunchedPersonal(prepared);writeJsonAtomic(path.join(output,variant+'-preparation-cleanup.json'),{childStarted:false,cleanupComplete:true,...PERSONAL_NO_CREDIT});}
    else if(binding&&!removed&&terminal?.observed){const cleanup=await cleanupPersonalInvocation(binding,terminal);writeJsonAtomic(path.join(output,variant+'-removal.json'),cleanup);}
   }
  }
  assert(!cancelled&&!signal?.aborted,'PERSONAL_SERVICE_PARENT_CANCELLED');assert.deepEqual(personalProducer(),cohort.producer,fail);assert.deepEqual(await verifyCandidateArtifact(candidate),cohort.artifact,fail);assert.equal(await digestCandidateTree(cohort.browser.root),cohort.browser.digest,fail);
  const result=readPersonalCohort(output,expected);writeJsonAtomic(path.join(output,'parent-expected.json'),expected);writeJsonAtomic(path.join(output,'personal-service-cohort.json'),result);
  writeJsonAtomic(path.join(output,'cohort-timing.json'),{startedAt,endedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-start),telemetryOnly:true});return {result,expected};
 }finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);signal?.removeEventListener('abort',cancel);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);try{const args=process.argv.slice(2);assert.deepEqual(args.filter((_,i)=>i%2===0),['--candidate','--browser','--output']);assert.equal(args.length,6);const {result}=await runPersonalCohort({candidate:args[1],browser:args[3],output:args[5]});console.log(JSON.stringify(result));}catch{console.error('PERSONAL_SERVICE_BOUND_COHORT_FAILED');process.exitCode=2;}
}
