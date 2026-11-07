import {validateMandatoryEmailAdmissionContext,readMandatoryEmailAdmissionInput,readMandatoryEmailRunContext} from './lib/exui-mandatory-email-event-contract.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {terminateOwnedChild} from './lib/exui-candidate-runtime.mjs';
import {mandatoryEmailChildCommand,mandatoryEmailDigest,mandatoryEmailProducer,mandatoryEmailFile,mandatoryEmailJson,MANDATORY_EMAIL_ROOT,MANDATORY_EMAIL_NO_CREDIT,validateMandatoryEmailCreation,captureMandatoryEmailBinding,replayMandatoryEmailInvocation} from './lib/exui-mandatory-email-event-invocation-binding.mjs';
import {verifyCandidateArtifact,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {inspectNativeApiRuntime,inspectNativeBrowserRuntime} from './lib/exui-native-containers.mjs';
import {ccdImagePins,assertCcdImageIdentity,docker} from './lib/exui-ccd-runtime.mjs';
import {inspectHostContainer} from './lib/exui-host-invocation.mjs';
import {createFreshHarnessRuntimeOutput} from './lib/exui-output-boundary.mjs';
import {writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {cleanupPersonalInvocation} from './run-harness-personal-service-cohort.mjs';
import {cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';

export function mandatoryEmailChildEnvironment(){return{HOME:os.homedir(),PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH,TMPDIR:fs.realpathSync(os.tmpdir())};}
// One owned IPC child and two finite barriers. Exit does not prove IPC/log handles closed.
export async function executeMandatoryEmailChild(command,{log,signal,onCreation,onPrepared,signalTarget=process,launch=spawn,terminate=terminateOwnedChild}={}){
  assert.deepEqual(command,mandatoryEmailChildCommand(command.args?.[1],command.args?.[3]),'MANDATORY_EMAIL_FIXED_CHILD');
  assert.equal(typeof onCreation,'function');assert.equal(typeof onPrepared,'function');
  let child,started=false,exited=false,exitCode,exitSignal,cancelled=false,termination,forced=false,protocol=0,protocolError=false,closeTimer;
  let resolveClose;const closed=new Promise(resolve=>{resolveClose=resolve;});
  const armClose=()=>{closeTimer??=setTimeout(()=>resolveClose({closed:false,code:null,signal:null}),2000);};
  const cancel=()=>{cancelled=true;if(child&&!termination){termination=terminate(child,{graceMs:30_000,killMs:2000});termination.then(result=>{forced=result.forced;armClose();},()=>{protocolError=true;armClose();});}};
  signalTarget.on('SIGINT',cancel);signalTarget.on('SIGTERM',cancel);signal?.addEventListener('abort',cancel,{once:true});
  let pending=Promise.resolve();
  try{
    if(signal?.aborted)return{started:false,observed:false,closed:false,forced:false,cancelled:true,code:null,signal:null,protocolComplete:false};
    try{child=launch(command.executable,[command.script,...command.args],{cwd:command.cwd,env:mandatoryEmailChildEnvironment(),stdio:['ignore',log,log,'ipc']});}
    catch{return{started:false,observed:false,closed:false,forced:false,cancelled:false,code:null,signal:null,protocolComplete:false};}
    child.once('spawn',()=>{started=true;if(cancelled)cancel();});
    child.once('error',()=>{protocolError=true;armClose();});
    child.once('exit',(code,childSignal)=>{exited=true;exitCode=code;exitSignal=childSignal;armClose();});
    child.once('close',(code,childSignal)=>{if(exited&&(code!==exitCode||childSignal!==exitSignal))protocolError=true;resolveClose({closed:true,code,signal:childSignal});});
    child.on('message',message=>{
      let snapshot;try{snapshot=structuredClone(message);}catch{protocolError=true;cancel();return;}
      pending=pending.then(async()=>{
        assert(!cancelled&&snapshot&&Object.keys(snapshot).sort().join()==='kind,packet','MANDATORY_EMAIL_IPC_MESSAGE');
        const kind=protocol===0?'mandatory-email-creation':protocol===1?'mandatory-email-prepared':null;
        assert(kind&&snapshot.kind===kind,'MANDATORY_EMAIL_IPC_ORDER');
        await(protocol===0?onCreation:onPrepared)(snapshot.packet);
        assert(!cancelled,'MANDATORY_EMAIL_IPC_CANCELLED');
        await new Promise((resolve,reject)=>child.send({kind:kind+'-ack',digest:mandatoryEmailDigest(snapshot.packet)},error=>error?reject(error):resolve()));
        protocol++;
      }).catch(()=>{protocolError=true;cancel();});
    });
    child.once('disconnect',()=>{if(protocol!==2){protocolError=true;cancel();}});
    const terminal=await closed;
    await pending;
    if(termination){try{const result=await termination;forced=result.forced;if(!result.observed)protocolError=true;}catch{protocolError=true;}}
    return{started,observed:exited,closed:terminal.closed,forced,cancelled,...terminal,protocolComplete:protocol===2&&!protocolError};
  }finally{
    clearTimeout(closeTimer);signalTarget.removeListener('SIGINT',cancel);signalTarget.removeListener('SIGTERM',cancel);signal?.removeEventListener('abort',cancel);
  }
}
const variants=['baseline','name-optional','address-optional'];
const successfulChild={started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null,protocolComplete:true};
const overlap=(a,b)=>a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep);
function privateJson(file,value,mode=0o600){writeJsonAtomic(file,value);fs.chmodSync(file,mode);}
export function assertMandatoryEmailAbsent(binding,registry,{inspect=inspectHostContainer,exists=fs.existsSync}={}){
  const names=[...Object.keys(binding.ccd.containers).map(service=>binding.ccd.owner+'-'+service),binding.plan.candidate.name,binding.plan.tools.name];
  const cids=[...Object.values(binding.ccd.containers),...registry.map(row=>row.id)];
  assert(cids.every(id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id))&&new Set(cids).size===cids.length,'MANDATORY_EMAIL_RESOURCE_IDS');
  assert.equal(new Set(names).size,names.length,'MANDATORY_EMAIL_RESOURCE_NAMES');
  for(const value of [...names,...cids])assert.equal(inspect(value),null,'MANDATORY_EMAIL_RESOURCE_RESIDUE_OR_UNKNOWN');
  assert(!exists(binding.privateWorkspace),'MANDATORY_EMAIL_PRIVATE_RESIDUE');
  return{names,cids,privateWorkspace:binding.privateWorkspace,afterObservedClose:true,containersAbsent:true,privateWorkspaceAbsent:true};
}
export async function reconcileMandatoryEmailFailure(active,{cleanupBinding=cleanupPersonalInvocation,cleanupCcd=cleanupCiCcd,inspect=inspectHostContainer}={}){
  assert(active?.terminal?.closed===true&&active.terminal.observed===true,'MANDATORY_EMAIL_FAILURE_CREATOR_UNJOINED');
  if(active.binding)return{status:'owned-binding-reconciled',removal:await cleanupBinding(active.binding,active.terminal)};
  assert(active.creation,'MANDATORY_EMAIL_FAILURE_OWNERSHIP_UNKNOWN');
  const {ccd,nativeNames}=active.creation;
  for(const name of nativeNames)assert.equal(inspect(name),null,'MANDATORY_EMAIL_UNACKNOWLEDGED_NATIVE_RESOURCE');
  const recovery=mandatoryEmailJson(ccd.output,'recovery.json');
  assert.deepEqual(recovery,{owner:ccd.owner,output:ccd.output,...(ccd.platform==='linux/arm64'?{}:{platform:ccd.platform}),resources:ccd.resources},'MANDATORY_EMAIL_FAILURE_RECOVERY_DRIFT');
  const attempts=fs.existsSync(path.join(ccd.output,'creation-attempts.json'))?mandatoryEmailJson(ccd.output,'creation-attempts.json'):[];
  assert(Array.isArray(attempts),'MANDATORY_EMAIL_FAILURE_CREATION_UNKNOWN');
  for(const row of attempts)assert(row.state==='settled'&&Object.hasOwn(ccd.resources,row.service)&&row.name===ccd.resources[row.service].name&&/^[a-f0-9]{64}$/.test(row.containerId),'MANDATORY_EMAIL_FAILURE_CREATION_UNCERTAIN');
  const cleanup=cleanupCcd(ccd.output);assert.equal(cleanup?.cleanupComplete,true,'MANDATORY_EMAIL_FAILURE_CCD_UNCERTAIN');
  for(const value of [...Object.values(ccd.resources).map(row=>row.name),...attempts.map(row=>row.containerId)])assert.equal(inspect(value),null,'MANDATORY_EMAIL_FAILURE_CCD_RESIDUE');
  return{status:'held-creation-reconciled',cleanup,nativeNamesAbsent:true,ccdNamesAndRecordedCidsAbsent:true};
}
export async function runMandatoryEmailSequence(suppliedCohort,{output,signal,execute=executeMandatoryEmailChild,producer=mandatoryEmailProducer,captureCreation=validateMandatoryEmailCreation,capturePrepared=captureMandatoryEmailBinding,replay=replayMandatoryEmailInvocation,inspect=inspectHostContainer,exists=fs.existsSync,reconcileFailure=reconcileMandatoryEmailFailure}={}){
  const cohort=structuredClone(suppliedCohort);
  if(Object.hasOwn(cohort,'admissionContext'))validateMandatoryEmailAdmissionContext(cohort.admissionContext);
  readMandatoryEmailRunContext(cohort);
  assert.deepEqual(cohort.noCredit,MANDATORY_EMAIL_NO_CREDIT,'MANDATORY_EMAIL_COHORT_CREDIT');
  const environment=mandatoryEmailChildEnvironment(),records=[],owners=new Set(),names=new Set(),ids=new Set(),workspaces=[];
  let cancelled=false,active;const cancellation=new AbortController(),cancel=()=>{cancelled=true;if(!cancellation.signal.aborted)cancellation.abort();};
  process.on('SIGINT',cancel);process.on('SIGTERM',cancel);signal?.addEventListener('abort',cancel,{once:true});
  try{
    for(const variant of variants){
      readMandatoryEmailRunContext(cohort);
      assert(!cancelled&&!signal?.aborted,'MANDATORY_EMAIL_COHORT_CANCELLED');assert.deepEqual(producer(),cohort.producer,'MANDATORY_EMAIL_COHORT_SOURCE');
      const directory=path.join(output,variant),requestFile=path.join(output,variant+'-expected.json');
      active={variant,directory};
      const request={schemaVersion:1,cohort,variant,directory,environment};privateJson(requestFile,request,0o400);
      const requestDigest=mandatoryEmailFile(output,path.basename(requestFile)).digest,command=mandatoryEmailChildCommand(requestFile,requestDigest);
      const launch={command,environment,requestDigest,source:cohort.producer,candidate:cohort.artifact,browser:cohort.browser,dependencies:cohort.dependencies};
      const launchFile=variant+'-launch.json';privateJson(path.join(output,launchFile),launch,0o400);const launchDigest=mandatoryEmailFile(output,launchFile).digest;
      let creation,binding;const log=fs.openSync(path.join(output,variant+'.log'),'wx',0o600);
      let terminal;
      try{
        assert.deepEqual(mandatoryEmailChildEnvironment(),environment,'MANDATORY_EMAIL_CHILD_ENVIRONMENT_DRIFT');
        terminal=await execute(command,{log,signal:cancellation.signal,onCreation:async packet=>{
          assert(!cancelled&&!signal?.aborted,'MANDATORY_EMAIL_COHORT_CANCELLED');assert.deepEqual(producer(),cohort.producer,'MANDATORY_EMAIL_COHORT_SOURCE');
          creation=captureCreation(packet,cohort,directory,variant,{inspect});
          active.creation=creation;
          for(const owner of [creation.runId,creation.ccd.owner]){assert(!owners.has(owner),'MANDATORY_EMAIL_OWNER_REUSE');owners.add(owner);}
          for(const name of [...Object.values(creation.ccd.resources).map(r=>r.name),...creation.nativeNames]){assert(!names.has(name),'MANDATORY_EMAIL_NAME_REUSE');names.add(name);}
          privateJson(path.join(output,variant+'-creation.json'),creation,0o400);
        },onPrepared:async packet=>{
          assert(creation&&!cancelled&&!signal?.aborted,'MANDATORY_EMAIL_PREPARED_WITHOUT_CREATION');
          binding=capturePrepared(packet,cohort,creation,{inspect});
          active.binding=binding;
          assert(!overlap(binding.privateWorkspace,output)&&workspaces.every(previous=>!overlap(binding.privateWorkspace,previous)),'MANDATORY_EMAIL_WORKSPACE_REUSE');
          workspaces.push(binding.privateWorkspace);privateJson(path.join(output,variant+'-binding.json'),binding,0o400);
        }});
      }finally{fs.closeSync(log);}
      active.terminal=terminal;
      privateJson(path.join(output,variant+'-terminal.json'),terminal);
      assert.deepEqual(terminal,successfulChild,'MANDATORY_EMAIL_COHORT_CHILD_NOT_CLOSED');
      assert(creation&&binding,'MANDATORY_EMAIL_COHORT_MISSING_HOLDS');
      assert(!cancelled&&!signal?.aborted,'MANDATORY_EMAIL_COHORT_CANCELLED');
      assert.equal(mandatoryEmailFile(output,path.basename(requestFile)).digest,requestDigest,'MANDATORY_EMAIL_PARENT_REQUEST_DRIFT');assert.equal(mandatoryEmailFile(output,launchFile).digest,launchDigest,'MANDATORY_EMAIL_PARENT_LAUNCH_DRIFT');
      const completion=replay(binding,cohort,terminal,requestDigest);
      assert.deepEqual(completion.frameworkTerminal,{code:variant==='baseline'?0:1,signal:null},'MANDATORY_EMAIL_FRAMEWORK_TERMINAL');
      assert.deepEqual([completion.result.baselineProofs,completion.result.effectiveFaults],[variant==='baseline'?2:0,variant==='baseline'?0:1],'MANDATORY_EMAIL_OBSERVED_PROOF_COUNTS');
      const closure=assertMandatoryEmailAbsent(binding,completion.registry,{inspect,exists});
      for(const id of closure.cids){assert(!ids.has(id),'MANDATORY_EMAIL_CID_REUSE');ids.add(id);}
      privateJson(path.join(output,variant+'-completion.json'),completion);privateJson(path.join(output,variant+'-absence.json'),closure);
      const files=[variant+'-expected.json',launchFile,variant+'-creation.json',variant+'-binding.json',variant+'-terminal.json',variant+'-completion.json',variant+'-absence.json'];
      records.push({variant,baselineProofs:completion.result.baselineProofs,effectiveFaults:completion.result.effectiveFaults,files:Object.fromEntries(files.map(name=>[name,mandatoryEmailFile(output,name).digest]))});
      active=undefined;
    }
    assert(!cancelled&&!signal?.aborted,'MANDATORY_EMAIL_COHORT_CANCELLED');assert.deepEqual(producer(),cohort.producer,'MANDATORY_EMAIL_COHORT_SOURCE');
    readMandatoryEmailRunContext(cohort);
    for(const record of records){
      for(const [name,digest]of Object.entries(record.files))assert.equal(mandatoryEmailFile(output,name).digest,digest,'MANDATORY_EMAIL_LATE_PARENT_DRIFT');
      const binding=mandatoryEmailJson(output,record.variant+'-binding.json'),terminal=mandatoryEmailJson(output,record.variant+'-terminal.json');
      const observed=replay(binding,cohort,terminal,record.files[record.variant+'-expected.json']);assert.deepEqual(observed,mandatoryEmailJson(output,record.variant+'-completion.json'),'MANDATORY_EMAIL_LATE_REPLAY_DRIFT');
      assert.deepEqual(assertMandatoryEmailAbsent(binding,observed.registry,{inspect,exists}),mandatoryEmailJson(output,record.variant+'-absence.json'),'MANDATORY_EMAIL_LATE_ABSENCE_DRIFT');
    }
    readMandatoryEmailRunContext(cohort);
    return{schemaVersion:1,kind:'mandatory-email-three-invocation-cohort',status:'observed-three-invocation-cohort',records,baselineProofs:records.reduce((sum,row)=>sum+row.baselineProofs,0),effectiveFaults:records.reduce((sum,row)=>sum+row.effectiveFaults,0),...MANDATORY_EMAIL_NO_CREDIT};
  }catch(error){let reconciliation={status:'unproved-no-cleanup-authority'};
    if(active?.terminal?.closed&&active.terminal.observed){try{reconciliation=await reconcileFailure(active,{inspect});}catch{reconciliation={status:'owned-cleanup-uncertain'};}}
    const first=typeof error?.message==='string'?error.message.split('\n',1)[0]:'';
    privateJson(path.join(output,'cohort-failure.json'),{kind:'mandatory-email-cohort-failure',cancelled:cancelled||Boolean(signal?.aborted),completed:records.map(row=>row.variant),stage:active?.variant??'final-replay',code:/^MANDATORY_EMAIL_[A-Z_]+$/.test(first)?first:'MANDATORY_EMAIL_COHORT_FAILED',reconciliation,...MANDATORY_EMAIL_NO_CREDIT});throw error;}
  finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);signal?.removeEventListener('abort',cancel);}
}
export async function runMandatoryEmailCohort({candidate,browser,output,signal,admissionInput}){
  const held=admissionInput===undefined?undefined:structuredClone(admissionInput);
  const supplied=held===undefined?undefined:readMandatoryEmailAdmissionInput(held);
  if(supplied){assert.equal(supplied.candidateManifest,candidate,'MANDATORY_EMAIL_ADMISSION_CANDIDATE');assert.equal(supplied.browserRoot,fs.realpathSync(browser),'MANDATORY_EMAIL_ADMISSION_BROWSER');}
  assert.equal(process.versions.node.split('.')[0],'24','MANDATORY_EMAIL_NODE24_REQUIRED');assert([candidate,browser,output].every(value=>typeof value==='string'&&path.isAbsolute(value)),'MANDATORY_EMAIL_COHORT_PATHS');assert(!signal?.aborted,'MANDATORY_EMAIL_COHORT_CANCELLED');
  const producer=mandatoryEmailProducer(),artifact=await verifyCandidateArtifact(candidate),browserRoot=fs.realpathSync(browser),platform=artifact.provenance.platform;
  const dependencies=await verifyHarnessDependencies(path.join(MANDATORY_EMAIL_ROOT,'node_modules'),path.join(MANDATORY_EMAIL_ROOT,'package.json'),path.join(MANDATORY_EMAIL_ROOT,'yarn.lock'));
  const ccdImages=Object.fromEntries(Object.entries(ccdImagePins(platform)).map(([service,pin])=>{const info=JSON.parse(docker(['image','inspect',pin.reference]))[0];assertCcdImageIdentity(info,pin,platform);return[service,{id:info.Id,architecture:info.Architecture,repoDigests:info.RepoDigests}];}));
  const cohort={schemaVersion:1,runId:'mandatory-email-'+randomUUID(),producer,candidateManifest:candidate,candidateManifestDigest:mandatoryEmailFile(path.dirname(candidate),path.basename(candidate)).digest,artifact,browser:{root:browserRoot,digest:await digestCandidateTree(browserRoot),image:inspectNativeBrowserRuntime(platform)},dependencies,nativeRuntime:inspectNativeApiRuntime(platform),ccdImages,noCredit:MANDATORY_EMAIL_NO_CREDIT,...(supplied?{admissionContext:supplied.context,admissionInput:held}:{})};
  readMandatoryEmailRunContext(cohort);
  assert(!signal?.aborted,'MANDATORY_EMAIL_COHORT_CANCELLED');
  output=createFreshHarnessRuntimeOutput(output,MANDATORY_EMAIL_ROOT,[candidate,artifact.candidateRoot,browserRoot,dependencies.root??path.join(MANDATORY_EMAIL_ROOT,'node_modules')]);
  privateJson(path.join(output,'parent-input.json'),cohort,0o400);const inputDigest=mandatoryEmailFile(output,'parent-input.json').digest;
  const result=await runMandatoryEmailSequence(cohort,{output,signal});
  assert.equal(mandatoryEmailFile(output,'parent-input.json').digest,inputDigest,'MANDATORY_EMAIL_PARENT_INPUT_DRIFT');assert.deepEqual(await verifyCandidateArtifact(candidate),artifact,'MANDATORY_EMAIL_FINAL_CANDIDATE_DRIFT');assert.equal(await digestCandidateTree(browserRoot),cohort.browser.digest,'MANDATORY_EMAIL_FINAL_BROWSER_DRIFT');
  assert.deepEqual(await verifyHarnessDependencies(path.join(MANDATORY_EMAIL_ROOT,'node_modules'),path.join(MANDATORY_EMAIL_ROOT,'package.json'),path.join(MANDATORY_EMAIL_ROOT,'yarn.lock')),dependencies,'MANDATORY_EMAIL_FINAL_DEPENDENCY_DRIFT');assert.deepEqual(mandatoryEmailProducer(),producer,'MANDATORY_EMAIL_FINAL_SOURCE_DRIFT');
  readMandatoryEmailRunContext(cohort);
  privateJson(path.join(output,'mandatory-email-cohort.json'),{cohortDigest:mandatoryEmailDigest(cohort),inputDigest,...result});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.umask(0o077);try{const args=process.argv.slice(2);assert([6,10].includes(args.length));assert.deepEqual(args.filter((_,index)=>index%2===0),args.length===6?['--candidate','--browser','--output']:['--candidate','--browser','--output','--admission-input','--digest']);const result=await runMandatoryEmailCohort({candidate:args[1],browser:args[3],output:args[5],...(args.length===10?{admissionInput:{path:args[7],digest:args[9]}}:{})});console.log(JSON.stringify(result));}catch{console.error('MANDATORY_EMAIL_BOUND_COHORT_FAILED');process.exitCode=2;}
}
