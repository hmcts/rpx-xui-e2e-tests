#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {startCcdRuntime,docker} from './lib/exui-ccd-runtime.mjs';
import {cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {prepareComplexEmailImport,importComplexEmail} from './lib/exui-complex-email-import.mjs';
import {observeComplexEmailMapping,validateComplexEmailMapping,compareComplexEmailMappings,COMPLEX_MAPPING_SOURCE_CONTEXT} from './lib/exui-complex-email-mapping.mjs';
import {createFreshHarnessOutput} from './lib/exui-output-boundary.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {classifyNativeFailure} from './lib/exui-native-failure-diagnostics.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const defaults={start:startCcdRuntime,prepare:prepareComplexEmailImport,import:importComplexEmail,observe:observeComplexEmailMapping,cleanup:cleanupCiCcd};
function git(args){const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(result.status,0,'COMPLEX_MAPPING_SOURCE_GIT');return result.stdout.trim();}
function sourceIdentity(){assert.equal(git(['status','--porcelain']),'','COMPLEX_MAPPING_SOURCE_CLEAN');return {commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}'])};}

export async function runComplexEmailMappingPair(output,{operations=defaults,isCancelled=()=>false,complexLifecycle}={}) {
 assert(complexLifecycle===undefined||['creationStarted','prepared','completed','closed'].every(key=>typeof complexLifecycle[key]==='function'),'COMPLEX_MAPPING_LIFECYCLE');
 const summary={schemaVersion:1,kind:'complex-email-searchable-mapping-feasibility',status:'in-progress',sourceContext:COMPLEX_MAPPING_SOURCE_CONTEXT,scope:'CCD import-generated mappings only; synthetic searchable direct parent; no indexing, query, EXUI or LiveFrom activation claim',runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,cleanupComplete:false,invocations:[]};
 const save=()=>writeJsonAtomic(path.join(output,'receipt.json'),summary);save();
 const mappings=[];
 for(const variant of ['baseline','searchable']) {
  const directory=path.join(output,variant);fs.mkdirSync(directory,{mode:0o700});
  const runtime=path.join(directory,'runtime'),invocation={variant,status:'in-progress',startedAt:new Date().toISOString(),cleanupComplete:false};summary.invocations.push(invocation);save();
  const start=performance.now();let heldState,heldImport;let phase='startup',successfulStart=false,createAttempted=false,cleanupUncertain=false;
  try {
   assert(!isCancelled(),'COMPLEX_MAPPING_CANCELLED');
   complexLifecycle?.creationStarted({variant,runtimeDirectory:runtime});
   const state=await operations.start(runtime,{
    platform:'linux/arm64',fixtureSelection:'event-capability-baseline',elasticsearch:true,isCancelled,
    runDocker:(args,input)=>{
     assert(!isCancelled(),'COMPLEX_MAPPING_CANCELLED');
     const creating=args[0]==='create';if(creating)createAttempted=true;
     try{
      const result=(operations.docker??docker)(args,input);
      if(creating)assert(typeof result==='string'&&/^[a-f0-9]{64}$/.test(result),'COMPLEX_MAPPING_CREATE_CID_REQUIRED');
      return result;
     }catch(error){if(creating)cleanupUncertain=true;throw error;}
    },
   });successfulStart=true;heldState=structuredClone(state);
   invocation.owner=state.owner;invocation.namespace=state.namespace;invocation.images=state.images;
   assert.equal(state.images.definition?.id,COMPLEX_MAPPING_SOURCE_CONTEXT.definitionImage,'COMPLEX_MAPPING_DEFINITION_IMAGE');
   phase='pre-import-health';writeJsonAtomic(path.join(directory,'before.json'),operations.observe(state,{beforeImport:true}));
   assert(!isCancelled(),'COMPLEX_MAPPING_CANCELLED');
   phase='prepare-import';await operations.prepare(path.join(directory,'fixture'),variant);
   phase='real-import';const imported=await operations.import(state,{fixtureDirectory:path.join(directory,'fixture'),variant});
   assert.equal(imported.status,'import-and-complex-metadata-observed','COMPLEX_MAPPING_IMPORT_REQUIRED');
   writeJsonAtomic(path.join(directory,'import.json'),imported);heldImport=structuredClone(imported);
   complexLifecycle?.prepared({variant,directory,state:heldState,imported:heldImport});
   assert(!isCancelled(),'COMPLEX_MAPPING_CANCELLED');
   phase='actual-mapping';const observed=operations.observe(state);writeJsonAtomic(path.join(directory,'mapping.json'),observed);
   const mapping=validateComplexEmailMapping(observed,variant);mappings.push(mapping);
   invocation.mappingDigest=digestBytes(JSON.stringify(observed));invocation.status='mapping-observed';
   if(variant==='searchable'){phase='source-fault';summary.fault=compareComplexEmailMappings(mappings[0],mappings[1]);}
   complexLifecycle?.completed({variant,directory,state:heldState,imported:heldImport,observed});
  } catch(error) {invocation.status='BLOCKED';invocation.failedPhase=phase;invocation.diagnostic=classifyNativeFailure(error);}
  finally {
   const cleanupStarted=performance.now();
   try {const cleanup=operations.cleanup(runtime);if(successfulStart||createAttempted||cleanup!==undefined)assert.equal(cleanup?.cleanupComplete,true,'COMPLEX_MAPPING_CLEANUP_RECEIPT_REQUIRED');assert(!cleanupUncertain,'COMPLEX_MAPPING_CLEANUP_UNCERTAIN');writeJsonAtomic(path.join(directory,'cleanup.json'),cleanup??{cleanupComplete:true,noRecoveryRequired:true});invocation.cleanupComplete=true;}catch(error){cleanupUncertain=true;invocation.cleanupComplete=false;invocation.status='BLOCKED';invocation.cleanupDiagnostic=classifyNativeFailure(error);}
   invocation.cleanupDurationMs=Math.round(performance.now()-cleanupStarted);invocation.durationMs=Math.round(performance.now()-start);invocation.endedAt=new Date().toISOString();save();
   complexLifecycle?.closed({variant,directory,state:heldState,cleanupComplete:invocation.cleanupComplete,cleanupUncertain,cancelled:isCancelled()});
  }
  if(invocation.status==='BLOCKED'||!invocation.cleanupComplete)break;
 }
 summary.cleanupComplete=summary.invocations.every(item=>item.cleanupComplete);
 summary.status=summary.invocations.length===2&&summary.invocations.every(item=>item.status==='mapping-observed')&&summary.fault?.faultEffective===true&&summary.cleanupComplete?'observed':'BLOCKED';save();return summary;
}

export async function runComplexEmailMapping(output) {
 const producer=sourceIdentity();output=createFreshHarnessOutput(output,[root]);
 writeJsonAtomic(path.join(output,'preexecution.json'),{kind:'complex-email-mapping-preexecution',producer,sourceContext:COMPLEX_MAPPING_SOURCE_CONTEXT,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false});
 let cancelled=false;const cancel=()=>{cancelled=true;};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 try {
  const result=await runComplexEmailMappingPair(output,{isCancelled:()=>cancelled});
  try {assert.deepEqual(sourceIdentity(),producer,'COMPLEX_MAPPING_SOURCE_CHANGED');}
  catch(error){result.status='BLOCKED';result.diagnostic=classifyNativeFailure(error);writeJsonAtomic(path.join(output,'receipt.json'),result);}
  return result;
 } finally {process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const output=process.argv[2];assert(output&&process.argv.length===3,'COMPLEX_MAPPING_OUTPUT_REQUIRED');
 const result=await runComplexEmailMapping(output).catch(error=>({status:'BLOCKED',diagnostic:classifyNativeFailure(error),cleanupComplete:false}));process.stdout.write(JSON.stringify({status:result.status,cleanupComplete:result.cleanupComplete,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false})+'\n');process.exitCode=result.status==='observed'?0:2;
}
