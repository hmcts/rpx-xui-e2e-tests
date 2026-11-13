const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const keys=['schemaVersion','kind','status','runId','producerCommit','candidateCommit','candidateArtifactDigest','sourceDigest','harnessDependencyDigest','browserDigest','candidate','dependencies','dataImageDigest','profileDigest','ccdRuntime','catalogueDigest','catalogueRows','descriptorDigest','receiptArtifactDigest','baselineProofs','effectiveFaults','sourceRows','cleanupComplete','catalogueCredit','releaseCredit','joint'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows=[
 ['SEARCH','SearchResultFields','applicantCaseName','d1594e44450b917d4f021dbb181b38553662cf59072a48bc4a52bf78ac78f375','prl-ccd-definitions:definitions/private-law/json/SearchResultFields.json'],
 ['WORKBASKET','WorkBasketResultFields','applicantCaseName','bff9082cbfe5b46c4f6462f9e5f0a870e8d02bd88408a65a1063086c541d60e7','prl-ccd-definitions:definitions/private-law/json/WorkBasketResultFields.json'],
 ['WORKBASKET','WorkBasketResultFields','familymanCaseNumber','bd7af2a30355a565999d5484e4fd4e365167fd28ac1fcc6b118c4bbc8f637c89','prl-ccd-definitions:definitions/private-law/json/WorkBasketResultFields.json'],
];
const ids=rows.map(([, , , id])=>`configuration-shape:${id}`);
const candidateKeys=['artifactDigest','webappCommit','dependencyLockDigest','toolkitVersion','toolkitDigest'];
const sourceRows=rows.map(([, , , id, sourceKey])=>({obligationId:`configuration-shape:${id}`,sourceKeys:[sourceKey]}));
const jointKeys=['browserDigest','candidateArtifactDigest','candidateCommit','catalogueDigest','harnessDependencyDigest','nativeRunId','obligationIds','policy','producerCommit','producerDigest','profileRunId','releaseApproval','releaseCredit','sourceRows','status'];
function renderApplicantCompatibility(value) {
 assert.deepEqual(Object.keys(value??{}).sort(),keys.slice().sort(),'APPLICANT_REPORT_PROJECTION_INVALID');
 for(const [key,expected] of Object.entries({schemaVersion:1,kind:'applicant-results-compatibility',status:'PASS',baselineProofs:4,effectiveFaults:3,sourceRows:3,cleanupComplete:true,releaseCredit:false}))assert.equal(value[key],expected,'APPLICANT_REPORT_PROJECTION_INVALID');
 for(const key of ['producerCommit','candidateCommit'])assert.match(value[key],/^[a-f0-9]{40}$/,'APPLICANT_REPORT_PROJECTION_INVALID');
 for(const key of ['candidateArtifactDigest','sourceDigest','harnessDependencyDigest','browserDigest','dataImageDigest','profileDigest','catalogueDigest','descriptorDigest','receiptArtifactDigest'])assert.match(value[key],/^sha256:[a-f0-9]{64}$/,'APPLICANT_REPORT_PROJECTION_INVALID');
 assert.match(value.runId,/^ccd-[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,'APPLICANT_REPORT_PROJECTION_INVALID');
 assert.deepEqual(Object.keys(value.candidate??{}).sort(),candidateKeys.slice().sort(),'APPLICANT_REPORT_PROJECTION_INVALID');
 assert.equal(value.candidate.artifactDigest,value.candidateArtifactDigest,'APPLICANT_REPORT_PROJECTION_INVALID');assert.equal(value.candidate.webappCommit,value.candidateCommit,'APPLICANT_REPORT_PROJECTION_INVALID');
 assert.deepEqual(Object.keys(value.dependencies??{}).sort(),['ccd','ccd-definition'],'APPLICANT_REPORT_PROJECTION_INVALID');
 for(const dependency of Object.values(value.dependencies)){
  assert.deepEqual(Object.keys(dependency).sort(),['apiContractDigest','artifactDigest'],'APPLICANT_REPORT_PROJECTION_INVALID');
  for(const item of Object.values(dependency))assert.match(item,/^sha256:[a-f0-9]{64}$/,'APPLICANT_REPORT_PROJECTION_INVALID');
 }
 assert.deepEqual(Object.keys(value.ccdRuntime??{}).sort(),['elasticsearch','localProfile','profileDigest'],'APPLICANT_REPORT_PROJECTION_INVALID');
 assert.equal(typeof value.ccdRuntime.elasticsearch,'boolean','APPLICANT_REPORT_PROJECTION_INVALID');assert.equal(typeof value.ccdRuntime.localProfile,'boolean','APPLICANT_REPORT_PROJECTION_INVALID');
 assert(value.ccdRuntime.profileDigest===null||/^sha256:[a-f0-9]{64}$/.test(value.ccdRuntime.profileDigest),'APPLICANT_REPORT_PROJECTION_INVALID');
 assert.deepEqual(value.catalogueRows,rows.map(([, , , id, sourceKey])=>({obligationId:`configuration-shape:${id}`,family:'PRIVATELAW',kind:'definition-shape',requiredBoundary:'candidate',sourceKeys:[sourceKey]})),'APPLICANT_REPORT_PROJECTION_INVALID');
 assert.equal(value.catalogueCredit,value.joint?.status==='included','APPLICANT_REPORT_PROJECTION_INVALID');
 assert.equal(value.joint?.policy,'applicant-results-native-candidate-v1','APPLICANT_REPORT_PROJECTION_INVALID');assert.equal(value.joint?.releaseCredit,false,'APPLICANT_REPORT_PROJECTION_INVALID');assert.equal(value.joint?.releaseApproval,false,'APPLICANT_REPORT_PROJECTION_INVALID');
 if(value.joint.status==='included'){
  assert.deepEqual(Object.keys(value.joint).sort(),jointKeys.slice().sort(),'APPLICANT_REPORT_PROJECTION_INVALID');
  assert.deepEqual(value.joint.obligationIds,ids,'APPLICANT_REPORT_PROJECTION_INVALID');
  assert.deepEqual(value.joint.sourceRows,sourceRows,'APPLICANT_REPORT_PROJECTION_INVALID');
  assert.equal(value.joint.profileRunId,value.runId,'APPLICANT_REPORT_PROJECTION_INVALID');assert.equal(value.joint.producerCommit,value.producerCommit,'APPLICANT_REPORT_PROJECTION_INVALID');
  assert.equal(value.joint.producerDigest,value.sourceDigest,'APPLICANT_REPORT_PROJECTION_INVALID');assert.equal(value.joint.candidateArtifactDigest,value.candidateArtifactDigest,'APPLICANT_REPORT_PROJECTION_INVALID');
  assert.equal(value.joint.candidateCommit,value.candidateCommit,'APPLICANT_REPORT_PROJECTION_INVALID');assert.equal(value.joint.harnessDependencyDigest,value.harnessDependencyDigest,'APPLICANT_REPORT_PROJECTION_INVALID');
  assert.equal(value.joint.browserDigest,value.browserDigest,'APPLICANT_REPORT_PROJECTION_INVALID');assert.equal(value.joint.catalogueDigest,value.catalogueDigest,'APPLICANT_REPORT_PROJECTION_INVALID');
 }else{
  assert.deepEqual(Object.keys(value.joint??{}).sort(),['policy','reason','releaseApproval','releaseCredit','status'].sort(),'APPLICANT_REPORT_PROJECTION_INVALID');
  assert.equal(value.joint.status,'separate','APPLICANT_REPORT_PROJECTION_INVALID');
  assert(['different-catalogue','different-producer','different-source','different-candidate','different-dependencies','different-browser','different-ccd-runtime'].includes(value.joint.reason),'APPLICANT_REPORT_PROJECTION_INVALID');
 }
 const join=value.catalogueCredit?'3 catalogue requirements included in candidate coverage':'0 catalogue credit; runtime proof remains separate';
 return `<section id="harness-applicant-compatibility" class="odhin-thin-border p-3 mt-3" data-compatibility-sha256="${digest(value)}" data-compatibility-status="${value.status}" data-compatibility-baselines="${value.baselineProofs}" data-compatibility-faults="${value.effectiveFaults}" aria-labelledby="harness-applicant-compatibility-heading"><h2 id="harness-applicant-compatibility-heading">Additional compatibility evidence: applicant result columns</h2><p><strong>PASS · 4 baseline proof checks + 3 effective fault checks · ${join}.</strong></p><div class="alert alert-warning"><strong>Corrected local ARM64 CCD dependency.</strong> The proof receives catalogue credit only when the native run has the same producer, EXUI candidate, CCD dependencies and runtime mode, browser/toolchain and catalogue source rows. This does not establish deployed-service behaviour or release approval.</div><div class="table-responsive"><table class="table harness-native-table"><thead><tr><th>View / source row</th><th>Service and actual case type</th><th>What was established</th></tr></thead><tbody>${rows.map(([view,sheet,field,id,sourceKey])=>`<tr><th scope="row">${view}<p>${sheet} · ${field}</p><details><summary>Source requirement</summary><code>configuration-shape:${id}</code><br><code>${sourceKey}</code></details></th><td>Private Law source · PRLAPPS<br>Disposable jurisdiction HARNESS<br>Actual case type HarnessResultsPRL</td><td>Correct field binding, heading and column order; three persisted case associations; seven rendered columns and 21 checked cells. Source LiveFrom retained as a typed CCD date.</td></tr>`).join('')}</tbody></table></div><h3>How the checks were challenged</h3><p>Three fresh definition variants each changed one selected source row, rendered both result views, and failed only the corresponding named row assertion. Baseline plus three fault runs each recorded a separate execution and cleanup. The two view observations belong to their source-row proof, not additional catalogue requirements.</p><details><summary>Candidate, producer and dependency identity</summary><dl>${[['Separate phase run',value.runId],['Harness producer commit',value.producerCommit],['EXUI candidate commit',value.candidateCommit],['Candidate artifact',value.candidateArtifactDigest],['Harness source',value.sourceDigest],['Harness dependencies',value.harnessDependencyDigest],['Browser',value.browserDigest],['Corrected CCD image',value.dataImageDigest],['Explicit local profile',value.profileDigest],['Validated receipt',value.receiptArtifactDigest],['Explicit attachment descriptor',value.descriptorDigest],['Catalogue digest',value.catalogueDigest]].map(([label,text])=>`<dt>${label}</dt><dd><code>${text}</code></dd>`).join('')}</dl></details><p><strong>Limits:</strong> synthetic session and jurisdiction/case-type normalization; controlled indexing of persisted cases. No date-activation, backing-field access/confidentiality or whole CaseField requirement claim. Test duration and attempts remain separate from the main run.</p></section>`;
}
module.exports={renderApplicantCompatibility};
