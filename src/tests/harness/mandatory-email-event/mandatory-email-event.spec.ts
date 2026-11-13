import {feasibilityTest} from '../../../fixtures/harnessCallback';
import {runMandatoryEmailEvent} from '../../../fixtures/harnessMandatoryEmailEvent';
const test=feasibilityTest('mandatory-email-event-ui-feasibility');
const variant=process.env.EXUI_MANDATORY_EMAIL_EVENT_VARIANT;
if(!['baseline','name-optional','address-optional'].includes(variant??''))throw Error('MANDATORY_EMAIL_EVENT_SELECTION_REQUIRED');
for(const row of ['name','address'] as const){
  if(variant!=='baseline'&&variant!==`${row}-optional`)continue;

  test(`source event row requires email ${row} and preserves a filled value`,async({page,playwright})=>{
    await runMandatoryEmailEvent({page,playwright,row,variant:variant as 'baseline'|'name-optional'|'address-optional',step:test.step});
  });
}
