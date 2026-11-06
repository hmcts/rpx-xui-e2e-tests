import assert from 'node:assert/strict';
import path from 'node:path';
import {runPersonalCohort,isPersonalCohortClosedFailure} from './run-harness-personal-service-cohort.mjs';
import {personalFile} from './lib/exui-personal-service-invocation-binding.mjs';
import {personalAdmissionDigest,validatePersonalAdmissionContext,verifyPersonalNativeCapture} from './lib/exui-personal-service-admission.mjs';
import {writeJsonAtomic} from './lib/exui-evidence-io.mjs';
// Canonical caller awaits this real API and retains the returned request pin.
// The collector performs publication admission; do not replay its full reader here.
const closedFailures=new WeakSet();
export const isPersonalAdmissionClosedFailure=error=>error instanceof Error&&closedFailures.has(error);
export async function runPersonalServiceAdmission({candidate,browser,output,signal,nativeContext,nativeOutput}){
 let stage='preflight';
 try{
 assert(!signal?.aborted,'PERSONAL_SERVICE_ADMISSION_CANCELLED');
 if(nativeOutput){const reference=verifyPersonalNativeCapture(nativeOutput,nativeContext.capture);nativeContext={...nativeContext,expected:{...nativeContext.expected,personalServiceNativeBinding:reference}};}
 const admissionContext=structuredClone(validatePersonalAdmissionContext(nativeContext));
 stage='cohort';
 const {result,expected}=await runPersonalCohort({candidate,browser,output,signal,admissionContext});
 stage='closed';
 assert(!signal?.aborted,'PERSONAL_SERVICE_ADMISSION_CANCELLED');
 assert.equal(result.status,'fresh-cohort-ready-for-independent-review','PERSONAL_SERVICE_PAIR_REQUIRED');
 const request={schemaVersion:1,kind:'personal-service-admission-request',directory:output,expected,contractDigest:personalAdmissionDigest(),receiptDigest:personalFile(output,'personal-service-cohort.json').digest,timingDigest:personalFile(output,'cohort-timing.json').digest};
 const file=path.join(output,'personal-service-admission-request.json');writeJsonAtomic(file,request);
 return {status:'passed',reportRequest:{path:file,digest:personalFile(output,path.basename(file)).digest,runId:expected.runId}};
 }catch(error){if(!signal?.aborted&&error instanceof Error&&(stage==='preflight'||stage==='closed'||isPersonalCohortClosedFailure(error)))closedFailures.add(error);throw error;}
}
