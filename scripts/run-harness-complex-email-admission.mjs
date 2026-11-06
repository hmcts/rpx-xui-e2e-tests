import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runComplexEmailCohort,complexProducer} from './run-harness-complex-email-cohort.mjs';
import {COMPLEX_CONTEXTS,complexPin} from './lib/exui-complex-email-cohort.mjs';
import {complexAdmissionDigest,validateComplexAdmissionContext,verifyComplexNativeCapture,recheckComplexAdmissionInputs} from './lib/exui-complex-email-admission.mjs';
import {writeJsonAtomic} from './lib/exui-evidence-io.mjs';
// No failed result is branded safe. The caller stops publication on every rejection.
export async function runComplexEmailAdmission({candidate,browser,output,signal,nativeContext,nativeOutput,sourceConfiguration},operations={}){
 const active=()=>assert(!signal?.aborted,'COMPLEX_EMAIL_ADMISSION_CANCELLED');active();
 const reference=verifyComplexNativeCapture(nativeOutput,nativeContext.capture);
 const admissionContext=structuredClone(validateComplexAdmissionContext({...nativeContext,expected:{...nativeContext.expected,complexEmailNativeBinding:reference}}));
 assert.deepEqual(sourceConfiguration,admissionContext.capture.binding.sourceConfiguration,'COMPLEX_EMAIL_SOURCE_INPUTS_CHANGED');
 const sourceInputs=recheckComplexAdmissionInputs(sourceConfiguration);assert(!sourceConfiguration.attempt,'COMPLEX_EMAIL_CAPABILITY_REQUIRED');
 const runId='complex-'+randomUUID(),producer=(operations.producer??complexProducer)(),startedAt=new Date().toISOString(),started=performance.now();
 const {result,expected}=await(operations.run??runComplexEmailCohort)({candidate,browser,output,sourceInputs,signal,admissionContext,admissionContractDigest:complexAdmissionDigest(),runId});
 active();assert.equal(result.status,'OBSERVATIONS_VERIFIED','COMPLEX_EMAIL_PAIR_REQUIRED');assert.equal(expected.runId,runId,'COMPLEX_EMAIL_RUN_REQUIRED');assert.deepEqual(expected.admissionContext,admissionContext,'COMPLEX_EMAIL_CONTEXT_CHANGED');assert.deepEqual(expected.producer,producer,'COMPLEX_EMAIL_PRODUCER_CHANGED');
 assert.deepEqual(Object.keys(expected.contexts).sort(),[...COMPLEX_CONTEXTS].sort(),'COMPLEX_EMAIL_CONTEXTS_REQUIRED');
 for(const context of Object.values(expected.contexts))assert(context.prepared&&context.completed&&context.closed?.observedAbsent===true,'COMPLEX_EMAIL_CLEANUP_REQUIRED');
 const terminal=expected.sourceProof?.terminal;assert(terminal?.started===true&&terminal.observed===true&&terminal.code===0&&terminal.signal===null&&terminal.cancelled===false&&terminal.forced===false,'COMPLEX_EMAIL_SOURCE_TERMINAL_REQUIRED');
 assert.deepEqual((operations.producer??complexProducer)(),producer,'COMPLEX_EMAIL_PRODUCER_CHANGED');recheckComplexAdmissionInputs(sourceConfiguration);verifyComplexNativeCapture(nativeOutput,nativeContext.capture);active();
 writeJsonAtomic(path.join(output,'cohort-timing.json'),{startedAt,endedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started),telemetryOnly:true});
 const request={schemaVersion:1,kind:'complex-email-admission-request',directory:output,expected,contractDigest:complexAdmissionDigest(),receiptDigest:complexPin(output,'complex-cohort-result.json'),timingDigest:complexPin(output,'cohort-timing.json')};
 const file=path.join(output,'complex-email-admission-request.json');writeJsonAtomic(file,request);active();
 return{status:'passed',reportRequest:{path:file,digest:complexPin(output,path.basename(file)),runId}};
}
