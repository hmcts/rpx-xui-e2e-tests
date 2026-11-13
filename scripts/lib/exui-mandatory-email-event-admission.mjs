import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes} from './exui-evidence-io.mjs';
import {divorceCandidateContent} from './exui-divorce-native-binding.mjs';
import {readMandatoryEmailCohort,MANDATORY_EMAIL_ROOT} from './exui-mandatory-email-event-invocation-binding.mjs';
import {mandatoryEmailFailure} from './exui-mandatory-email-event-observation.mjs';
import {MANDATORY_EMAIL_ADMISSION_POLICY,mandatoryEmailAdmissionContract,mandatoryEmailAdmissionDigest,mandatoryEmailReadFile,mandatoryEmailExpectedWithoutRequests,readMandatoryEmailAdmissionInput,validateMandatoryEmailAdmissionContext,verifyMandatoryEmailContextCohort} from './exui-mandatory-email-event-contract.mjs';
const fail='MANDATORY_EMAIL_ADMISSION_INVALID';
const keys=(value,names)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),fail);assert.deepEqual(Object.keys(value).sort(),names.slice().sort(),fail);};
const terminal={started:true,observed:true,closed:true,forced:false,cancelled:false,code:0,signal:null};
const admissionRows=contract=>contract.source.rows.map(row=>({id:row.obligationId,row:row.id,sourceKey:contract.sourceKey,sourceIndex:row.sourceIndex,sourceRowDigest:row.sourceRowDigest,baselineProofId:row.proofId,faultProofId:row.mutantProofId,assertionId:row.failureId,errorCode:mandatoryEmailFailure(row.id)}));
export function mandatoryEmailControllerCommand({candidate,browser,output,inputDigest}){
 assert([candidate,browser,output].every(p=>typeof p==='string'&&path.isAbsolute(p)&&path.normalize(p)===p),fail);assert(/^sha256:[a-f0-9]{64}$/.test(inputDigest),fail);
 return{executable:process.execPath,cwd:MANDATORY_EMAIL_ROOT,script:path.join(MANDATORY_EMAIL_ROOT,'scripts/run-harness-mandatory-email-event-cohort.mjs'),args:['--candidate',candidate,'--browser',browser,'--output',path.join(output,'cohort'),'--admission-input',path.join(output,'expected-input.json'),'--digest',inputDigest],environmentKeys:['HOME','PATH','TMPDIR']};
}
export function mandatoryEmailCohortPins(directory){
 const parent=mandatoryEmailReadFile(path.join(directory,'parent-input.json')),receipt=mandatoryEmailReadFile(path.join(directory,'mandatory-email-cohort.json'));
 return{inputDigest:parent.digest,cohortDigest:digestBytes(JSON.stringify(parent.value)),receiptDigest:receipt.digest,records:receipt.value.records};
}
export function mandatoryEmailAdmissionPins(directory){
 const input=mandatoryEmailReadFile(path.join(directory,'expected-input.json'));
 return{runId:input.value.runId,inputDigest:input.digest,launchDigest:mandatoryEmailReadFile(path.join(directory,'independent-controller-launch.json')).digest,terminalDigest:mandatoryEmailReadFile(path.join(directory,'independent-controller-terminal.json')).digest,cleanupDigest:mandatoryEmailReadFile(path.join(directory,'independent-controller-cleanup.json')).digest,cohort:mandatoryEmailCohortPins(path.join(directory,'cohort'))};
}
export function readMandatoryEmailAdmissionPacket(requestPath,requestPin){
 keys(requestPin,['runId','digest']);const actual=mandatoryEmailReadFile(requestPath);assert.equal(actual.digest,requestPin.digest,fail);const request=actual.value;
 keys(request,['schemaVersion','kind','directory','expected']);assert.equal(request.schemaVersion,1,fail);assert.equal(request.kind,'mandatory-email-admission-request',fail);assert.equal(request.expected.runId,requestPin.runId,fail);
 const directory=request.directory;assert(path.isAbsolute(directory)&&path.normalize(directory)===directory&&fs.realpathSync(directory)===directory&&fs.lstatSync(directory).isDirectory(),fail);
 keys(request.expected,['runId','inputDigest','launchDigest','terminalDigest','cleanupDigest','cohort']);assert.deepEqual(mandatoryEmailAdmissionPins(directory),request.expected,fail);
 const expected=request.expected,inputFile=path.join(directory,'expected-input.json'),input=readMandatoryEmailAdmissionInput({path:inputFile,digest:expected.inputDigest}),context=validateMandatoryEmailAdmissionContext(input.context);
 const launch=mandatoryEmailReadFile(path.join(directory,'independent-controller-launch.json')).value;
 assert.deepEqual(launch,{schemaVersion:1,runId:input.runId,inputDigest:expected.inputDigest,producer:context.native.producer,command:mandatoryEmailControllerCommand({candidate:input.candidateManifest,browser:input.browserRoot,output:directory,inputDigest:expected.inputDigest}),contextDigest:digestBytes(JSON.stringify(context))},fail);
 assert.deepEqual(mandatoryEmailReadFile(path.join(directory,'independent-controller-terminal.json')).value,{schemaVersion:1,runId:input.runId,inputDigest:expected.inputDigest,...terminal},fail);
 const raw=readMandatoryEmailCohort(path.join(directory,'cohort'),expected.cohort);assert.deepEqual(raw.cohort.admissionInput,{path:inputFile,digest:expected.inputDigest},fail);assert.deepEqual(raw.cohort.admissionContext,context,fail);verifyMandatoryEmailContextCohort(context,raw.cohort);
 const variants=raw.packets.map(packet=>{const{binding,completion}=packet;return{variant:packet.variant,names:[...Object.keys(binding.ccd.containers).map(service=>binding.ccd.owner+'-'+service),binding.plan.candidate.name,binding.plan.tools.name],cids:[...Object.values(binding.ccd.containers),...completion.registry.map(row=>row.id)],privateWorkspace:binding.privateWorkspace,afterObservedClose:true,containersAbsent:true,privateWorkspaceAbsent:true};});
 assert.deepEqual(mandatoryEmailReadFile(path.join(directory,'independent-controller-cleanup.json')).value,{schemaVersion:1,runId:input.runId,inputDigest:expected.inputDigest,observedAfterControllerClose:true,variants},fail);
 // All source/raw/parent observations precede the final byte comparison.
 assert.deepEqual(mandatoryEmailAdmissionPins(directory),expected,fail);assert.deepEqual(readMandatoryEmailAdmissionInput({path:inputFile,digest:expected.inputDigest}),input,fail);assert.equal(mandatoryEmailReadFile(requestPath).digest,requestPin.digest,fail);
 const contract=mandatoryEmailAdmissionContract(),rows=admissionRows(contract);
 const admission={schemaVersion:1,kind:'mandatory-email-two-row-admission',status:'passed',policy:MANDATORY_EMAIL_ADMISSION_POLICY,obligationIds:contract.obligationIds,rows,boundary:'candidate',family:'PRIVATELAW',catalogueSize:112,selected:2,accepted:2,baselineProofs:2,effectiveFaults:2,executions:3,runId:input.runId,cohortRunId:raw.cohort.runId,producerCommit:raw.cohort.producer.commit,producerDigest:raw.cohort.producer.digest,candidateArtifactDigest:raw.cohort.artifact.identity.artifactDigest,inputDigest:expected.inputDigest,requestDigest:requestPin.digest,contractDigest:mandatoryEmailAdmissionDigest(),sourceComplete:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,releaseApproval:false};
 return{admission,cohort:raw.cohort,admissionContext:context,expected,packets:raw.packets};
}
// Caller must first use the fixed raw packet reader above. This function cannot mutate credit.
export function mandatoryEmailNativeJointAdmission(native,capsule,packet,expected){
 keys(packet,['admission','cohort','admissionContext','expected','packets']);const contract=mandatoryEmailAdmissionContract(),a=packet.admission;
 assert(/^sha256:[a-f0-9]{64}$/.test(a.requestDigest),fail);assert.deepEqual(a,{schemaVersion:1,kind:'mandatory-email-two-row-admission',status:'passed',policy:MANDATORY_EMAIL_ADMISSION_POLICY,obligationIds:contract.obligationIds,rows:admissionRows(contract),boundary:'candidate',family:'PRIVATELAW',catalogueSize:112,selected:2,accepted:2,baselineProofs:2,effectiveFaults:2,executions:3,runId:packet.expected.runId,cohortRunId:packet.cohort.runId,producerCommit:packet.cohort.producer.commit,producerDigest:packet.cohort.producer.digest,candidateArtifactDigest:packet.cohort.artifact.identity.artifactDigest,inputDigest:packet.expected.inputDigest,requestDigest:a.requestDigest,contractDigest:mandatoryEmailAdmissionDigest(),sourceComplete:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,releaseApproval:false},fail);
 const context=verifyMandatoryEmailContextCohort(packet.admissionContext,packet.cohort);assert.equal(a.producerCommit,packet.cohort.producer.commit,fail);assert.equal(a.producerDigest,packet.cohort.producer.digest,fail);assert.equal(a.candidateArtifactDigest,packet.cohort.artifact.identity.artifactDigest,fail);assert.deepEqual(packet.packets.map(p=>p.variant),['baseline','name-optional','address-optional'],fail);
 const separate=reason=>({policy:MANDATORY_EMAIL_ADMISSION_POLICY,status:'separate',reason,releaseCredit:false,releaseApproval:false});
 if(!native||!capsule||!expected?.mandatoryEmailRequest)return separate('missing-main-binding');
 if(native.producer.commit!==packet.cohort.producer.commit)return separate('different-producer');
 if(native.candidate.identity.artifactDigest!==packet.cohort.artifact.identity.artifactDigest)return separate('different-candidate');
 assert.deepEqual(context.native,native,fail);assert.deepEqual(context.capture,{binding:capsule,reference:expected.mandatoryEmailNativeBinding},fail);assert.deepEqual(context.expected,mandatoryEmailExpectedWithoutRequests(expected),fail);assert.deepEqual(native.candidate,divorceCandidateContent(packet.cohort.artifact),fail);assert.equal(expected.mandatoryEmailRequest.runId,a.runId,fail);assert.equal(expected.mandatoryEmailRequest.digest,a.requestDigest,fail);
 return{policy:MANDATORY_EMAIL_ADMISSION_POLICY,status:'included',obligationIds:contract.obligationIds,nativeRunId:expected.jobRunId,mandatoryRunId:a.runId,nativeBindingDigest:expected.mandatoryEmailNativeBinding.digest,requestDigest:expected.mandatoryEmailRequest.digest,inputDigest:a.inputDigest,contractDigest:a.contractDigest,releaseCredit:false,releaseApproval:false};
}
export function creditMandatoryEmailRows(coverage,catalogue,missing,admission){
 const contract=mandatoryEmailAdmissionContract();assert.equal(admission.joint.status,'included',fail);assert.deepEqual(admission.joint.obligationIds,contract.obligationIds,fail);assert.equal(coverage.selected,112,fail);for(const key of ['candidate','ccd','missing'])assert(Number.isInteger(coverage[key])&&coverage[key]>=0,fail);assert(coverage.missing>=2,fail);assert.equal(coverage.candidate+coverage.ccd+coverage.missing,coverage.selected,fail);
 for(const id of contract.obligationIds){const rows=catalogue.obligations.filter(row=>row.id===id);assert.equal(rows.length,1,fail);assert.deepEqual(rows[0],{id,family:'PRIVATELAW',kind:'definition-shape',requiredBoundary:'candidate',sourceKeys:[contract.sourceKey]},fail);assert(!coverage.creditedObligationIds.includes(id),fail);assert(missing.some(row=>(typeof row==='string'?row:row.id)===id),fail);}
 for(const id of contract.obligationIds)coverage.creditedObligationIds.push(id);coverage.candidate+=2;coverage.missing-=2;coverage.mandatoryEmailAdmission=admission.joint;
}
