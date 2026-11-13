const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('./lib/exui-applicant-results.mjs');

test('applicant results: fixed mutations change only the two selected material attributes',async()=>{
 const {APPLICANT_RESULT_VARIANTS,applicantResultDefinition,validateApplicantResultDefinition}=await load();
 const baseline=applicantResultDefinition();
 for(const variant of APPLICANT_RESULT_VARIANTS.slice(1)){
  const actual=applicantResultDefinition(variant),expected=structuredClone(baseline);
  const catalogueFault={
   'applicant-binding':['SearchResultFields','applicantCaseName','CaseFieldID','familymanCaseNumber'],
   'applicant-label':['WorkBasketResultFields','applicantCaseName','Label','Harness wrong case label'],
   'applicant-order':['WorkBasketResultFields','familymanCaseNumber','DisplayOrder',8],
  }[variant];
  const [faultSheet,faultField,faultAttribute,faultValue]=catalogueFault;
  expected.sheets[faultSheet].find(row=>row.CaseFieldID===faultField)[faultAttribute]=faultValue;
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
  assert.deepEqual(observed,expected);
 }
});

test('applicant results: candidate catalogue contract selects only the three reviewed PRL result rows',async()=>{
 const {applicantResultCatalogueContract}=await import('./lib/exui-applicant-results-catalogue.mjs');
 const rows=applicantResultCatalogueContract();
 assert.deepEqual(rows.map(row=>[row.obligationId,row.view,row.field,row.sourcePath,row.sourceIndex]),[
  ['configuration-shape:d1594e44450b917d4f021dbb181b38553662cf59072a48bc4a52bf78ac78f375','SEARCH','applicantCaseName','definitions/private-law/json/SearchResultFields.json',0],
  ['configuration-shape:bff9082cbfe5b46c4f6462f9e5f0a870e8d02bd88408a65a1063086c541d60e7','WORKBASKET','applicantCaseName','definitions/private-law/json/WorkBasketResultFields.json',0],
  ['configuration-shape:bd7af2a30355a565999d5484e4fd4e365167fd28ac1fcc6b118c4bbc8f637c89','WORKBASKET','familymanCaseNumber','definitions/private-law/json/WorkBasketResultFields.json',1],
 ]);
 assert(rows.every(row=>/^sha256:[a-f0-9]{64}$/.test(row.rowDigest)));
 assert.deepEqual(rows.map(row=>row.definition),[
  {LiveFrom:'01/07/2021',CaseTypeID:'HarnessResultsPRL',CaseFieldID:'applicantCaseName',Label:'Case name',DisplayOrder:1},
  {LiveFrom:'01/07/2021',CaseTypeID:'HarnessResultsPRL',CaseFieldID:'applicantCaseName',Label:'Case',DisplayOrder:1},
  {LiveFrom:'01/07/2021',CaseTypeID:'HarnessResultsPRL',CaseFieldID:'familymanCaseNumber',Label:'Familyman number',DisplayOrder:2},
 ]);
});

test('applicant results: each mutation also faults its assigned catalogue row',async()=>{
 const {applicantResultDefinition}=await load();
 const cases=[
  ['applicant-binding','SearchResultFields',0,'applicantCaseName','CaseFieldID','familymanCaseNumber'],
  ['applicant-label','WorkBasketResultFields',0,'applicantCaseName','Label','Harness wrong case label'],
  ['applicant-order','WorkBasketResultFields',1,'familymanCaseNumber','DisplayOrder',8],
 ];
 const baseline=applicantResultDefinition();
 for(const [variant,sheet,index,field,attribute,value] of cases){
  const mutant=applicantResultDefinition(variant),row=mutant.sheets[sheet][index];
  assert.equal(baseline.sheets[sheet][index].CaseFieldID,field);
  assert.equal(row[attribute],value,`${variant} did not fault ${sheet}.${field}.${attribute}`);
  for(const other of ['SearchResultFields','WorkBasketResultFields']){
   if(other===sheet)continue;
   const applicantIndex=baseline.sheets[other].findIndex(item=>item.CaseFieldID==='applicantName');
   assert.deepEqual(mutant.sheets[other].filter((_,index)=>index!==applicantIndex),baseline.sheets[other].filter((_,index)=>index!==applicantIndex));
  }
 }
});

test('applicant results: only healthy exact fault observations can establish detection',async()=>{
 const {applicantResultDefinition,applicantResultContract,applicantResultObserved,validateApplicantResultOutcome}=await load();
 const {applicantResultCatalogueObserved,applicantResultCatalogueMutation}=await import('./lib/exui-applicant-results-catalogue.mjs');
 function fixture(variant='applicant-label'){
  const observations={},specs=[];
  for(const view of ['SEARCH','WORKBASKET']){
   const sheet=view==='SEARCH'?'SearchResultFields':'WorkBasketResultFields';
   const definition=applicantResultDefinition(variant),columns=definition.sheets[sheet].map(row=>({case_field_id:row.CaseFieldID,label:row.Label,order:row.DisplayOrder}));
   const catalogueRows=applicantResultCatalogueObserved(view,columns),target=variant==='baseline'?null:applicantResultCatalogueMutation(variant);
   observations[view]={variant,useCase:view,cells:21,rows:3,columns:columns.map(field=>field.case_field_id),catalogueCredit:false,releaseCredit:false,applicantExpected:applicantResultContract(view),applicantObserved:applicantResultObserved(view,columns),catalogueRows};
   const failed=target?.view===view;
   specs.push({title:'candidate renders results: '+view,tests:[{results:[{status:failed?'failed':'passed',errors:failed?[{message:'Error: RESULT_CATALOGUE_SOURCE_CONTRACT'}]:[]}]}]});
  }
  return {variant,terminal:{code:variant==='baseline'?0:1,signal:null},report:{errors:[],stats:{expected:variant==='baseline'?2:1,unexpected:variant==='baseline'?0:1,skipped:0},suites:[{specs}]},observations};
 }
 for(const variant of ['baseline','applicant-label','applicant-binding','applicant-order'])assert(validateApplicantResultOutcome(fixture(variant)));
 for(const mutate of [
  f=>{f.observations.SEARCH.rows=0;},f=>{f.observations.SEARCH.cells=0;},f=>{f.observations.SEARCH.columns=[];},
  f=>{delete f.observations.WORKBASKET;},f=>{f.terminal.signal='SIGTERM';},f=>{f.terminal.code=2;},
  f=>{f.report.errors=[{message:'import failed'}];},f=>{f.report.suites[0].specs[0].tests[0].results[0].errors=[{message:'Timeout table blank'}];},
  f=>{f.report.suites[0].specs[0].tests[0].results[0].status='timedOut';},f=>{f.report.stats.skipped=1;},
  f=>{f.observations.SEARCH.catalogueRows=[];},
  f=>{f.observations.SEARCH.catalogueCredit=true;},f=>{f.report.suites[0].specs[1].title='candidate renders results: SEARCH';},
  f=>{f.report.suites[0].specs[0].tests[0].results.push(f.report.suites[0].specs[0].tests[0].results[0]);},
 ]){const f=fixture();mutate(f);assert.throws(()=>validateApplicantResultOutcome(f));}
});
