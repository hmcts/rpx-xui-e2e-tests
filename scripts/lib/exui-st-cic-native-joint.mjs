import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {digestBytes} from './exui-evidence-io.mjs';
import {divorceCandidateContent} from './exui-divorce-native-binding.mjs';
import {loadCommittedConfigurationCatalogue} from './exui-configuration-runtime-coverage.mjs';
import {ST_CIC_PROFILE_ID,stCicProfileContract,stCicProfileContractDigest} from './exui-st-cic-profile-contract.mjs';
import {ST_CIC_ADMISSION_POLICY,validateStCicAdmissionContext,verifyStCicAdmissionContextBinding,stCicExpectedWithoutRequests} from './exui-st-cic-profile-admission.mjs';

const fail='ST_CIC_NATIVE_JOINT_INVALID',hash=/^sha256:[a-f0-9]{64}$/;
const keys=(value,names)=>{assert(value&&typeof value==='object'&&!Array.isArray(value),fail);assert.deepEqual(Object.keys(value).sort(),names.slice().sort(),fail);};
const separate=reason=>({policy:ST_CIC_ADMISSION_POLICY,status:'separate',reason,releaseCredit:false,releaseApproval:false});
function validatePacketProjection(packet){
 keys(packet,['admission','binding',...(Object.hasOwn(packet,'admissionContext')?['admissionContext']:[])]);
 const {admission:a,binding:b}=packet,contract=stCicProfileContract();
 keys(a,['schemaVersion','kind','status','obligationId','boundary','family','baselineProofs','effectiveFaults','runtimeAcceptance','catalogueCredit','wholeProfileSatisfied','selected','accepted','catalogueSize','runId','producerCommit','producerDigest','candidateArtifactDigest','candidateCommit','inputDigest','bindingDigest','receiptDigest','terminalDigest','launchDigest','cleanupDigest','contractDigest','releaseCredit','releaseApproval']);
 for(const [name,value]of Object.entries({schemaVersion:1,kind:'st-cic-profile-admission',status:'passed',obligationId:ST_CIC_PROFILE_ID,boundary:'candidate',family:'ST_CIC',baselineProofs:5,effectiveFaults:5,selected:1,accepted:1,catalogueSize:112,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false}))assert.equal(a[name],value,fail);
 assert(/^st-cic-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(a.runId),fail);
 for(const name of ['producerDigest','candidateArtifactDigest','inputDigest','bindingDigest','receiptDigest','terminalDigest','launchDigest','cleanupDigest','contractDigest'])assert(hash.test(a[name]),fail);
 assert.equal(a.producerCommit,b.producer.commit,fail);assert.equal(a.producerDigest,b.producer.digest,fail);
 assert.equal(a.producerDigest,digestBytes(JSON.stringify(b.producer.files)),fail);
 assert.equal(a.candidateArtifactDigest,b.artifact.identity.artifactDigest,fail);assert.equal(a.candidateCommit,b.artifact.provenance.webappCommit,fail);
 assert.equal(a.candidateCommit,contract.consumerRevision,fail);assert.equal(a.bindingDigest,digestBytes(JSON.stringify(b)),fail);
 assert.deepEqual(b.contract,contract,fail);assert.equal(b.contractDigest,stCicProfileContractDigest(),fail);assert.equal(a.contractDigest,b.contractDigest,fail);
 const {catalogue}=loadCommittedConfigurationCatalogue(),rows=catalogue.obligations.filter(row=>row.id===ST_CIC_PROFILE_ID);
 assert.equal(catalogue.obligations.length,112,fail);assert.equal(rows.length,1,fail);
 const row=rows[0];assert.equal(row.kind,'configuration-profile',fail);assert.equal(row.family,'ST_CIC',fail);assert.equal(row.requiredBoundary,'candidate',fail);
 assert.deepEqual(row.sourceKeys,[contract.sourceKey,contract.sourceKey],fail);
 return {row,catalogueDigest:digestBytes(JSON.stringify(catalogue.obligations))};
}
// Call only after both complete raw readers pass using independently held request pins.
// This comparison neither replays raw evidence nor mutates catalogue/admission flags.
function compareStCicNative(native,capsule,packet,expected){
 const {row,catalogueDigest}=validatePacketProjection(packet);
 const childContext=packet.admissionContext===undefined?undefined:verifyStCicAdmissionContextBinding(packet.admissionContext,packet.binding);
 const request=expected?.stCicProfileRequest;
 if(request!==undefined){keys(request,['runId','digest']);assert(hash.test(request.digest),fail);assert.equal(request.runId,packet.admission.runId,fail);}
 if(!native||!capsule||!request)return separate('missing-native-binding');
 if(!childContext)return separate('missing-parent-context');
 const parent=validateStCicAdmissionContext({native,capture:{binding:capsule,reference:expected.stCicNativeBinding},expected});
 if(native.producer.commit!==packet.binding.producer.commit)return separate('different-producer');
 assert.deepEqual(native.producer.files,packet.binding.producer.files,fail);
 if(native.candidate.identity.artifactDigest!==packet.binding.artifact.identity.artifactDigest)return separate('different-candidate');
 assert.deepEqual(native.candidate,divorceCandidateContent(packet.binding.artifact),fail);
 if(!isDeepStrictEqual(native.runtime,packet.binding.runtime))return separate('different-runtime');
 if(!isDeepStrictEqual(native.browser,{image:packet.binding.browser.image,digest:packet.binding.browser.digest}))return separate('different-browser');
 if(!isDeepStrictEqual(native.dependencies,packet.binding.browser.dependencies))return separate('different-dependencies');
 assert.equal(native.catalogue.obligationsDigest,catalogueDigest,fail);
 // Consistent child copies cannot replace the actual caller's held main expectations.
 assert.deepEqual(childContext.expected,stCicExpectedWithoutRequests(expected),fail);
 assert.deepEqual(childContext.native,parent.native,fail);assert.deepEqual(childContext.capture,parent.capture,fail);
 return {policy:ST_CIC_ADMISSION_POLICY,status:'included',obligationId:ST_CIC_PROFILE_ID,sourceKeys:structuredClone(row.sourceKeys),catalogueDigest,nativeRunId:expected.jobRunId,profileRunId:packet.admission.runId,nativeBindingDigest:expected.stCicNativeBinding.digest,requestDigest:request.digest,inputDigest:packet.admission.inputDigest,bindingDigest:packet.admission.bindingDigest,receiptDigest:packet.admission.receiptDigest,contractDigest:packet.admission.contractDigest,releaseCredit:false,releaseApproval:false};
}

export function stCicNativeJointAdmission(native,capsule,packet,expected){
 try{return compareStCicNative(native,capsule,packet,expected);}
 // Assertion diffs may contain private paths or held context; expose one finite code.
 catch{throw new Error(fail);}
}
