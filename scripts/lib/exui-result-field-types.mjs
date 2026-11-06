import assert from 'node:assert/strict';
import {buildResultColumnDefinition} from './exui-result-columns-definition.mjs';

const canonical=buildResultColumnDefinition();
// Definition-store c37c9b84: V0001__Base_version.sql defines CREATED_DATE as
// DateTime; StateMetadataCaseFieldEntityFactory + ReferenceUtils derive the
// FixedList identity and items from the imported State rows. CCD 5c5ff0b9
// CaseSearchResultViewGenerator emits the CommonField type in result headers.
// These dependencies support result interpretation; they earn no CaseField credit.
export function expectedResultFieldType(fieldId) {
 if(fieldId==='[CREATED_DATE]')return {id:'DateTime',type:'DateTime',fixed_list_items:[]};
 if(fieldId==='[STATE]')return {id:`FixedList-${canonical.caseType}[STATE]`,type:'FixedList',fixed_list_items:canonical.sheets.State.map(row=>({code:row.ID,label:row.Name,order:row.DisplayOrder??null}))};
 const field=canonical.sheets.CaseField.find(row=>row.ID===fieldId);
 assert(field&&['Text','Date','DateTime'].includes(field.FieldType),'RESULT_CCD_SEARCH_SOURCE_FIELD');
 return {id:field.FieldType,type:field.FieldType,fixed_list_items:[]};
}
export function validateResultFieldType(fieldId,observed) {
 assert(observed&&typeof observed==='object','RESULT_CCD_SEARCH_FIELD_TYPE');
 const expected=expectedResultFieldType(fieldId);
 assert.deepEqual({id:observed.id,type:observed.type,fixed_list_items:observed.fixed_list_items??[]},expected,'RESULT_CCD_SEARCH_FIELD_TYPE');
 return expected;
}

// api/searchCases.handleElasticSearchResponse maps CCD headers[0].fields to
// columns. Check the metadata consumed by the candidate, while retaining the
// separately validated CCD descriptor as the column-binding expectation.
export function validateResultCandidateColumns(body,expectedColumns) {
 assert(Array.isArray(body?.columns)&&Array.isArray(expectedColumns),'RESULT_CANDIDATE_COLUMNS');
 assert.equal(body.columns.length,expectedColumns.length,'RESULT_CANDIDATE_COLUMNS');
 const columns=[...body.columns].sort((a,b)=>a.order-b.order);
 const expected=[...expectedColumns].sort((a,b)=>a.order-b.order);
 assert.equal(new Set(columns.map(field=>field.case_field_id)).size,columns.length,'RESULT_CANDIDATE_COLUMN_BINDING');
 for(let i=0;i<columns.length;i++) {
  const field=columns[i];
  for(const key of ['case_field_id','label','order','metadata'])assert.deepEqual(field[key],expected[i][key],'RESULT_CANDIDATE_COLUMN_BINDING');
  validateResultFieldType(field.case_field_id,field.case_field_type);
 }
}
