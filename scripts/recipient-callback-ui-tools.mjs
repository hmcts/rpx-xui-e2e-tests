import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {startCcdGateway,seedCcdSession} from './lib/exui-ccd-browser-runtime.mjs';
import {seedAppCcdSessions} from './lib/exui-native-contract.mjs';
import {verifyHarnessDependencies} from './lib/exui-harness-dependencies.mjs';
import {describeCandidateArtifact,digestCandidateTree} from './lib/exui-candidate-artifact.mjs';
import {assertRuntimeIdentity} from './lib/exui-candidate-runtime.mjs';
import {assertCandidateConfigurationSources} from './lib/exui-configuration-catalogue.mjs';
import {digestBytes,writeJsonAtomic} from './lib/exui-evidence-io.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const directory='/output/baseline',input=read('/output/input.json');
assert.equal(input.kind,'recipient-callback-ui-feasibility');assert(['baseline','binding-omitted'].includes(input.variant));
if(process.argv.includes('--inside-providers')) {
 assert.equal(digestBytes(JSON.stringify(input.harnessSources.map(file=>[file,digestBytes(fs.readFileSync('/harness/'+file))]))),input.harnessSourceDigest,'HARNESS_SOURCE_SNAPSHOT_MISMATCH');
 await verifyHarnessDependencies('/harness/node_modules','/harness/package.json','/harness/yarn.lock',input.harnessDependencies.digest);
 assert.equal(await digestCandidateTree('/browser'),input.browserDigest,'BROWSER_ARTIFACT_MISMATCH');
 const observed=await describeCandidateArtifact('/candidate',input.artifact.provenance);assertRuntimeIdentity(input.artifact.identity,observed.identity);
 assertCandidateConfigurationSources('/candidate',read('/harness/scripts/fixtures/exui-configuration-review.json'));
 for(const [name,port] of [['data',4452],['definition',4451]]) {
  const response=await fetch(`http://127.0.0.1:${port}/v3/api-docs`,{redirect:'error'});assert(response.ok);assert.equal(digestBytes(JSON.stringify(await response.json())),input.apiContracts[name]);
 }
 for(const [name,route] of [['definition','/api/data/case-type/HarnessNestedPRL'],['pages','/api/display/wizard-page-structure/case-types/HarnessNestedPRL/event-triggers/serviceOfDocuments']]){
  const response=await fetch('http://127.0.0.1:4451'+route,{headers:input.credentials.observer.headers,redirect:'error'});assert(response.ok);assert.equal(digestBytes(JSON.stringify(await response.json())),input.callbackObservedDigests[name],'CALLBACK_DESCRIPTOR_DRIFT');
 }
 const sessions=seedAppCcdSessions(input.credentials,seedCcdSession,'exui-ccd-event-capability-pilot');
 writeJsonAtomic(directory+'/personas.json',{credentials:input.credentials,sessions});fs.chmodSync(directory+'/personas.json',0o600);
 const server=await startCcdGateway(directory,input.credentials,null,'exui-ccd-event-capability-pilot',{recipientCallback:{invocationId:'recipient-callback-ui'}});
 writeJsonAtomic(directory+'/provider-ready.json',{cookie:sessions.allowed});
 process.once('SIGTERM',()=>server.close(error=>{if(error)process.exit(2);writeJsonAtomic(directory+'/provider-stopped.json',{closed:true});process.exit(0);}));
} else if(process.argv.includes('--inside-proof')) {
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',EXUI_CALLBACK_FEASIBILITY:'true',EXUI_CALLBACK_VARIANT:input.variant,EXUI_CCD_PERSONAS:directory+'/personas.json',EXUI_CCD_EVIDENCE:directory,EXUI_HARNESS_TEST_OUTPUT:directory+'/test-output',EXUI_CALLBACK_REPORT:directory+'/report.json',EXUI_CHROMIUM_EXECUTABLE:input.browserExecutable};
 const child=spawn(process.execPath,['/harness/node_modules/@playwright/test/cli.js','test','--config','/harness/playwright.callback-feasibility.config.mjs'],{cwd:'/harness',env,stdio:'inherit'});
 const terminal=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 writeJsonAtomic(directory+'/framework-terminal.json',terminal);process.exitCode=terminal.signal?2:terminal.code;
} else throw Error('CALLBACK_UI_TOOLS_INVOCATION_REQUIRED');
