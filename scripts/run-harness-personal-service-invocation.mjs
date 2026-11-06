#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {personalFile,personalJson,personalDigest,readPersonalPrepared,personalPlan,personalProducer} from './lib/exui-personal-service-invocation-binding.mjs';
import {runHostInvocation,removeHostResource,inspectHostContainer} from './lib/exui-host-invocation.mjs';
import {verifyCcdContainerIdentity} from './lib/exui-ccd-runtime.mjs';
import {verifyCallbackUiRuntime} from './run-harness-recipient-callback-ui.mjs';
import {readPersonalServiceDate} from './lib/exui-personal-service-facets.mjs';
import {verifyCandidateArtifact,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {writeJsonAtomic} from './lib/exui-evidence-io.mjs';
export async function runPersonalInvocation(expectedFile,expectedDigest) {
 assert(path.isAbsolute(expectedFile)&&/^sha256:[a-f0-9]{64}$/.test(expectedDigest),'PERSONAL_SERVICE_CHILD_ARGUMENT');
 const parent=path.dirname(expectedFile),name=path.basename(expectedFile);assert(/^(baseline|optional)-expected\.json$/.test(name),'PERSONAL_SERVICE_CHILD_ARGUMENT');
 const bytes=personalFile(parent,name);assert.equal(bytes.digest,expectedDigest,'PERSONAL_SERVICE_CHILD_EXPECTATION');
 const {binding,cohort}=JSON.parse(bytes.bytes);assert.equal(name,binding.variant+'-expected.json','PERSONAL_SERVICE_CHILD_VARIANT');
 assert.equal(binding.directory,path.join(parent,binding.variant),'PERSONAL_SERVICE_CHILD_DIRECTORY');
 if(cohort.admissionContext){const m=await import('./lib/exui-personal-service-admission.mjs');assert.equal(cohort.admissionContractDigest,m.personalAdmissionDigest(),'PERSONAL_SERVICE_CHILD_ADMISSION_CONTRACT');assert.equal(m.personalCohortCompatibility(cohort.admissionContext,cohort).status,'included','PERSONAL_SERVICE_CHILD_ADMISSION_CONTEXT');}
 const input=readPersonalPrepared(binding,cohort,{live:true});assert.deepEqual(personalProducer(),cohort.producer,'PERSONAL_SERVICE_CHILD_SOURCE');
 assert.deepEqual(await verifyCandidateArtifact(cohort.candidateManifest),cohort.artifact,'PERSONAL_SERVICE_CHILD_CANDIDATE');assert.equal(await digestCandidateTree(cohort.browser.root),cohort.browser.digest,'PERSONAL_SERVICE_CHILD_BROWSER');
 verifyCcdContainerIdentity(binding.ccd);
 assert.deepEqual(verifyCallbackUiRuntime(binding.ccd,personalJson(binding.directory,'runtime/recipient-callback-import/receipt.json'),{writeReceipt:false}),input.callbackObservedDigests,'PERSONAL_SERVICE_CHILD_DESCRIPTOR');
 assert.deepEqual(readPersonalServiceDate(binding.ccd,input.definition.definitionVersion,{writeReceipt:false}),personalJson(binding.directory,'runtime/recipient-callback-import/personal-service-stored-row-date.json'),'PERSONAL_SERVICE_CHILD_DATE');
 const plan=personalPlan(input,binding.handoff);for(const item of [plan.candidate,plan.tools])assert.equal(inspectHostContainer(item.name),null,'PERSONAL_SERVICE_CHILD_NOT_FRESH');
 const resources=new Map();let cancelled=false,terminal,cleanupComplete=false;
 const cancel=()=>{cancelled=true;for(const resource of resources.values())if(resource.kind==='process')resource.child?.kill('SIGTERM');};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 try{
  const result=await runHostInvocation({...plan,candidate:{...plan.candidate,launchProcess:binding.candidateProcess},manifest:structuredClone(binding.manifest),payloadDigest:input.artifact.payloadDigest},{resources,isCancelled:()=>cancelled});terminal=result.terminal;
  writeJsonAtomic(path.join(binding.directory,'personal-service-observed-terminal.json'),{runId:input.runId,terminal});
  assert(!cancelled,'PERSONAL_SERVICE_CHILD_CANCELLED');assert.deepEqual(terminal,{code:binding.variant==='baseline'?0:1,signal:null},'PERSONAL_SERVICE_CHILD_FRAMEWORK');
 }finally{
  const errors=[];for(const key of [...resources.keys()].reverse()){try{await removeHostResource(resources,key,binding.directory);}catch(error){errors.push(error);}}
  cleanupComplete=errors.length===0;writeJsonAtomic(path.join(binding.directory,'personal-service-child-finalization.json'),{schemaVersion:1,runId:input.runId,bindingDigest:personalDigest(binding),cleanupComplete});
  process.off('SIGINT',cancel);process.off('SIGTERM',cancel);assert(cleanupComplete,'PERSONAL_SERVICE_CHILD_CLEANUP');
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);try{const args=process.argv.slice(2);assert.deepEqual(args.filter((_,i)=>i%2===0),['--expected','--digest']);assert.equal(args.length,4);await runPersonalInvocation(args[1],args[3]);}catch{console.error('PERSONAL_SERVICE_BOUND_INVOCATION_FAILED');process.exitCode=2;}
}
