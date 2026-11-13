import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

import {applicantResultCatalogueContract} from '../../../../scripts/lib/exui-applicant-results-catalogue.mjs';
import {applicantResultDefinition,applicantResultObserved} from '../../../../scripts/lib/exui-applicant-results.mjs';
import {test,expect} from '../../../fixtures/harnessCcd';
import {eventProofInputs} from '../../../fixtures/harnessCcdEvent';
import {observeResultTable,type ResultView} from '../../../fixtures/harnessResultColumns';

const mutation=process.env.EXUI_HARNESS_MUTATION;
if(mutation&&!['applicant-binding','applicant-label','applicant-order'].includes(mutation)) throw Error('APPLICANT_RESULTS_MUTATION_INVALID');
const variant=mutation??'baseline';
const resultSheets={SEARCH:'SearchResultFields',WORKBASKET:'WorkBasketResultFields'};
test.describe.configure({retries:0});

if(variant==='baseline')test('source applicant columns preserve binding, labels and order in Search and Workbasket',{
 annotation:{type:'harness-proof',description:'ccd-applicant-results-source-contract'+(mutation?`-${mutation}`:'')},
},async({page})=>{
 const {manifest,context}=eventProofInputs();
 expect(manifest.releaseScopeId).toBe('exui-ccd-applicant-results-pilot');
 expect(context.releaseScopeId).toBe(manifest.releaseScopeId);
 expect(context.invocationId).toBe(variant);
 const input=JSON.parse(fs.readFileSync(process.env.EXUI_CCD_RESULTS_INPUT!,'utf8'));
 expect(input.variant).toBe(variant);
 const views={
  SEARCH:await observeResultTable(page,'SEARCH',input.resultExpected.SEARCH),
  WORKBASKET:await observeResultTable(page,'WORKBASKET',input.resultExpected.WORKBASKET),
 };
 fs.writeFileSync(path.join(process.env.EXUI_CCD_EVIDENCE!,'applicant-results-observation.json'),JSON.stringify({schemaVersion:1,kind:'native-applicant-results-observation',invocationId:context.invocationId,variant,views}),{flag:'wx',mode:0o600});
 // Both healthy views must exhibit the fault before a single attributed failure can count.
 const recipe=applicantResultDefinition(variant);
 for(const view of Object.values(views)) {
  const sheet=resultSheets[view.useCase];
  expect(view.applicantObserved,'exact applied definition required').toEqual(applicantResultObserved(view.useCase,recipe.sheets[sheet].map(row=>({case_field_id:row.CaseFieldID,label:row.Label,order:row.DisplayOrder}))));
 }
 expect(Object.values(views).map(view=>isDeepStrictEqual(view.applicantObserved,view.applicantExpected)),'applicant name remains source-bound in both views').toEqual([true,true]);

 await test.step('harness-assertion:applicant-result-source-contract',async()=>{
  expect(Object.values(views).map(view=>view.applicantObserved)).toEqual(Object.values(views).map(view=>view.applicantExpected));
 });
});

for(const sourceRow of applicantResultCatalogueContract().filter(row=>variant==='baseline'||row.mutationId===variant)){
 test(`catalogue result row is rendered from its exact source: ${sourceRow.field} (${sourceRow.view})`,{
  annotation:{type:'harness-proof',description:sourceRow.proofId},
 },async({page})=>{
  const {manifest,context}=eventProofInputs();
  expect(manifest.releaseScopeId).toBe('exui-ccd-applicant-results-pilot');
  expect(context.invocationId).toBe(variant);
  const input=JSON.parse(fs.readFileSync(process.env.EXUI_CCD_RESULTS_INPUT!,'utf8'));
  expect(input.variant).toBe(variant);
  const observedViews:Partial<Record<ResultView,Awaited<ReturnType<typeof observeResultTable>>>>=variant==='baseline'?{[sourceRow.view]:await observeResultTable(page,sourceRow.view,input.resultExpected[sourceRow.view])}:Object.fromEntries(await Promise.all((['SEARCH','WORKBASKET'] as const).map(async view=>[view,await observeResultTable(page,view,input.resultExpected[view])] as const)));
  if(variant!=='baseline')fs.writeFileSync(path.join(process.env.EXUI_CCD_EVIDENCE!,'applicant-results-observation.json'),JSON.stringify({schemaVersion:1,kind:'native-applicant-results-observation',invocationId:context.invocationId,variant,views:observedViews}),{flag:'wx',mode:0o600});
  const observedView=observedViews[sourceRow.view]!;
  const observation=observedView.catalogueRows.find(row=>row.obligationId===sourceRow.obligationId);
  expect(observation).toBeDefined();
  fs.writeFileSync(path.join(process.env.EXUI_CCD_EVIDENCE!,`${sourceRow.proofId}-observation.json`),JSON.stringify({
   schemaVersion:1,kind:'native-prl-result-row-observation',invocationId:context.invocationId,variant,sourceRow,observation,
  }),{flag:'wx',mode:0o600});
  await test.step(`harness-assertion:result-catalogue-${variant}`,async()=>{
   expect(observation!.observed,'RESULT_CATALOGUE_SOURCE_CONTRACT').toEqual(observation!.expected);
  });
 });
}
