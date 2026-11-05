import assert from 'node:assert/strict';
import {buildResultColumnFixture} from './exui-result-columns.mjs';
import {applicantResultDefinition,applicantResultObserved} from './exui-applicant-results.mjs';
const sheets={SEARCH:'SearchResultFields',WORKBASKET:'WorkBasketResultFields'};
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value??'');
function sourceRows(){
 const fixture=buildResultColumnFixture();
 return fixture.bindings.filter(row=>row.field==='applicantName').map(binding=>{
  const sheet=binding.sourcePath.endsWith('/SearchResultFields.json')?'SearchResultFields':'WorkBasketResultFields';
  const row=fixture.sheets[sheet].find(row=>row.CaseFieldID==='applicantName');
  return {sheet,obligationId:binding.obligationId,sourcePath:binding.sourcePath,rowDigest:binding.rowDigest,sourceDate:row.LiveFrom};
 });
}
export function expectedApplicantResultDates(version,variant='baseline'){
 assert(Number.isSafeInteger(version)&&version>0,'RESULT_DATE_VERSION_REQUIRED');
 const definition=applicantResultDefinition(variant);
 return Object.entries(sheets).map(([view,sheet])=>{
  const columns=definition.sheets[sheet].map(row=>({case_field_id:row.CaseFieldID,label:row.Label,order:row.DisplayOrder}));
  const field=applicantResultObserved(view,columns).field;
  const date=sourceRows().find(row=>row.sheet===sheet).sourceDate;
  assert(/^\d{2}\/\d{2}\/\d{4}$/.test(date),'RESULT_DATE_SOURCE_REQUIRED');
  const [day,month,year]=date.split('/');
  return {sheet,case_type:'HarnessResultsPRL',version,field,path:'',unscoped_role:true,no_live_to:true,live_from:`${year}-${month}-${day}`,sql_type:'date'};
 });
}
export function applicantResultDateRecord(rows,state,version,{variant='baseline',workbookDigest}={}){
 assert.deepEqual(rows,expectedApplicantResultDates(version,variant),'RESULT_STORED_DATE_ROWS_MISMATCH');
 assert(typeof state.owner==='string'&&/^harness-[a-z0-9-]+$/.test(state.owner)&&/^[a-f0-9]{64}$/.test(state.namespace),'RESULT_DATE_RUNTIME_IDENTITY');
 const dependencyImages=Object.fromEntries(['data','definition'].map(name=>[name,state.images?.[name]?.id]));
 assert(Object.values(dependencyImages).every(digest)&&digest(workbookDigest),'RESULT_DATE_DEPENDENCY_BINDING');
 return {schemaVersion:1,kind:'stored-applicant-result-source-dates',owner:state.owner,namespace:state.namespace,definitionVersion:version,variant,workbookDigest,dependencyImages,source:buildResultColumnFixture().source,sourceRows:sourceRows(),rows,activationClaim:false};
}
export function assertApplicantResultDates(record,state,version,options){
 assert(record,'RESULT_STORED_DATES_REQUIRED');
 assert.deepEqual(record,applicantResultDateRecord(record.rows,state,version,options),'RESULT_DATE_BINDING_MISMATCH');
}
export function readApplicantResultDates(state,version,{variant='baseline',workbookDigest,runDocker,inspect}){
 const expected=expectedApplicantResultDates(version,variant);
 inspect(state);
 const select=(table,row)=>`SELECT '${row.sheet}' AS sheet,ct.reference AS case_type,ct.version,cf.reference AS field,
COALESCE(r.case_field_element_path,'') AS path,r.role_id IS NULL AS unscoped_role,r.live_to IS NULL AS no_live_to,
r.live_from::text AS live_from,pg_typeof(r.live_from)::text AS sql_type
FROM ${table} r JOIN case_type ct ON ct.id=r.case_type_id
JOIN case_field cf ON cf.id=r.case_field_id AND cf.case_type_id=ct.id
WHERE ct.reference='HarnessResultsPRL' AND ct.version=${version} AND cf.reference='${row.field}'`;
 // Fixed tables and source-validated field/variant IDs only. Preserve typed dates; do not infer activation.
 const sql=`BEGIN READ ONLY; SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) FROM (${select('search_result_case_field',expected[0])} UNION ALL ${select('workbasket_case_field',expected[1])} ORDER BY sheet,field) r; COMMIT;`;
 let raw;try{raw=runDocker(['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition'],sql);}catch{throw Error('RESULT_DATE_QUERY_FAILED');}
 inspect(state);
 assert(typeof raw==='string'&&Buffer.byteLength(raw)<16384,'RESULT_DATE_RESPONSE_INVALID');
 let rows;try{rows=JSON.parse(raw);}catch{throw Error('RESULT_DATE_RESPONSE_INVALID');}
 return applicantResultDateRecord(rows,state,version,{variant,workbookDigest});
}
