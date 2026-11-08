import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {digestBytes} from './exui-evidence-io.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './exui-native-sources.mjs';
import {nativeInventoryDigest} from './exui-divorce-native-binding.mjs';
import {CMC_PROFILE_ID,cmcProfileContract,cmcProfileContractDigest} from './exui-cmc-profile-contract.mjs';

const fail='CMC_PROFILE_ADMISSION_INVALID',hash=/^sha256:[a-f0-9]{64}$/;
const keys=(value,names)=>assert.deepEqual(Object.keys(value??{}).sort(),names.slice().sort(),fail);

export function cmcNativeProfileCompatibility(nativeContext,profile){
 if(!nativeContext?.binding||!nativeContext.expected)return {policy:'cmc-native-candidate-joint-v1',status:'separate',reason:'missing-native-binding',releaseCredit:false,releaseApproval:false};
 const native=nativeContext.binding,expected=nativeContext.expected;
 assert.equal(profile.kind,'cmc-profile-cohort',fail);assert.equal(profile.family,'CMC',fail);assert.equal(profile.obligationId,CMC_PROFILE_ID,fail);
 if(profile.producer.commit!==native.producer.commit||profile.producer.sourceDigest!==native.producer.sourceDigest||!isDeepStrictEqual(profile.producer.files,native.producer.files))return {policy:'cmc-native-candidate-joint-v1',status:'separate',reason:'different-producer',releaseCredit:false,releaseApproval:false};
 if(profile.candidate.identity.artifactDigest!==expected.candidateArtifactDigest||profile.candidate.identity.artifactDigest!==native.candidate.identity.artifactDigest)return {policy:'cmc-native-candidate-joint-v1',status:'separate',reason:'different-candidate',releaseCredit:false,releaseApproval:false};
 assert.deepEqual(profile.candidate,native.candidate,fail);
 if(profile.sourceDefault.revision!==native.sourceDefault.revision||profile.sourceDefault.digest!==native.sourceDefault.digest)return {policy:'cmc-native-candidate-joint-v1',status:'separate',reason:'different-source-default',releaseCredit:false,releaseApproval:false};
 if(JSON.stringify(profile.runtime)!==JSON.stringify(native.runtime))return {policy:'cmc-native-candidate-joint-v1',status:'separate',reason:'different-runtime',releaseCredit:false,releaseApproval:false};
 assert.equal(profile.candidate.provenance.webappCommit,cmcProfileContract().consumerRevision,fail);assert.equal(profile.sourceDefault.revision,cmcProfileContract().sourceRevision,fail);assert.equal(profile.sourceDefault.digest,cmcProfileContract().sourceDigest,fail);assert.equal(expected.harnessCommit,native.producer.commit,fail);
 if(expected.nativeCohortBinding&&profile.nativeBindingDigest!==expected.nativeCohortBinding.digest)return {policy:'cmc-native-candidate-joint-v1',status:'separate',reason:'different-native-binding',releaseCredit:false,releaseApproval:false};
 if(profile.catalogueDigest!==native.catalogue?.obligationsDigest)return {policy:'cmc-native-candidate-joint-v1',status:'separate',reason:'different-catalogue',releaseCredit:false,releaseApproval:false};
 return {policy:'cmc-native-candidate-joint-v1',status:'included',obligationId:CMC_PROFILE_ID,sourceKeys:['rpx-xui-webapp:config/default.json','rpx-xui-webapp:config/default.json'],nativeRunId:expected.jobRunId,profileRunId:profile.runId,nativeBindingDigest:profile.nativeBindingDigest,catalogueDigest:profile.catalogueDigest,cohortDigest:profile.cohortDigest,contractDigest:profile.contractDigest,releaseCredit:false,releaseApproval:false};
}

