import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
import {SELECTOR_EVENT_SCOPE,SELECTOR_EVENT_MUTATION,deriveSelectorEventRowFixture} from './exui-selector-event-row-contract.mjs';
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value??'');
export const selectorSequence=Object.freeze(['baseline',SELECTOR_EVENT_MUTATION]);
export function validateSelectorRuntimeInput(input,invocationId) {
 assert(selectorSequence.includes(invocationId),'SELECTOR_TRANSITION_INVOCATION');
 assert.equal(input.releaseScopeId,SELECTOR_EVENT_SCOPE,'SELECTOR_TRANSITION_SCOPE');
 assert.equal(input.ccd.ready,true,'SELECTOR_TRANSITION_NOT_READY');
 assert(/^[a-f0-9]{64}$/.test(input.ccd.namespace),'SELECTOR_TRANSITION_NAMESPACE');
 assert(/^harness-[a-f0-9]{16}$/.test(input.ccd.owner),'SELECTOR_TRANSITION_OWNER');
 const variant=invocationId==='baseline'?'baseline':'summary-hidden',definition=input.definition;
 assert.equal(definition?.kind,'native-selector-event-row-definition','SELECTOR_TRANSITION_IMPORT');
 assert.equal(definition.variant,variant,'SELECTOR_TRANSITION_VARIANT');
 assert.equal(definition.releaseScopeId,SELECTOR_EVENT_SCOPE,'SELECTOR_TRANSITION_IMPORT_SCOPE');
 assert.equal(definition.owner,input.ccd.owner,'SELECTOR_TRANSITION_OWNER');
 assert.equal(definition.namespace,input.ccd.namespace,'SELECTOR_TRANSITION_NAMESPACE');
 assert.deepEqual(definition.images,input.ccd.images,'SELECTOR_TRANSITION_IMAGES');
 assert.deepEqual(definition.sourceBinding,deriveSelectorEventRowFixture(variant).binding,'SELECTOR_TRANSITION_SOURCE');
 assert.deepEqual(input.selectorEventBinding,definition.sourceBinding,'SELECTOR_TRANSITION_SOURCE');
 assert(Number.isSafeInteger(definition.definitionVersion)&&definition.definitionVersion>0,'SELECTOR_TRANSITION_VERSION');
 for(const value of [input.definitionImportDigest,definition.fixtureDigest,definition.sourceDefinitionDigest,definition.observedDefinitionDigest,definition.observedPagesDigest,definition.storedDateDigest])assert(digest(value),'SELECTOR_TRANSITION_DIGEST');
 const personas=['allowed','courtadmin','judge','observer','readonly'];
 assert.deepEqual(Object.keys(input.credentials??{}).sort(),personas,'SELECTOR_TRANSITION_ACTORS');
 const actors=personas.map(name=>input.credentials[name]);
 assert(actors.every(actor=>/^[a-f0-9-]{36}$/i.test(actor.userId)&&/^Bearer \S+$/.test(actor.headers?.Authorization??'')),'SELECTOR_TRANSITION_ACTOR');
 assert.equal(new Set(actors.map(actor=>actor.userId)).size,5,'SELECTOR_TRANSITION_ACTOR_COLLISION');
 assert.equal(new Set(actors.map(actor=>actor.headers.Authorization)).size,5,'SELECTOR_TRANSITION_BEARER_COLLISION');
 for(const persona of ['courtadmin','judge','readonly'])assert.deepEqual(input.credentials[persona].roles?.slice().sort(),['caseworker','caseworker-harness',`caseworker-privatelaw-${persona}`],'SELECTOR_TRANSITION_SOURCE_ROLES');
}
export function selectorTransitionRequest(input) {
 validateSelectorRuntimeInput(input,'baseline');
 assert(/^ccd-[a-f0-9-]{36}$/.test(input.runId),'SELECTOR_TRANSITION_RUN');
 return {schemaVersion:1,runId:input.runId,releaseScopeId:SELECTOR_EVENT_SCOPE,invocationIds:[SELECTOR_EVENT_MUTATION],baselineNamespace:input.ccd.namespace,baselineDefinitionImportDigest:input.definitionImportDigest};
}
export function validateSelectorTransitionRequest(input,request) {
 assert.deepEqual(request,selectorTransitionRequest(input),'SELECTOR_TRANSITION_REQUEST');
}
export function selectSelectorRuntime(input,record) {
 assert.deepEqual(Object.keys(record??{}).sort(),['invocationId','request','requestDigest','runId','runtime','schemaVersion'],'SELECTOR_TRANSITION_ACK_FIELDS');
 assert.equal(record.schemaVersion,1,'SELECTOR_TRANSITION_SCHEMA');assert.equal(record.runId,input.runId,'SELECTOR_TRANSITION_RUN');
 assert.equal(record.invocationId,SELECTOR_EVENT_MUTATION,'SELECTOR_TRANSITION_INVOCATION');
 validateSelectorTransitionRequest(input,record.request);
 assert.equal(record.requestDigest,digestBytes(JSON.stringify(record.request)),'SELECTOR_TRANSITION_REQUEST_DIGEST');
 const runtime=record.runtime;validateSelectorRuntimeInput(runtime,SELECTOR_EVENT_MUTATION);
 for(const key of ['runId','releaseScopeId','harnessCommit','harnessSourceDigest','harnessSourceState','browserDigest','artifact','apiContracts','gatewayDigest','harnessDependencies','nativeRuntime','browserRuntimeImage'])assert.deepEqual(runtime[key],input[key],'SELECTOR_TRANSITION_IDENTITY_DRIFT');
 assert.deepEqual(runtime.ccd.images,input.ccd.images,'SELECTOR_TRANSITION_IMAGE_DRIFT');
 assert.equal(runtime.ccd.platform??'linux/arm64',input.ccd.platform??'linux/arm64','SELECTOR_TRANSITION_PLATFORM');
 assert.notEqual(runtime.ccd.namespace,input.ccd.namespace,'SELECTOR_TRANSITION_NAMESPACE_REUSE');
 assert.notEqual(runtime.ccd.owner,input.ccd.owner,'SELECTOR_TRANSITION_OWNER_REUSE');
 assert.notEqual(runtime.definitionImportDigest,input.definitionImportDigest,'SELECTOR_TRANSITION_IMPORT_REUSE');
 assert.notEqual(runtime.definition.observedDefinitionDigest,input.definition.observedDefinitionDigest,'SELECTOR_TRANSITION_DESCRIPTOR_UNCHANGED');
 assert.notEqual(runtime.definition.fixtureDigest,input.definition.fixtureDigest,'SELECTOR_TRANSITION_WORKBOOK_UNCHANGED');
 return runtime;
}
export function publishSelectorRuntime(output,record) {
 assert.equal(record.invocationId,SELECTOR_EVENT_MUTATION,'SELECTOR_TRANSITION_INVOCATION');
 const directory=path.join(output,SELECTOR_EVENT_MUTATION);fs.mkdirSync(directory,{recursive:true,mode:0o700});assert.equal(fs.realpathSync(directory),directory,'SELECTOR_TRANSITION_ALIAS');
 const file=path.join(directory,'runtime-input.json'),temporary=path.join(directory,`.${randomUUID()}.json`);
 try{writeJsonAtomic(temporary,record);fs.linkSync(temporary,file);}finally{fs.rmSync(temporary,{force:true});}
 return {path:path.relative(output,file),digest:digestBytes(fs.readFileSync(file))};
}
async function wait(file,{isCancelled=()=>false,timeoutMs}) {
 const deadline=Date.now()+timeoutMs;
 while(!fs.existsSync(file)){assert(!isCancelled(),'SELECTOR_TRANSITION_CANCELLED');assert(Date.now()<deadline,'SELECTOR_TRANSITION_ACK_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,10));}
 assert(!isCancelled(),'SELECTOR_TRANSITION_CANCELLED');assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'SELECTOR_TRANSITION_ALIAS');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
export async function waitForSelectorRuntime(input,output,{isCancelled=()=>false,timeoutMs=6*60_000}={}) {
 return selectSelectorRuntime(input,await wait(path.join(output,SELECTOR_EVENT_MUTATION,'runtime-input.json'),{isCancelled,timeoutMs}));
}
export async function waitForSelectorBaselineCapture(input,output,{isCancelled=()=>false,timeoutMs=30_000}={}) {
 const capture=await wait(path.join(output,'independent-selector-baseline.json'),{isCancelled,timeoutMs});
 assert.equal(capture.capturedBeforeExecution,true,'SELECTOR_BASELINE_CAPTURE_ORDER');
 for(const key of ['runId','harnessCommit','releaseScopeId','harnessSourceDigest'])assert.equal(capture.expected?.[key],input[key],'SELECTOR_BASELINE_CAPTURE_IDENTITY');
 assert.deepEqual(capture.definition,input.definition,'SELECTOR_BASELINE_CAPTURE_DEFINITION');assert.deepEqual(capture.ccd,input.ccd,'SELECTOR_BASELINE_CAPTURE_CCD');
}
