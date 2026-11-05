import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { digestBytes } from './exui-evidence-io.mjs';
import { loadSharedNativePhase } from './exui-shared-role-native-binding.mjs';
import { bindSharedRoleToolkitArtifact } from './exui-shared-role-toolkit.mjs';
import { reproduceSharedRoleCcdSource,bindSharedRoleCcdRuntime,reproduceSharedRoleAmd64Source,bindSharedRoleAmd64Runtime } from './exui-shared-role-ccd-provenance.mjs';
import { sharedNestedContract,SHARED_NESTED_ID,SHARED_NESTED_FACETS,SHARED_NESTED_FAULT,SHARED_NESTED_PROOF,bindSharedNestedSourceFixture,assertSharedNestedObservedDefinition } from './exui-shared-nested-contract.mjs';
import { readSharedNestedArtifact } from './exui-shared-nested-artifacts.mjs';
import { sharedNestedBinding,replaySharedNestedObservation } from './exui-shared-nested-observations.mjs';
const readFixed=(root,name)=>{
  const base=fs.realpathSync(root),file=path.join(base,name);
  assert(!path.isAbsolute(name)&&!name.split('/').includes('..')&&file.startsWith(base+path.sep)&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile()&&fs.statSync(file).size<=16*1024*1024,'SHARED_NESTED_PRIVATE_BOUNDARY');
  return fs.readFileSync(file);
};
const json=(root,name)=>JSON.parse(readFixed(root,name));
export function sharedNestedNativePlan() {
  return [...SHARED_NESTED_FACETS.map(row=>({id:row.id,invocationId:'baseline',proofId:row.proofId,failureId:null})),
    {id:'ccd-drop-child',invocationId:'ccd-drop-child',proofId:'shared-nested-email-child-loss',failureId:'nested-persistence'},
    {id:'ccd-drop-postal-optional-child',invocationId:'ccd-drop-postal-optional-child',proofId:'shared-nested-post-child-loss',failureId:'postal-persistence'},
    {id:SHARED_NESTED_FAULT,invocationId:SHARED_NESTED_FAULT,proofId:SHARED_NESTED_PROOF,failureId:'nested-sibling-preservation'}];
}
function assertProof(record,loaded) {
  const execution=loaded.input.executions.find(row=>row.invocationId===record.invocationId);
  const proof=record.failureId?loaded.input.mutations.find(row=>row.mutationId===record.invocationId)?.mutantResult:loaded.input.results.find(row=>row.proofId===record.proofId);
  assert(execution&&proof,'SHARED_NESTED_PROOF_REQUIRED');
  assert.equal(proof.proofId,record.proofId,'SHARED_NESTED_PROOF_ID');assert.equal(proof.invocationId,record.invocationId,'SHARED_NESTED_PROOF_INVOCATION');
  assert.equal(proof.runId,loaded.input.manifest.runId,'SHARED_NESTED_PROOF_RUN');assert.deepEqual(proof.identity,execution.identity,'SHARED_NESTED_PROOF_IDENTITY');
  assert.equal(proof.outcome,record.failureId?'failed':'passed','SHARED_NESTED_PROOF_OUTCOME');assert.equal(proof.failureId,record.failureId,'SHARED_NESTED_PROOF_FAILURE');
  assert.equal(proof.complete,true,'SHARED_NESTED_PROOF_COMPLETE');assert.equal(proof.retryIndex,0,'SHARED_NESTED_PROOF_RETRY');
  return execution;
}
export async function replaySharedNestedNativeBindings({harnessRoot,ccdPhaseDirectory,candidateArtifactPath,sourceImageInputs}) {
  const phase=loadSharedNativePhase(harnessRoot,ccdPhaseDirectory,'sharedNested');
  assert.equal(phase.loaded.receipt.verdict.status,'PASS','SHARED_NESTED_PHASE_PASS_REQUIRED');
  const source=bindSharedNestedSourceFixture(),toolkit=await bindSharedRoleToolkitArtifact(candidateArtifactPath);
  const privateRoot=path.dirname(ccdPhaseDirectory),importedBytes=readFixed(privateRoot,'ccd-runtime/definition-import.json'),imported=JSON.parse(importedBytes);
  const observed=json(privateRoot,'ccd-runtime/observed-definition.json');
  const definition=assertSharedNestedObservedDefinition(observed);
  const base=phase.loaded.input.manifest;
  assert.equal(imported.fixtureDigest,source.workbookDigest,'SHARED_NESTED_CANONICAL_WORKBOOK');
  assert.equal(imported.binding.sourceDigest,source.fixtureDigest,'SHARED_NESTED_CANONICAL_FIXTURE');
  assert([200,201].includes(imported.status),'SHARED_NESTED_SUCCESSFUL_IMPORT');
  assert.equal(imported.observedDefinitionDigest,digestBytes(JSON.stringify(observed)),'SHARED_NESTED_OBSERVED_DIGEST');
  assert.equal(String(observed.version.number),base.runtimeMetadata.definitionVersion,'SHARED_NESTED_OBSERVED_VERSION');
  const manifests=new Map(),executions=new Map(),records=[];
  for(const record of sharedNestedNativePlan()) {
    const execution=assertProof(record,phase.loaded);executions.set(record.invocationId,execution);
    const bytes=name=>readSharedNestedArtifact(ccdPhaseDirectory,execution,name);
    const manifest=JSON.parse(bytes('manifest.json'));manifests.set(record.invocationId,manifest);
    assert.equal(manifest.runId,base.runId,'SHARED_NESTED_COHORT_RUN');assert.equal(manifest.harnessCommit,base.harnessCommit,'SHARED_NESTED_COHORT_PRODUCER');
    assert.deepEqual(manifest.identity,execution.identity,'SHARED_NESTED_EXECUTION_IDENTITY');
    for(const key of ['harnessSourceDigest','harnessDependencyDigest','browserDigest','ccdNamespace','definitionImportDigest','observedDefinitionDigest','definitionVersion'])
      assert.equal(manifest.runtimeMetadata[key],base.runtimeMetadata[key],'SHARED_NESTED_COHORT_BINDING');
    for(const key of ['artifactDigest','webappCommit','dependencyLockDigest','toolkitVersion','toolkitDigest'])assert.equal(manifest.identity[key],toolkit.candidateIdentity[key],'SHARED_NESTED_CANDIDATE_BINDING');
    assert.equal(digestBytes(importedBytes),manifest.runtimeMetadata.definitionImportDigest,'SHARED_NESTED_IMPORT_BINDING');
    assert.equal(imported.fixtureDigest,manifest.identity.definitionDigests.HarnessNestedPRL,'SHARED_NESTED_DEFINITION_BINDING');
    for(const [service,name] of [['data','ccd'],['definition','ccd-definition']])assert.equal(imported.images[service].id,manifest.identity.dependencyIdentities[name].artifactDigest,'SHARED_NESTED_RUNNING_IMAGE');
    const personas=JSON.parse(bytes('personas.json')),actorId=personas.credentials.allowed.userId;
    const requests=bytes('ccd-requests.jsonl').toString().trim().split('\n').filter(Boolean).map(JSON.parse);
    {
      const facetId=record.invocationId==='baseline'?record.id:record.invocationId==='ccd-drop-postal-optional-child'?'nested-post-2':'nested-email-2';
      const context=JSON.parse(bytes('context.json')),binding=sharedNestedBinding(manifest,context);
      const observation=JSON.parse(bytes(facetId+'-observation.json'));
      const replay=replaySharedNestedObservation(observation,{binding,actorId,facetId,mutation:record.failureId?record.invocationId:null});
      const writes=requests.filter(row=>row.method==='POST'&&row.upstreamPath===`/cases/${observation.caseId}/events`&&row.actorId===actorId);
      assert.equal(writes.length,1,'SHARED_NESTED_ONE_AUTHENTICATED_WRITE');assert.equal(writes[0].status,201,'SHARED_NESTED_SUCCESSFUL_TRANSPORT');
      if(record.failureId) {
        const actions=bytes('fault-actions.jsonl').toString().trim().split('\n').filter(Boolean).map(JSON.parse);
        assert.equal(actions.length,1,'SHARED_NESTED_SIBLING_APPLICATION_COUNT');
        const changed=structuredClone(observation.request.body.data);
        if(record.invocationId===SHARED_NESTED_FAULT)changed.sodAdditionalRecipientsList=changed.sodAdditionalRecipientsList.slice(0,1);
        if(record.invocationId==='ccd-drop-child')for(const row of changed.sodAdditionalRecipientsList)delete row.value.emailInformation.emailAddress;
        if(record.invocationId==='ccd-drop-postal-optional-child')delete changed.sodAdditionalRecipientsList[1].value.postalInformation.postalAddress.AddressLine2;
        assert.deepEqual(actions[0],{mutation:record.invocationId,method:'POST',upstreamPath:`/cases/${observation.caseId}/events`,status:201,eventId:'update',before:observation.request.body.data,after:changed},'SHARED_NESTED_SIBLING_APPLICATION');
      }
      records.push({...record,caseId:observation.caseId,...replay});
    }
  }
  assert.equal(new Set(records.filter(row=>row.invocationId==='baseline').map(row=>row.caseId)).size,4,'SHARED_NESTED_DISTINCT_BASELINE_CASES');
  let sourceImage;
  if(sourceImageInputs) {
    const amd64=sourceImageInputs.platform==='linux/amd64',inputs={...sourceImageInputs};delete inputs.platform;
    const reproduced=amd64?reproduceSharedRoleAmd64Source(inputs):reproduceSharedRoleCcdSource(inputs);
    const bind=amd64?bindSharedRoleAmd64Runtime:bindSharedRoleCcdRuntime;
    sourceImage={proofDigest:reproduced.proofDigest,bindings:records.map(record=>({id:record.id,...bind(reproduced.proof,manifests.get(record.invocationId),importedBytes)})),limits:'Retained role-class/JAR/image witnesses only; no source equivalence claimed for unwitnessed CCD field-parser classes'};
  }
  return {obligationId:SHARED_NESTED_ID,contractDigest:sharedNestedContract().contractDigest,records,source,definition,toolkit,sourceImage,catalogueCredit:false,runtimeAcceptance:false,acceptedObligationIds:[],missingAcceptanceEvidence:[...(sourceImage?[]:['CCD-source-image-witness']),'explicit-shared-nested-catalogue-admission']};
}
export async function admitSharedNestedNative(inputs) {
  assert(inputs?.sourceImageInputs,'SHARED_NESTED_SOURCE_IMAGE_REQUIRED');
  const replay=await replaySharedNestedNativeBindings(inputs),expected=sharedNestedNativePlan().map(row=>row.id).sort();
  assert.deepEqual(replay.records.map(row=>row.id).sort(),expected,'SHARED_NESTED_COMPLETE_FACETS');
  assert.deepEqual(replay.sourceImage.bindings.map(row=>row.id).sort(),expected,'SHARED_NESTED_COMPLETE_SOURCE_BINDING');
  assert.deepEqual(replay.missingAcceptanceEvidence,['explicit-shared-nested-catalogue-admission'],'SHARED_NESTED_UNEXPECTED_GAP');
  assert.deepEqual([replay.catalogueCredit,replay.runtimeAcceptance,replay.acceptedObligationIds],[false,false,[]],'SHARED_NESTED_NO_SELF_CREDIT');
  return {obligationId:SHARED_NESTED_ID,boundary:'candidate',status:'passed',sourceImageProofDigest:replay.sourceImage.proofDigest,facetCount:4,faultCount:3,sourceBindingCount:7,candidateArtifactDigest:replay.toolkit.candidateIdentity.artifactDigest};
}
