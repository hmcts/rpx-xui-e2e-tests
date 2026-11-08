import assert from 'node:assert/strict';
import {isDeepStrictEqual as isDeepEqual} from 'node:util';
import { digestBytes } from './exui-evidence-io.mjs';
import { NATIVE_HARNESS_SOURCE_FILES } from './exui-native-sources.mjs';
import { nativeInventoryDigest } from './exui-divorce-native-binding.mjs';
import { FR_PROFILE_ID, FR_PROFILE_FACETS, frProfileContract, frProfileContractDigest } from './exui-fr-profile-contract.mjs';

const failure='FR_PROFILE_ADMISSION_INVALID';
const hash=/^sha256:[a-f0-9]{64}$/;
const keys=(value,names)=>assert.deepEqual(Object.keys(value??{}).sort(),names.slice().sort(),failure);
const separate=reason=>({policy:'fr-native-candidate-joint-v1',status:'separate',reason,releaseCredit:false,releaseApproval:false});

export function frNativeProfileCompatibility(nativeContext,profile){
 if(!nativeContext?.binding||!nativeContext.expected)return separate('missing-native-binding');
 const native=nativeContext.binding,expected=nativeContext.expected;
 assert.equal(profile.kind,'fr-profile-cohort',failure);
 assert.equal(profile.family,'FR',failure);assert.equal(profile.obligationId,FR_PROFILE_ID,failure);
 if(profile.producer.commit!==native.producer.commit||profile.producer.sourceDigest!==native.producer.sourceDigest||!isDeepEqual(profile.producer.files,native.producer.files))return separate('different-producer');
 if(profile.candidate.identity.artifactDigest!==expected.candidateArtifactDigest||profile.candidate.identity.artifactDigest!==native.candidate.identity.artifactDigest)return separate('different-candidate');
 assert.deepEqual(profile.candidate,native.candidate,failure);
 if(profile.sourceDefault.revision!==native.sourceDefault.revision||profile.sourceDefault.digest!==native.sourceDefault.digest)return separate('different-source-default');
 if(JSON.stringify(profile.runtime)!==JSON.stringify(native.runtime))return separate('different-runtime');
 assert.equal(profile.candidate.provenance.webappCommit,frProfileContract().consumerRevision,'FR_PROFILE_CONSUMER_INVALID');
 assert.equal(profile.sourceDefault.revision,frProfileContract().sourceRevision,'FR_PROFILE_CONSUMER_INVALID');
 assert.equal(profile.sourceDefault.digest,frProfileContract().sourceDigest,'FR_PROFILE_CONSUMER_INVALID');
 assert.equal(expected.harnessCommit,native.producer.commit,failure);
 if(expected.nativeCohortBinding&&profile.nativeBindingDigest!==expected.nativeCohortBinding.digest)return separate('different-native-binding');
 if(profile.catalogueDigest!==native.catalogue?.obligationsDigest)return separate('different-catalogue');
 return {policy:'fr-native-candidate-joint-v1',status:'included',obligationId:FR_PROFILE_ID,sourceKeys:['rpx-xui-webapp:config/default.json','rpx-xui-webapp:config/default.json'],nativeRunId:expected.jobRunId,profileRunId:profile.runId,nativeBindingDigest:profile.nativeBindingDigest,catalogueDigest:profile.catalogueDigest,cohortDigest:profile.cohortDigest,contractDigest:profile.contractDigest,releaseCredit:false,releaseApproval:false};
}

