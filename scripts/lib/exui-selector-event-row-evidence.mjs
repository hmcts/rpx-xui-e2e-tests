import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes,readExecutionEvidence} from './exui-evidence-io.mjs';
import {SELECTOR_EVENT_SCOPE,SELECTOR_EVENT_PROOF,SELECTOR_EVENT_MUTANT_PROOF,SELECTOR_EVENT_FAILURE,SELECTOR_EVENT_MUTATION,selectorEventPolicy,selectorEventMutation} from './exui-selector-event-row-contract.mjs';
import {selectorSequence,validateSelectorRuntimeInput,selectSelectorRuntime} from './exui-selector-event-row-transition.mjs';
import {assertCopiedSelectorRuntimeEvidence} from './exui-selector-event-row-runtime.mjs';
import {validateSelectorInvocationObservation,selectorObservationReferences} from './exui-selector-event-row-observations.mjs';
import {validateNativeInvocationFinalization} from './exui-native-ci-ownership.mjs';
import {assertOwnedContainerAuthority} from './exui-oci-runtime.mjs';
export function readSelectorArtifact(directory,relative) {
 assert(!path.isAbsolute(relative)&&!relative.split('/').includes('..'),'SELECTOR_EVIDENCE_PATH');
 const file=path.join(directory,relative);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'SELECTOR_EVIDENCE_ALIAS');
 const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),reference:{path:relative,digest:digestBytes(bytes)}};
}
export function readSelectorCheckpoint(directory,expected,invocationId,input) {
 assert.equal(expected.releaseScopeId,SELECTOR_EVENT_SCOPE,'SELECTOR_CHECKPOINT_SCOPE');assert.equal(expected.nativeAuthority,true,'SELECTOR_CHECKPOINT_AUTHORITY');
 assert(selectorSequence.includes(invocationId),'SELECTOR_CHECKPOINT_INVOCATION');
 const manifest=readSelectorArtifact(directory,`${invocationId}/manifest.json`),raw=readSelectorArtifact(directory,`${invocationId}/execution.json`),observation=readSelectorArtifact(directory,`${invocationId}/selector-event-row-observation.json`);
 for(const field of ['runId','harnessCommit','releaseScopeId','policyDigest','identity'])assert.deepEqual(manifest.value[field],expected[field],'SELECTOR_CHECKPOINT_IDENTITY');
 for(const field of ['harnessSourceDigest','harnessDependencyDigest','browserDigest'])assert.equal(manifest.value.runtimeMetadata[field],expected[field],'SELECTOR_CHECKPOINT_METADATA');
 assert.equal(manifest.value.runtimeMetadata.harnessSourceState,'clean','SELECTOR_CHECKPOINT_SOURCE');assert.equal(manifest.value.runtimeMetadata.isolation,'native-separate-api-owned-network-none','SELECTOR_CHECKPOINT_ISOLATION');
 const policy=selectorEventPolicy();assert.equal(expected.policyDigest,policy.policyDigest,'SELECTOR_CHECKPOINT_POLICY');assert.deepEqual(manifest.value.requiredObligationIds,policy.requiredObligationIds,'SELECTOR_CHECKPOINT_OBLIGATIONS');
 assert.equal(raw.value.resultArtifact?.path,`${invocationId}/report.json`,'SELECTOR_CHECKPOINT_REPORT_PATH');
 const loaded=readExecutionEvidence(directory,raw.reference,manifest.value,policy),baseline=invocationId==='baseline';
 assert.equal(loaded.results.length,1,'SELECTOR_CHECKPOINT_PROOF_COUNT');const result=loaded.results[0];
 assert.equal(result.retryIndex,0,'SELECTOR_CHECKPOINT_RETRY');
 assert.equal(result.proofId,baseline?SELECTOR_EVENT_PROOF:SELECTOR_EVENT_MUTANT_PROOF,'SELECTOR_CHECKPOINT_PROOF');assert.equal(result.boundary,'candidate','SELECTOR_CHECKPOINT_BOUNDARY');
 assert.equal(result.outcome,baseline?'passed':'failed','SELECTOR_CHECKPOINT_OUTCOME');assert.equal(result.failureId,baseline?null:SELECTOR_EVENT_FAILURE,'SELECTOR_CHECKPOINT_FAILURE');
 assert.equal(loaded.execution.invocationId,invocationId,'SELECTOR_CHECKPOINT_INVOCATION');assert.equal(loaded.execution.runId,expected.runId,'SELECTOR_CHECKPOINT_RUN');assert.deepEqual(loaded.execution.identity,expected.identity,'SELECTOR_CHECKPOINT_EXECUTION_IDENTITY');
 assert.equal(loaded.execution.kind,baseline?'baseline':'mutation','SELECTOR_CHECKPOINT_KIND');assert.equal(loaded.execution.terminalState,'completed','SELECTOR_CHECKPOINT_TERMINAL');assert.deepEqual(loaded.execution.unexpectedGlobalErrors,[],'SELECTOR_CHECKPOINT_GLOBAL_ERRORS');
 assert.deepEqual(readSelectorArtifact(directory,`${invocationId}/framework-terminal.json`).value,{code:baseline?0:1,signal:null},'SELECTOR_CHECKPOINT_FRAMEWORK');assert.equal(loaded.execution.runnerExitCode,baseline?0:1,'SELECTOR_CHECKPOINT_EXIT');
 const journalFile=path.join(directory,invocationId,'ccd-requests.jsonl');assert(fs.lstatSync(journalFile).isFile()&&fs.realpathSync(journalFile)===journalFile,'SELECTOR_EVIDENCE_ALIAS');
 const journal=fs.readFileSync(journalFile,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
 validateSelectorInvocationObservation(observation.value,journal,input,invocationId);validateNativeInvocationFinalization(directory,{invocationId});
 return {manifest:manifest.value,execution:loaded.execution,references:[manifest.reference,raw.reference,observation.reference,...loaded.references]};
}
// Same fixed native-container authority contract as other native scopes. This
// checks current removal independently before preparing the next namespace.
export function assertSelectorInvocationRemoved(ownership,invocationId,inspect) {
 const selected=ownership.invocations.filter(item=>item.invocationId===invocationId);assert.equal(selected.length,1,'SELECTOR_REMOVAL_PLAN');const {plan}=selected[0];
 const registry=readSelectorArtifact(ownership.directory,'owned-resources.json').value;
 const {denial,lifecycle}=validateNativeInvocationFinalization(ownership.directory,{invocationId});const removed=[];
 for(const [service,resource] of [['candidate',plan.candidate],['browser-provider',plan.tools]]){
  const matches=registry.filter(row=>row.name===resource.name);assert.equal(matches.length,1,'SELECTOR_REMOVAL_INVENTORY');const item=matches[0];
  assert(/^[a-f0-9]{64}$/.test(item.id),'SELECTOR_REMOVAL_CID');assert.equal(item.owner,ownership.owner,'SELECTOR_REMOVAL_OWNER');assert.equal(item.service,service,'SELECTOR_REMOVAL_SERVICE');assert.equal(item.image,resource.image,'SELECTOR_REMOVAL_IMAGE');assert.equal(item.namespace,plan.namespace,'SELECTOR_REMOVAL_NAMESPACE');assert.deepEqual(item.mounts,resource.mounts,'SELECTOR_REMOVAL_MOUNTS');assert.equal(item.removed,true,'SELECTOR_REMOVAL_TERMINAL');
  assert.equal(inspect(item.id),null,'SELECTOR_REMOVAL_CID_PRESENT');assert.equal(inspect(resource.name),null,'SELECTOR_REMOVAL_NAME_PRESENT');
  if(service==='candidate'){assert.equal(denial.candidateId,item.id,'SELECTOR_REMOVAL_PROBE');for(const observed of [lifecycle.before,lifecycle.after]){assert.equal(observed.Id,item.id,'SELECTOR_REMOVAL_LIFECYCLE');assert.equal(observed.Name,`/${resource.name}`,'SELECTOR_REMOVAL_LIFECYCLE_NAME');assertOwnedContainerAuthority(observed,{owner:ownership.owner,service,image:resource.image,namespace:plan.namespace,mounts:resource.mounts,launchProcess:resource.launchProcess});}assert.equal(lifecycle.after.State.OOMKilled,false,'SELECTOR_REMOVAL_OOM');}
  removed.push({name:item.name,id:item.id});
 }
 return {invocationId,removed};
}
export function validateSelectorEventEvidence(directory,expected,loadedInput,terminal) {
 assert.equal(expected.nativeAuthority,true,'SELECTOR_EVIDENCE_AUTHORITY');
 const referenced=(reference,relative)=>{assert.deepEqual(Object.keys(reference??{}).sort(),['digest','path'],'SELECTOR_EVIDENCE_REFERENCE');assert.equal(reference.path,relative,'SELECTOR_EVIDENCE_REFERENCE_PATH');const actual=readSelectorArtifact(directory,relative);assert.equal(actual.reference.digest,reference.digest,'SELECTOR_EVIDENCE_REFERENCE_DIGEST');return actual.value;};
 assert.deepEqual(referenced(expected.selectorControllerTerminal,'independent-controller-terminal.json'),{schemaVersion:1,runId:expected.runId,terminal},'SELECTOR_EVIDENCE_OBSERVED_TERMINAL');
 const capture=referenced(expected.selectorEventCapture,'independent-selector-capture.json');
 assert.equal(capture.schemaVersion,1,'SELECTOR_EVIDENCE_SCHEMA');assert.equal(capture.completedAfterController,true,'SELECTOR_EVIDENCE_CAPTURE_ORDER');
 assert.deepEqual(capture.invocations.map(item=>item.invocationId),selectorSequence,'SELECTOR_EVIDENCE_CAPTURE_SELECTION');assert.deepEqual(loadedInput.executions.map(item=>item.invocationId),selectorSequence,'SELECTOR_EVIDENCE_EXECUTION_SELECTION');
 const baseline=readSelectorArtifact(directory,'input.json');assert.equal(capture.baselineInputDigest,baseline.reference.digest,'SELECTOR_EVIDENCE_BASELINE_BINDING');
 const namespaces=new Set(),owners=new Set(),cids=new Set();
 for(const [index,captured] of capture.invocations.entries()){
  const invocationId=selectorSequence[index],before=referenced(captured.expectation,`independent-selector-${invocationId}.json`);
  assert.equal(before.capturedBeforeExecution,true,'SELECTOR_EVIDENCE_EXPECTATION_ORDER');assert.equal(before.invocationId,invocationId,'SELECTOR_EVIDENCE_EXPECTATION_INVOCATION');
  assert(Number.isFinite(Date.parse(before.capturedAt)),'SELECTOR_EVIDENCE_CAPTURE_TIME');
  for(const field of ['runId','harnessCommit','releaseScopeId','policyDigest','harnessSourceDigest','harnessDependencyDigest','browserDigest','nativeAuthority'])assert.deepEqual(before.expected[field],expected[field],'SELECTOR_EVIDENCE_EXPECTED_IDENTITY');
  const ack=index?referenced(captured.runtimeRecord,`${invocationId}/runtime-input.json`):null;
  const input=index?selectSelectorRuntime(baseline.value,ack):baseline.value;
  validateSelectorRuntimeInput(input,invocationId);
  if(index)assert.deepEqual(readSelectorArtifact(directory,'selector-transition-request.json').value,ack.request,'SELECTOR_EVIDENCE_REQUEST_BINDING');
  for(const key of ['definition','definitionImportDigest','selectorEventBinding','ccd','apiContracts'])assert.deepEqual(input[key],before[key],'SELECTOR_EVIDENCE_PREEXECUTION_BINDING');
  assert.deepEqual(Object.fromEntries(Object.entries(input).filter(([key])=>/^selector.*Receipt$/.test(key))),before.runtimeEvidence,'SELECTOR_EVIDENCE_PREEXECUTION_REFS');
  assert.deepEqual(Object.fromEntries(Object.entries(input.credentials).map(([name,value])=>[name,{userId:value.userId,roles:value.roles??[]}])),before.actors,'SELECTOR_EVIDENCE_PARENT_ACTORS');
  assertCopiedSelectorRuntimeEvidence(directory,input,invocationId);
  assert(!namespaces.has(input.ccd.namespace)&&!owners.has(input.ccd.owner),'SELECTOR_EVIDENCE_RUNTIME_REUSE');namespaces.add(input.ccd.namespace);owners.add(input.ccd.owner);
  for(const cid of Object.values(input.ccd.containers)){assert(/^[a-f0-9]{64}$/.test(cid)&&!cids.has(cid),'SELECTOR_EVIDENCE_CID_REUSE');cids.add(cid);}
  const checkpoint=readSelectorCheckpoint(directory,before.expected,invocationId,input);
  const metadata={definitionImportDigest:input.definitionImportDigest,observedDefinitionDigest:input.definition.observedDefinitionDigest,observedPagesDigest:input.definition.observedPagesDigest,selectorStoredDateDigest:input.definition.storedDateDigest,definitionVersion:String(input.definition.definitionVersion),ccdNamespace:input.ccd.namespace};
  for(const [key,value] of Object.entries(metadata))assert.equal(checkpoint.manifest.runtimeMetadata[key],value,'SELECTOR_EVIDENCE_METADATA');
  assert.deepEqual(checkpoint.manifest.identity.definitionDigests,{HarnessNestedPRL:input.definition.fixtureDigest},'SELECTOR_EVIDENCE_WORKBOOK_IDENTITY');
  assert.deepEqual(captured.identity,before.expected.identity,'SELECTOR_EVIDENCE_CAPTURE_IDENTITY');
  const removal=referenced(captured.removal,`independent-selector-${invocationId}-removal.json`);
  assert.equal(removal.invocationId,invocationId,'SELECTOR_EVIDENCE_REMOVAL_INVOCATION');assert.equal(removal.ccd.owner,input.ccd.owner,'SELECTOR_EVIDENCE_REMOVAL_OWNER');assert.equal(removal.ccd.cleanupComplete,true,'SELECTOR_EVIDENCE_REMOVAL_COMPLETE');
  assert.deepEqual(removal.ccd.checkedContainerIds.slice().sort(),Object.values(input.ccd.containers).sort(),'SELECTOR_EVIDENCE_REMOVAL_CIDS');assert.deepEqual(removal.ccd.checkedNames.slice().sort(),Object.keys(input.ccd.containers).map(service=>`${input.ccd.owner}-${service}`).sort(),'SELECTOR_EVIDENCE_REMOVAL_NAMES');
  assert.equal(removal.native.invocationId,invocationId,'SELECTOR_EVIDENCE_NATIVE_REMOVAL');assert.deepEqual(removal.native.removed.map(item=>item.name).sort(),[`${input.runId}-${invocationId}-candidate`,`${input.runId}-${invocationId}-tools`].sort(),'SELECTOR_EVIDENCE_NATIVE_NAMES');
  const registry=readSelectorArtifact(directory,'owned-resources.json').value;
  for(const removed of removal.native.removed){const matches=registry.filter(item=>item.name===removed.name);assert.equal(matches.length,1,'SELECTOR_EVIDENCE_REMOVAL_REGISTRY');assert.equal(matches[0].id,removed.id,'SELECTOR_EVIDENCE_REMOVAL_ID');assert.equal(matches[0].removed,true,'SELECTOR_EVIDENCE_REMOVAL_STATE');}
 }
 assert.deepEqual(loadedInput.manifest.identity,capture.invocations[0].identity,'SELECTOR_EVIDENCE_BASELINE_IDENTITY');
 const run=readSelectorArtifact(directory,'run.json').value;assert.deepEqual(run.mutations.map(item=>item.mutationId),[SELECTOR_EVENT_MUTATION],'SELECTOR_EVIDENCE_MUTATION_SELECTION');
 const mutation=referenced(run.mutations[0].derivationArtifact,`${SELECTOR_EVENT_MUTATION}/derivation.json`);
 assert.deepEqual(mutation.baselineIdentity,capture.invocations[0].identity,'SELECTOR_EVIDENCE_MUTATION_IDENTITY');assert.deepEqual(mutation.mutantIdentity,capture.invocations[1].identity,'SELECTOR_EVIDENCE_MUTATION_IDENTITY');
 assert.equal(mutation.mutationDefinitionDigest,selectorEventPolicy().mutationDefinitions[0].definitionDigest,'SELECTOR_EVIDENCE_MUTATION_POLICY');
 assert.equal(mutation.transformation,SELECTOR_EVENT_MUTATION,'SELECTOR_EVIDENCE_MUTATION_ID');
 assert.deepEqual(mutation.runtimeRecord,capture.invocations[1].runtimeRecord,'SELECTOR_EVIDENCE_MUTATION_RUNTIME');
 assert.deepEqual(mutation.transformationRecord,selectorEventMutation(),'SELECTOR_EVIDENCE_MUTATION_CONTRACT');
 assert.deepEqual(mutation.selectorObservations,selectorObservationReferences(directory),'SELECTOR_EVIDENCE_OBSERVATION_REFERENCES');
 return true;
}
