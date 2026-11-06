const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('./lib/exui-applicant-results.mjs');

test('applicant results: fixed mutations change only the two selected material attributes',async()=>{
 const {APPLICANT_RESULT_VARIANTS,applicantResultDefinition,validateApplicantResultDefinition}=await load();
 const baseline=applicantResultDefinition();
 for(const variant of APPLICANT_RESULT_VARIANTS.slice(1)){
  const actual=applicantResultDefinition(variant),expected=structuredClone(baseline);
  for(const [view,sheet] of [['SEARCH','SearchResultFields'],['WORKBASKET','WorkBasketResultFields']]){
   const row=expected.sheets[sheet].find(row=>row.CaseFieldID==='applicantName');
   if(variant==='applicant-binding')row.CaseFieldID=view==='SEARCH'?'familymanCaseNumber':'childName';
   if(variant==='applicant-label')row.Label='Synthetic wrong applicant heading';
   if(variant==='applicant-order')row.DisplayOrder=9;
  }
  assert.deepEqual(actual,expected);validateApplicantResultDefinition(actual,variant);
  assert.throws(()=>validateApplicantResultDefinition(baseline,variant));
  for(const key of ['runtimeAcceptance','catalogueCredit','releaseCredit'])assert.equal(actual[key],false);
  actual.sheets.CaseField[0].FieldType='Number';assert.throws(()=>validateApplicantResultDefinition(actual,variant));
 }
 assert.throws(()=>applicantResultDefinition('future-live-date'));
});
test('applicant results: independent source oracle detects every effective variant in both views',async()=>{
 const {APPLICANT_RESULT_VARIANTS,applicantResultDefinition,applicantResultContract,applicantResultObserved}=await load();
 for(const view of ['SEARCH','WORKBASKET'])for(const variant of APPLICANT_RESULT_VARIANTS){
  const sheet=view==='SEARCH'?'SearchResultFields':'WorkBasketResultFields';
  const columns=applicantResultDefinition(variant).sheets[sheet].map(row=>({case_field_id:row.CaseFieldID,label:row.Label,order:row.DisplayOrder}));
  const observed=applicantResultObserved(view,columns),expected=applicantResultContract(view);
  if(variant==='baseline')assert.deepEqual(observed,expected);else assert.notDeepEqual(observed,expected);
 }
});

test('applicant results: only healthy exact fault observations can establish detection',async()=>{
 const {applicantResultDefinition,applicantResultContract,applicantResultObserved,validateApplicantResultOutcome}=await load();
 function fixture(variant='applicant-label'){
  const observations={},specs=[];
  for(const view of ['SEARCH','WORKBASKET']){
   const sheet=view==='SEARCH'?'SearchResultFields':'WorkBasketResultFields';
   const columns=applicantResultDefinition(variant).sheets[sheet].map(row=>({case_field_id:row.CaseFieldID,label:row.Label,order:row.DisplayOrder}));
   observations[view]={variant,useCase:view,cells:21,rows:3,columns:columns.map(field=>field.case_field_id),catalogueCredit:false,releaseCredit:false,applicantExpected:applicantResultContract(view),applicantObserved:applicantResultObserved(view,columns)};
   specs.push({title:'candidate renders results: '+view,tests:[{results:[{status:variant==='baseline'?'passed':'failed',errors:variant==='baseline'?[]:[{message:'Error: RESULT_APPLICANT_SOURCE_CONTRACT'}]}]}]});
  }
  return {variant,terminal:{code:variant==='baseline'?0:1,signal:null},report:{errors:[],stats:{expected:variant==='baseline'?2:0,unexpected:variant==='baseline'?0:2,skipped:0},suites:[{specs}]},observations};
 }
 for(const variant of ['baseline','applicant-label','applicant-binding','applicant-order'])assert(validateApplicantResultOutcome(fixture(variant)));
 for(const mutate of [
  f=>{f.observations.SEARCH.rows=0;},f=>{f.observations.SEARCH.cells=0;},f=>{f.observations.SEARCH.columns=[];},
  f=>{delete f.observations.WORKBASKET;},f=>{f.terminal.signal='SIGTERM';},f=>{f.terminal.code=2;},
  f=>{f.report.errors=[{message:'import failed'}];},f=>{f.report.suites[0].specs[0].tests[0].results[0].errors=[{message:'Timeout table blank'}];},
  f=>{f.report.suites[0].specs[0].tests[0].results[0].status='timedOut';},f=>{f.report.stats.skipped=1;},
  f=>{f.observations.SEARCH.applicantObserved=f.observations.SEARCH.applicantExpected;},
  f=>{f.observations.SEARCH.catalogueCredit=true;},f=>{f.report.suites[0].specs[1].title='candidate renders results: SEARCH';},
  f=>{f.report.suites[0].specs[0].tests[0].results.push(f.report.suites[0].specs[0].tests[0].results[0]);},
 ]){const f=fixture();mutate(f);assert.throws(()=>validateApplicantResultOutcome(f));}
});
