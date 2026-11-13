#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyCandidateArtifact,assertFreshCandidateDerivationOutput,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {inspectNativeApiRuntime,inspectNativeBrowserRuntime} from './lib/exui-native-containers.mjs';
import {browserExecutable} from './lib/exui-oci-runtime.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {ST_CIC_PROFILE_FACETS,stCicProfileContract,stCicProfileContractDigest} from './lib/exui-st-cic-profile-contract.mjs';
import {stCicProducerBinding,stCicFallbackWitness,stCicConfigurationBindings,readStCicCohort,validateStCicCohortBinding} from './lib/exui-st-cic-profile-cohort.mjs';
import {PROFILE_SOURCE_FILES} from './lib/exui-source-profile-sources.mjs';
import {ST_CIC_COHORT_FILES} from './lib/exui-st-cic-profile-cohort.mjs';
import {runSourceProfileFeasibility} from './run-harness-source-profile-jurisdictions.mjs';
import {runHostInvocation,inspectHostContainer} from './lib/exui-host-invocation.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
export async function prepareStCicProfileBinding({artifactPath,browserRoot,signal,owners=Object.fromEntries(ST_CIC_PROFILE_FACETS.map(({facet})=>[facet,'candidate-'+randomUUID()]))}){
 assert([artifactPath,browserRoot].every(value=>typeof value==='string'&&path.isAbsolute(value)),'ST_CIC_COHORT_INPUT');
 assert(!signal?.aborted,'ST_CIC_COHORT_CANCELLED');
 const artifact=await verifyCandidateArtifact(artifactPath);
 await new Promise(resolve=>setImmediate(resolve));assert(!signal?.aborted,'ST_CIC_COHORT_CANCELLED');
 const producer=stCicProducerBinding();assert(ST_CIC_COHORT_FILES.every(name=>PROFILE_SOURCE_FILES.includes(name)),'ST_CIC_COHORT_SOURCE_REGISTRATION');const runtime=inspectNativeApiRuntime(artifact.provenance.platform),dependenciesRoot=fs.realpathSync(path.join(root,'node_modules'));
 const browserDigest=await digestCandidateTree(browserRoot);assert(!signal?.aborted,'ST_CIC_COHORT_CANCELLED');
 const dependencies=await verifyHarnessDependencies(dependenciesRoot,path.join(root,'package.json'),path.join(root,'yarn.lock'));
 await new Promise(resolve=>setImmediate(resolve));assert(!signal?.aborted,'ST_CIC_COHORT_CANCELLED');
 const browser={root:fs.realpathSync(browserRoot),dependenciesRoot,digest:browserDigest,dependencies,image:inspectNativeBrowserRuntime(artifact.provenance.platform),executable:'/browser/'+browserExecutable(JSON.parse(fs.readFileSync(path.join(root,'node_modules/playwright-core/browsers.json'))),artifact.provenance.platform)};
 const binding={schemaVersion:1,artifact,producer,runtime,browser,owners,contract:stCicProfileContract(),contractDigest:stCicProfileContractDigest(),configurations:stCicConfigurationBindings(artifact.candidateRoot),fallback:stCicFallbackWitness(artifact.candidateRoot)};
 validateStCicCohortBinding(binding,{artifact,producer,runtime,browser,owners});return binding;
}
export async function runStCicProfile({artifactPath,browserRoot,output,expectedInput}){

 assert(typeof output==='string'&&path.isAbsolute(output),'ST_CIC_COHORT_INPUT');
 let supplied;
 if(expectedInput){assert(path.isAbsolute(expectedInput)&&fs.realpathSync(expectedInput)===expectedInput&&!fs.lstatSync(expectedInput).isSymbolicLink(),'ST_CIC_COHORT_PARENT_INPUT');supplied=JSON.parse(fs.readFileSync(expectedInput));assert.deepEqual(Object.keys(supplied).sort(),['binding','runId','schemaVersion'],'ST_CIC_COHORT_PARENT_INPUT');assert.equal(supplied.schemaVersion,1,'ST_CIC_COHORT_PARENT_INPUT');}
 const binding=await prepareStCicProfileBinding({artifactPath,browserRoot,...(supplied?{owners:supplied.binding.owners}:{})});
 if(supplied)assert.deepEqual(binding,supplied.binding,'ST_CIC_COHORT_PARENT_INPUT');
 const {artifact,producer,runtime,browser,owners}=binding;
 output=await assertFreshCandidateDerivationOutput({baseline:artifact,manifestPath:artifactPath,output});
 for(const input of [root,artifact.candidateRoot,artifactPath,browser.root,browser.dependenciesRoot].map(value=>fs.realpathSync(value)))assert(output!==input&&!output.startsWith(input+path.sep)&&!input.startsWith(output+path.sep),'ST_CIC_COHORT_OUTPUT_INPUT_OVERLAP');
 fs.mkdirSync(output,{mode:0o700});output=fs.realpathSync(output);fs.writeFileSync(path.join(output,'cohort-input.json'),JSON.stringify(binding,null,2)+'\n',{mode:0o444,flag:'wx'});

 for(const {facet,browser:needsBrowser} of ST_CIC_PROFILE_FACETS){

  assert.deepEqual(stCicProducerBinding(),producer,'ST_CIC_COHORT_PRODUCER');
  const receipt=await runSourceProfileFeasibility({artifactPath,output:path.join(output,facet),facet,owner:owners[facet],browserRoot:needsBrowser?browserRoot:null},{runInvocation:async(spec,options)=>{
   // Parent-owned before launch; candidate cannot write this evidence mount.
   writeJsonAtomic(path.join(spec.directory,'cohort-host-plan.json'),{tools:spec.tools,candidate:{image:spec.candidate.image,mounts:spec.candidate.mounts,launchProcess:spec.candidate.launchProcess}});
   const observations=[];let observed;
   try{
    observed=await runHostInvocation(spec,{...options,inspect:id=>{
     const value=inspectHostContainer(id);
     if(value?.Config.Labels?.['exui.harness.service']==='browser-provider')observations.push({id:value.Id,name:value.Name,owner:value.Config.Labels['exui.harness.owner'],service:value.Config.Labels['exui.harness.service'],image:value.Image,network:value.HostConfig.NetworkMode,running:value.State.Running,exitCode:value.State.ExitCode,oomKilled:value.State.OOMKilled,restartCount:value.RestartCount});
     return value;
    }});
    writeJsonAtomic(path.join(spec.directory,'cohort-host-terminal.json'),observed.terminal);return observed;
   }finally{writeJsonAtomic(path.join(spec.directory,'cohort-host-tools.json'),{schemaVersion:1,invocationId:spec.invocationId,terminal:observed?.terminal??null,observations});}
  }});
  assert.equal(receipt.status,'feasibility-observed','ST_CIC_COHORT_INCOMPLETE');

  console.log(JSON.stringify({facet,status:receipt.status,catalogueCredit:false}));
 }

 assert.deepEqual(await verifyCandidateArtifact(artifactPath),artifact,'ST_CIC_COHORT_ARTIFACT');assert.deepEqual(stCicProducerBinding(),producer,'ST_CIC_COHORT_PRODUCER');
 const result=readStCicCohort(output,{artifact,producer,runtime,browser,owners});writeJsonAtomic(path.join(output,'st-cic-profile-cohort.json'),result);
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);
 try{const args=process.argv.slice(2);assert([6,8].includes(args.length)&&args[0]==='--artifact'&&args[2]==='--browser-root'&&args[4]==='--output'&&(args.length===6||args[6]==='--expected-input'),'ST_CIC_COHORT_INPUT');const result=await runStCicProfile({artifactPath:path.resolve(args[1]),browserRoot:path.resolve(args[3]),output:path.resolve(args[5]),expectedInput:args[7]?path.resolve(args[7]):undefined});console.log(JSON.stringify({status:result.status,obligationId:result.obligationId,catalogueCredit:false}));}
 catch{console.error(JSON.stringify({status:'failed',code:'ST_CIC_COHORT_FAILED',catalogueCredit:false}));process.exitCode=2;}
}
