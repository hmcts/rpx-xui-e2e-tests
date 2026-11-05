import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes} from './exui-evidence-io.mjs';
import {readDivorceCohort,DIVORCE_COHORT_FILES} from './exui-divorce-profile-cohort.mjs';
import {DIVORCE_PROFILE_ID,DIVORCE_PROFILE_FACETS,divorceProfileContractDigest} from './exui-divorce-profile-contract.mjs';
import {loadCommittedConfigurationCatalogue} from './exui-configuration-runtime-coverage.mjs';
const fail='DIVORCE_ADMISSION_INVALID',hash=/^sha256:[a-f0-9]{64}$/;
const keys=(value,names)=>assert.deepEqual(Object.keys(value??{}).sort(),names.slice().sort(),fail);
export function readDivorceAdmissionFile(file){
 assert(typeof file==='string'&&path.isAbsolute(file)&&path.normalize(file)===file&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile(),fail);
 const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),digest:digestBytes(bytes)};
}
export function divorceAdmissionPins(directory){
 const input=readDivorceAdmissionFile(path.join(directory,'expected-input.json')),binding=input.value.binding;
 return {runId:input.value.runId,inputDigest:input.digest,bindingDigest:digestBytes(JSON.stringify(binding)),producerCommit:binding.producer.commit,producerDigest:binding.producer.digest,candidateArtifactDigest:binding.artifact.identity.artifactDigest,receiptDigest:readDivorceAdmissionFile(path.join(directory,'cohort/divorce-profile-cohort.json')).digest,terminalDigest:readDivorceAdmissionFile(path.join(directory,'independent-controller-terminal.json')).digest,cleanupDigest:readDivorceAdmissionFile(path.join(directory,'independent-controller-cleanup.json')).digest,launchDigest:readDivorceAdmissionFile(path.join(directory,'independent-controller-launch.json')).digest};
}
// The caller supplies independently retained pins. No receipt boolean supplies authority.
export function admitDivorceProfile(directory,expected,options={}){
 assert(fs.realpathSync(directory)===directory&&fs.lstatSync(directory).isDirectory(),fail);
 keys(expected,['runId','inputDigest','bindingDigest','producerCommit','producerDigest','candidateArtifactDigest','receiptDigest','terminalDigest','launchDigest','cleanupDigest']);
 assert(/^divorce-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(expected.runId)&&/^[a-f0-9]{40}$/.test(expected.producerCommit),fail);
 for(const name of ['inputDigest','bindingDigest','producerDigest','candidateArtifactDigest','receiptDigest','terminalDigest','launchDigest','cleanupDigest'])assert(hash.test(expected[name]),fail);
 assert.deepEqual(divorceAdmissionPins(directory),expected,fail);
 const input=readDivorceAdmissionFile(path.join(directory,'expected-input.json')).value,binding=input.binding;
 keys(binding.producer,['commit','files','digest']);keys(binding.producer.files,DIVORCE_COHORT_FILES);assert.equal(digestBytes(JSON.stringify(binding.producer.files)),binding.producer.digest,fail);
 keys(input,['schemaVersion','runId','binding']);assert.equal(input.schemaVersion,1,fail);
 const terminal=readDivorceAdmissionFile(path.join(directory,'independent-controller-terminal.json')).value;
 assert.deepEqual(terminal,{schemaVersion:1,runId:expected.runId,inputDigest:expected.inputDigest,started:true,observed:true,forced:false,cancelled:false,code:0,signal:null},fail);
 const launch=readDivorceAdmissionFile(path.join(directory,'independent-controller-launch.json')).value;
 keys(launch,['schemaVersion','runId','inputDigest','producer','command']);assert.equal(launch.schemaVersion,1,fail);assert.equal(launch.runId,expected.runId,fail);assert.equal(launch.inputDigest,expected.inputDigest,fail);assert.deepEqual(launch.producer,binding.producer,fail);
 keys(launch.command,['executable','cwd','script','args','environmentKeys']);
 assert(path.isAbsolute(launch.command.executable)&&path.basename(launch.command.executable)==='node',fail);
 assert(path.isAbsolute(launch.command.cwd)&&path.normalize(launch.command.cwd)===launch.command.cwd,fail);
 assert.equal(launch.command.script,path.join(launch.command.cwd,'scripts/run-harness-divorce-profile.mjs'),fail);
 assert.deepEqual(launch.command.environmentKeys,['HOME','PATH','TMPDIR'],fail);
 const args=launch.command.args;assert(Array.isArray(args)&&args.length===8,fail);
 assert.deepEqual(args.filter((_,index)=>index%2===0),['--artifact','--browser-root','--output','--expected-input'],fail);
 assert(path.isAbsolute(args[1]),fail);assert.equal(args[3],binding.browser.root,fail);assert.equal(args[5],path.join(directory,'cohort'),fail);assert.equal(args[7],path.join(directory,'expected-input.json'),fail);
 const cleanup=readDivorceAdmissionFile(path.join(directory,'independent-controller-cleanup.json')).value;
 assert.deepEqual(cleanup,{schemaVersion:1,runId:expected.runId,inputDigest:expected.inputDigest,observedAfterController:true,containers:DIVORCE_PROFILE_FACETS.flatMap(({facet,fault})=>['baseline',fault].flatMap(id=>['candidate','tools'].map(role=>({name:`${binding.owners[facet]}-${id}-${role}`,absent:true}))))},fail);
 const receipt=readDivorceAdmissionFile(path.join(directory,'cohort/divorce-profile-cohort.json')).value;
 const actual=readDivorceCohort(path.join(directory,'cohort'),binding,options);assert.deepEqual(receipt,actual,fail);
 assert.equal(actual.bindingDigest,expected.bindingDigest,fail);assert.equal(actual.obligationId,DIVORCE_PROFILE_ID,fail);assert.equal(actual.contractDigest,divorceProfileContractDigest(),fail);
 const {catalogue}=loadCommittedConfigurationCatalogue();assert.equal(catalogue.obligations.length,112,fail);
 const row=catalogue.obligations.filter(item=>item.id===DIVORCE_PROFILE_ID);assert.equal(row.length,1,fail);assert.equal(row[0].kind,'configuration-profile',fail);assert.equal(row[0].family,'DIVORCE',fail);assert.equal(row[0].requiredBoundary,'candidate',fail);
 return {schemaVersion:1,kind:'divorce-profile-admission',status:'passed',obligationId:DIVORCE_PROFILE_ID,boundary:'candidate',family:'DIVORCE',baselineProofs:6,effectiveFaults:6,selected:1,accepted:1,catalogueSize:112,runId:expected.runId,producerCommit:expected.producerCommit,producerDigest:expected.producerDigest,candidateArtifactDigest:expected.candidateArtifactDigest,candidateCommit:binding.artifact.provenance.webappCommit,inputDigest:expected.inputDigest,bindingDigest:expected.bindingDigest,receiptDigest:expected.receiptDigest,terminalDigest:expected.terminalDigest,launchDigest:expected.launchDigest,cleanupDigest:expected.cleanupDigest,contractDigest:actual.contractDigest,releaseCredit:false,releaseApproval:false};
}
export function readDivorceProfileAdmission(descriptorPath){
 const {value}=readDivorceAdmissionFile(descriptorPath);const timed=Object.hasOwn(value,'standaloneTimingDigest');keys(value,['schemaVersion','kind','directory','expected',...(timed?['standaloneTimingDigest']:[])]);assert.equal(value.schemaVersion,1,fail);assert.equal(value.kind,'divorce-profile-admission-request',fail);
 const result=admitDivorceProfile(value.directory,value.expected);
 return {...result,...(timed?{standaloneTiming:readDivorceProfileTiming(value.directory,value.standaloneTimingDigest,value.expected)}:{})};
}

