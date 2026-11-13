import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {digestBytes} from './lib/exui-evidence-io.mjs';
import {verifyCandidateArtifact} from './lib/exui-candidate-artifact.mjs';
import {terminateOwnedChild} from './lib/exui-candidate-runtime.mjs';
import {createFreshHarnessRuntimeOutput} from './lib/exui-output-boundary.mjs';
import {divorceCandidateContent} from './lib/exui-divorce-native-binding.mjs';
import {mandatoryEmailProducer,MANDATORY_EMAIL_ROOT,readMandatoryEmailCohort} from './lib/exui-mandatory-email-event-invocation-binding.mjs';
import {mandatoryEmailSerialized,mandatoryEmailReadFile,validateMandatoryEmailAdmissionContext,readMandatoryEmailAdmissionInput} from './lib/exui-mandatory-email-event-contract.mjs';
import {mandatoryEmailControllerCommand,mandatoryEmailCohortPins,mandatoryEmailAdmissionPins,readMandatoryEmailAdmissionPacket} from './lib/exui-mandatory-email-event-admission.mjs';
import {assertMandatoryEmailAbsent,reconcileMandatoryEmailFailure} from './run-harness-mandatory-email-event-cohort.mjs';
const save=(file,value,mode=0o400)=>fs.writeFileSync(file,mandatoryEmailSerialized(value),{mode,flag:'wx'});
export async function executeMandatoryEmailController(command,{log,signal,signalTarget=process,launch=spawn,terminate=terminateOwnedChild}={}){
 assert.deepEqual(command,mandatoryEmailControllerCommand({candidate:command.args?.[1],browser:command.args?.[3],output:path.dirname(command.args?.[5]??''),inputDigest:command.args?.[9]}),'MANDATORY_EMAIL_CONTROLLER_COMMAND');
 let child,started=false,observed=false,closed=false,cancelled=false,forced=false,termination,timer,exitCode,exitSignal,protocolError=false,resolve;
 const completion=new Promise(r=>{resolve=r;});
 const arm=()=>{timer??=setTimeout(()=>resolve({closed:false,code:null,signal:null}),2000);};
 const cancel=()=>{cancelled=true;if(child&&!termination){termination=terminate(child,{graceMs:30_000,killMs:2000});termination.then(value=>{forced=value.forced;arm();},()=>{protocolError=true;arm();});}};
 signalTarget.on('SIGINT',cancel);signalTarget.on('SIGTERM',cancel);signal?.addEventListener('abort',cancel,{once:true});
 try{
  assert(!signal?.aborted,'MANDATORY_EMAIL_ADMISSION_CANCELLED');
  try{child=launch(command.executable,[command.script,...command.args],{cwd:command.cwd,env:{HOME:os.homedir(),PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH,TMPDIR:fs.realpathSync(os.tmpdir())},stdio:['ignore',log,log]});}catch{return{started:false,observed:false,closed:false,forced:false,cancelled:false,code:null,signal:null};}
  child.once('spawn',()=>{started=true;if(cancelled)cancel();});child.once('error',()=>{protocolError=true;cancel();arm();});
  child.once('exit',(code,value)=>{observed=true;exitCode=code;exitSignal=value;arm();});
  child.once('close',(code,value)=>{closed=true;if(observed&&(code!==exitCode||value!==exitSignal))protocolError=true;resolve({closed:true,code,signal:value});});
  if(signal?.aborted)cancel();const terminal=await completion;
  if(termination){try{const actual=await termination;forced=actual.forced;if(!actual.observed)protocolError=true;}catch{protocolError=true;}}
  return{started,observed:observed&&!protocolError,closed:closed&&terminal.closed,forced,cancelled,code:terminal.code,signal:terminal.signal};
 }finally{clearTimeout(timer);signalTarget.removeListener('SIGINT',cancel);signalTarget.removeListener('SIGTERM',cancel);signal?.removeEventListener('abort',cancel);}
}
async function reconcileClosedFailure(directory){
 const results=[];
 for(const variant of ['baseline','name-optional','address-optional']){
  const creation=path.join(directory,variant+'-creation.json'),binding=path.join(directory,variant+'-binding.json'),terminal=path.join(directory,variant+'-terminal.json');
  if(!fs.existsSync(creation)&&!fs.existsSync(binding))continue;
  assert(fs.existsSync(terminal),'MANDATORY_EMAIL_CONTROLLER_INNER_CREATOR_UNKNOWN');const actual=mandatoryEmailReadFile(terminal).value;assert(actual.closed===true&&actual.observed===true,'MANDATORY_EMAIL_CONTROLLER_INNER_CREATOR_UNKNOWN');
  results.push(await reconcileMandatoryEmailFailure({terminal:actual,...(fs.existsSync(binding)?{binding:mandatoryEmailReadFile(binding).value}:{creation:mandatoryEmailReadFile(creation).value})}));
 }
 return results;
}
export async function runMandatoryEmailAdmission({candidate,browser,output,admissionContext,signal}){
 // This wrapper is the joint route. Standalone callers use the unchanged optional-context R2 entrypoint.
 const context=validateMandatoryEmailAdmissionContext(admissionContext);
 assert(!signal?.aborted,'MANDATORY_EMAIL_ADMISSION_CANCELLED');
 const artifact=await verifyCandidateArtifact(candidate);assert.deepEqual(divorceCandidateContent(artifact),context.native.candidate,'MANDATORY_EMAIL_ADMISSION_CANDIDATE');assert(!signal?.aborted,'MANDATORY_EMAIL_ADMISSION_CANCELLED');
 const browserRoot=fs.realpathSync(browser),dependencyRoot=fs.realpathSync(path.join(MANDATORY_EMAIL_ROOT,'node_modules'));
 output=createFreshHarnessRuntimeOutput(output,MANDATORY_EMAIL_ROOT,[candidate,artifact.candidateRoot,browserRoot,dependencyRoot]);
 const runId='mandatory-admission-'+randomUUID(),input={schemaVersion:1,kind:'mandatory-email-admission-input',runId,context,candidateManifest:candidate,browserRoot},inputFile=path.join(output,'expected-input.json');save(inputFile,input);
 const inputDigest=mandatoryEmailReadFile(inputFile).digest,command=mandatoryEmailControllerCommand({candidate,browser:browserRoot,output,inputDigest}),producer=mandatoryEmailProducer();assert.equal(producer.commit,context.native.producer.commit,'MANDATORY_EMAIL_ADMISSION_PRODUCER');assert.deepEqual(Object.fromEntries(producer.files),context.native.producer.files,'MANDATORY_EMAIL_ADMISSION_PRODUCER');
 const launch={schemaVersion:1,runId,inputDigest,producer:context.native.producer,command,contextDigest:digestBytes(JSON.stringify(context))};save(path.join(output,'independent-controller-launch.json'),launch);const launchDigest=mandatoryEmailReadFile(path.join(output,'independent-controller-launch.json')).digest;
 const log=fs.openSync(path.join(output,'controller.log'),'wx',0o600);let terminal;
 try{
  readMandatoryEmailAdmissionInput({path:inputFile,digest:inputDigest});terminal=await executeMandatoryEmailController(command,{log,signal});save(path.join(output,'independent-controller-terminal.json'),{schemaVersion:1,runId,inputDigest,...terminal});
  assert.deepEqual(terminal,{started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null},'MANDATORY_EMAIL_CONTROLLER_NOT_CLOSED_SUCCESSFULLY');assert(!signal?.aborted,'MANDATORY_EMAIL_ADMISSION_CANCELLED');
  assert.equal(mandatoryEmailReadFile(path.join(output,'independent-controller-launch.json')).digest,launchDigest,'MANDATORY_EMAIL_LAUNCH_DRIFT');readMandatoryEmailAdmissionInput({path:inputFile,digest:inputDigest});assert.deepEqual(mandatoryEmailProducer(),producer,'MANDATORY_EMAIL_ADMISSION_SOURCE_DRIFT');
  const cohortDirectory=path.join(output,'cohort'),held=mandatoryEmailCohortPins(cohortDirectory),raw=readMandatoryEmailCohort(cohortDirectory,held),variants=raw.packets.map(packet=>({variant:packet.variant,...assertMandatoryEmailAbsent(packet.binding,packet.completion.registry)}));
  save(path.join(output,'independent-controller-cleanup.json'),{schemaVersion:1,runId,inputDigest,observedAfterControllerClose:true,variants});
  const expected=mandatoryEmailAdmissionPins(output),requestFile=path.join(output,'admission-request.json');save(requestFile,{schemaVersion:1,kind:'mandatory-email-admission-request',directory:output,expected});
  const request={runId,digest:mandatoryEmailReadFile(requestFile).digest};const packet=readMandatoryEmailAdmissionPacket(requestFile,request);
  return{admission:packet.admission,reportRequest:{path:requestFile,...request}};
 }catch(error){
  let cleanup='unproven';if(terminal?.observed&&terminal.closed&&!terminal.forced){try{await reconcileClosedFailure(path.join(output,'cohort'));cleanup='known-owned-reconciled';}catch{/* Unknown creators cannot be promoted or guessed absent. */}}
  save(path.join(output,'admission-failure.json'),{status:'blocked',cleanup,controllerObserved:terminal?.observed===true,controllerClosed:terminal?.closed===true,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false});throw error;
 }finally{fs.closeSync(log);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);try{const args=process.argv.slice(2);assert.deepEqual(args.filter((_,index)=>index%2===0),['--candidate','--browser','--output','--context']);assert.equal(args.length,8);const result=await runMandatoryEmailAdmission({candidate:args[1],browser:args[3],output:args[5],admissionContext:mandatoryEmailReadFile(args[7]).value});console.log(JSON.stringify({status:result.admission.status,runId:result.admission.runId,obligationIds:result.admission.obligationIds,contractDigest:result.admission.contractDigest}));}catch{console.error('MANDATORY_EMAIL_ADMISSION_REJECTED');process.exitCode=2;}
}
