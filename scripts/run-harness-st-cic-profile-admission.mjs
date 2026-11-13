#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareStCicProfileBinding} from './run-harness-st-cic-profile.mjs';
import {stCicProducerBinding,readStCicCohort} from './lib/exui-st-cic-profile-cohort.mjs';
import {ST_CIC_PROFILE_FACETS} from './lib/exui-st-cic-profile-contract.mjs';
import {admitStCicProfile,stCicAdmissionPins,readStCicAdmissionFile,validateStCicAdmissionContext,verifyStCicAdmissionContextBinding,readStCicAdmissionContext} from './lib/exui-st-cic-profile-admission.mjs';
import {createFreshHarnessOutput} from './lib/exui-output-boundary.mjs';
import {verifyCandidateArtifact} from './lib/exui-candidate-artifact.mjs';
import {terminateOwnedChild} from './lib/exui-candidate-runtime.mjs';
import {inspectHostContainer} from './lib/exui-host-invocation.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
export function stCicControllerCommand({artifactPath,browserRoot,output}){
 return {executable:process.execPath,cwd:root,script:path.join(root,'scripts/run-harness-st-cic-profile.mjs'),args:['--artifact',artifactPath,'--browser-root',browserRoot,'--output',path.join(output,'cohort'),'--expected-input',path.join(output,'expected-input.json')],environmentKeys:['HOME','PATH','TMPDIR']};
}
// Fixed producer only. Cancellation waits for this child before touching its owned resources.
export async function executeStCicController(command,{log,signal,signalTarget=process,launch=(file,args,options)=>spawn(file,args,options),terminate=terminateOwnedChild}={}){
 assert(Array.isArray(command?.args)&&command.args.length===8,'ST_CIC_CONTROLLER_COMMAND');
 for(const index of [1,3,5,7])assert(typeof command.args[index]==='string'&&path.isAbsolute(command.args[index]),'ST_CIC_CONTROLLER_COMMAND');
 assert.deepEqual(command,stCicControllerCommand({artifactPath:command.args[1],browserRoot:command.args[3],output:path.dirname(command.args[5])}),'ST_CIC_CONTROLLER_COMMAND');
 let child,cancelled=false,closed=false,terminal,termination,rejectCancellation;
 const cancellationFailed=new Promise((_,reject)=>{rejectCancellation=reject;});
 const terminateOnce=()=>termination??=Promise.resolve().then(()=>terminate(child,{graceMs:30000,killMs:2000}));
 const cancel=()=>{cancelled=true;if(child&&!closed)terminateOnce().catch(rejectCancellation);};
 signalTarget.on('SIGINT',cancel);signalTarget.on('SIGTERM',cancel);signal?.addEventListener('abort',cancel,{once:true});
 try{
  await new Promise(resolve=>setImmediate(resolve));
  assert(!cancelled&&!signal?.aborted,'ST_CIC_CONTROLLER_CANCELLED');
  child=launch(command.executable,[command.script,...command.args],{cwd:command.cwd,env:{HOME:os.homedir(),PATH:process.env.PATH,TMPDIR:fs.realpathSync(os.tmpdir())},stdio:['ignore',log,log]});
  child.once('close',()=>{closed=true;});
  if(cancelled)cancel();
  terminal=await Promise.race([new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));}),cancellationFailed]);
  if(termination){const ended=await termination;assert(ended.observed,'ST_CIC_CONTROLLER_UNOBSERVED');return {started:true,observed:true,forced:ended.forced,cancelled,...terminal};}
  return {started:true,observed:true,forced:false,cancelled,...terminal};
 }catch(error){
  if(child&&!closed){const ended=await terminateOnce();assert(ended.observed,'ST_CIC_CONTROLLER_UNOBSERVED');}
  throw error;
 }finally{const remove=()=>{signalTarget.removeListener('SIGINT',cancel);signalTarget.removeListener('SIGTERM',cancel);signal?.removeEventListener('abort',cancel);};if(child&&!closed)child.once('close',remove);else remove();}
}
function facetNames(binding,facet){const definition=ST_CIC_PROFILE_FACETS.find(item=>item.facet===facet);return ['baseline',definition.fault].flatMap(id=>['candidate','tools'].map(role=>`${binding.owners[facet]}-${id}-${role}`));}
function assertFreshOwners(binding){const observations=[];for(const {facet} of ST_CIC_PROFILE_FACETS)for(const name of facetNames(binding,facet)){assert.equal(inspectHostContainer(name),null,'ST_CIC_ADMISSION_OWNER_NOT_FRESH');observations.push({name,absent:true});}return observations;}
export function stCicRemovalObservations(output,binding,inspect=inspectHostContainer){
 const observations=[];
 for(const {facet} of ST_CIC_PROFILE_FACETS){
  const rows=readStCicAdmissionFile(path.join(output,'cohort',facet,'owned-resources.json')).value,names=facetNames(binding,facet);
  assert(Array.isArray(rows)&&rows.length===4,'ST_CIC_ADMISSION_RESOURCE');
  assert.deepEqual(rows.map(r=>r.name).sort(),names.slice().sort(),'ST_CIC_ADMISSION_RESOURCE');
  for(const name of names){const r=rows.find(row=>row.name===name);assert(r.kind==='container'&&r.owner===binding.owners[facet]&&r.removed===true&&/^[a-f0-9]{64}$/.test(r.id),'ST_CIC_ADMISSION_RESOURCE');observations.push({name,id:r.id,owner:r.owner});}
 }
 assert.equal(new Set(observations.map(r=>r.id)).size,20,'ST_CIC_ADMISSION_RESOURCE');return observations.map(row=>{assert.equal(inspect(row.id),null,'ST_CIC_ADMISSION_RESOURCE_PRESENT');assert.equal(inspect(row.name),null,'ST_CIC_ADMISSION_RESOURCE_PRESENT');return {...row,absent:true};});
}
export async function runStCicProfileAdmission({artifactPath,browserRoot,output,signal,admissionContext}){
 const context=admissionContext===undefined?undefined:validateStCicAdmissionContext(admissionContext);
 assert(!signal?.aborted,'ST_CIC_ADMISSION_CANCELLED');
 assert([artifactPath,browserRoot,output].every(value=>typeof value==='string'&&path.isAbsolute(value)),'ST_CIC_ADMISSION_INPUT');
 const binding=await prepareStCicProfileBinding({artifactPath,browserRoot,signal});assert(!signal?.aborted,'ST_CIC_ADMISSION_CANCELLED');if(context)verifyStCicAdmissionContextBinding(context,binding);assertFreshOwners(binding);
 output=createFreshHarnessOutput(output,[root,artifactPath,binding.artifact.candidateRoot,binding.browser.root,binding.browser.dependenciesRoot]);
 const runId='st-cic-'+randomUUID(),input={schemaVersion:1,runId,binding},inputBytes=JSON.stringify(input,null,2)+'\n',inputDigest=digestBytes(inputBytes),command=stCicControllerCommand({artifactPath,browserRoot:binding.browser.root,output});
 fs.writeFileSync(path.join(output,'expected-input.json'),inputBytes,{mode:0o444,flag:'wx'});
 const contextBytes=context?JSON.stringify({schemaVersion:1,kind:'st-cic-parent-context',runId,inputDigest,context},null,2)+'\n':undefined,contextPin=contextBytes===undefined?{}:{admissionContextDigest:digestBytes(contextBytes)};
 if(contextBytes!==undefined)fs.writeFileSync(path.join(output,'native-admission-context.json'),contextBytes,{mode:0o444,flag:'wx'});
 writeJsonAtomic(path.join(output,'independent-controller-launch.json'),{schemaVersion:1,runId,inputDigest,producer:binding.producer,command,...contextPin});
 const launchDigest=digestBytes(fs.readFileSync(path.join(output,'independent-controller-launch.json')));
 assert.deepEqual(stCicProducerBinding(),binding.producer,'ST_CIC_ADMISSION_PRODUCER');
 const log=fs.openSync(path.join(output,'controller.log'),'wx',0o600);
 try{
  readStCicAdmissionContext(output,{runId,inputDigest,...contextPin},binding);
  assert(!signal?.aborted,'ST_CIC_ADMISSION_CANCELLED');const terminal=await executeStCicController(command,{log,signal});
  writeJsonAtomic(path.join(output,'independent-controller-terminal.json'),{schemaVersion:1,runId,inputDigest,...terminal});
  assert(!signal?.aborted,'ST_CIC_ADMISSION_CANCELLED');
  assert.deepEqual(terminal,{started:true,observed:true,forced:false,cancelled:false,code:0,signal:null},'ST_CIC_ADMISSION_CONTROLLER');
  assert.equal(fs.readFileSync(path.join(output,'expected-input.json'),'utf8'),inputBytes,'ST_CIC_ADMISSION_INPUT_DRIFT');
  const replayedContext=readStCicAdmissionContext(output,{runId,inputDigest,...contextPin},binding);assert.deepEqual(replayedContext,context,'ST_CIC_ADMISSION_CONTEXT_DRIFT');
  assert.deepEqual(stCicProducerBinding(),binding.producer,'ST_CIC_ADMISSION_PRODUCER');assert.deepEqual(await verifyCandidateArtifact(artifactPath),binding.artifact,'ST_CIC_ADMISSION_CANDIDATE');
  const raw=readStCicCohort(path.join(output,'cohort'),binding);assert.deepEqual(readStCicAdmissionFile(path.join(output,'cohort/st-cic-profile-cohort.json')).value,raw,'ST_CIC_ADMISSION_COHORT_DRIFT');
  writeJsonAtomic(path.join(output,'independent-controller-cleanup.json'),{schemaVersion:1,runId,inputDigest,observedAfterController:true,containers:stCicRemovalObservations(output,binding)});
  const expected=stCicAdmissionPins(output);assert.equal(expected.admissionContextDigest,contextPin.admissionContextDigest,'ST_CIC_ADMISSION_CONTEXT_DRIFT');assert.equal(expected.launchDigest,launchDigest,'ST_CIC_ADMISSION_LAUNCH_DRIFT');assert.equal(expected.inputDigest,inputDigest,'ST_CIC_ADMISSION_INPUT_DRIFT');assert.equal(expected.bindingDigest,digestBytes(JSON.stringify(binding)),'ST_CIC_ADMISSION_INPUT_DRIFT');
  const result=admitStCicProfile(output,expected);
  assert(!signal?.aborted,'ST_CIC_ADMISSION_CANCELLED');stCicRemovalObservations(output,binding);
  writeJsonAtomic(path.join(output,'st-cic-profile-admission.json'),result);
  const requestPath=path.join(output,'admission-request.json');writeJsonAtomic(requestPath,{schemaVersion:1,kind:'st-cic-profile-admission-request',directory:output,expected});
  return {...result,reportRequest:{path:requestPath,digest:digestBytes(fs.readFileSync(requestPath)),runId}};
 }finally{fs.closeSync(log);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);
 try{const args=process.argv.slice(2);assert.deepEqual(args.filter((_,i)=>i%2===0),['--artifact','--browser-root','--output']);assert.equal(args.length,6);const result=await runStCicProfileAdmission({artifactPath:args[1],browserRoot:args[3],output:args[5]});console.log(JSON.stringify({status:result.status,obligationId:result.obligationId,receiptDigest:result.receiptDigest,releaseApproval:false}));}
 catch{console.error('ST_CIC_PROFILE_ADMISSION_FAILED');process.exitCode=2;}
}
