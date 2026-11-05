import {assertApplicantResultDates} from './exui-applicant-result-dates.mjs';
import {validateResultDescriptors} from './exui-result-columns-import.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes,readExecutionEvidence} from './exui-evidence-io.mjs';
import {APPLICANT_RESULTS_SCOPE,APPLICANT_RESULTS_PROOF,APPLICANT_RESULTS_FAILURE,applicantResultsPolicy} from './exui-applicant-results-contract.mjs';
import {applicantResultSequence,validateApplicantResultRuntime,validateApplicantResultTransitionRequest,selectApplicantResultRuntime} from './exui-applicant-results-transition.mjs';
import {applicantResultDefinition,applicantResultObserved,applicantResultContract} from './exui-applicant-results.mjs';
import {validateNativeInvocationFinalization} from './exui-native-ci-ownership.mjs';
import {assertOwnedContainerAuthority} from './exui-oci-runtime.mjs';
export function readApplicantArtifact(directory,relative) {
 assert(!path.isAbsolute(relative)&&!relative.split('/').includes('..'),'RESULT_EVIDENCE_PATH');
 const file=path.join(directory,relative);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'RESULT_EVIDENCE_ALIAS');
 const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),reference:{path:relative,digest:digestBytes(bytes)}};
}
export function assertApplicantObservation(observation,invocationId) {
 assert(applicantResultSequence.includes(invocationId),'RESULT_EVIDENCE_INVOCATION');
 assert.equal(observation?.kind,'native-applicant-results-observation','RESULT_EVIDENCE_OBSERVATION');
 assert.equal(observation.schemaVersion,1,'RESULT_EVIDENCE_SCHEMA');assert.equal(observation.invocationId,invocationId,'RESULT_EVIDENCE_INVOCATION');assert.equal(observation.variant,invocationId,'RESULT_EVIDENCE_VARIANT');
 assert.deepEqual(Object.keys(observation.views??{}).sort(),['SEARCH','WORKBASKET'],'RESULT_EVIDENCE_VIEWS');
 const definition=applicantResultDefinition(invocationId);let references;
 for(const [view,sheet] of [['SEARCH','SearchResultFields'],['WORKBASKET','WorkBasketResultFields']]){
  const item=observation.views[view];assert.equal(item.useCase,view,'RESULT_EVIDENCE_VIEW');assert.equal(item.cells,21,'RESULT_EVIDENCE_CELLS');assert.equal(item.rows,3,'RESULT_EVIDENCE_ROWS');
  assert.deepEqual(item.columns,definition.sheets[sheet].slice().sort((a,b)=>a.DisplayOrder-b.DisplayOrder).map(row=>row.CaseFieldID),'RESULT_EVIDENCE_COLUMNS');
  assert(Array.isArray(item.references)&&item.references.length===3&&new Set(item.references).size===3&&item.references.every(value=>/^\d{16}$/.test(value)),'RESULT_EVIDENCE_ASSOCIATIONS');
  if(references)assert.deepEqual([...item.references].sort(),references,'RESULT_EVIDENCE_SAME_CASES');else references=[...item.references].sort();
  assert.deepEqual(item.applicantExpected,applicantResultContract(view),'RESULT_EVIDENCE_SOURCE_ORACLE');
  const columns=definition.sheets[sheet].map(row=>({case_field_id:row.CaseFieldID,label:row.Label,order:row.DisplayOrder}));
  assert.deepEqual(item.applicantObserved,applicantResultObserved(view,columns),'RESULT_EVIDENCE_EFFECTIVE_VARIANT');
  if(invocationId!=='baseline')assert.notDeepEqual(item.applicantObserved,item.applicantExpected,'RESULT_EVIDENCE_UNCHANGED_VIEW');
 }
}
export function readApplicantCheckpoint(directory,expected,invocationId) {
 assert.equal(expected.releaseScopeId,APPLICANT_RESULTS_SCOPE,'RESULT_CHECKPOINT_SCOPE');assert.equal(expected.nativeAuthority,true,'RESULT_CHECKPOINT_AUTHORITY');
 const manifest=readApplicantArtifact(directory,`${invocationId}/manifest.json`),raw=readApplicantArtifact(directory,`${invocationId}/execution.json`),observation=readApplicantArtifact(directory,`${invocationId}/applicant-results-observation.json`);
 for(const field of ['runId','harnessCommit','releaseScopeId','policyDigest','identity'])assert.deepEqual(manifest.value[field],expected[field],'RESULT_CHECKPOINT_IDENTITY');
 for(const field of ['harnessSourceDigest','harnessDependencyDigest','browserDigest'])assert.equal(manifest.value.runtimeMetadata[field],expected[field],'RESULT_CHECKPOINT_METADATA');
 assert.equal(manifest.value.runtimeMetadata.harnessSourceState,'clean','RESULT_CHECKPOINT_SOURCE');assert.equal(manifest.value.runtimeMetadata.isolation,'native-separate-api-owned-network-none','RESULT_CHECKPOINT_ISOLATION');
 const policy=applicantResultsPolicy();assert.equal(expected.policyDigest,policy.policyDigest,'RESULT_CHECKPOINT_POLICY');assert.deepEqual(manifest.value.requiredObligationIds,policy.requiredObligationIds,'RESULT_CHECKPOINT_OBLIGATIONS');
 const loaded=readExecutionEvidence(directory,raw.reference,manifest.value,policy),baseline=invocationId==='baseline';
 assert.equal(loaded.results.length,1,'RESULT_CHECKPOINT_PROOF_COUNT');const result=loaded.results[0];
 assert.equal(result.proofId,baseline?APPLICANT_RESULTS_PROOF:`${APPLICANT_RESULTS_PROOF}-${invocationId}`,'RESULT_CHECKPOINT_PROOF');
 assert.equal(result.outcome,baseline?'passed':'failed','RESULT_CHECKPOINT_OUTCOME');assert.equal(result.failureId,baseline?null:APPLICANT_RESULTS_FAILURE,'RESULT_CHECKPOINT_FAILURE');
 assert.equal(loaded.execution.invocationId,invocationId,'RESULT_CHECKPOINT_INVOCATION');assert.equal(loaded.execution.runId,expected.runId,'RESULT_CHECKPOINT_RUN');assert.deepEqual(loaded.execution.identity,expected.identity,'RESULT_CHECKPOINT_EXECUTION_IDENTITY');
 assert.equal(loaded.execution.kind,baseline?'baseline':'mutation','RESULT_CHECKPOINT_KIND');assert.equal(loaded.execution.terminalState,'completed','RESULT_CHECKPOINT_TERMINAL');assert.deepEqual(loaded.execution.unexpectedGlobalErrors,[],'RESULT_CHECKPOINT_GLOBAL_ERRORS');
 assert.deepEqual(readApplicantArtifact(directory,`${invocationId}/framework-terminal.json`).value,{code:baseline?0:1,signal:null},'RESULT_CHECKPOINT_FRAMEWORK');assert.equal(loaded.execution.runnerExitCode,baseline?0:1,'RESULT_CHECKPOINT_EXIT');
 assertApplicantObservation(observation.value,invocationId);validateNativeInvocationFinalization(directory,{invocationId});
 return {manifest:manifest.value,execution:loaded.execution,references:[manifest.reference,raw.reference,observation.reference,...loaded.references]};
}
export function assertApplicantInvocationRemoved(ownership,invocationId,inspect) {
 const selected=ownership.invocations.filter(item=>item.invocationId===invocationId);assert.equal(selected.length,1,'RESULT_REMOVAL_PLAN');const {plan}=selected[0];
 const registry=readApplicantArtifact(ownership.directory,'owned-resources.json').value;
 const {denial,lifecycle}=validateNativeInvocationFinalization(ownership.directory,{invocationId});const removed=[];
 for(const [service,resource] of [['candidate',plan.candidate],['browser-provider',plan.tools]]){
  const matches=registry.filter(row=>row.name===resource.name);assert.equal(matches.length,1,'RESULT_REMOVAL_INVENTORY');const item=matches[0];
  assert(/^[a-f0-9]{64}$/.test(item.id),'RESULT_REMOVAL_CID');assert.equal(item.owner,ownership.owner,'RESULT_REMOVAL_OWNER');assert.equal(item.service,service,'RESULT_REMOVAL_SERVICE');assert.equal(item.image,resource.image,'RESULT_REMOVAL_IMAGE');assert.equal(item.namespace,plan.namespace,'RESULT_REMOVAL_NAMESPACE');assert.deepEqual(item.mounts,resource.mounts,'RESULT_REMOVAL_MOUNTS');assert.equal(item.removed,true,'RESULT_REMOVAL_TERMINAL');
  assert.equal(inspect(item.id),null,'RESULT_REMOVAL_CID_PRESENT');assert.equal(inspect(resource.name),null,'RESULT_REMOVAL_NAME_PRESENT');
  if(service==='candidate'){assert.equal(denial.candidateId,item.id,'RESULT_REMOVAL_PROBE');for(const observed of [lifecycle.before,lifecycle.after]){assert.equal(observed.Id,item.id,'RESULT_REMOVAL_LIFECYCLE');assertOwnedContainerAuthority(observed,{owner:ownership.owner,service,image:resource.image,namespace:plan.namespace,mounts:resource.mounts});}assert.equal(lifecycle.after.State.OOMKilled,false,'RESULT_REMOVAL_OOM');}
  removed.push({name:item.name,id:item.id});
 }
 return {invocationId,removed};
}

