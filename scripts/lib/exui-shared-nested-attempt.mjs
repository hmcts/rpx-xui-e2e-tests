import os from 'node:os';
import {getReleasePolicy} from './exui-release-policy.mjs';
import {nativeContainerPlan} from './exui-native-containers.mjs';
import {nativeInvocations,nativeIdentity} from './exui-native-contract.mjs';
import {assertOwnedContainerAuthority} from './exui-oci-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digestBytes,readEvidenceArtifactBytes,loadRunEvidence} from './exui-evidence-io.mjs';
import {readSharedNestedBaselineCheckpoint} from './exui-native-proof-validation.mjs';
import {validateNativePhaseFinalization,validateNativeInvocationFinalization} from './exui-native-ci-ownership.mjs';
import {validateCiPhase} from './exui-candidate-ci-evidence.mjs';
import {NATIVE_HARNESS_SOURCE_FILES} from './exui-native-sources.mjs';
import {SHARED_NESTED_SCOPE,SHARED_NESTED_ID,SHARED_NESTED_FACETS,sharedNestedValues,bindSharedNestedSourceFixture,assertSharedNestedObservedDefinition} from './exui-shared-nested-contract.mjs';
import {sharedNestedBinding,replaySharedNestedObservation} from './exui-shared-nested-observations.mjs';
import {bindSharedRoleToolkitArtifact} from './exui-shared-role-toolkit.mjs';
import {replaySharedNestedNativeBindings} from './exui-shared-nested-native-binding.mjs';
export const POSTCODE_SOURCE_ID='configuration-shape:19c563fe69729edfef6a79cc024fde59db914b7ab5d82bbffc14cd20fa63c667';
const root=fileURLToPath(new URL('../../',import.meta.url));
const fail='SHARED_NESTED_ATTEMPT_INVALID';
const exact=(value,keys)=>assert.deepEqual(Object.keys(value??{}).sort(),keys.slice().sort(),fail);
function read(file){assert(path.isAbsolute(file)&&path.normalize(file)===file&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile()&&fs.statSync(file).size<=16*1024*1024,fail);const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),digest:digestBytes(bytes)};}
const normal=value=>String(value).replace(/\s+/g,' ').trim();
export function validatePostcodeAttempt(value,{binding,actorId,facetId,failureId}) {
 const facet=SHARED_NESTED_FACETS.find(row=>row.id===facetId);assert(facet?.channel==='post',fail);
 const match=/^shared-nested-PostCode-required-([01])$/.exec(failureId??'');assert(match,fail);const failedIndex=Number(match[1]);assert(failedIndex<facet.recipientCount,fail);
 exact(value,['schemaVersion','binding','facetId','caseId','actorId','before','checks']);assert.equal(value.schemaVersion,1,fail);assert.deepEqual(value.binding,binding,fail);assert.equal(value.facetId,facetId,fail);assert.equal(value.actorId,actorId,fail);assert(/^[0-9]{16}$/.test(value.caseId),fail);
 assert.equal(String(value.before?.state?.id),value.caseId,fail);assert.equal(value.before.state.case_type_id,'HarnessNestedPRL',fail);assert.equal(value.before.state.jurisdiction,'HARNESS',fail);assert.equal(value.before.state.state,'Created',fail);assert.deepEqual(value.before.state.case_data,{protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[]},fail);
 assert.equal(value.checks.length,failedIndex*2+2,fail);
 for(const [position,check] of value.checks.entries()) {
  exact(check,['index','field','intended','cyaHeadings','controls','cyaRows']);const index=Math.floor(position/2),field=['AddressLine1','PostCode'][position%2];assert.equal(check.index,index,fail);assert.equal(check.field,field,fail);
  const intended=sharedNestedValues('post',facet.recipientCount);intended[index].postalInformation.postalAddress[field]='';assert.deepEqual(check.intended,intended,fail);
  if(position<value.checks.length-1) {assert.deepEqual(check.cyaHeadings,[],fail);assert.deepEqual(check.cyaRows,[],fail);const control=check.controls.find(row=>row.index===index&&row.field===field);assert(control?.value===''&&control.visible===true&&control.classes.includes('govuk-input--error'),fail);}
  else {assert(check.cyaHeadings.some(text=>normal(text)==='Check your answers'),fail);assert.deepEqual(check.controls,[],fail);assert.equal(check.cyaRows.length,facet.recipientCount,fail);for(const [rowIndex,row]of check.cyaRows.entries()){const text=normal(row),recipient=intended[rowIndex].postalInformation;for(const token of [recipient.postalName,...Object.values(recipient.postalAddress).filter(Boolean)])assert(text.includes(token),fail);for(const [otherIndex,other]of intended.entries())if(otherIndex!==rowIndex)assert(!text.includes(other.postalInformation.postalName),fail);}}
 }
 return {caseId:value.caseId,failedRecipientIndex:failedIndex,sourceRequirementId:POSTCODE_SOURCE_ID};
}
export async function readSharedNestedAttempt(descriptorPath) {
 const descriptor=read(descriptorPath),request=descriptor.value;exact(request,['schemaVersion','kind','directory','expected']);assert.equal(request.schemaVersion,1,fail);assert.equal(request.kind,'shared-nested-attempt-request',fail);
 const directory=request.directory;assert(path.isAbsolute(directory)&&fs.realpathSync(directory)===directory&&fs.lstatSync(directory).isDirectory(),fail);const native=path.join(directory,'sharedNested'),pins=request.expected;
 exact(pins,['runId','producerCommit','candidateArtifactDigest','beforeDigest','terminalDigest','cleanupDigest','nativeCleanupDigest','summaryDigest']);
 const before=read(path.join(directory,'independent-before.json')),terminal=read(path.join(directory,'independent-terminal.json')),cleanup=read(path.join(directory,'ccd-cleanup.json')),summary=read(path.join(directory,'summary.json')),nativeCleanup=read(path.join(directory,'native-cleanup.json'));
 for(const [key,record]of [['beforeDigest',before],['terminalDigest',terminal],['cleanupDigest',cleanup],['summaryDigest',summary],['nativeCleanupDigest',nativeCleanup]])assert.equal(record.digest,pins[key],fail);
 exact(before.value,['schemaVersion','capturedBeforeExecution','expected','candidateManifest','ccd','ownership']);assert.equal(before.value.schemaVersion,1,fail);assert.equal(before.value.capturedBeforeExecution,true,fail);const expected=before.value.expected;
 assert.equal(expected.releaseScopeId,SHARED_NESTED_SCOPE,fail);assert.equal(expected.runId,pins.runId,fail);assert.equal(expected.harnessCommit,pins.producerCommit,fail);assert.equal(expected.identity.artifactDigest,pins.candidateArtifactDigest,fail);
 assert.equal(summary.value.kind,'standalone-shared-nested-attempt',fail);assert.equal(summary.value.cleanupComplete,true,fail);assert.equal(summary.value.catalogueCredit,false,fail);assert.equal(summary.value.releaseCredit,false,fail);assert(['BLOCKED','PASS'].includes(summary.value.status),fail);
 assert(Number.isSafeInteger(summary.value.durationMs)&&summary.value.durationMs>=0&&Date.parse(summary.value.completedAt)-Date.parse(summary.value.startedAt)===summary.value.durationMs,fail);
 assert.equal(cleanup.value.cleanupComplete,true,fail);assert.equal(cleanup.value.owner,before.value.ccd.owner,fail);assert(cleanup.value.checkedContainerIds.includes(before.value.ccd.namespace),fail);
 const recovery=read(path.join(directory,'ccd-runtime/recovery.json')).value;assert.equal(recovery.owner,before.value.ccd.owner,fail);assert.deepEqual(cleanup.value.checkedNames,Object.values(recovery.resources).map(row=>row.name),fail);assert.deepEqual(cleanup.value.checkedContainerIds,[...new Set([...Object.values(before.value.ccd.containers),before.value.ccd.namespace])].sort(),fail);
 const input=read(path.join(native,'input.json')).value;assert.equal(input.only,undefined,fail);assert.equal(input.releaseScopeId,SHARED_NESTED_SCOPE,fail);assert.deepEqual(input.harnessSources,NATIVE_HARNESS_SOURCE_FILES,fail);assert.equal(input.harnessCommit,expected.harnessCommit,fail);assert.equal(input.harnessDependencies.digest,expected.harnessDependencyDigest,fail);assert.equal(input.browserDigest,expected.browserDigest,fail);assert.deepEqual(input.ccd,before.value.ccd,fail);
 const sourceDigest=digestBytes(JSON.stringify(NATIVE_HARNESS_SOURCE_FILES.map(name=>[name,digestBytes(fs.readFileSync(path.join(root,name)))])));assert.equal(sourceDigest,expected.harnessSourceDigest,fail);assert.equal(input.harnessSourceDigest,sourceDigest,fail);
 const toolkit=await bindSharedRoleToolkitArtifact(before.value.candidateManifest);assert.deepEqual(input.artifact,read(before.value.candidateManifest).value,fail);assert.deepEqual(nativeIdentity(input,{invocationId:'baseline',mutation:null},input.artifact.candidateRoot).identity,expected.identity,fail);for(const key of ['artifactDigest','webappCommit','dependencyLockDigest','toolkitVersion','toolkitDigest'])assert.equal(expected.identity[key],toolkit.candidateIdentity[key],fail);
 const sourceFixture=bindSharedNestedSourceFixture();const observed=read(path.join(directory,'ccd-runtime/observed-definition.json')),imported=read(path.join(directory,'ccd-runtime/definition-import.json'));assertSharedNestedObservedDefinition(observed.value);assert([200,201].includes(imported.value.status),fail);assert.equal(imported.value.fixtureDigest,sourceFixture.fixtureDigest,fail);assert.equal(imported.value.binding.workbookDigest,sourceFixture.workbookDigest,fail);assert.equal(imported.value.sourceRevision,sourceFixture.sourceRevision,fail);assert.equal(String(imported.value.definitionVersion),String(observed.value.version.number),fail);assert.equal(imported.value.observedDefinitionDigest,digestBytes(JSON.stringify(observed.value)),fail);assert.equal(input.definitionImportDigest,imported.digest,fail);
 const handoff=read(path.join(native,'container-launch.json')).value,ownership=before.value.ownership;
 assertSharedNestedStateRemoved(handoff.stateRoot);
 assert.equal(ownership.directory,native,fail);assert.equal(ownership.owner,expected.runId,fail);assert.equal(ownership.mode,handoff.mode,fail);
 assert.deepEqual(ownership.invocations,nativeInvocations(SHARED_NESTED_SCOPE).map(({invocationId})=>({invocationId,plan:nativeContainerPlan(input,handoff,invocationId)})),fail);
 const registry=read(path.join(native,'owned-resources.json')).value;
 assert.equal(nativeCleanup.value.owner,ownership.owner,fail);assert.equal(nativeCleanup.value.cleanupComplete,true,fail);assert.equal(nativeCleanup.value.privateStateRemoved,true,fail);
 assert.deepEqual(nativeCleanup.value.checkedNames,ownership.invocations.flatMap(({plan})=>[plan.tools.name,plan.candidate.name]),fail);
 assert.deepEqual(nativeCleanup.value.checkedContainerIds,[...new Set(registry.map(row=>row.id).filter(Boolean))].sort(),fail);
 const checkpoint=readSharedNestedBaselineCheckpoint(native,expected);assert.equal(checkpoint.input.manifest.runtimeMetadata.definitionImportDigest,imported.digest,fail);assert.equal(checkpoint.input.manifest.runtimeMetadata.observedDefinitionDigest,imported.value.observedDefinitionDigest,fail);assert.equal(checkpoint.input.manifest.runtimeMetadata.ccdNamespace,before.value.ccd.namespace,fail);
 for(const [service,key]of [['data','ccd'],['definition','ccd-definition']])assert.equal(imported.value.images[service].id,expected.identity.dependencyIdentities[key].artifactDigest,fail);
 assert.equal(terminal.value.terminal.signal,null,fail);assert([0,2].includes(terminal.value.terminal.code),fail);validateNativePhaseFinalization(native,checkpoint.input.executions,terminal.value.terminal);

 const execution=checkpoint.input.executions[0],manifest=checkpoint.input.manifest,packet=name=>JSON.parse(readEvidenceArtifactBytes(native,execution.sharedNestedArtifacts.find(row=>row.path==='baseline/'+name)).bytes),context=packet('context.json'),binding=sharedNestedBinding(manifest,context),personas=packet('personas.json'),actorId=personas.credentials.allowed.userId;
 const journal=readEvidenceArtifactBytes(native,execution.sharedNestedArtifacts.find(row=>row.path==='baseline/ccd-requests.jsonl')).bytes.toString().trim().split('\n').filter(Boolean).map(JSON.parse);
 const facets=[],cases=[];
 for(const facet of SHARED_NESTED_FACETS) {
  const proof=checkpoint.input.results.find(row=>row.proofId===facet.proofId);let defect=null;
  if(proof.outcome==='passed'){const value=packet(facet.id+'-observation.json');replaySharedNestedObservation(value,{binding,actorId,facetId:facet.id});cases.push(value.caseId);}
  else if(/^shared-nested-PostCode-required-[01]$/.test(proof.failureId??'')){
   defect=validatePostcodeAttempt(packet(facet.id+'-mandatory-attempt.json'),{binding,actorId,facetId:facet.id,failureId:proof.failureId});cases.push(defect.caseId);
   assert(journal.some(row=>row.method==='GET'&&row.upstreamPath===`/internal/cases/${defect.caseId}/event-triggers/update`&&row.actorId===actorId&&row.status===200),fail);
   assert(!journal.some(row=>row.method==='POST'&&row.upstreamPath===`/cases/${defect.caseId}/events`),fail);
  }
  facets.push({facetId:facet.id,status:proof.outcome==='passed'?'PASS':'FAIL',failure:proof.outcome==='passed'?'none':defect?'source-required-postcode':'other',failedRecipientIndex:defect?.failedRecipientIndex??null});
 }
 assert.equal(new Set(cases).size,cases.length,fail);const baselineFailed=facets.filter(row=>row.status==='FAIL').length;
 if(baselineFailed){for(const execution of checkpoint.input.executions)assertSharedNestedInvocationAuthority({directory:native,execution,ownership,registry});assert.equal(summary.value.status,'BLOCKED',fail);assert.deepEqual(registry.map(row=>row.name).sort(),ownership.invocations.find(row=>row.invocationId==='baseline').plan?[ownership.invocations[0].plan.tools.name,ownership.invocations[0].plan.candidate.name].sort():[],fail);assert.equal(terminal.value.terminal.code,2,fail);assert(!fs.existsSync(path.join(native,'run.json'))&&!fs.existsSync(path.join(native,'gate.json')),fail);assert(!input.only,fail);for(const mutation of ['ccd-drop-child','ccd-drop-postal-optional-child','shared-nested-drop-second-recipient'])assert(!fs.existsSync(path.join(native,mutation,'manifest.json')),fail);}
 else {assert.equal(summary.value.status,'PASS',fail);assert.equal(terminal.value.terminal.code,0,fail);assert.equal(validateCiPhase(native,expected,terminal.value.terminal).status,'PASS',fail);for(const execution of loadRunEvidence(path.join(native,'run.json'),getReleasePolicy(SHARED_NESTED_SCOPE)).input.executions)assertSharedNestedInvocationAuthority({directory:native,execution,ownership,registry});await replaySharedNestedNativeBindings({harnessRoot:root,ccdPhaseDirectory:native,candidateArtifactPath:before.value.candidateManifest});}
 return {schemaVersion:1,kind:'shared-nested-attempt',status:baselineFailed?'BLOCKED':'PASS',runId:expected.runId,producerCommit:expected.harnessCommit,candidateCommit:expected.identity.webappCommit,candidateArtifactDigest:expected.identity.artifactDigest,sourceDigest,descriptorDigest:descriptor.digest,durationMs:summary.value.durationMs,baselinePassed:4-baselineFailed,baselineFailed,faultsObserved:baselineFailed?0:3,faultsNotRun:baselineFailed?3:0,facets,sharedRequirementId:SHARED_NESTED_ID,failedSourceRequirementId:facets.some(row=>row.failure==='source-required-postcode')?POSTCODE_SOURCE_ID:null,cleanupComplete:true,catalogueCredit:false,releaseCredit:false};
}

