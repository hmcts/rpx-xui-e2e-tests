import fs from 'node:fs';
import path from 'node:path';

import {feasibilityTest,expect} from '../../../fixtures/harnessCallback';
import {observeResultTable} from '../../../fixtures/harnessResultColumns';
const test=feasibilityTest('result-columns-ui-feasibility');
const directory=process.env.EXUI_CCD_EVIDENCE!;
const input=JSON.parse(fs.readFileSync('/output/input.json','utf8'));
for(const useCase of ['SEARCH','WORKBASKET'] as const) {
 test(`candidate renders seven source result columns and three persisted cases: ${useCase}`,async({page,context})=>{
  const personas=JSON.parse(fs.readFileSync(path.join(directory,'personas.json'),'utf8'));
  await context.addCookies([{name:'xui-webapp',value:personas.sessions.allowed,domain:'127.0.0.1',path:'/'}]);
  const observed=await observeResultTable(page,useCase,input.resultExpected[useCase]);
  fs.writeFileSync(path.join(directory,`results-ui-${useCase}.json`),JSON.stringify({kind:'result-columns-ui-feasibility-observation',...observed,variant:input.variant,catalogueCredit:false,releaseCredit:false}),{mode:0o600});
  expect(observed.applicantObserved,'RESULT_APPLICANT_SOURCE_CONTRACT').toEqual(observed.applicantExpected);
 });
}
