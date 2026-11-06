import assert from 'node:assert/strict';
import path from 'node:path';
import {runPersonalCohort} from './run-harness-personal-service-cohort.mjs';
import {personalFile} from './lib/exui-personal-service-invocation-binding.mjs';
import {personalAdmissionDigest,validatePersonalAdmissionContext} from './lib/exui-personal-service-admission.mjs';
import {writeJsonAtomic} from './lib/exui-evidence-io.mjs';
// Canonical caller awaits this real API and retains the returned request pin.
// The collector performs publication admission; do not replay its full reader here.
export async function runPersonalServiceAdmission({candidate,browser,output,signal,nativeContext}){
 assert(!signal?.aborted,'PERSONAL_SERVICE_ADMISSION_CANCELLED');
 const admissionContext=structuredClone(validatePersonalAdmissionContext(nativeContext));
 const {result,expected}=await runPersonalCohort({candidate,browser,output,signal,admissionContext});
 assert(!signal?.aborted,'PERSONAL_SERVICE_ADMISSION_CANCELLED');
 assert.equal(result.status,'fresh-cohort-ready-for-independent-review','PERSONAL_SERVICE_PAIR_REQUIRED');
 const request={schemaVersion:1,kind:'personal-service-admission-request',directory:output,expected,contractDigest:personalAdmissionDigest(),receiptDigest:personalFile(output,'personal-service-cohort.json').digest,timingDigest:personalFile(output,'cohort-timing.json').digest};
 const file=path.join(output,'personal-service-admission-request.json');writeJsonAtomic(file,request);
 return {status:'passed',reportRequest:{path:file,digest:personalFile(output,path.basename(file)).digest,runId:expected.runId}};
}