export function admitFrProfile(profile,nativeContext,catalogue){
 keys(profile,['schemaVersion','kind','status','runId','obligationId','family','contract','contractDigest','candidate','producer','sourceDefault','runtime','facets','nativeBindingDigest','catalogueDigest','cohortDigest']);
 assert.equal(profile.schemaVersion,1,failure);assert.equal(profile.status,'validated-for-admission',failure);
 assert(/^fr-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(profile.runId),failure);
 assert.equal(profile.obligationId,FR_PROFILE_ID,failure);assert.equal(profile.family,'FR',failure);
 assert.deepEqual(profile.contract,frProfileContract(),failure);assert.equal(profile.contractDigest,frProfileContractDigest(),failure);
 assert.deepEqual(Object.keys(profile.candidate).sort(),['identity','payloadDigest','provenance'],failure);
 assert(hash.test(profile.candidate.identity.artifactDigest)&&hash.test(profile.candidate.payloadDigest),failure);
 assert.deepEqual(Object.keys(profile.producer).sort(),['commit','files','sourceDigest'],failure);
 assert(/^[a-f0-9]{40}$/.test(profile.producer.commit)&&hash.test(profile.producer.sourceDigest),failure);
 assert.deepEqual(Object.keys(profile.producer.files).sort(),NATIVE_HARNESS_SOURCE_FILES.slice().sort(),failure);
 assert.equal(nativeInventoryDigest(profile.producer.files),profile.producer.sourceDigest,failure);
 keys(profile.sourceDefault,['revision','digest']);assert(/^[a-f0-9]{40}$/.test(profile.sourceDefault.revision)&&hash.test(profile.sourceDefault.digest),failure);
 keys(profile.runtime,['reference','imageId','platform']);assert(hash.test(profile.runtime.imageId)&&['linux/arm64','linux/amd64'].includes(profile.runtime.platform),failure);
 assert(hash.test(profile.nativeBindingDigest)&&hash.test(profile.catalogueDigest)&&hash.test(profile.cohortDigest),failure);
 assert.deepEqual(profile.facets.map(row=>row.facet),FR_PROFILE_FACETS.map(row=>row.facet),failure);
 for(const row of profile.facets){
  keys(row,['facet','receiptDigest','baseline','fault']);assert(hash.test(row.receiptDigest),failure);
  keys(row.baseline,['status','configDigest','observationsDigest','journalDigest']);keys(row.fault,['status','configDigest','observationsDigest','journalDigest']);
  assert.equal(row.baseline.status,'observed',failure);assert.equal(row.fault.status,'expected-fault-observed',failure);
  for(const record of [row.baseline,row.fault])for(const field of ['configDigest','observationsDigest','journalDigest'])assert(hash.test(record[field]),failure);
  assert.notEqual(row.baseline.configDigest,row.fault.configDigest,failure);
 }
 assert(Array.isArray(catalogue?.obligations),failure);
 const rows=catalogue.obligations.filter(row=>row.id===FR_PROFILE_ID);
 assert.equal(rows.length,1,failure);assert.deepEqual(rows[0],{id:FR_PROFILE_ID,family:'FR',kind:'configuration-profile',requiredBoundary:'candidate',sourceKeys:['rpx-xui-webapp:config/default.json','rpx-xui-webapp:config/default.json']},failure);
 assert.equal(profile.catalogueDigest,digestBytes(JSON.stringify(catalogue.obligations)),failure);
 const joint=frNativeProfileCompatibility(nativeContext,profile);
 return {schemaVersion:1,kind:'fr-profile-admission',status:'passed',obligationId:FR_PROFILE_ID,family:'FR',boundary:'candidate',selected:1,accepted:joint.status==='included'?1:0,facets:profile.facets.length,baselineProofs:profile.facets.length,effectiveFaults:profile.facets.length,runId:profile.runId,candidateArtifactDigest:profile.candidate.identity.artifactDigest,candidateCommit:profile.candidate.provenance.webappCommit,producerCommit:profile.producer.commit,producerDigest:profile.producer.sourceDigest,contractDigest:profile.contractDigest,catalogueDigest:profile.catalogueDigest,cohortDigest:profile.cohortDigest,nativeBindingDigest:profile.nativeBindingDigest,joint,releaseCredit:false,releaseApproval:false};
}
