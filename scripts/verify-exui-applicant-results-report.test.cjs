const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {renderApplicantCompatibility}=require('./harness-applicant-results-report.cjs');
const hash='sha256:'+'a'.repeat(64),commit='b'.repeat(40),canary='PRIVATE_AUTH_cookie_caseId_1234567890123456';
const projection=()=>({schemaVersion:1,kind:'applicant-results-compatibility',status:'PASS',runId:'ccd-11111111-1111-4111-8111-111111111111',producerCommit:commit,candidateCommit:'c'.repeat(40),candidateArtifactDigest:hash,sourceDigest:hash,dataImageDigest:hash,profileDigest:hash,descriptorDigest:hash,receiptArtifactDigest:hash,baselineProofs:1,effectiveFaults:3,sourceRows:2,cleanupComplete:true,catalogueCredit:false,releaseCredit:false});
test('compatibility panel states separate cohort, exact row mapping, fault counts and exclusions',async()=>{
 const html=renderApplicantCompatibility(projection());
 for(const text of ['1 baseline proof + 3 effective fault checks','2 source result rows','SEARCH','WORKBASKET','HarnessResultsPRL','does not establish default/Jenkins compatibility','excluded from the main test totals','No date-activation','not combined with the main run as one build',commit,'c'.repeat(40)])assert(html.includes(text));
 const {applicantResultsContract}=await import('./lib/exui-applicant-results-contract.mjs');
 for(const row of applicantResultsContract().rows)assert(html.includes(row.obligationId));
 assert(!html.includes(canary));assert(!html.includes('data-native-kind='));
});
test('public compatibility projection rejects extra fields, arbitrary labels, false success and changed counts',()=>{
 for(const mutate of [v=>v.private=canary,v=>v.runId=canary,v=>v.producerCommit=canary,v=>v.dataImageDigest=canary,v=>v.status='BLOCKED',v=>v.cleanupComplete=false,v=>v.catalogueCredit=true,v=>v.releaseCredit=true,v=>v.effectiveFaults=2,v=>v.baselineProofs=2,v=>v.sourceRows=3]){
  const value=projection();mutate(value);assert.throws(()=>renderApplicantCompatibility(value));
 }
});
test('raw evidence reader rejects stale pins and never accepts a success summary without native evidence',async(t)=>{
 const {readApplicantCompatibilityEvidence}=await import('./lib/exui-applicant-results-report-evidence.mjs');
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'applicant-report-'));t.after(()=>fs.rmSync(root,{recursive:true}));
 const directory=path.join(root,'native');fs.mkdirSync(directory);
 const write=(name,value)=>{const bytes=JSON.stringify(value);fs.writeFileSync(path.join(root,name),bytes);return digestBytes(bytes);};
 const expected={runId:projection().runId,harnessCommit:commit,releaseScopeId:'exui-ccd-applicant-results-pilot',identity:{artifactDigest:hash}};
 const pins={runId:expected.runId,producerCommit:commit,candidateArtifactDigest:hash,receiptArtifactDigest:hash,
  admissionDigest:write('native/independent-results-admission.json',{schemaVersion:1,completedAfterController:true,expected}),
  controllerTerminalDigest:write('native/independent-controller-terminal.json',{terminal:{code:0,signal:null}}),
  summaryDigest:write('summary.json',{kind:'standalone-applicant-results-pilot',status:'PASS',nativeRuntimeAcceptance:true,cleanupComplete:true,catalogueCredit:false,releaseCredit:false,invocations:4,proposedCatalogueRows:2,receiptArtifactDigest:hash}),};
 const descriptor={schemaVersion:1,kind:'applicant-results-compatibility-request',directory,expected:pins};
 const file=path.join(root,'request.json');write('request.json',descriptor);
 assert.throws(()=>readApplicantCompatibilityEvidence(file),error=>error.code==='ENOENT');
 for(const key of ['runId','producerCommit','candidateArtifactDigest','admissionDigest','controllerTerminalDigest','summaryDigest']){
  write('request.json',{...descriptor,expected:{...pins,[key]:canary}});
  assert.throws(()=>readApplicantCompatibilityEvidence(file),/APPLICANT_REPORT_EVIDENCE_INVALID/);
 }
 write('request.json',{...descriptor,private:canary});assert.throws(()=>readApplicantCompatibilityEvidence(file),/APPLICANT_REPORT_EVIDENCE_INVALID/);
});
test('compatibility attachment requires the validated main native cohort and cannot replace it',async()=>{
 const Reporter=require('./harness-public-odhin-reporter.cjs');
 const reporter=new Reporter({selection:'harness'});
 await assert.rejects(()=>reporter.prepareCompatibilityEvidence('/not-read-without-main-native'));
 assert.equal(reporter.compatibilityEvidence,null);assert.equal(reporter.nativeEvidence,null);
});
