#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {setImmediate as yieldToSignals} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {startCcdRuntime,CCD_IMAGES,verifyCcdContainerIdentity} from './lib/exui-ccd-runtime.mjs';
import {cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {inspectHostContainer} from './lib/exui-host-invocation.mjs';
import {createFreshHarnessOutput} from './lib/exui-output-boundary.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './lib/exui-native-sources.mjs';
import {AUTHORISATION_ROW_NO_CREDIT,AUTHORISATION_ROW_ID} from './lib/exui-authorisation-row-contract.mjs';
import {prepareAuthorisationCreateWorkbook,importAuthorisationCreate,readAuthorisationAclDates,observeAuthorisationCreate,validateAuthorisationCreateObservation,readAuthorisationCreatePacket,AUTH_CREATE_VARIANTS} from './lib/exui-authorisation-create-runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const jsonDigest=value=>digestBytes(JSON.stringify(value,null,2)+'\n');
const fileDigest=file=>{assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'AUTH_CREATE_PIN_ALIAS');return digestBytes(fs.readFileSync(file));};
const read=file=>JSON.parse(fs.readFileSync(file));
export function authorisationCreateProducer() {
 const git=(...args)=>{const result=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(result.status,0,'AUTH_CREATE_GIT');return result.stdout.trim();};
 const files=[...new Set([...NATIVE_HARNESS_SOURCE_FILES,'scripts/lib/exui-authorisation-row-contract.mjs','scripts/lib/exui-authorisation-row-fixture.mjs','scripts/fixtures/ccd/authorisation-row-backing.source.json','scripts/lib/exui-authorisation-create-runtime.mjs','scripts/run-harness-authorisation-create.mjs'])].sort();
 assert.equal(git('status','--porcelain'), '','AUTH_CREATE_CLEAN_PRODUCER');
 const hashes=Object.fromEntries(files.map(relative=>[relative,fileDigest(path.join(root,relative))]));
 return {commit:git('rev-parse','HEAD'),sourceDigest:digestBytes(JSON.stringify(hashes)),files:hashes};
}
// One process owns both fixed contexts; no persistent child controller is spawned.
export async function runAuthorisationCreate(output,{producer=authorisationCreateProducer,prepare=prepareAuthorisationCreateWorkbook,start=startCcdRuntime,importDefinition=importAuthorisationCreate,dates=readAuthorisationAclDates,observe=observeAuthorisationCreate,replay=validateAuthorisationCreateObservation,cleanup=cleanupCiCcd,inspect=verifyCcdContainerIdentity,finalReplay=readAuthorisationCreatePacket,inspectRemoved=inspectHostContainer,signalTarget=process}={}) {
 const started=performance.now(),startedAt=new Date().toISOString();
 assert(typeof output==='string'&&path.isAbsolute(output),'AUTH_CREATE_ABSOLUTE_OUTPUT');
 const directory=createFreshHarnessOutput(output,[root]);assert.equal(directory,output,'AUTH_CREATE_OUTPUT_ALIAS');
 // These pins stay in the controller's memory, independent of later packet files.
 const expected={producer:structuredClone(producer()),images:structuredClone(CCD_IMAGES),contexts:[]};
 const summary={schemaVersion:1,kind:'non-credit-authorisation-create-milestone',obligationId:AUTHORISATION_ROW_ID,status:'BLOCKED',startedAt,elapsedMs:0,verificationMs:0,producer:expected.producer,images:expected.images,variants:[],cancelled:false,cleanupComplete:true,...AUTHORISATION_ROW_NO_CREDIT};
 const save=()=>writeJsonAtomic(path.join(directory,'summary.json'),summary);save();let cancelled=false,continuationSafe=true,verificationStarted,phase='preparation';
 const cancel=()=>{cancelled=true;};signalTarget.once('SIGINT',cancel);signalTarget.once('SIGTERM',cancel);
 try{
  for(const variant of AUTH_CREATE_VARIANTS){
   await yieldToSignals();assert(!cancelled&&continuationSafe,'AUTH_CREATE_CONTINUATION_UNSAFE');
   const stage={variant,status:'BLOCKED',cleanupComplete:false,setupMs:0,executionMs:0,cleanupMs:0},context={variant};summary.variants.push(stage);expected.contexts.push(context);save();
   const fixture=path.join(directory,variant+'-fixture'),runtime=path.join(directory,variant+'-runtime');let began=performance.now(),executionStarted=false;
   try{
    phase='workbook';assert(!cancelled,'AUTH_CREATE_CANCELLED');const prepared=prepare(fixture,variant);await yieldToSignals();assert(!cancelled,'AUTH_CREATE_CANCELLED');
    assert.deepEqual(read(path.join(fixture,'binding.json')),prepared,'AUTH_CREATE_PREPARED_BINDING');context.fixture=Object.fromEntries(['definition.json','definition.xlsx','binding.json'].map(name=>[name,fileDigest(path.join(fixture,name))]));
    phase='ccd-start';const state=await start(runtime,{fixtureSelection:'event-capability-baseline',platform:'linux/arm64',isCancelled:()=>cancelled,onCreateUncertainty:()=>{continuationSafe=false;}});
    context.runtime=structuredClone(Object.fromEntries(['owner','namespace','containers','images','output','fixtureSelection','platform'].map(key=>[key,state[key]])));
    context.recoveryDigest=fileDigest(path.join(runtime,'recovery.json'));context.creationDigest=fileDigest(path.join(runtime,'creation-attempts.json'));context.recovery=read(path.join(runtime,'recovery.json'));
    await yieldToSignals();assert(!cancelled,'AUTH_CREATE_CANCELLED');inspect(state);
    phase='source-import';const importObservations=[];
    const imported=importDefinition(state,fixture,variant,{onObservation:entry=>{importObservations.push(entry);writeJsonAtomic(path.join(directory,variant+'-import-requests.json'),importObservations);context.importRequestsDigest=jsonDigest(importObservations);}});
    writeJsonAtomic(path.join(directory,variant+'-import.json'),imported);context.importDigest=jsonDigest(imported);await yieldToSignals();assert(!cancelled,'AUTH_CREATE_CANCELLED');
    phase='typed-acl';const stored=dates(state,imported.version,variant);writeJsonAtomic(path.join(directory,variant+'-stored-acl.json'),stored);context.storedDigest=jsonDigest(stored);stage.setupMs=Math.round(performance.now()-began);began=performance.now();executionStarted=true;await yieldToSignals();assert(!cancelled,'AUTH_CREATE_CANCELLED');
    phase='actor-api';const observation=await observe(state,variant,{isCancelled:()=>cancelled,onJournal:journal=>{writeJsonAtomic(path.join(directory,variant+'-requests.json'),journal);context.journalDigest=jsonDigest(journal);}});assert(!cancelled,'AUTH_CREATE_CANCELLED');writeJsonAtomic(path.join(directory,variant+'-observation.json'),observation);context.observationDigest=jsonDigest(observation);
    phase='raw-replay';stage.replay=replay(observation,variant);phase='producer-check';assert.deepEqual(producer(),expected.producer,'AUTH_CREATE_PRODUCER_CHANGED');stage.status='PASS';
   }catch{stage.failedStage=phase;summary.failedStage??=phase;throw Error('AUTH_CREATE_CONTEXT_BLOCKED');}finally{
    if(executionStarted)stage.executionMs=Math.round(performance.now()-began);else stage.setupMs=Math.round(performance.now()-began);
    const cleanupBegan=performance.now();try{
     const removal=cleanup(runtime);
     if(context.runtime){
      assert.equal(removal?.cleanupComplete,true,'AUTH_CREATE_CLEANUP_AUTHORITY');assert.equal(removal.owner,context.runtime.owner,'AUTH_CREATE_CLEANUP_AUTHORITY');
      assert.deepEqual(removal.checkedNames.slice().sort(),Object.values(context.recovery.resources).map(row=>row.name).sort(),'AUTH_CREATE_CLEANUP_NAMES');
      assert.deepEqual(removal.checkedContainerIds.slice().sort(),[...new Set([...Object.values(context.runtime.containers),context.runtime.namespace])].sort(),'AUTH_CREATE_CLEANUP_IDS');
     }
     stage.removal=removal;context.removal=structuredClone(removal);stage.cleanupComplete=true;
    }catch{summary.failedStage??='cleanup';stage.failedStage??='cleanup';continuationSafe=false;summary.cleanupComplete=false;stage.cleanupComplete=false;}
    stage.cleanupMs=Math.round(performance.now()-cleanupBegan);summary.cancelled=cancelled;if(!continuationSafe)summary.cleanupComplete=false;if(!stage.cleanupComplete||!continuationSafe||cancelled)stage.status='BLOCKED';save();
   }
   await yieldToSignals();assert(continuationSafe&&!cancelled&&stage.status==='PASS'&&stage.cleanupComplete,'AUTH_CREATE_CONTEXT_NOT_CLOSED');
  }
  phase='post-cleanup-replay';verificationStarted=performance.now();assert.deepEqual(producer(),expected.producer,'AUTH_CREATE_PRODUCER_CHANGED');summary.replay=finalReplay(directory,expected,{inspect:inspectRemoved});await yieldToSignals();assert(!cancelled,'AUTH_CREATE_CANCELLED');summary.status='PASS';
 }catch{summary.status='BLOCKED';summary.failedStage??=phase;}finally{
  if(verificationStarted!==undefined)summary.verificationMs=Math.round(performance.now()-verificationStarted);summary.elapsedMs=Math.round(performance.now()-started);summary.cancelled=cancelled;if(cancelled||!continuationSafe)summary.status='BLOCKED';
  writeJsonAtomic(path.join(directory,'controller-context-pins.json'),expected);summary.contextPinsDigest=jsonDigest(expected);signalTarget.off('SIGINT',cancel);signalTarget.off('SIGTERM',cancel);save();
 }
 return {exitCode:summary.status==='PASS'?0:2,summary,expected};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);try{assert.deepEqual(process.argv.slice(2,3),['--output']);assert.equal(process.argv.length,4);const result=await runAuthorisationCreate(process.argv[3]);console.log(JSON.stringify({status:result.summary.status,kind:result.summary.kind,failedStage:result.summary.failedStage??null,contextPinsDigest:result.summary.contextPinsDigest,completedContexts:result.summary.variants.filter(item=>item.status==='PASS').length,...AUTHORISATION_ROW_NO_CREDIT}));process.exitCode=result.exitCode;}catch{console.error('AUTH_CREATE_STANDALONE_BLOCKED');process.exitCode=2;}
}
