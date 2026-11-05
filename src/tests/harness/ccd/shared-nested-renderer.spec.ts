import assert from 'node:assert/strict';

import { SHARED_NESTED_FACETS, SHARED_NESTED_FAULT, SHARED_NESTED_PROOF, SHARED_NESTED_MUTATIONS } from '../../../../scripts/lib/exui-shared-nested-contract.mjs';
import { test } from '../../../fixtures/harnessCcd';
import { runSharedNestedFacet } from '../../../fixtures/harnessSharedNested';
const mutation=process.env.EXUI_HARNESS_MUTATION;
assert(mutation===undefined||SHARED_NESTED_MUTATIONS.includes(mutation),'SHARED_NESTED_MUTATION_SELECTION');
for(const facet of SHARED_NESTED_FACETS.filter(row=>!mutation||row.id===(mutation==='ccd-drop-postal-optional-child'?'nested-post-2':'nested-email-2'))) {
  test(`shared nested renderer ${facet.channel} with ${facet.recipientCount} recipients`,{
    annotation:{type:'harness-proof',description:mutation?(mutation===SHARED_NESTED_FAULT?SHARED_NESTED_PROOF:mutation==='ccd-drop-child'?'shared-nested-email-child-loss':'shared-nested-post-child-loss'):facet.proofId},
  },async({page,request})=>{await runSharedNestedFacet(facet,page,request);});
}
