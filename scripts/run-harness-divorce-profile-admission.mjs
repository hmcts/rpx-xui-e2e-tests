#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareDivorceProfileBinding} from './run-harness-divorce-profile.mjs';
import {divorceProducerBinding,startDivorceClock,finishDivorceClock} from './lib/exui-divorce-profile-cohort.mjs';
import {DIVORCE_PROFILE_FACETS} from './lib/exui-divorce-profile-contract.mjs';
import {admitDivorceProfile,divorceAdmissionPins,readDivorceProfileTiming} from './lib/exui-divorce-profile-admission.mjs';
import {createFreshHarnessOutput} from './lib/exui-output-boundary.mjs';
import {verifyCandidateArtifact} from './lib/exui-candidate-artifact.mjs';
import {terminateOwnedChild} from './lib/exui-candidate-runtime.mjs';
import {inspectHostContainer,removeHostResource} from './lib/exui-host-invocation.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
export function divorceControllerCommand({artifactPath,browserRoot,output}){
 return {executable:process.execPath,cwd:root,script:path.join(root,'scripts/run-harness-divorce-profile.mjs'),args:['--artifact',artifactPath,'--browser-root',browserRoot,'--output',path.join(output,'cohort'),'--expected-input',path.join(output,'expected-input.json')],environmentKeys:['HOME','PATH','TMPDIR']};
}
// Fixed producer only. Cancellation waits for this child before touching its owned resources.
export async function executeDivorceController(command,{log,signalTarget=process,launch=(file,args,options)=>spawn(file,args,options),terminate=terminateOwnedChild}={}){
 assert(Array.isArray(command?.args)&&command.args.length===8,'DIVORCE_CONTROLLER_COMMAND');
 for(const index of [1,3,5,7])assert(typeof command.args[index]==='string'&&path.isAbsolute(command.args[index]),'DIVORCE_CONTROLLER_COMMAND');
 assert.deepEqual(command,divorceControllerCommand({artifactPath:command.args[1],browserRoot:command.args[3],output:path.dirname(command.args[5])}),'DIVORCE_CONTROLLER_COMMAND');
 let child,cancelled=false,terminal,termination,rejectCancellation;
 const cancellationFailed=new Promise((_,reject)=>{rejectCancellation=reject;});
 const cancel=()=>{cancelled=true;if(child&&!termination){termination=terminate(child,{graceMs:30000,killMs:2000});termination.catch(rejectCancellation);}};
 signalTarget.once('SIGINT',cancel);signalTarget.once('SIGTERM',cancel);
 try{
  child=launch(command.executable,[command.script,...command.args],{cwd:command.cwd,env:{HOME:os.homedir(),PATH:process.env.PATH,TMPDIR:fs.realpathSync(os.tmpdir())},stdio:['ignore',log,log]});
  terminal=await Promise.race([new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));}),cancellationFailed]);
  if(termination){const ended=await termination;assert(ended.observed,'DIVORCE_CONTROLLER_UNOBSERVED');return {started:true,observed:true,forced:ended.forced,cancelled,...terminal};}
  return {started:true,observed:true,forced:false,cancelled,...terminal};
 }catch(error){
  if(child){const ended=await (termination??terminate(child,{graceMs:30000,killMs:2000}));assert(ended.observed,'DIVORCE_CONTROLLER_UNOBSERVED');}
  throw error;
 }finally{signalTarget.removeListener('SIGINT',cancel);signalTarget.removeListener('SIGTERM',cancel);}
}
function facetNames(binding,facet){const definition=DIVORCE_PROFILE_FACETS.find(item=>item.facet===facet);return ['baseline',definition.fault].flatMap(id=>['candidate','tools'].map(role=>`${binding.owners[facet]}-${id}-${role}`));}
function assertFreshOwners(binding){const observations=[];for(const {facet} of DIVORCE_PROFILE_FACETS)for(const name of facetNames(binding,facet)){assert.equal(inspectHostContainer(name),null,'DIVORCE_ADMISSION_OWNER_NOT_FRESH');observations.push({name,absent:true});}return observations;}
function cleanupOwnedAfterTerminal(output,binding){
 for(const {facet} of DIVORCE_PROFILE_FACETS){const directory=path.join(output,'cohort',facet),file=path.join(directory,'owned-resources.json');if(!fs.existsSync(file))continue;
  const recorded=JSON.parse(fs.readFileSync(file)),allowed=facetNames(binding,facet);assert(Array.isArray(recorded),'DIVORCE_ADMISSION_RESOURCE');
  for(const row of recorded)assert(row.kind==='container'&&row.owner===binding.owners[facet]&&allowed.includes(row.name),'DIVORCE_ADMISSION_RESOURCE');
  const resources=new Map(recorded.map(row=>[row.name,row]));assert.equal(resources.size,recorded.length,'DIVORCE_ADMISSION_RESOURCE');
  for(const row of [...recorded].reverse())removeHostResource(resources,row.name,directory);
 }
}
export async function runDivorceProfileAdmission({artifactPath,browserRoot,output}){
 const totalStart=startDivorceClock();
 assert([artifactPath,browserRoot,output].every(value=>typeof value==='string'&&path.isAbsolute(value)),'DIVORCE_ADMISSION_INPUT');
 const binding=await prepareDivorceProfileBinding({artifactPath,browserRoot});assertFreshOwners(binding);
 output=createFreshHarnessOutput(output,[root,artifactPath,binding.artifact.candidateRoot,binding.browser.root,binding.browser.dependenciesRoot]);
 const runId='divorce-'+randomUUID(),input={schemaVersion:1,runId,binding},inputBytes=JSON.stringify(input,null,2)+'\n',inputDigest=digestBytes(inputBytes),command=divorceControllerCommand({artifactPath,browserRoot:binding.browser.root,output});
 fs.writeFileSync(path.join(output,'expected-input.json'),inputBytes,{mode:0o444,flag:'wx'});
 writeJsonAtomic(path.join(output,'independent-controller-launch.json'),{schemaVersion:1,runId,inputDigest,producer:binding.producer,command});
 const launchDigest=digestBytes(fs.readFileSync(path.join(output,'independent-controller-launch.json')));
 assert.deepEqual(divorceProducerBinding(),binding.producer,'DIVORCE_ADMISSION_PRODUCER');
 const log=fs.openSync(path.join(output,'controller.log'),'wx',0o600);let terminal;
 try{
  const preparation=finishDivorceClock(totalStart),executionStart=startDivorceClock();
  terminal=await executeDivorceController(command,{log});
  const execution=finishDivorceClock(executionStart),admissionStart=startDivorceClock();
  writeJsonAtomic(path.join(output,'independent-controller-terminal.json'),{schemaVersion:1,runId,inputDigest,...terminal});
  assert.deepEqual(terminal,{started:true,observed:true,forced:false,cancelled:false,code:0,signal:null},'DIVORCE_ADMISSION_CONTROLLER');
  assert.equal(fs.readFileSync(path.join(output,'expected-input.json'),'utf8'),inputBytes,'DIVORCE_ADMISSION_INPUT_DRIFT');
  assert.deepEqual(divorceProducerBinding(),binding.producer,'DIVORCE_ADMISSION_PRODUCER');assert.deepEqual(await verifyCandidateArtifact(artifactPath),binding.artifact,'DIVORCE_ADMISSION_CANDIDATE');
  writeJsonAtomic(path.join(output,'independent-controller-cleanup.json'),{schemaVersion:1,runId,inputDigest,observedAfterController:true,containers:assertFreshOwners(binding)});
  const expected=divorceAdmissionPins(output);assert.equal(expected.launchDigest,launchDigest,'DIVORCE_ADMISSION_LAUNCH_DRIFT');assert.equal(expected.inputDigest,inputDigest,'DIVORCE_ADMISSION_INPUT_DRIFT');assert.equal(expected.bindingDigest,digestBytes(JSON.stringify(binding)),'DIVORCE_ADMISSION_INPUT_DRIFT');
  const result=admitDivorceProfile(output,expected);
  assertFreshOwners(binding);
  writeJsonAtomic(path.join(output,'divorce-profile-admission.json'),result);
  const childTimingDigest=digestBytes(fs.readFileSync(path.join(output,'cohort/cohort-timing.json'))),admission=finishDivorceClock(admissionStart);
  const timing={schemaVersion:1,kind:'divorce-profile-wrapper-timing',runId,inputDigest,telemetryOnly:true,...finishDivorceClock(totalStart),phases:{preparation,execution,admission},childTimingDigest};
  writeJsonAtomic(path.join(output,'standalone-timing.json'),timing);
  const standaloneTimingDigest=digestBytes(fs.readFileSync(path.join(output,'standalone-timing.json')));readDivorceProfileTiming(output,standaloneTimingDigest,expected);
  writeJsonAtomic(path.join(output,'admission-request.json'),{schemaVersion:1,kind:'divorce-profile-admission-request',directory:output,expected,standaloneTimingDigest});return result;
 }catch(error){
  // No destructive cleanup when process termination could not be observed.
  if(terminal?.observed)cleanupOwnedAfterTerminal(output,binding);
  throw error;
 }finally{fs.closeSync(log);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);
 try{const args=process.argv.slice(2);assert.deepEqual(args.filter((_,i)=>i%2===0),['--artifact','--browser-root','--output']);assert.equal(args.length,6);const result=await runDivorceProfileAdmission({artifactPath:args[1],browserRoot:args[3],output:args[5]});console.log(JSON.stringify(result));}
 catch{console.error('DIVORCE_PROFILE_ADMISSION_FAILED');process.exitCode=2;}
}
