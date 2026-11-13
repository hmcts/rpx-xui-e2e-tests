const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {renderApplicantCompatibility}=require('./harness-applicant-results-report.cjs');
const hash='sha256:'+'a'.repeat(64),commit='b'.repeat(40),canary='PRIVATE_AUTH_cookie_caseId_1234567890123456';
const ids=['configuration-shape:d1594e44450b917d4f021dbb181b38553662cf59072a48bc4a52bf78ac78f375','configuration-shape:bff9082cbfe5b46c4f6462f9e5f0a870e8d02bd88408a65a1063086c541d60e7','configuration-shape:bd7af2a30355a565999d5484e4fd4e365167fd28ac1fcc6b118c4bbc8f637c89'];
const sourcePaths=['SearchResultFields','WorkBasketResultFields','WorkBasketResultFields'];
const sourceKeys=sourcePaths.map(path=>`prl-ccd-definitions:definitions/private-law/json/${path}.json`);
const projection=()=>({schemaVersion:1,kind:'applicant-results-compatibility',status:'PASS',runId:'ccd-11111111-1111-4111-8111-111111111111',producerCommit:commit,candidateCommit:'c'.repeat(40),candidateArtifactDigest:hash,sourceDigest:hash,harnessDependencyDigest:hash,browserDigest:hash,candidate:{artifactDigest:hash,webappCommit:'c'.repeat(40),dependencyLockDigest:hash,toolkitVersion:'1.2.3',toolkitDigest:hash},dependencies:{ccd:{artifactDigest:hash,apiContractDigest:hash},'ccd-definition':{artifactDigest:hash,apiContractDigest:hash}},dataImageDigest:hash,profileDigest:hash,ccdRuntime:{elasticsearch:true,localProfile:true,profileDigest:hash},catalogueDigest:hash,catalogueRows:ids.map((obligationId,index)=>({obligationId,family:'PRIVATELAW',kind:'definition-shape',requiredBoundary:'candidate',sourceKeys:[sourceKeys[index]]})),descriptorDigest:hash,receiptArtifactDigest:hash,baselineProofs:4,effectiveFaults:3,sourceRows:3,cleanupComplete:true,catalogueCredit:false,releaseCredit:false,joint:{policy:'applicant-results-native-candidate-v1',status:'separate',reason:'different-ccd-runtime',releaseCredit:false,releaseApproval:false}});
test('compatibility panel states separate cohort, exact row mapping, fault counts and exclusions',async()=>{
 const html=renderApplicantCompatibility(projection());
 for(const text of ['4 baseline proof checks + 3 effective fault checks','0 catalogue credit; runtime proof remains separate','SEARCH','WORKBASKET','HarnessResultsPRL','does not establish deployed-service behaviour','No date-activation','Test duration and attempts remain separate from the main run',commit,'c'.repeat(40)])assert(html.includes(text));
 for(const id of ids)assert(html.includes(id));
 assert(!html.includes(canary));assert(!html.includes('data-native-kind='));
});
test('compatibility panel credits only the three exact joined PRL result rows',()=>{
 const value=projection();value.catalogueCredit=true;value.joint={policy:'applicant-results-native-candidate-v1',status:'included',
  nativeRunId:'ci-22222222-2222-4222-8222-222222222222',profileRunId:value.runId,producerCommit:value.producerCommit,producerDigest:value.sourceDigest,
  candidateCommit:value.candidateCommit,candidateArtifactDigest:value.candidateArtifactDigest,harnessDependencyDigest:value.harnessDependencyDigest,
  browserDigest:value.browserDigest,catalogueDigest:value.catalogueDigest,obligationIds:ids,sourceRows:ids.map((obligationId,index)=>({obligationId,sourceKeys:[sourceKeys[index]]})),releaseCredit:false,releaseApproval:false};
 const html=renderApplicantCompatibility(value);
 assert(html.includes('3 catalogue requirements included in candidate coverage'));
 for(const id of ids)assert(html.includes(id));
 assert(html.includes('does not establish deployed-service behaviour or release approval'));
});
test('public compatibility projection rejects extra fields, arbitrary labels, false success and changed counts',()=>{
 for(const mutate of [v=>v.private=canary,v=>v.runId=canary,v=>v.producerCommit=canary,v=>v.dataImageDigest=canary,v=>v.status='BLOCKED',v=>v.cleanupComplete=false,v=>v.catalogueCredit=true,v=>v.releaseCredit=true,v=>v.effectiveFaults=2,v=>v.baselineProofs=2,v=>v.sourceRows=4,v=>v.catalogueRows[0].sourceKeys[0]='forged']){
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
  summaryDigest:write('summary.json',{kind:'standalone-applicant-results-pilot',status:'PASS',nativeRuntimeAcceptance:true,cleanupComplete:true,catalogueCredit:false,releaseCredit:false,invocations:4,proposedCatalogueRows:3,receiptArtifactDigest:hash}),};
 const descriptor={schemaVersion:1,kind:'applicant-results-compatibility-request',directory,expected:pins};
 const file=path.join(root,'request.json');write('request.json',descriptor);
 assert.throws(()=>readApplicantCompatibilityEvidence(file),error=>error.code==='ENOENT');
 for(const key of ['runId','producerCommit','candidateArtifactDigest','admissionDigest','controllerTerminalDigest','summaryDigest']){
  write('request.json',{...descriptor,expected:{...pins,[key]:canary}});
  assert.throws(()=>readApplicantCompatibilityEvidence(file),/APPLICANT_REPORT_EVIDENCE_INVALID/);
 }
 write('request.json',{...descriptor,private:canary});assert.throws(()=>readApplicantCompatibilityEvidence(file),/APPLICANT_REPORT_EVIDENCE_INVALID/);
});
test('native applicant run emits a digest-pinned report handoff only after accepted cleanup',async t=>{
 const {writeApplicantResultsCompatibilityRequest}=await import('./run-harness-applicant-results.mjs'),{digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const root=fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'applicant-request-')));t.after(()=>fs.rmSync(root,{recursive:true}));const directory=path.join(root,'native');fs.mkdirSync(directory);
 const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
 write(path.join(root,'summary.json'),{status:'PASS',nativeRuntimeAcceptance:true,cleanupComplete:true,catalogueCredit:false,releaseCredit:false,receiptArtifactDigest:hash});
 write(path.join(directory,'independent-results-admission.json'),{schemaVersion:1,completedAfterController:true,expected:{runId:'ccd-11111111-1111-4111-8111-111111111111',harnessCommit:commit,identity:{artifactDigest:hash}}});
 write(path.join(directory,'independent-controller-terminal.json'),{runId:'ccd-11111111-1111-4111-8111-111111111111',terminal:{code:0,signal:null}});
 const requestPath=writeApplicantResultsCompatibilityRequest(root,directory),request=JSON.parse(fs.readFileSync(requestPath));
 assert.deepEqual(request,{schemaVersion:1,kind:'applicant-results-compatibility-request',directory,expected:{runId:'ccd-11111111-1111-4111-8111-111111111111',producerCommit:commit,candidateArtifactDigest:hash,receiptArtifactDigest:hash,
  admissionDigest:digestBytes(fs.readFileSync(path.join(directory,'independent-results-admission.json'))),controllerTerminalDigest:digestBytes(fs.readFileSync(path.join(directory,'independent-controller-terminal.json'))),summaryDigest:digestBytes(fs.readFileSync(path.join(root,'summary.json')))}});
 const blocked=path.join(root,'blocked');fs.mkdirSync(path.join(blocked,'native'),{recursive:true});write(path.join(blocked,'summary.json'),{status:'BLOCKED',nativeRuntimeAcceptance:false,cleanupComplete:true,catalogueCredit:false,releaseCredit:false});
 assert.throws(()=>writeApplicantResultsCompatibilityRequest(blocked,path.join(blocked,'native')),/RESULT_REPORT_HANDOFF_INVALID/);
});
test('compatibility attachment requires the validated main native cohort and cannot replace it',async()=>{
 const Reporter=require('./harness-public-odhin-reporter.cjs');
 const reporter=new Reporter({selection:'harness'});
 await assert.rejects(()=>reporter.prepareCompatibilityEvidence('/not-read-without-main-native'));
 assert.equal(reporter.compatibilityEvidence,null);assert.equal(reporter.nativeEvidence,null);
});

test('a different catalogue stays separate and publishes zero credit without mutating native coverage',async()=>{
 const {applyApplicantResultsAdmission}=await import('./lib/exui-applicant-results-admission.mjs');
 const {loadCommittedConfigurationCatalogue}=await import('./lib/exui-configuration-runtime-coverage.mjs');
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const {catalogue}=loadCommittedConfigurationCatalogue(),value=projection();
 const native={source:{},releaseApproval:false,catalogueCoverage:{selected:112,catalogueDigest:digestBytes(JSON.stringify(catalogue.obligations)),releaseCredit:false}};
 assert.notEqual(value.catalogueDigest,native.catalogueCoverage.catalogueDigest);
 const before=structuredClone(native);value.joint=applyApplicantResultsAdmission(native,value);
 assert.equal(value.joint.status,'separate');assert.equal(value.joint.reason,'different-catalogue');assert.equal(value.catalogueCredit,false);assert.deepEqual(native,before);
 const html=renderApplicantCompatibility(value);assert(html.includes('0 catalogue credit; runtime proof remains separate'));assert(!html.includes('3 catalogue requirements included in candidate coverage'));
});
