import assert from 'node:assert/strict';

import {test,expect} from '../../../fixtures/harnessCcd';
import {eventProofInputs} from '../../../fixtures/harnessCcdEvent';
import {runSelectorEventRow} from '../../../fixtures/harnessSelectorEventRow';

const mutation=process.env.EXUI_HARNESS_MUTATION;
assert(mutation===undefined||mutation==='ccd-hide-selector-summary','SELECTOR_EVENT_MUTATION_INVALID');
test.describe.configure({retries:0});

test('source selector event row preserves optional selection, page order, CYA change and persistence',{
 annotation:{type:'harness-proof',description:mutation?'ccd-selector-summary-hidden':'ccd-selector-event-row'},
},async({page,playwright})=>{
 const {manifest,context}=eventProofInputs();

 await test.step('harness-assertion:selector-event-identity',async()=>{
  expect(manifest.releaseScopeId).toBe('exui-ccd-selector-event-row-pilot');
  expect(context.releaseScopeId).toBe('exui-ccd-selector-event-row-pilot');
  expect(context.invocationId).toBe(mutation??'baseline');
 });

 await runSelectorEventRow({page,playwright,mode:'native',variant:mutation?'summary-hidden':'baseline',invocationId:context.invocationId,step:test.step});
});
