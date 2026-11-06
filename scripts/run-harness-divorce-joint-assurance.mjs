#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runHarnessAssurance} from './run-harness-assurance.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
// Local reproduction alias; Jenkins and local callers share one canonical sequence.
export async function runDivorceJointAssurance(jobPath,profileOutput){
 assert.equal(process.cwd(),root,'DIVORCE_JOINT_CWD');assert(path.isAbsolute(jobPath)&&path.isAbsolute(profileOutput),'DIVORCE_JOINT_INPUT');
 return runHarnessAssurance(jobPath,{profileOutput});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);assert(args.length===4&&args[0]==='--input'&&args[2]==='--profile-output','DIVORCE_JOINT_INPUT');const result=await runDivorceJointAssurance(args[1],args[3]);console.log(JSON.stringify(result));process.exitCode=result.exitCode;}
 catch{console.error('DIVORCE_JOINT_ASSURANCE_FAILED');process.exitCode=2;}
}
