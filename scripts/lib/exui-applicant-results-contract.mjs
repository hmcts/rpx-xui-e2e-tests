import assert from 'node:assert/strict';
import {buildResultColumnFixture} from './exui-result-columns.mjs';
import {definitionDigest} from './exui-definition-references.mjs';
import {APPLICANT_RESULT_VARIANTS,applicantResultDefinition} from './exui-applicant-results.mjs';
import {applicantResultCatalogueContract,applicantResultCatalogueMutation} from './exui-applicant-results-catalogue.mjs';

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
 return {schemaVersion:1,kind:'applicant-result-exact-row-contract',releaseScopeId:APPLICANT_RESULTS_SCOPE,source:fixture.source,rows,catalogueRows:applicantResultCatalogueContract(),dependency,
  dependencyBoundary:'Explicit corrected local ARM64 CCD image, actual imported descriptors, SQL date retention and real candidate results. No deployed/default CCD image claim.',
  activationClaim:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
}
export function applicantResultsMutation(variant) {
 assert(APPLICANT_RESULTS_MUTATIONS.includes(variant),'RESULT_APPLICANT_MUTATION');
 const target=applicantResultCatalogueMutation(variant);
 return {mutationId:variant,obligationId:target.obligationId,
  target:`${target.sourcePath}[${target.sourceIndex}] ${target.field}`,
  definitionDigest:definitionDigest({sourceRows:[{obligationId:target.obligationId,rowDigest:target.rowDigest}],transformation:variant,definition:applicantResultDefinition(variant)}),
  expectedFailureId:`result-catalogue-${variant}`,baselineProofId:target.proofId,mutantProofId:target.proofId};
}
export function applicantResultsPolicy() {
 const catalogueRows=applicantResultCatalogueContract();
 const policy={releaseScopeId:APPLICANT_RESULTS_SCOPE,requiredObligationIds:[APPLICANT_RESULTS_OBLIGATION,...catalogueRows.map(row=>row.obligationId)],
  obligations:[
   {id:APPLICANT_RESULTS_OBLIGATION,boundary:'candidate',requiredProofIds:[APPLICANT_RESULTS_PROOF],requiredMutationIds:[]},
   ...catalogueRows.map(row=>({id:row.obligationId,boundary:'candidate',requiredProofIds:[row.proofId],requiredMutationIds:[row.mutationId]})),
  ],
  mutationDefinitions:APPLICANT_RESULTS_MUTATIONS.map(applicantResultsMutation)};
 return {...policy,policyDigest:definitionDigest(policy)};
}

// Deterministic workbook bytes; the regression test regenerates all four from the reviewed source.
const workbookDigests={
 baseline:'sha256:0566f7e5953f1eeccb79f0e6ba4af5caff4f750968a9d9411148a495da1dd1b8',
 'applicant-binding':'sha256:b01d20a05d25b2ecc70a8fc65b8d7a8b850782b66a67c9e18da4d88c62c5678a',
 'applicant-label':'sha256:8cd92f411eaa4510b7b9d0d5f2ca99ce3929d5da9b5c2db6652b07d475b11830',
 'applicant-order':'sha256:3e50c5edaac15d4e7739ba6d80d5f50fb16ee7fbd5f73c87ef6bacbee518f786',
};
export function applicantResultWorkbookDigest(variant='baseline') {
 assert(Object.hasOwn(workbookDigests,variant),'RESULT_APPLICANT_VARIANT');return workbookDigests[variant];
}
