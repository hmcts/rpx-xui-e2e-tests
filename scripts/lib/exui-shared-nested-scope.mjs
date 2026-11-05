import {createHash} from 'node:crypto';
const digest=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const SHARED_NESTED_SCOPE='exui-shared-nested-renderer-pilot';
export const SHARED_NESTED_ID='configuration-shared:nested-renderer';
export const SHARED_NESTED_FAULT='shared-nested-drop-second-recipient';
export const SHARED_NESTED_PROOF='shared-nested-sibling-loss';
export const SHARED_NESTED_MUTATIONS=Object.freeze(['ccd-drop-child','ccd-drop-postal-optional-child',SHARED_NESTED_FAULT]);
export const SHARED_NESTED_FACETS=Object.freeze(['email','post'].flatMap(channel=>[1,2].map(recipientCount=>Object.freeze({id:`nested-${channel}-${recipientCount}`,channel,recipientCount,proofId:`shared-nested-${channel}-${recipientCount}`}))));
export const SHARED_NESTED_CONTRACT_DIGEST='sha256:4ea21662d76185703b22be4d5f8b3c06491e0368cb85e52a4e1f237355bb9bb4';
// Keep the runner's fixed selection small; the source-bound reader independently replays the full contract.
export function sharedNestedPolicy() {
 const mutations=[
  {mutationId:'ccd-drop-child',baselineProofId:'shared-nested-email-2',mutantProofId:'shared-nested-email-child-loss',expectedFailureId:'nested-persistence'},
  {mutationId:'ccd-drop-postal-optional-child',baselineProofId:'shared-nested-post-2',mutantProofId:'shared-nested-post-child-loss',expectedFailureId:'postal-persistence'},
  {mutationId:SHARED_NESTED_FAULT,baselineProofId:'shared-nested-email-2',mutantProofId:SHARED_NESTED_PROOF,expectedFailureId:'nested-sibling-preservation'}
 ];
 const policy={releaseScopeId:SHARED_NESTED_SCOPE,requiredObligationIds:[SHARED_NESTED_ID],obligations:[{id:SHARED_NESTED_ID,boundary:'candidate',requiredProofIds:SHARED_NESTED_FACETS.map(row=>row.proofId),requiredMutationIds:SHARED_NESTED_MUTATIONS.slice()}],mutationDefinitions:mutations.map(row=>({...row,obligationId:SHARED_NESTED_ID,definitionDigest:digest({contractDigest:SHARED_NESTED_CONTRACT_DIGEST,mutation:row.mutationId})}))};
 return {...policy,policyDigest:digest(policy)};
}
