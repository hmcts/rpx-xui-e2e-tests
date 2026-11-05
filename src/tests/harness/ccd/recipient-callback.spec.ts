import assert from 'node:assert/strict';

import {runRecipientCallbackJourney} from '../../../fixtures/harnessCallbackJourney';
import {test,expect} from '../../../fixtures/harnessCcd';
import {eventProofInputs} from '../../../fixtures/harnessCcdEvent';

const mutation=process.env.EXUI_HARNESS_MUTATION;
assert(mutation===undefined||mutation==='ccd-omit-recipient-mid-event','CALLBACK_MUTATION_INVALID');
const variant=mutation?'binding-omitted':'baseline';
test.describe.configure({retries:0});

test('source recipient callback binds validation, correction and persisted normalization',{
 annotation:{type:'harness-proof',description:mutation?'callback-recipient-binding-omitted':'callback-recipient-row'},
},async({page,playwright})=>{
 const {manifest,context}=eventProofInputs();

 await test.step('harness-assertion:recipient-callback-identity',async()=>{
  expect(manifest.releaseScopeId).toBe('exui-ccd-recipient-callback-pilot');
  expect(context.releaseScopeId).toBe('exui-ccd-recipient-callback-pilot');
  expect(context.invocationId).toBe(mutation??'baseline');
 });

 await runRecipientCallbackJourney({page,playwright,mode:'native',variant,invocationId:context.invocationId,step:test.step});
});