export function assertSharedNestedInvocationAuthority({directory,execution,ownership,registry}) {
 const row=ownership.invocations.find(item=>item.invocationId===execution.invocationId);assert(row,fail);const {plan}=row;
 const {denial,lifecycle}=validateNativeInvocationFinalization(directory,execution);
 for(const [service,resource]of [['candidate',plan.candidate],['browser-provider',plan.tools]]) {
  const recorded=registry.find(item=>item.name===resource.name);assert(recorded&&/^[a-f0-9]{64}$/.test(recorded.id),fail);
  assert.equal(recorded.owner,ownership.owner,fail);assert.equal(recorded.service,service,fail);assert.equal(recorded.image,resource.image,fail);assert.equal(recorded.namespace,plan.namespace,fail);assert.deepEqual(recorded.mounts,resource.mounts,fail);assert.equal(recorded.removed,true,fail);
  if(service==='candidate') {assert.equal(denial.candidateId,recorded.id,fail);for(const info of [lifecycle.before,lifecycle.after]){assert.equal(info.Id,recorded.id,fail);assert.equal(info.Name,'/'+resource.name,fail);assertOwnedContainerAuthority(info,{owner:ownership.owner,service,image:resource.image,namespace:plan.namespace,mounts:resource.mounts,launchProcess:resource.launchProcess});}assert.equal(lifecycle.after.State.OOMKilled,false,fail);}
 }
}

export function assertSharedNestedStateRemoved(stateRoot) {
 assert(typeof stateRoot==='string'&&path.isAbsolute(stateRoot)&&path.normalize(stateRoot)===stateRoot&&stateRoot.startsWith(fs.realpathSync(os.tmpdir())+path.sep)&&path.basename(stateRoot).startsWith('harness-native-state-')&&!fs.existsSync(stateRoot),fail);
}
