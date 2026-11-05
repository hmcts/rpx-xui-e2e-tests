import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
import {APPLICANT_RESULTS_SCOPE,APPLICANT_RESULTS_MUTATIONS,applicantResultsContract,applicantResultWorkbookDigest} from './exui-applicant-results-contract.mjs';
import {assertApplicantResultDates} from './exui-applicant-result-dates.mjs';
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value??'');
export const applicantResultSequence=Object.freeze(['baseline',...APPLICANT_RESULTS_MUTATIONS]);
export function validateApplicantResultRuntime(input,variant) {
 assert(applicantResultSequence.includes(variant),'RESULT_TRANSITION_VARIANT');
 assert.equal(input.releaseScopeId,APPLICANT_RESULTS_SCOPE,'RESULT_TRANSITION_SCOPE');
 assert.equal(input.variant,variant,'RESULT_TRANSITION_VARIANT');
 assert.equal(input.ccd.ready,true,'RESULT_TRANSITION_NOT_READY');
 assert(/^[a-f0-9]{64}$/.test(input.ccd.namespace),'RESULT_TRANSITION_NAMESPACE');
 assert(/^harness-[a-f0-9]{16}$/.test(input.ccd.owner),'RESULT_TRANSITION_OWNER');
 assert.equal(input.definition?.kind,'native-applicant-result-definition','RESULT_TRANSITION_NATIVE_IMPORT');
 const definition=input.definition;
 assert.equal(definition.variant,variant,'RESULT_TRANSITION_IMPORT_VARIANT');
 assert.equal(definition.owner,input.ccd.owner,'RESULT_TRANSITION_IMPORT_OWNER');
 assert.equal(definition.namespace,input.ccd.namespace,'RESULT_TRANSITION_IMPORT_NAMESPACE');
 assert.equal(definition.fixtureDigest,applicantResultWorkbookDigest(variant),'RESULT_TRANSITION_WORKBOOK');
 assert.deepEqual(definition.sourceContract,applicantResultsContract(),'RESULT_TRANSITION_SOURCE');
 assert.deepEqual(definition.images,input.ccd.images,'RESULT_TRANSITION_IMAGES');
 assert(Number.isSafeInteger(definition.definitionVersion)&&definition.definitionVersion>0,'RESULT_TRANSITION_VERSION');
 for(const value of [input.definitionImportDigest,definition.observedDefinitionDigest,input.resultExpectedDigest,input.resultDatesDigest,...Object.values(input.resultDescriptorDigests??{})])assert(digest(value),'RESULT_TRANSITION_DIGEST');
 assert.deepEqual(Object.keys(input.resultDescriptorDigests??{}).sort(),['definition','search','workbasket'],'RESULT_TRANSITION_DESCRIPTORS');
 assert.equal(input.resultExpectedDigest,digestBytes(JSON.stringify(input.resultExpected)),'RESULT_TRANSITION_EXPECTED_DIGEST');
 assertApplicantResultDates(input.storedResultDates,input.ccd,definition.definitionVersion,{variant,workbookDigest:definition.fixtureDigest});
 assert.deepEqual(Object.keys(input.credentials??{}).sort(),['allowed','observer'],'RESULT_TRANSITION_ACTORS');
 assert.deepEqual(input.credentials.allowed,input.credentials.observer,'RESULT_TRANSITION_ACTOR_ALIAS');
 assert(/^Bearer \S+$/.test(input.credentials.allowed.headers?.Authorization??''),'RESULT_TRANSITION_BEARER');
}
export function applicantResultTransitionRequest(input,invocationId,priorInput=input) {
 const index=applicantResultSequence.indexOf(invocationId);assert(index>0,'RESULT_TRANSITION_INVOCATION');
 validateApplicantResultRuntime(input,'baseline');validateApplicantResultRuntime(priorInput,applicantResultSequence[index-1]);
 assert(/^ccd-[a-f0-9-]{36}$/.test(input.runId),'RESULT_TRANSITION_RUN');
 assert.equal(priorInput.runId,input.runId,'RESULT_TRANSITION_PRIOR_RUN');
 return {schemaVersion:1,runId:input.runId,releaseScopeId:APPLICANT_RESULTS_SCOPE,invocationId,priorInvocationId:applicantResultSequence[index-1],priorNamespace:priorInput.ccd.namespace,priorDefinitionImportDigest:priorInput.definitionImportDigest};
}
export function validateApplicantResultTransitionRequest(input,request,priorInput) {
 assert.deepEqual(request,applicantResultTransitionRequest(input,request.invocationId,priorInput),'RESULT_TRANSITION_REQUEST');
}
export function selectApplicantResultRuntime(input,invocationId,record) {
 const index=applicantResultSequence.indexOf(invocationId);assert(index>0,'RESULT_TRANSITION_INVOCATION');
 assert.equal(record?.schemaVersion,1,'RESULT_TRANSITION_ACK_SCHEMA');
 assert.equal(record.runId,input.runId,'RESULT_TRANSITION_ACK_RUN');assert.equal(record.invocationId,invocationId,'RESULT_TRANSITION_ACK_INVOCATION');
 assert.deepEqual(Object.keys(record).sort(),['invocationId','request','requestDigest','runId','runtime','schemaVersion'],'RESULT_TRANSITION_ACK_FIELDS');
 const request=record.request;
 assert.deepEqual(Object.keys(request??{}).sort(),['invocationId','priorDefinitionImportDigest','priorInvocationId','priorNamespace','releaseScopeId','runId','schemaVersion'],'RESULT_TRANSITION_REQUEST_FIELDS');
 assert.equal(request.schemaVersion,1,'RESULT_TRANSITION_REQUEST_SCHEMA');
 assert(/^[a-f0-9]{64}$/.test(request.priorNamespace)&&digest(request.priorDefinitionImportDigest),'RESULT_TRANSITION_PRIOR_BINDING');
 assert.equal(request?.runId,input.runId,'RESULT_TRANSITION_REQUEST_RUN');
 assert.equal(request.releaseScopeId,APPLICANT_RESULTS_SCOPE,'RESULT_TRANSITION_REQUEST_SCOPE');
 assert.equal(request.invocationId,invocationId,'RESULT_TRANSITION_REQUEST_INVOCATION');
 assert.equal(request.priorInvocationId,applicantResultSequence[index-1],'RESULT_TRANSITION_ORDER');
 assert.equal(record.requestDigest,digestBytes(JSON.stringify(request)),'RESULT_TRANSITION_REQUEST_DIGEST');
 const runtime=record.runtime;
 validateApplicantResultRuntime(runtime,invocationId);
 for(const key of ['runId','releaseScopeId','harnessCommit','harnessSourceDigest','harnessSourceState','browserDigest','artifact','apiContracts','gatewayDigest','harnessDependencies','nativeRuntime','browserRuntimeImage','correctedDependency','supportingScaffold','supportingScaffoldDigest'])assert.deepEqual(runtime[key],input[key],'RESULT_TRANSITION_IDENTITY_DRIFT');
 assert.deepEqual(runtime.ccd.images,input.ccd.images,'RESULT_TRANSITION_IMAGE_DRIFT');
 for(const value of [input.ccd.namespace,request.priorNamespace])assert.notEqual(runtime.ccd.namespace,value,'RESULT_TRANSITION_NAMESPACE_REUSE');
 assert.notEqual(runtime.ccd.owner,input.ccd.owner,'RESULT_TRANSITION_OWNER_REUSE');
 assert.notEqual(runtime.definitionImportDigest,input.definitionImportDigest,'RESULT_TRANSITION_IMPORT_REUSE');
 return runtime;
}
export function publishApplicantResultRuntime(output,record) {
 assert(APPLICANT_RESULTS_MUTATIONS.includes(record.invocationId),'RESULT_TRANSITION_INVOCATION');
 const directory=path.join(output,record.invocationId);fs.mkdirSync(directory,{recursive:true,mode:0o700});assert.equal(fs.realpathSync(directory),directory,'RESULT_TRANSITION_ALIAS');
 const file=path.join(directory,'runtime-input.json'),temporary=path.join(directory,`.${randomUUID()}.json`);
 try{writeJsonAtomic(temporary,record);fs.linkSync(temporary,file);}finally{fs.rmSync(temporary,{force:true});}
 return {path:path.relative(output,file),digest:digestBytes(fs.readFileSync(file))};
}
export async function waitForApplicantResultRuntime(input,output,invocationId,priorInput,{isCancelled=()=>false,timeoutMs=6*60_000}={}) {
 const request=applicantResultTransitionRequest(input,invocationId,priorInput);
 const file=path.join(output,invocationId,'runtime-input.json'),deadline=Date.now()+timeoutMs;
 while(!fs.existsSync(file)){assert(!isCancelled(),'RESULT_TRANSITION_CANCELLED');assert(Date.now()<deadline,'RESULT_TRANSITION_ACK_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,10));}
 assert(!isCancelled(),'RESULT_TRANSITION_CANCELLED');assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'RESULT_TRANSITION_ALIAS');
 const record=JSON.parse(fs.readFileSync(file,'utf8'));assert.deepEqual(record.request,request,'RESULT_TRANSITION_REQUEST');
 return selectApplicantResultRuntime(input,invocationId,record);
}

export async function waitForApplicantResultBaselineCapture(input,output,{isCancelled=()=>false,timeoutMs=30_000}={}) {
 const file=path.join(output,'independent-results-baseline.json'),deadline=Date.now()+timeoutMs;
 while(!fs.existsSync(file)){assert(!isCancelled(),'RESULT_TRANSITION_CANCELLED');assert(Date.now()<deadline,'RESULT_BASELINE_CAPTURE_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,10));}
 assert(!isCancelled(),'RESULT_TRANSITION_CANCELLED');assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'RESULT_BASELINE_CAPTURE_ALIAS');
 const capture=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(capture.capturedBeforeExecution,true,'RESULT_BASELINE_CAPTURE_ORDER');
 for(const key of ['runId','harnessCommit','releaseScopeId','harnessSourceDigest'])assert.equal(capture.expected?.[key],input[key],'RESULT_BASELINE_CAPTURE_IDENTITY');
 assert.deepEqual(capture.definition,input.definition,'RESULT_BASELINE_CAPTURE_DEFINITION');assert.deepEqual(capture.ccd,input.ccd,'RESULT_BASELINE_CAPTURE_CCD');
}
