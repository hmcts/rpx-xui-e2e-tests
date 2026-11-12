const test=require('node:test');const assert=require('node:assert/strict');
test('applicant exact-row contract accounts for every own facet without granting backing-field or activation coverage',async()=>{
 const {applicantResultsContract}=await import('./lib/exui-applicant-results-contract.mjs');const contract=applicantResultsContract();
 assert.deepEqual(contract.rows.map(row=>row.obligationId),['configuration-shape:03d72dbbb7b22d6f829fd7eaeca12da69ee34305c2b736fed3328b9d52913843','configuration-shape:08a604dcba55326233339684cdc7f53d7df02d63b0187684e44a974cd1bd5d58']);
 for(const row of contract.rows){assert.equal(row.sourceFacets.length,5);assert.equal(row.sourceFacets.find(f=>f.attribute==='LiveFrom').activationClaim,false);assert.equal(row.sourceFacets.find(f=>f.attribute==='CaseTypeID').source,'PRLAPPS');}
 assert.equal(contract.dependency.row.FieldType,'Text');assert.equal(Object.hasOwn(contract.dependency.row,'Searchable'),false);
 assert.equal(contract.dependency.separateCaseFieldObligationSatisfied,false);assert.match(contract.dependency.dispositions.SecurityClassification,/no confidentiality/);
 for(const key of ['activationClaim','runtimeAcceptance','catalogueCredit','releaseCredit'])assert.equal(contract[key],false);
 contract.rows.pop();assert.equal(applicantResultsContract().rows.length,2);
});
test('applicant aggregate policy requires all three effective faults and unique proof selection',async()=>{
 const {applicantResultsPolicy,APPLICANT_RESULTS_PROOF,APPLICANT_RESULTS_MUTATIONS}=await import('./lib/exui-applicant-results-contract.mjs');const policy=applicantResultsPolicy();
 assert.equal(policy.obligations.length,4);assert.deepEqual(policy.obligations[0].requiredProofIds,[APPLICANT_RESULTS_PROOF]);assert.deepEqual(policy.obligations[0].requiredMutationIds,[]);
 assert.deepEqual(policy.obligations.slice(1).map(row=>row.id),['configuration-shape:d1594e44450b917d4f021dbb181b38553662cf59072a48bc4a52bf78ac78f375','configuration-shape:bff9082cbfe5b46c4f6462f9e5f0a870e8d02bd88408a65a1063086c541d60e7','configuration-shape:bd7af2a30355a565999d5484e4fd4e365167fd28ac1fcc6b118c4bbc8f637c89']);
 assert.deepEqual(policy.obligations.slice(1).map(row=>row.requiredMutationIds[0]),[...APPLICANT_RESULTS_MUTATIONS]);
 assert.equal(policy.mutationDefinitions.length,3);assert.deepEqual(policy.mutationDefinitions.map(row=>row.baselineProofId),policy.obligations.slice(1).map(row=>row.requiredProofIds[0]));
 assert.equal(new Set(policy.mutationDefinitions.map(row=>row.definitionDigest)).size,3);assert.equal(new Set(policy.mutationDefinitions.map(row=>row.mutantProofId)).size,3);
});
test('all native applicant workbook seals reproduce from the exact source and transformation',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {prepareResultColumnDefinition}=await import('./prepare-harness-result-columns.mjs');
 const {applicantResultWorkbookDigest,APPLICANT_RESULTS_MUTATIONS}=await import('./lib/exui-applicant-results-contract.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'applicant-workbook-test-'));
 try{for(const variant of ['baseline',...APPLICANT_RESULTS_MUTATIONS])assert.equal((await prepareResultColumnDefinition(path.join(root,variant),{variant})).workbookDigest,applicantResultWorkbookDigest(variant));}finally{fs.rmSync(root,{recursive:true});}
});
