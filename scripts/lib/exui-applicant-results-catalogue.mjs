import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildResultColumnFixture} from './exui-result-columns.mjs';

const selectedRows=Object.freeze([
 {view:'SEARCH',sheet:'SearchResultFields',field:'applicantCaseName',proofId:'ccd-prl-result-search-applicant-case-name',mutationId:'applicant-binding'},
 {view:'WORKBASKET',sheet:'WorkBasketResultFields',field:'applicantCaseName',proofId:'ccd-prl-result-workbasket-applicant-case-name',mutationId:'applicant-label'},
 {view:'WORKBASKET',sheet:'WorkBasketResultFields',field:'familymanCaseNumber',proofId:'ccd-prl-result-workbasket-familyman-case-number',mutationId:'applicant-order'},
]);

export function applicantResultCatalogueContract() {
 const fixture=buildResultColumnFixture();
 const source=JSON.parse(fs.readFileSync(new URL('../fixtures/ccd/result-columns.source.json',import.meta.url),'utf8'));
 return selectedRows.map(({view,sheet,field,proofId,mutationId})=>{
  const bindings=fixture.bindings.filter(item=>item.sourcePath.endsWith(`/${sheet}.json`)&&item.field===field);
  assert.equal(bindings.length,1,'RESULT_CATALOGUE_BINDING_UNIQUE');
  const binding=bindings[0],selected=source.sources.find(item=>item.path===binding.sourcePath)?.rows[binding.sourceIndex];
  assert(selected,'RESULT_CATALOGUE_SOURCE_ROW');
  assert.equal(selected.rowDigest,binding.rowDigest,'RESULT_CATALOGUE_SOURCE_DIGEST');
  const definitionRows=fixture.sheets[sheet].filter(row=>row.CaseFieldID===field);
  assert.equal(definitionRows.length,1,'RESULT_CATALOGUE_DEFINITION_ROW');
  return {obligationId:binding.obligationId,proofId,mutationId,view,field,sourcePath:binding.sourcePath,sourceIndex:binding.sourceIndex,
   rowDigest:binding.rowDigest,sourceRow:structuredClone(selected.row),definition:structuredClone(definitionRows[0]),
   fieldDependency:binding.fieldDependency};
 });
}

export function applicantResultCatalogueMutation(variant) {
 const [row]=applicantResultCatalogueContract().filter(item=>item.mutationId===variant);
 assert(row,'RESULT_CATALOGUE_MUTATION');
 return row;
}

export function applicantResultCatalogueObserved(view,columns) {
 const selected=applicantResultCatalogueContract().filter(row=>row.view===view);
 assert(selected.length,'RESULT_CATALOGUE_VIEW');
 return selected.map(row=>{
  const actual=columns.find(item=>item.case_field_id===row.field)??columns.find(item=>item.order===row.definition.DisplayOrder);
  return {obligationId:row.obligationId,proofId:row.proofId,expected:{CaseFieldID:row.definition.CaseFieldID,Label:row.definition.Label,DisplayOrder:row.definition.DisplayOrder},
   observed:actual?{CaseFieldID:actual.case_field_id,Label:actual.label,DisplayOrder:actual.order}:null};
 });
}
