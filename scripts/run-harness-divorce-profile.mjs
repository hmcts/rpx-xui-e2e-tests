#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyCandidateArtifact,assertFreshCandidateDerivationOutput,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {inspectNativeApiRuntime,inspectNativeBrowserRuntime} from './lib/exui-native-containers.mjs';
import {browserExecutable} from './lib/exui-oci-runtime.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {DIVORCE_PROFILE_FACETS,divorceProfileContract,divorceProfileContractDigest} from './lib/exui-divorce-profile-contract.mjs';
import {divorceProducerBinding,divorceFallbackWitness,divorceConfigurationBindings,readDivorceCohort} from './lib/exui-divorce-profile-cohort.mjs';
import {runSourceProfileFeasibility} from './run-harness-source-profile-jurisdictions.mjs';
import {runHostInvocation} from './lib/exui-host-invocation.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
export async function runDivorceProfile({artifactPath,browserRoot,output}){
 assert([artifactPath,browserRoot,output].every(value=>typeof value==='string'&&path.isAbsolute(value)),'DIVORCE_COHORT_INPUT');
 const artifact=await verifyCandidateArtifact(artifactPath),producer=divorceProducerBinding();
 await assertFreshCandidateDerivationOutput({baseline:artifact,manifestPath:artifactPath,output});
 assert(!output.startsWith(root+path.sep)&&!root.startsWith(output+path.sep),'DIVORCE_COHORT_INPUT');
 const runtime=inspectNativeApiRuntime(artifact.provenance.platform),dependenciesRoot=fs.realpathSync(path.join(root,'node_modules'));
 const browser={root:fs.realpathSync(browserRoot),dependenciesRoot,digest:await digestCandidateTree(browserRoot),dependencies:await verifyHarnessDependencies(dependenciesRoot,path.join(root,'package.json'),path.join(root,'yarn.lock')),image:inspectNativeBrowserRuntime(artifact.provenance.platform),executable:'/browser/'+browserExecutable(JSON.parse(fs.readFileSync(path.join(root,'node_modules/playwright-core/browsers.json'))),artifact.provenance.platform)};
 const binding={schemaVersion:1,artifact,producer,runtime,browser,contract:divorceProfileContract(),contractDigest:divorceProfileContractDigest(),configurations:divorceConfigurationBindings(artifact.candidateRoot),fallback:divorceFallbackWitness(artifact.candidateRoot)};
 fs.mkdirSync(output,{mode:0o700});output=fs.realpathSync(output);fs.writeFileSync(path.join(output,'cohort-input.json'),JSON.stringify(binding,null,2)+'\n',{mode:0o444,flag:'wx'});
 for(const {facet,browser:needsBrowser} of DIVORCE_PROFILE_FACETS){
  assert.deepEqual(divorceProducerBinding(),producer,'DIVORCE_COHORT_PRODUCER');
  const receipt=await runSourceProfileFeasibility({artifactPath,output:path.join(output,facet),facet,browserRoot:needsBrowser?browserRoot:null},{runInvocation:async(spec,options)=>{
   // Parent-owned before launch; candidate cannot write this evidence mount.
   writeJsonAtomic(path.join(spec.directory,'cohort-host-plan.json'),{tools:spec.tools,candidate:{image:spec.candidate.image,mounts:spec.candidate.mounts,launchProcess:spec.candidate.launchProcess}});
   const observed=await runHostInvocation(spec,options);writeJsonAtomic(path.join(spec.directory,'cohort-host-terminal.json'),observed.terminal);return observed;
  }});
  assert.equal(receipt.status,'feasibility-observed','DIVORCE_COHORT_INCOMPLETE');
  console.log(JSON.stringify({facet,status:receipt.status,catalogueCredit:false}));
 }
 assert.deepEqual(await verifyCandidateArtifact(artifactPath),artifact,'DIVORCE_COHORT_ARTIFACT');assert.deepEqual(divorceProducerBinding(),producer,'DIVORCE_COHORT_PRODUCER');
 const result=readDivorceCohort(output,{artifact,producer,runtime,browser});writeJsonAtomic(path.join(output,'divorce-profile-cohort.json'),result);return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);
 try{const args=process.argv.slice(2);assert(args.length===6&&args[0]==='--artifact'&&args[2]==='--browser-root'&&args[4]==='--output','DIVORCE_COHORT_INPUT');const result=await runDivorceProfile({artifactPath:path.resolve(args[1]),browserRoot:path.resolve(args[3]),output:path.resolve(args[5])});console.log(JSON.stringify({status:result.status,obligationId:result.obligationId,catalogueCredit:false}));}
 catch{console.error(JSON.stringify({status:'failed',code:'DIVORCE_COHORT_FAILED',catalogueCredit:false}));process.exitCode=2;}
}