export function validateApplicantResultsEvidence(directory,expected,loadedInput,terminal) {
 assert.equal(expected.nativeAuthority,true,'RESULT_EVIDENCE_AUTHORITY');
 const referenced=(reference,relative)=>{assert.deepEqual(Object.keys(reference??{}).sort(),['digest','path'],'RESULT_EVIDENCE_REFERENCE');assert.equal(reference.path,relative,'RESULT_EVIDENCE_REFERENCE_PATH');const actual=readApplicantArtifact(directory,relative);assert.equal(actual.reference.digest,reference.digest,'RESULT_EVIDENCE_REFERENCE_DIGEST');return actual.value;};
 const observedTerminal=referenced(expected.applicantControllerTerminal,'independent-controller-terminal.json');
 assert.deepEqual(observedTerminal,{schemaVersion:1,runId:expected.runId,terminal},'RESULT_EVIDENCE_OBSERVED_TERMINAL');
 const capture=referenced(expected.applicantResultsCapture,'independent-results-capture.json');
 assert.equal(capture.schemaVersion,1,'RESULT_EVIDENCE_CAPTURE_SCHEMA');assert.equal(capture.completedAfterController,true,'RESULT_EVIDENCE_CAPTURE_ORDER');
 assert.deepEqual(capture.invocations.map(item=>item.invocationId),applicantResultSequence,'RESULT_EVIDENCE_CAPTURE_SELECTION');
 assert.deepEqual(loadedInput.executions.map(item=>item.invocationId),applicantResultSequence,'RESULT_EVIDENCE_EXECUTION_SELECTION');
 const baseline=readApplicantArtifact(directory,'input.json');assert.equal(capture.baselineInputDigest,baseline.reference.digest,'RESULT_EVIDENCE_BASELINE_BINDING');
 const seenNamespaces=new Set(),seenOwners=new Set(),seenCids=new Set();let priorInput;
 for(const [index,captured] of capture.invocations.entries()){
  const invocationId=applicantResultSequence[index];
  const before=referenced(captured.expectation,`independent-results-${invocationId}.json`);
  assert.equal(before.capturedBeforeExecution,true,'RESULT_EVIDENCE_EXPECTATION_ORDER');assert.equal(before.invocationId,invocationId,'RESULT_EVIDENCE_EXPECTATION_INVOCATION');
  for(const field of ['runId','harnessCommit','releaseScopeId','policyDigest','harnessSourceDigest','harnessDependencyDigest','browserDigest','nativeAuthority'])assert.deepEqual(before.expected[field],expected[field],'RESULT_EVIDENCE_EXPECTED_IDENTITY');
  const runtime=index?referenced(captured.runtimeRecord,`${invocationId}/runtime-input.json`).runtime:baseline.value;
  validateApplicantResultRuntime(runtime,invocationId);
  if(index){const record=referenced(captured.runtimeRecord,`${invocationId}/runtime-input.json`);validateApplicantResultTransitionRequest(baseline.value,record.request,priorInput);assert.deepEqual(selectApplicantResultRuntime(baseline.value,invocationId,record),runtime,'RESULT_EVIDENCE_SELECTED_RUNTIME');const request=readApplicantArtifact(directory,`results-transition-${invocationId}.json`);assert.deepEqual(request.value,record.request,'RESULT_EVIDENCE_REQUEST_BINDING');}
  priorInput=runtime;
  for(const key of ['resultDescriptorDigests','resultExpectedDigest','resultDatesDigest','definitionImportDigest'])assert.deepEqual(runtime[key],before[key],'RESULT_EVIDENCE_INDEPENDENT_OBSERVATION_DIGEST');
  assert.deepEqual(runtime.definition,before.definition,'RESULT_EVIDENCE_DEFINITION_CAPTURE');assert.deepEqual(runtime.correctedDependency,before.correctedDependency,'RESULT_EVIDENCE_DEPENDENCY_CAPTURE');
  assert.deepEqual(runtime.ccd,before.ccd,'RESULT_EVIDENCE_CCD_CAPTURE');
  assert(!seenNamespaces.has(runtime.ccd.namespace)&&!seenOwners.has(runtime.ccd.owner),'RESULT_EVIDENCE_RUNTIME_REUSE');seenNamespaces.add(runtime.ccd.namespace);seenOwners.add(runtime.ccd.owner);
  for(const cid of Object.values(runtime.ccd.containers)){assert(/^[a-f0-9]{64}$/.test(cid)&&!seenCids.has(cid),'RESULT_EVIDENCE_CID_REUSE');seenCids.add(cid);}
  assert.deepEqual(Object.fromEntries(Object.entries(runtime).filter(([key])=>/^result.*Receipt$/.test(key))),before.runtimeEvidence,'RESULT_EVIDENCE_PREEXECUTION_REFS');
  const imported=referenced(runtime.resultImportReceipt,`${invocationId}/import-readback.json`);
  assert.equal(imported.status,'import-and-readback-observed','RESULT_EVIDENCE_IMPORTED_STATUS');assert.equal(imported.owner,runtime.ccd.owner,'RESULT_EVIDENCE_IMPORTED_OWNER');assert.equal(imported.namespace,runtime.ccd.namespace,'RESULT_EVIDENCE_IMPORTED_NAMESPACE');assert.equal(imported.variant,invocationId,'RESULT_EVIDENCE_IMPORTED_VARIANT');assert.deepEqual(imported.images,runtime.ccd.images,'RESULT_EVIDENCE_IMPORTED_IMAGES');
  const definition=referenced(runtime.resultDefinitionReceipt,`${invocationId}/definition.json`);assert.deepEqual(definition,applicantResultDefinition(invocationId),'RESULT_EVIDENCE_DEFINITION');
  assert.equal(imported.binding.definitionDigest,runtime.resultDefinitionReceipt.digest,'RESULT_EVIDENCE_IMPORTED_DEFINITION');assert.equal(imported.binding.workbookDigest,runtime.definition.fixtureDigest,'RESULT_EVIDENCE_IMPORTED_WORKBOOK');
  validateResultDescriptors(definition,Object.fromEntries(Object.entries(imported.observations).map(([name,item])=>[name,item.body])));
  for(const name of ['definition','search','workbasket'])assert.equal(digestBytes(JSON.stringify(imported.observations[name].body)),runtime.resultDescriptorDigests[name],'RESULT_EVIDENCE_DESCRIPTOR_DIGEST');
  assert.equal(digestBytes(JSON.stringify(imported.observations.definition.body)),runtime.definition.observedDefinitionDigest,'RESULT_EVIDENCE_DESCRIPTOR_IDENTITY');
  assert.equal(imported.observations.definition.body.version.number,runtime.definition.definitionVersion,'RESULT_EVIDENCE_DESCRIPTOR_VERSION');
  const nativeImport=referenced(runtime.resultNativeImportReceipt,`${invocationId}/native-import.json`);assert.deepEqual(nativeImport,runtime.definition,'RESULT_EVIDENCE_NATIVE_IMPORT');assert.equal(runtime.resultNativeImportReceipt.digest,runtime.definitionImportDigest,'RESULT_EVIDENCE_NATIVE_IMPORT_DIGEST');
  const dates=referenced(runtime.resultDatesReceipt,`${invocationId}/stored-dates.json`);assert.deepEqual(dates,runtime.storedResultDates,'RESULT_EVIDENCE_DATES');assert.equal(runtime.resultDatesReceipt.digest,runtime.resultDatesDigest,'RESULT_EVIDENCE_DATES_DIGEST');assertApplicantResultDates(dates,runtime.ccd,runtime.definition.definitionVersion,{variant:invocationId,workbookDigest:runtime.definition.fixtureDigest});
  const workbook=path.join(directory,`${invocationId}/definition.xlsx`);assert.equal(runtime.resultWorkbookReceipt.path,`${invocationId}/definition.xlsx`,'RESULT_EVIDENCE_WORKBOOK_PATH');assert(fs.lstatSync(workbook).isFile()&&fs.realpathSync(workbook)===workbook,'RESULT_EVIDENCE_WORKBOOK_ALIAS');assert.equal(digestBytes(fs.readFileSync(workbook)),runtime.definition.fixtureDigest,'RESULT_EVIDENCE_WORKBOOK_BYTES');assert.equal(runtime.resultWorkbookReceipt.digest,runtime.definition.fixtureDigest,'RESULT_EVIDENCE_WORKBOOK_CAPTURE');
  const seed=referenced(runtime.resultSeedReceipt,`${invocationId}/seed-receipt.json`);assert.equal(seed.status,'persisted-rows-indexed','RESULT_EVIDENCE_SEED_STATUS');assert.equal(seed.owner,runtime.ccd.owner,'RESULT_EVIDENCE_SEED_OWNER');assert.equal(seed.namespace,runtime.ccd.namespace,'RESULT_EVIDENCE_SEED_NAMESPACE');
  const checkpoint=readApplicantCheckpoint(directory,before.expected,invocationId);
  for(const key of ['definitionImportDigest','resultDatesDigest','resultExpectedDigest'])assert.equal(checkpoint.manifest.runtimeMetadata[key],runtime[key],'RESULT_EVIDENCE_RUNTIME_METADATA');
  assert.equal(checkpoint.manifest.identity.definitionDigests.HarnessResultsPRL,runtime.definition.fixtureDigest,'RESULT_EVIDENCE_WORKBOOK_IDENTITY');
  const backend=referenced(runtime.resultBackendReceipt,`${invocationId}/backend-search.json`);assert.equal(backend.status,'both-use-cases-observed','RESULT_EVIDENCE_BACKEND');assert.equal(backend.owner,runtime.ccd.owner,'RESULT_EVIDENCE_BACKEND_OWNER');assert.equal(backend.namespace,runtime.ccd.namespace,'RESULT_EVIDENCE_BACKEND_NAMESPACE');
  assert.deepEqual(runtime.resultExpected,Object.fromEntries(Object.entries(backend.observations).map(([view,value])=>[view,value.body])),'RESULT_EVIDENCE_EXPECTED_BACKEND');
  const observation=readApplicantArtifact(directory,`${invocationId}/applicant-results-observation.json`).value;
  for(const view of ['SEARCH','WORKBASKET']){assert.deepEqual([...observation.views[view].references].sort(),backend.observations[view].body.cases.map(item=>item.case_id).sort(),'RESULT_EVIDENCE_PERSISTED_ASSOCIATION');assert.deepEqual([...observation.views[view].references].sort(),seed.references.slice().sort(),'RESULT_EVIDENCE_SEED_ASSOCIATION');}
  const removal=referenced(captured.removal,`independent-results-${invocationId}-removal.json`);
  assert.equal(removal.invocationId,invocationId,'RESULT_EVIDENCE_REMOVAL_INVOCATION');assert.equal(removal.ccd.owner,runtime.ccd.owner,'RESULT_EVIDENCE_REMOVAL_OWNER');assert.equal(removal.ccd.cleanupComplete,true,'RESULT_EVIDENCE_REMOVAL_COMPLETE');
  assert.deepEqual(removal.ccd.checkedContainerIds.slice().sort(),Object.values(runtime.ccd.containers).sort(),'RESULT_EVIDENCE_REMOVAL_CIDS');
  assert.deepEqual(removal.ccd.checkedNames.slice().sort(),Object.keys(runtime.ccd.containers).map(service=>`${runtime.ccd.owner}-${service}`).sort(),'RESULT_EVIDENCE_REMOVAL_NAMES');
  assert.equal(removal.native.invocationId,invocationId,'RESULT_EVIDENCE_NATIVE_REMOVAL');assert.deepEqual(removal.native.removed.map(item=>item.name).sort(),[`${runtime.runId}-${invocationId}-candidate`,`${runtime.runId}-${invocationId}-tools`].sort(),'RESULT_EVIDENCE_NATIVE_NAMES');
 }
 assert.deepEqual(loadedInput.manifest.identity,capture.invocations[0].identity,'RESULT_EVIDENCE_BASELINE_IDENTITY');
 return true;
}
