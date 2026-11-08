const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');

// Execute the production entrypoint with native/profile children replaced, never Docker.
exports.runEntrypoint = function runEntrypoint(fixture, {profileOutput, cancelNative = false, closedPersonalFailure = false, mutation} = {}) {
 const root = fixture.root, scripts = path.join(root, 'scripts'), lib = path.join(scripts, 'lib');
 fs.mkdirSync(lib, {recursive: true});
 let source=fs.readFileSync(path.join(__dirname,'../run-harness-assurance.mjs'),'utf8');
 if(mutation==='unconditional-profile')source=source.replace('profileOutput === undefined ? {} : {profile:', 'false ? {} : {profile:');
 if(mutation==='profile-only-preparation')source=source.replace(/^      prepare: (.*),$/m,'      ...(profileOutput === undefined ? {} : {prepare: $1}),');
 if(mutation==='omit-personal-progress')source=source.replace(/^(      personal: signal => )reportNativeProgress\("Personal-service preparation, proofs and cleanup", \(\) => (.*)\),$/m,'$1$2,');
 if(mutation==='omit-collector-progress')source=source.replace(/^(      collect: \(nativeEvidencePath, timing\) => )reportNativeProgress\("Evidence replay and diagnostic report", \(\) => (.*)\),$/m,'$1$2,');
 fs.writeFileSync(path.join(scripts,'run-harness-assurance.mjs'),source);
 const write = (name, bytes) => fs.writeFileSync(path.join(scripts, name), bytes);
 for (const name of ['exui-evidence-io.mjs', 'exui-selector-event-row-evidence.mjs', 'exui-candidate-artifact.mjs'])
  write('lib/' + name, `export * from ${JSON.stringify(pathToFileURL(path.join(__dirname, '../lib', name)).href)};`);
 write('lib/exui-complex-email-admission.mjs',"export const verifyComplexNativeCapture=()=>undefined;export const prepareComplexAdmissionInputs=()=>({attempt:{schemaVersion:1,kind:'complex-email-attempt',status:'NOT_RUN',reason:'SOURCE_INPUTS_NOT_CONFIGURED'}});");
 write('run-harness-complex-email-admission.mjs',"export async function runComplexEmailAdmission(){throw Error('UNEXPECTED_UNCONFIGURED_COMPLEX_RUN');}");
 write('lib/exui-personal-service-admission.mjs','export const verifyPersonalNativeCapture=()=>undefined;');
 write('run-harness-st-cic-profile-admission.mjs','export const runStCicProfileAdmission=()=>{throw Error("UNEXPECTED_ST_CIC_RUN");};');
 write('run-harness-fr-profile-admission.mjs','export const runFrProfileAdmission=()=>{throw Error("UNEXPECTED_FR_PROFILE_RUN");};');
 write('run-harness-cmc-profile-admission.mjs','export const runCmcProfileAdmission=()=>{throw Error("UNEXPECTED_CMC_PROFILE_RUN");};');
 write('lib/exui-st-cic-profile-admission.mjs','export const verifyStCicNativeCapture=()=>{throw Error("UNEXPECTED_ST_CIC_CAPTURE");};');
 write('run-harness-personal-service-admission.mjs',`import fs from 'node:fs';const record=x=>fs.appendFileSync('calls.jsonl',JSON.stringify(x)+'\\n');const closedError=Error('PRIVATE-PROGRESS-ERROR-CANARY');export const isPersonalAdmissionClosedFailure=error=>error===closedError;export async function runPersonalServiceAdmission(options){record('personal');${closedPersonalFailure ? 'throw closedError;' : ''}return {private:'PRIVATE-PROGRESS-RESULT-CANARY',status:'passed',reportRequest:{path:'/personal',digest:'sha256:'+'a'.repeat(64),runId:'personal'}};}`);
 write('lib/exui-divorce-native-binding.mjs', 'export const verifyDivorceNativeCapture=()=>undefined;');
 write('lib/exui-output-boundary.mjs', 'export const writeHarnessPublicSummary=()=>{};');
 write('lib/exui-candidate-ci-inputs.mjs', 'export const validateCiJob=value=>value;');
 write('lib/exui-release-policy.mjs', `export const getReleasePolicy=()=>({policyDigest:${JSON.stringify(Object.values(fixture.captured.policies)[0].policyDigest)}});`);
 const append = `const record=x=>fs.appendFileSync('calls.jsonl',JSON.stringify(x)+${JSON.stringify('\n')});`;
 const record = `import fs from 'node:fs';${append}`;
 write('run-harness-ci.mjs', `${record}export {reportNativeProgress} from ${JSON.stringify(pathToFileURL(path.join(__dirname,'../run-harness-ci.mjs')).href)};export async function runHarnessCi(file,options){record('native');options.captureNativeCohort({binding:{}});options.capturePersonalNative?.({binding:{},reference:{}});${cancelNative ? "process.emit('SIGTERM');" : ''}return ${JSON.stringify(fixture.verdict)};}`);
 write('run-harness-divorce-profile-admission.mjs', `${record}export async function runDivorceProfileAdmission(){record('profile');throw Error('CONTROLLED_UNQUALIFIED_PROFILE');}`);
 write('run-harness-local-aat.cjs', `const fs=require('node:fs');${append}exports.runHarnessCollection=async(env,options)=>{record({collect:options});return {status:'passed',exitCode:0,personalServiceInclusion:'included'};};`);
 write('harness-public-odhin-reporter.cjs', `const fs=require('node:fs');${append}module.exports={resetPublicReport:()=>record('withdraw')};`);
 const bin = path.join(root, 'bin');fs.mkdirSync(bin);
 fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nprintf "%s\\n" ' + fixture.captured.harnessCommit + '\n', {mode: 0o700});
 const candidateManifest=path.join(root,'candidate.json');fs.writeFileSync(candidateManifest,JSON.stringify({provenance:{platform:'linux/arm64'}}));
 const job = path.join(root, 'job.json');fs.writeFileSync(job, JSON.stringify({...fixture.job,candidateManifest}));
 write('invoke.mjs', `import {runHarnessAssurance} from './run-harness-assurance.mjs';try{console.log(JSON.stringify(await runHarnessAssurance(${JSON.stringify(job)},${JSON.stringify(profileOutput === undefined ? {} : {profileOutput})})));}catch(error){console.log(JSON.stringify({error:error.message}));}`);
 const terminal = spawnSync(process.execPath, [path.join(scripts, 'invoke.mjs')], {cwd: root, encoding: 'utf8', env: {PATH: bin + path.delimiter + process.env.PATH}});
 const callsPath = path.join(root, 'calls.jsonl');
 const lines=terminal.stdout.trim().split('\n');
 return {terminal, progress:lines.slice(0,-1), result: lines.at(-1) ? JSON.parse(lines.at(-1)) : null, calls: fs.existsSync(callsPath) ? fs.readFileSync(callsPath, 'utf8').trim().split('\n').map(JSON.parse) : []};
};
