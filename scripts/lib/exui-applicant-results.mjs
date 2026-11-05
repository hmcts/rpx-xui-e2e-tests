import assert from 'node:assert/strict';
import {buildResultColumnDefinition} from './exui-result-columns-definition.mjs';

export const APPLICANT_RESULT_VARIANTS = Object.freeze(['baseline','applicant-binding','applicant-label','applicant-order']);
const sheets = {SEARCH:'SearchResultFields',WORKBASKET:'WorkBasketResultFields'};
export function applicantResultContract(view) {
  assert(Object.hasOwn(sheets,view),'RESULT_APPLICANT_VIEW');
  const row=buildResultColumnDefinition().sheets[sheets[view]].find(row=>row.CaseFieldID==='applicantName');
  return {field:row.CaseFieldID,label:row.Label,order:row.DisplayOrder};
}
export function applicantResultDefinition(variant='baseline') {
  assert(APPLICANT_RESULT_VARIANTS.includes(variant),'RESULT_APPLICANT_VARIANT');
  const definition=buildResultColumnDefinition();
  if(variant==='baseline')return definition;
  for(const [view,sheet] of Object.entries(sheets)) {
    const row=definition.sheets[sheet].find(row=>row.CaseFieldID==='applicantName');
    if(variant==='applicant-binding')row.CaseFieldID=view==='SEARCH'?'familymanCaseNumber':'childName';
    if(variant==='applicant-label')row.Label='Synthetic wrong applicant heading';
    if(variant==='applicant-order')row.DisplayOrder=9;
  }
  return definition;
}
export function validateApplicantResultDefinition(definition,variant='baseline') {
  assert.deepEqual(definition,applicantResultDefinition(variant),'RESULT_APPLICANT_DEFINITION_DRIFT');
}
export function applicantResultObserved(view,columns) {
  const contract=applicantResultContract(view);
  // Bind by source row position for binding faults, by exact field for label/order faults.
  const field=columns.find(column=>column.case_field_id===contract.field)??columns.find(column=>column.order===contract.order);
  assert(field,'RESULT_APPLICANT_COLUMN_MISSING');
  return {field:field.case_field_id,label:field.label,order:field.order};
}

export function validateApplicantResultOutcome({variant,terminal,report,observations}) {
  assert(APPLICANT_RESULT_VARIANTS.includes(variant),'RESULT_APPLICANT_VARIANT');
  assert.equal(terminal.signal,null,'RESULT_UI_SIGNAL');
  assert.equal(report.errors?.length??0,0,'RESULT_UI_GLOBAL_ERROR');
  assert.equal(report.stats.skipped,0,'RESULT_UI_SKIPPED');
  const specs=report.suites.flatMap(function flatten(suite){return [...(suite.specs??[]),...(suite.suites??[]).flatMap(flatten)];});
  assert.equal(specs.length,2,'RESULT_UI_TWO_VIEWS_REQUIRED');
  for(const view of ['SEARCH','WORKBASKET']){
    const matches=specs.filter(spec=>spec.title.endsWith(': '+view));
    assert.equal(matches.length,1,'RESULT_UI_VIEW_REQUIRED');
    assert.equal(matches[0].tests.length,1,'RESULT_UI_ONE_TEST_REQUIRED');
    const test=matches[0].tests[0];assert.equal(test.results.length,1,'RESULT_UI_NO_RETRY');
    const result=test.results[0],observed=observations[view];
    assert(observed,'RESULT_UI_OBSERVATION_REQUIRED');
    assert.equal(observed.variant,variant,'RESULT_UI_VARIANT');assert.equal(observed.useCase,view,'RESULT_UI_VIEW');
    assert.equal(observed.cells,21,'RESULT_UI_HEALTHY_CELLS');assert.equal(observed.rows,3,'RESULT_UI_HEALTHY_ROWS');
    assert.equal(observed.columns.length,7,'RESULT_UI_HEALTHY_COLUMNS');assert.equal(new Set(observed.columns).size,7,'RESULT_UI_UNIQUE_COLUMNS');
    assert.equal(observed.catalogueCredit,false,'RESULT_UI_NO_CREDIT');assert.equal(observed.releaseCredit,false,'RESULT_UI_NO_CREDIT');
    assert.deepEqual(observed.applicantExpected,applicantResultContract(view),'RESULT_UI_SOURCE_ORACLE');
    const sheet=view==='SEARCH'?'SearchResultFields':'WorkBasketResultFields';
    const columns=applicantResultDefinition(variant).sheets[sheet].map(row=>({case_field_id:row.CaseFieldID,label:row.Label,order:row.DisplayOrder}));
    assert.deepEqual(observed.applicantObserved,applicantResultObserved(view,columns),'RESULT_UI_EFFECTIVE_FAULT_REQUIRED');
    if(variant==='baseline')assert.equal(result.status,'passed','RESULT_UI_BASELINE_FAILED');
    else {
      assert.equal(result.status,'failed','RESULT_UI_FAULT_NOT_DETECTED');
      assert(result.errors?.length===1&&result.errors[0].message.includes('RESULT_APPLICANT_SOURCE_CONTRACT'),'RESULT_UI_WRONG_FAILURE');
      assert.notDeepEqual(observed.applicantObserved,observed.applicantExpected,'RESULT_UI_INEFFECTIVE_FAULT');
    }
  }
  assert.equal(terminal.code,variant==='baseline'?0:1,'RESULT_UI_EXIT');
  assert.equal(report.stats.expected,variant==='baseline'?2:0,'RESULT_UI_EXPECTED_COUNT');
  assert.equal(report.stats.unexpected,variant==='baseline'?0:2,'RESULT_UI_UNEXPECTED_COUNT');
  return variant==='baseline'?'two-candidate-result-tables-observed':'applicant-result-fault-observed';
}
