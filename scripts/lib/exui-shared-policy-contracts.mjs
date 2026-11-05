import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { digestBytes } from './exui-evidence-io.mjs';

const source = JSON.parse(fs.readFileSync(new URL('../fixtures/ccd/shared-policy-sources.json', import.meta.url)));
const review = JSON.parse(fs.readFileSync(new URL('../fixtures/exui-configuration-review.json', import.meta.url)));
// Independent seal of the reviewed 24-file source inventory, not a digest supplied by its caller.
const sourceInventoryDigest = 'sha256:bfe447916878b8c73a33d0e8dd58224d16664a1a197ae2b1c80d82ce08e7aaf8';
export function validateSharedPolicySources(value) {
 exactKeys(value,['schemaVersion','caseType','runtimeCaseType','sourceReferences','runtimeBindingRequired'],'SHARED_POLICY_SOURCE_SCHEMA');
 assert.equal(value.schemaVersion,1,'SHARED_POLICY_SOURCE_SCHEMA');
 assert.equal(value.caseType,'PRLAPPS','SHARED_POLICY_SOURCE_CASE_TYPE');
 assert.equal(value.runtimeCaseType,'HarnessNestedPRL','SHARED_POLICY_NORMALIZATION');
 assert.equal(value.runtimeBindingRequired,true,'SHARED_POLICY_RUNTIME_BINDING_REQUIRED');
 assert(Array.isArray(value.sourceReferences)&&value.sourceReferences.length===24,'SHARED_POLICY_SOURCE_INVENTORY');
 const revisions={'hmcts/prl-ccd-definitions':'694b9951e94369f1394380506960c4f04f25755d','hmcts/ccd-case-ui-toolkit':'d3ab22454a82040ab0c7e9e1161f562dd1390a5e','hmcts/ccd-data-store-api':'5c5ff0b941dcbc7e661e8aa9e38dc51d7c30ffb3'};
 const keys=[];
 for(const ref of value.sourceReferences) {
  exactKeys(ref,['repository','revision','path','digest','boundary'],'SHARED_POLICY_SOURCE_REFERENCE_SCHEMA');
  assert(Object.hasOwn(revisions,ref.repository)&&ref.revision===revisions[ref.repository],'SHARED_POLICY_SOURCE_REVISION');
  assert(typeof ref.path==='string'&&!ref.path.startsWith('/')&&!ref.path.split('/').includes('..')&&digest(ref.digest),'SHARED_POLICY_SOURCE_REFERENCE');
  assert.equal(ref.boundary,ref.repository==='hmcts/prl-ccd-definitions'?'definition':'interpreter-source-reference','SHARED_POLICY_SOURCE_BOUNDARY');
  keys.push(ref.repository+':'+ref.path);
 }
 assert.equal(new Set(keys).size,24,'SHARED_POLICY_DUPLICATE_SOURCE');
 assert.equal(digestBytes(JSON.stringify(value)),sourceInventoryDigest,'SHARED_POLICY_SOURCE_SEAL');
 return structuredClone(value);
}
const ids = ['configuration-shared:nested-renderer','configuration-shared:role-policy'];
const commonArtifacts = ['native-execution','browser-observation','ccd-before','ccd-after','independent-observer','definition-binding'];
const shapes = ['email','post'].flatMap(channel=>[1,2].map(recipientCount=>({channel,recipientCount})));
const sourceKeys = [
 'prl-ccd-definitions:definitions/private-law/json/CaseField/ServiceOfDocuments/CaseField.json',
 'prl-ccd-definitions:definitions/private-law/json/ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json',
 'prl-ccd-definitions:definitions/private-law/json/CaseEventToFields/ServiceOfDocuments/Page2/CaseEventToFields.json',
 'prl-ccd-definitions:definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json',
];
export function sharedPolicySourceKeys(id) {
 assert(ids.includes(id),'SHARED_POLICY_UNKNOWN_ID');
 return id===ids[0]?[...sourceKeys]:[...sourceKeys,'prl-ccd-definitions:definitions/private-law/json/AuthorisationCaseEvent/ServiceOfDocuments/AuthorisationCaseEvent.json'];
}
const fault=(id,failureId,reusableProof,additionalAssertions=[])=>({id,failureId,reusableProof,requiredArtifacts:['native-execution','mutation-definition','mutation-application','healthy-control','fault-observation','baseline-observation'],assertions:['exact-reviewed-transformation','successful-transport-and-application-before-failure','intended-assertion-fails','no-global-or-infrastructure-error','same-candidate-and-source-binding','owned-cleanup-complete',...additionalAssertions]});
export function buildSharedPolicyContracts() {
 validateSharedPolicySources(source);
 assert.equal(source.caseType,'PRLAPPS','SHARED_POLICY_SOURCE_CASE_TYPE');
 assert.equal(source.runtimeCaseType,'HarnessNestedPRL','SHARED_POLICY_NORMALIZATION');
 assert.equal(review.knownValid.length,16,'SHARED_POLICY_REVIEWED_CELL_COUNT');
 assert(review.knownValid.every(cell=>cell.caseType==='PRLAPPS'&&['caseworker-privatelaw-courtadmin','caseworker-privatelaw-readonly'].includes(cell.role)&&['read','update'].includes(cell.action)&&['email','post'].includes(cell.channel)&&[1,2].includes(cell.recipientCount)&&['allowed','denied'].includes(cell.expectedAccess)),'SHARED_POLICY_FOREIGN_CASE_TYPE');
 assert.equal(new Set(review.knownValid.map(cell=>[cell.role,cell.action,cell.channel,cell.recipientCount].join('|'))).size,16,'SHARED_POLICY_DUPLICATE_CELL');
 const base={schemaVersion:1,scope:'bounded-prl-service-of-documents-shared-interpreters',sourceCaseType:'PRLAPPS',runtimeCaseType:'HarnessNestedPRL',normalization:'synthetic isolated CCD case-type identifier; not a second service',sourceReferences:source.sourceReferences,sourceToRuntimeBindingRequired:true,automaticExistingProofCredit:false,releaseApproval:false};
 const renderer={...base,id:ids[0],boundary:'candidate',claim:'Nested additional-recipient complex and collection interpretation for four reviewed email/post one/two-recipient shapes only',excludes:['Other EXUI renderers, services, shapes and arbitrary nesting','Deployment-profile completeness','Unreviewed toolkit versions'],facets:shapes.map(shape=>({id:`nested-${shape.channel}-${shape.recipientCount}`,...shape,requiredArtifacts:commonArtifacts,assertions:['source-defined-child-order-and-labels','conditional-branch-visibility','mandatory-field-validation-before-submit','optional-child-preservation','visible-check-your-answers-values','submit-payload-matches-intended-values','independent-CCD-readback-matches-payload','visible-case-view-matches-persisted-values','collection-identities-and-sibling-association-preserved','no-extra-or-lost-recipient']})),faults:[fault('ccd-drop-child','nested-persistence','ccd-child-loss'),fault('ccd-drop-postal-optional-child','postal-persistence','ccd-postal-child-loss'),fault('shared-nested-drop-second-recipient','nested-sibling-preservation',null)]};
 const role={...base,id:ids[1],boundary:'ccd',claim:'Source PRL additional-recipient read/update ACL intersection for the reviewed two roles and four shapes, plus synthetic denied-state integrity and renewed-session isolation',excludes:['All EXUI authorization models','Production identity provider or deployed role-assignment configuration','Other roles, case types and operations'],facets:review.knownValid.map(cell=>({id:`role-${cell.role.endsWith('courtadmin')?'courtadmin':'readonly'}-${cell.action}-${cell.channel}-${cell.recipientCount}`,...cell,requiredArtifacts:commonArtifacts,assertions:['literal-source-role-and-case-type-state-field-event-ACL-intersection','same-authenticated-actor-through-request','actual-candidate-visibility-matches-source-access','real-CCD-status-and-projection-match-source-access',...(cell.expectedAccess==='allowed'?['visible-values-match-independent-CCD-readback',...(cell.action==='update'?['persisted-change-exact','state-version-history-increment-once']:[])]:['no-protected-data-disclosure','denied-write-preserves-data-state-version-history'])]})),faults:[fault('ccd-remove-courtadmin-recipient-read','courtadmin-recipient-read-projection','ccd-courtadmin-read-shapes-hidden'),fault('ccd-remove-readonly-recipient-read','readonly-recipient-read-projection','ccd-readonly-read-shapes-hidden'),fault('ccd-remove-courtadmin-event-create','courtadmin-update-persistence','ccd-courtadmin-update-recipient-shapes-denied'),fault('ccd-enable-readonly-recipient-update','readonly-update-isolation','ccd-readonly-update-recipient-shapes-enabled'),fault('ccd-broaden-access','denied-data-isolation','ccd-access-broadened'),fault('ccd-write-then-deny','denied-state-integrity','ccd-write-then-deny'),fault('ccd-stale-revoked-bearer','revoked-data-isolation','ccd-stale-revoked-bearer',['same-actor-original-bearer-substituted-only-on-renewed-case-read','healthy-original-bearer-control-precedes-renewed-session-denial-failure'])],additionalSequences:[{id:'denied-data-and-write-integrity',requiredArtifacts:commonArtifacts,assertions:['separate-denied-actor','no-protected-case-data','denied-response-cannot-mask-persisted-write','independent-state-version-history-unchanged']},{
  id:'revoked-warmed-session',requiredArtifacts:commonArtifacts,
  // CCD caches UserInfo by token. The existing real proof observes the old token's
  // grant separately; only the distinct token and renewed EXUI session claim denial.
  boundary:{actor:'same-synthetic-idam-actor',renewal:'distinct-bearer-and-explicitly-renewed-EXUI-session',originalWarmedBearer:'observed-HTTP-200-with-protected-data-cache-applicability-only',immediateInvalidationClaim:false,productionOidcClaim:false,cacheExpiryClaim:false},
  assertions:['same-actor-and-case','successful-warm-read-before-revocation','revocation-applied-and-observed','renewed-session-uses-distinct-bearer-with-observed-removed-roles','fresh-bearer-and-renewed-session-deny-protected-data','original-warmed-bearer-retained-grant-observed-as-cache-applicability','denied-renewed-write-preserves-data-state-version-history','independent-observer-data-unchanged']
 }]};
 return [renderer,role].map(contract=>structuredClone({...contract,contractDigest:digestBytes(JSON.stringify(contract))}));
}
export function validateSharedPolicyContract(contract) {
 const expected=buildSharedPolicyContracts().find(item=>item.id===contract?.id);
 assert(expected,'SHARED_POLICY_UNKNOWN_ID');
 assert.deepEqual(contract,expected,'SHARED_POLICY_CONTRACT_DRIFT');
 return expected;
}
function exactKeys(value,keys,code) {assert(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),code);}
const digest=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
// This checks sealed evidence references only. It does not replay assertions or grant aggregate credit.
export function validateSharedPolicyEvidenceBindings(contract,envelope,{evidenceRoot,expectedIdentity}) {
 validateSharedPolicyContract(contract);
 exactKeys(envelope,['schemaVersion','obligationId','contractDigest','identity','records'],'SHARED_POLICY_ENVELOPE');
 assert.equal(envelope.schemaVersion,1,'SHARED_POLICY_SCHEMA');assert.equal(envelope.obligationId,contract.id,'SHARED_POLICY_OBLIGATION');assert.equal(envelope.contractDigest,contract.contractDigest,'SHARED_POLICY_CONTRACT_BINDING');
 const identityKeys=['runId','candidateArtifactDigest','toolkitDigest','ccdImageSetDigest','definitionDigest','sourceRuntimeBindingDigest'];
 exactKeys(expectedIdentity,identityKeys,'SHARED_POLICY_EXPECTED_IDENTITY');
 assert(typeof expectedIdentity.runId==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(expectedIdentity.runId),'SHARED_POLICY_RUN');
 for(const key of identityKeys.filter(key=>key!=='runId'))assert(digest(expectedIdentity[key]),'SHARED_POLICY_IDENTITY_DIGEST');
 assert.deepEqual(envelope.identity,expectedIdentity,'SHARED_POLICY_IDENTITY_MISMATCH');
 const requirements=[...contract.facets,...contract.faults,...(contract.additionalSequences??[])];
 assert(Array.isArray(envelope.records),'SHARED_POLICY_RECORDS');
 assert.deepEqual(envelope.records.map(item=>item.id).sort(),requirements.map(item=>item.id).sort(),'SHARED_POLICY_INCOMPLETE_FACETS');
 const root=fs.realpathSync(evidenceRoot);let checked=0;
 for(const record of envelope.records) {
  exactKeys(record,['id','artifacts'],'SHARED_POLICY_RECORD');
  const requirement=requirements.find(item=>item.id===record.id);
  assert(Array.isArray(record.artifacts),'SHARED_POLICY_ARTIFACTS');
  assert.deepEqual(record.artifacts.map(item=>item.kind).sort(),[...requirement.requiredArtifacts].sort(),'SHARED_POLICY_ARTIFACT_SELECTION');
  for(const artifact of record.artifacts) {
   exactKeys(artifact,['kind','path','digest'],'SHARED_POLICY_ARTIFACT_SCHEMA');
   assert(digest(artifact.digest),'SHARED_POLICY_ARTIFACT_DIGEST');
   assert(typeof artifact.path==='string'&&/^[a-zA-Z0-9_./-]+$/.test(artifact.path)&&!artifact.path.startsWith('/')&&!artifact.path.split('/').includes('..'),'SHARED_POLICY_ARTIFACT_PATH');
   const target=path.resolve(root,artifact.path),resolved=fs.realpathSync(target);
   assert(resolved.startsWith(root+path.sep)&&resolved===target&&!fs.lstatSync(target).isSymbolicLink(),'SHARED_POLICY_ARTIFACT_ESCAPE');
   const stat=fs.statSync(target);assert(stat.isFile()&&stat.size>0&&stat.size<=8*1024*1024,'SHARED_POLICY_ARTIFACT_SIZE');
   assert.equal(digestBytes(fs.readFileSync(target)),artifact.digest,'SHARED_POLICY_ARTIFACT_CHANGED');checked++;
  }
 }
 return {obligationId:contract.id,contractDigest:contract.contractDigest,checkedArtifacts:checked,bindingStatus:'verified',acceptanceStatus:'native-facet-replay-required',acceptedObligationIds:[],runtimeAcceptance:false,catalogueCredit:false};
}