// Optional telemetry is pinned and checked separately; it grants no admission authority.
export function readDivorceProfileTiming(directory,timingDigest,expected){
 const code='DIVORCE_TIMING_INVALID';assert(hash.test(timingDigest),code);
 const loaded=readDivorceAdmissionFile(path.join(directory,'standalone-timing.json'));assert.equal(loaded.digest,timingDigest,code);const timing=loaded.value;
 keys(timing,['schemaVersion','kind','runId','inputDigest','telemetryOnly','startedAt','endedAt','durationMs','phases','childTimingDigest']);
 assert.equal(timing.schemaVersion,1,code);assert.equal(timing.kind,'divorce-profile-wrapper-timing',code);assert.equal(timing.runId,expected.runId,code);assert.equal(timing.inputDigest,expected.inputDigest,code);assert.equal(timing.telemetryOnly,true,code);
 const span=value=>{for(const name of ['startedAt','endedAt'])assert(typeof value[name]==='string'&&new Date(value[name]).toISOString()===value[name],code);assert(Number.isSafeInteger(value.durationMs)&&value.durationMs>=0&&value.durationMs<=24*60*60*1000,code);const start=Date.parse(value.startedAt),end=Date.parse(value.endedAt);assert(end>=start&&Math.abs(end-start-value.durationMs)<=1000,code);return {start,end,duration:value.durationMs};};
 const total=span(timing);
 const nested=(values,parent)=>{let previous=parent.start,sum=0;for(const value of values){const current=span(value);assert(current.start>=previous&&current.end<=parent.end,code);previous=current.end;sum+=current.duration;}assert(sum<=parent.duration+1000,code);};
 keys(timing.phases,['preparation','execution','admission']);for(const value of Object.values(timing.phases))keys(value,['startedAt','endedAt','durationMs']);nested(Object.values(timing.phases),total);
 assert(hash.test(timing.childTimingDigest),code);const loadedChild=readDivorceAdmissionFile(path.join(directory,'cohort/cohort-timing.json'));assert.equal(loadedChild.digest,timing.childTimingDigest,code);const child=loadedChild.value;
 keys(child,['schemaVersion','kind','bindingDigest','telemetryOnly','preparation','facets','finalization']);assert.equal(child.schemaVersion,1,code);assert.equal(child.kind,'divorce-profile-child-timing',code);assert.equal(child.bindingDigest,expected.bindingDigest,code);assert.equal(child.telemetryOnly,true,code);
 assert.deepEqual(child.facets.map(row=>row.facet),DIVORCE_PROFILE_FACETS.map(row=>row.facet),code);for(const row of child.facets)keys(row,['facet','startedAt','endedAt','durationMs']);for(const row of [child.preparation,child.finalization])keys(row,['startedAt','endedAt','durationMs']);
 nested([child.preparation,...child.facets,child.finalization],span(timing.phases.execution));
 return {telemetryOnly:true,digest:timingDigest,startedAt:timing.startedAt,endedAt:timing.endedAt,durationMs:timing.durationMs,phases:timing.phases,child:{preparation:child.preparation,facets:child.facets,finalization:child.finalization}};
}
