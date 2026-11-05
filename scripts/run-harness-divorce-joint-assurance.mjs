#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {validateCiJob} from './lib/exui-candidate-ci-inputs.mjs';
import {captureAssuranceExpectations,writeNativeDescriptor} from './run-harness-assurance.mjs';
import {runHarnessCi} from './run-harness-ci.mjs';
import {runDivorceProfileAdmission} from './run-harness-divorce-profile-admission.mjs';
import Reporter from './harness-public-odhin-reporter.cjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
// A fixed caller, not a new CI phase: finish the native controller before installing profile cancellation handlers.
export async function runDivorceJointAssurance(jobPath,profileOutput){
 assert.equal(process.cwd(),root,'DIVORCE_JOINT_CWD');assert(path.isAbsolute(jobPath)&&path.isAbsolute(profileOutput),'DIVORCE_JOINT_INPUT');
 Reporter.resetPublicReport('harness');
 const job=validateCiJob(JSON.parse(fs.readFileSync(jobPath))),captured=captureAssuranceExpectations();
 const sourceInputs=process.env.HARNESS_SHARED_ROLE_SOURCE_INPUTS?JSON.parse(fs.readFileSync(process.env.HARNESS_SHARED_ROLE_SOURCE_INPUTS)):undefined;
 const started=performance.now(),verdict=await runHarnessCi(jobPath,{captureNativeCohort:value=>{captured.nativeCohortCapture=value;}}),nativeElapsedMs=Math.round(performance.now()-started);
 assert(captured.nativeCohortCapture,'DIVORCE_JOINT_PREFLIGHT');
 // The returned pins originate from this actual wrapper invocation, never a later scan of output files.
 const profile=await runDivorceProfileAdmission({artifactPath:job.candidateManifest,browserRoot:job.browserCache,output:profileOutput});
 const descriptor=writeNativeDescriptor(job,captured,verdict,sourceInputs,profile.reportRequest);
 const {runHarnessCollection}=await import('./run-harness-local-aat.cjs');
 const diagnostics=await runHarnessCollection(process.env,{profile:'harness',nativeEvidencePath:descriptor,nativeElapsedMs,...(verdict.phaseTimings?{phaseTimings:verdict.phaseTimings}:{})});
 assert.equal(diagnostics.divorceProfileInclusion,'included','DIVORCE_JOINT_NOT_INCLUDED');
 return {nativeStatus:verdict.status,profileStatus:profile.status,descriptor,diagnosticStatus:diagnostics.status,exitCode:Math.max(verdict.exitCode,diagnostics.exitCode),releaseApproval:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);assert(args.length===4&&args[0]==='--input'&&args[2]==='--profile-output','DIVORCE_JOINT_INPUT');const result=await runDivorceJointAssurance(args[1],args[3]);console.log(JSON.stringify(result));process.exitCode=result.exitCode;}
 catch{console.error('DIVORCE_JOINT_ASSURANCE_FAILED');process.exitCode=2;}
}