export function admitCmcProfile(profile,nativeContext,catalogue){
 keys(profile,['schemaVersion','kind','status','runId','obligationId','family','contract','contractDigest','candidate','producer','sourceDefault','runtime','facets','nativeBindingDigest','catalogueDigest','cohortDigest']);
 assert.equal(profile.schemaVersion,1,fail);assert.equal(profile.status,'validated-for-admission',fail);assert(/^cmc-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(profile.runId),fail);
 assert.equal(profile.obligationId,CMC_PROFILE_ID,fail);assert.equal(profile.family,'CMC',fail);assert.deepEqual(profile.contract,cmcProfileContract(),fail);assert.equal(profile.contractDigest,cmcProfileContractDigest(),fail);
 assert.deepEqual(Object.keys(profile.candidate).sort(),['identity','payloadDigest','provenance'],fail);assert(hash.test(profile.candidate.identity.artifactDigest)&&hash.test(profile.candidate.payloadDigest),fail);
 assert.deepEqual(Object.keys(profile.producer).sort(),['commit','files','sourceDigest'],fail);assert(/^[a-f0-9]{40}$/.test(profile.producer.commit)&&hash.test(profile.producer.sourceDigest),fail);assert.deepEqual(Object.keys(profile.producer.files).sort(),NATIVE_HARNESS_SOURCE_FILES.slice().sort(),fail);assert.equal(nativeInventoryDigest(profile.producer.files),profile.producer.sourceDigest,fail);
 keys(profile.sourceDefault,['revision','digest']);assert(/^[a-f0-9]{40}$/.test(profile.sourceDefault.revision)&&hash.test(profile.sourceDefault.digest),fail);keys(profile.runtime,['reference','imageId','platform']);assert(hash.test(profile.runtime.imageId)&&['linux/arm64','linux/amd64'].includes(profile.runtime.platform),fail);
 assert(hash.test(profile.nativeBindingDigest)&&hash.test(profile.catalogueDigest)&&hash.test(profile.cohortDigest),fail);assert.deepEqual(profile.facets.map(row=>row.facet),[CMC_PROFILE_FACET_NAME],fail);
 const row=profile.facets[0];keys(row,['facet','fault','receiptDigest','baseline','faultEvidence']);assert.equal(row.facet,CMC_PROFILE_FACET_NAME,fail);assert.equal(row.fault,CMC_PROFILE_FACET_VALUE.fault,fail);assert(hash.test(row.receiptDigest),fail);for(const evidence of [row.baseline,row.faultEvidence]){keys(evidence,['status','configDigest','observationsDigest','journalDigest']);assert.equal(evidence.status,evidence===row.baseline?'observed':'expected-fault-observed',fail);for(const field of ['configDigest','observationsDigest','journalDigest'])assert(hash.test(evidence[field]),fail);}assert.notEqual(row.baseline.configDigest,row.faultEvidence.configDigest,fail);
 assert(Array.isArray(catalogue?.obligations),fail);const rows=catalogue.obligations.filter(item=>item.id===CMC_PROFILE_ID);assert.equal(rows.length,1,fail);assert.deepEqual(rows[0],{id:CMC_PROFILE_ID,family:'CMC',kind:'configuration-profile',requiredBoundary:'candidate',sourceKeys:['rpx-xui-webapp:config/default.json','rpx-xui-webapp:config/default.json']},fail);assert.equal(profile.catalogueDigest,digestBytes(JSON.stringify(catalogue.obligations)),fail);
 const joint=cmcNativeProfileCompatibility(nativeContext,profile);return {schemaVersion:1,kind:'cmc-profile-admission',status:'passed',obligationId:CMC_PROFILE_ID,family:'CMC',boundary:'candidate',selected:1,accepted:joint.status==='included'?1:0,facets:1,baselineProofs:1,effectiveFaults:1,runId:profile.runId,candidateArtifactDigest:profile.candidate.identity.artifactDigest,candidateCommit:profile.candidate.provenance.webappCommit,producerCommit:profile.producer.commit,producerDigest:profile.producer.sourceDigest,contractDigest:profile.contractDigest,catalogueDigest:profile.catalogueDigest,cohortDigest:profile.cohortDigest,nativeBindingDigest:profile.nativeBindingDigest,joint,releaseCredit:false,releaseApproval:false};
}

import {CMC_PROFILE_FACET as CMC_PROFILE_FACET_VALUE} from './exui-cmc-profile-contract.mjs';
const CMC_PROFILE_FACET_NAME=CMC_PROFILE_FACET_VALUE.facet;
