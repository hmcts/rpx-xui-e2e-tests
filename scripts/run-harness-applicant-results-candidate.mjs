#!/usr/bin/env node
import {classifyNativeFailure,nativeFailurePrefix} from './lib/exui-native-failure-diagnostics.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {verifyCandidateArtifact,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {assertCandidateConfigurationSources} from './lib/exui-configuration-catalogue.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './lib/exui-native-sources.mjs';
import {readApplicantResultRuntime,copyApplicantRuntimeEvidence} from './lib/exui-applicant-results-runtime.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
import {createFreshHarnessOutput} from './lib/exui-output-boundary.mjs';
import {browserExecutable} from './lib/exui-oci-runtime.mjs';
import {runNativeHostPhase} from './lib/exui-native-host.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function launchApplicantResults({candidate,browser,runtime,profile,output}) {
 const artifact=await verifyCandidateArtifact(candidate),browserRoot=fs.realpathSync(browser),harnessDependencies=await verifyHarnessDependencies(root+'node_modules',root+'package.json',root+'yarn.lock');
 assertCandidateConfigurationSources(artifact.candidateRoot,JSON.parse(fs.readFileSync(root+'scripts/fixtures/exui-configuration-review.json','utf8')));
 const selected=readApplicantResultRuntime(runtime,{profile});assert.equal(selected.ccd.platform??"linux/arm64",artifact.provenance.platform,'RESULT_CANDIDATE_PLATFORM');
 output=createFreshHarnessOutput(output,[artifact.candidateRoot,candidate,browserRoot,runtime,root+'node_modules']);
 const runId='ccd-'+randomUUID(),harnessSources=NATIVE_HARNESS_SOURCE_FILES;
 const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(result.status,0,'RESULT_SOURCE_GIT');return result.stdout.trim();};
 assert.equal(git(['status','--porcelain']),'','RESULT_SOURCE_NOT_CLEAN');const harnessCommit=git(['rev-parse','HEAD']);
 const stagedHarness=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'exui-applicant-harness-'));fs.chmodSync(stagedHarness,0o700);fs.mkdirSync(path.join(stagedHarness,'node_modules'));
 for(const file of harnessSources){const source=path.join(root,file);assert(fs.lstatSync(source).isFile()&&fs.realpathSync(source)===source,'RESULT_SOURCE_ALIAS');const target=path.join(stagedHarness,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
 const harnessSourceDigest=digestBytes(JSON.stringify(harnessSources.map(file=>[file,digestBytes(fs.readFileSync(path.join(stagedHarness,file)))])));
 const chromium=JSON.parse(fs.readFileSync(root+'node_modules/playwright-core/browsers.json')).browsers.find(item=>item.name==='chromium-headless-shell');
 const input={...selected,artifact,browserRoot,browserDigest:await digestCandidateTree(browserRoot),browserExecutable:'/browser/'+browserExecutable({browsers:[chromium]},artifact.provenance.platform),harnessDependencies,harnessCommit,harnessSourceState:'clean',harnessSources,harnessSourceDigest,runId,gatewayDigest:digestBytes(fs.readFileSync(root+'scripts/lib/exui-ccd-browser-runtime.mjs'))};
 Object.assign(input,copyApplicantRuntimeEvidence(output,input,'baseline'));writeJsonAtomic(output+'/input.json',input);fs.chmodSync(output+'/input.json',0o600);
 return runNativeHostPhase(output,stagedHarness);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);assert.deepEqual(args.filter((_,i)=>i%2===0),['--candidate','--browser','--runtime','--profile','--output']);assert.equal(args.length,10);const verdict=await launchApplicantResults({candidate:args[1],browser:args[3],runtime:args[5],profile:args[7],output:args[9]});process.exitCode=verdict.exitCode;}catch(error){console.error(nativeFailurePrefix+JSON.stringify(classifyNativeFailure(error)));console.error('RESULT_NATIVE_CONTROLLER_FAILED');process.exitCode=2;}
}
