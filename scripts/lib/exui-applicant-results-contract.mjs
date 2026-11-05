import assert from 'node:assert/strict';
import {buildResultColumnFixture} from './exui-result-columns.mjs';
import {definitionDigest} from './exui-definition-references.mjs';
import {APPLICANT_RESULT_VARIANTS,applicantResultDefinition} from './exui-applicant-results.mjs';

export const APPLICANT_RESULTS_SCOPE='exui-ccd-applicant-results-pilot';
export const APPLICANT_RESULTS_OBLIGATION='ccd-applicant-results-two-views';
export const APPLICANT_RESULTS_PROOF='ccd-applicant-results-source-contract';
export const APPLICANT_RESULTS_FAILURE='applicant-result-source-contract';
export const APPLICANT_RESULTS_MUTATIONS=Object.freeze(APPLICANT_RESULT_VARIANTS.slice(1));

// This exact-row contract deliberately leaves the separate backing CaseField obligation unproved.
export function applicantResultsContract() {
 const fixture=buildResultColumnFixture(),backing=fixture.sheets.CaseField.find(row=>row.ID==='applicantName');
 assert.deepEqual(Object.keys(backing).sort(),['CaseTypeID','FieldType','ID','Label','LiveFrom','SecurityClassification'],'RESULT_APPLICANT_BACKING_FACETS');
 assert.equal(backing.FieldType,'Text','RESULT_APPLICANT_BACKING_TYPE');
 const dispositions={
  LiveFrom:{claim:'typed-date-retention',activationClaim:false},
  CaseTypeID:{claim:'source-bound-normalization',source:'PRLAPPS',runtime:'HarnessResultsPRL'},
  CaseFieldID:{claim:'exact-binding-and-three-persisted-associated-values',fault:'applicant-binding'},
  Label:{claim:'exact-result-heading',fault:'applicant-label'},
  DisplayOrder:{claim:'exact-result-column-order',fault:'applicant-order'},
 };
 const rows=fixture.bindings.filter(row=>row.field==='applicantName').map(binding=>{
  const sheet=binding.sourcePath.endsWith('/SearchResultFields.json')?'SearchResultFields':'WorkBasketResultFields';
  const row=fixture.sheets[sheet].find(value=>value.CaseFieldID==='applicantName');
  assert.deepEqual(Object.keys(row).sort(),Object.keys(dispositions).sort(),'RESULT_APPLICANT_ROW_FACETS');
  return {...binding,sheet,view:sheet==='SearchResultFields'?'SEARCH':'WORKBASKET',sourceFacets:Object.entries(row).map(([attribute,value])=>({attribute,value,...dispositions[attribute]}))};
 });
 assert.equal(rows.length,2,'RESULT_APPLICANT_ROW_COUNT');
 const dependency={rowDigest:rows[0].fieldDependency,sourcePath:'definitions/private-law/json/CaseField/CaseField.json',row:backing,
  required:['exact backing field identity','actual CCD Text type','candidate Text rendering','three uniquely persisted associated values'],
  dispositions:{CaseTypeID:'normalized identity',ID:'exact backing binding',FieldType:'actual Text renderer',Label:'retained source; result heading comes from the result row',SecurityClassification:'retained source; no confidentiality or access-policy coverage',LiveFrom:'retained source; no temporal-activation coverage'},
  separateCaseFieldObligationSatisfied:false};
 assert(rows.every(row=>row.fieldDependency===dependency.rowDigest),'RESULT_APPLICANT_BACKING_BINDING');
 return {schemaVersion:1,kind:'applicant-result-exact-row-contract',releaseScopeId:APPLICANT_RESULTS_SCOPE,source:fixture.source,rows,dependency,
  dependencyBoundary:'Explicit corrected local ARM64 CCD image, actual imported descriptors, SQL date retention and real candidate results. No deployed/default CCD image claim.',
  activationClaim:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
}
export function applicantResultsMutation(variant) {
 assert(APPLICANT_RESULTS_MUTATIONS.includes(variant),'RESULT_APPLICANT_MUTATION');
 const contract=applicantResultsContract();
 return {mutationId:variant,obligationId:APPLICANT_RESULTS_OBLIGATION,
  definitionDigest:definitionDigest({sourceRows:contract.rows.map(row=>({obligationId:row.obligationId,rowDigest:row.rowDigest})),transformation:variant,definition:applicantResultDefinition(variant)}),
  expectedFailureId:APPLICANT_RESULTS_FAILURE,baselineProofId:APPLICANT_RESULTS_PROOF,mutantProofId:`${APPLICANT_RESULTS_PROOF}-${variant}`};
}
export function applicantResultsPolicy() {
 const policy={releaseScopeId:APPLICANT_RESULTS_SCOPE,requiredObligationIds:[APPLICANT_RESULTS_OBLIGATION],
  obligations:[{id:APPLICANT_RESULTS_OBLIGATION,boundary:'candidate',requiredProofIds:[APPLICANT_RESULTS_PROOF],requiredMutationIds:[...APPLICANT_RESULTS_MUTATIONS]}],
  mutationDefinitions:APPLICANT_RESULTS_MUTATIONS.map(applicantResultsMutation)};
 return {...policy,policyDigest:definitionDigest(policy)};
}

// Deterministic workbook bytes; the regression test regenerates all four from the reviewed source.
const workbookDigests={
 baseline:'sha256:0566f7e5953f1eeccb79f0e6ba4af5caff4f750968a9d9411148a495da1dd1b8',
 'applicant-binding':'sha256:14a5062b742af4c0d5730fc88b6c17b865794acc2a3e4de205bbdb82f22e5c11',
 'applicant-label':'sha256:9cfb4ee7fd658d0dacb5e87b776e1264f78a2f8f77f3916bd376e05d4fcf2a82',
 'applicant-order':'sha256:8610856cd912a638e5c727c1096bcba4bbeca048c751ca3989679ed24010f6fb',
};
export function applicantResultWorkbookDigest(variant='baseline') {
 assert(Object.hasOwn(workbookDigests,variant),'RESULT_APPLICANT_VARIANT');return workbookDigests[variant];
}
