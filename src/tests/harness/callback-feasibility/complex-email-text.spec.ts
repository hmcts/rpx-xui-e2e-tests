import { feasibilityTest } from '../../../fixtures/harnessCallback';
import { runComplexEmailText } from '../../../fixtures/harnessComplexEmail';

const test=feasibilityTest('complex-email-text-ui-feasibility');
const variant=process.env.EXUI_CALLBACK_VARIANT;
if(process.env.EXUI_COMPLEX_EMAIL_TEXT!=='true'||(variant!=='baseline'&&variant!=='email-type'))throw Error('COMPLEX_EMAIL_FEASIBILITY_SELECTION');

test('source ComplexTypes Text email-address field keeps text semantics and recipient associations',async({page,playwright})=>{
  await runComplexEmailText({page,playwright,variant,step:test.step});
});
