const test=require('node:test'),assert=require('node:assert/strict');
test('native result observations require both healthy views, exact transformation and persisted associations',async()=>{
 const {assertApplicantObservation}=await import('./lib/exui-applicant-results-evidence.mjs');
 const {applicantResultDefinition,applicantResultObserved,applicantResultContract}=await import('./lib/exui-applicant-results.mjs');
 for(const variant of ['baseline','applicant-binding','applicant-label','applicant-order']){
  const definition=applicantResultDefinition(variant),observation={schemaVersion:1,kind:'native-applicant-results-observation',invocationId:variant,variant,views:{}};
  for(const [view,sheet] of [['SEARCH','SearchResultFields'],['WORKBASKET','WorkBasketResultFields']]){
   const columns=definition.sheets[sheet].map(row=>({case_field_id:row.CaseFieldID,label:row.Label,order:row.DisplayOrder}));
   observation.views[view]={useCase:view,cells:21,rows:3,references:['1111111111111111','2222222222222222','3333333333333333'],columns:columns.slice().sort((a,b)=>a.order-b.order).map(row=>row.case_field_id),applicantObserved:applicantResultObserved(view,columns),applicantExpected:applicantResultContract(view)};
  }
  assertApplicantObservation(observation,variant);
  for(const change of [r=>delete r.views.WORKBASKET,r=>r.views.SEARCH.cells=0,r=>r.views.WORKBASKET.rows=0,r=>r.views.WORKBASKET.references[0]='4444444444444444',r=>r.views.SEARCH.references[1]=r.views.SEARCH.references[0],r=>r.views.WORKBASKET.columns.reverse(),r=>r.views.SEARCH.applicantExpected.label='wrong',r=>r.views.WORKBASKET.applicantObserved.label='wrong']){
   const broken=structuredClone(observation);change(broken);assert.throws(()=>assertApplicantObservation(broken,variant),/RESULT_EVIDENCE/);
  }
  if(variant!=='baseline'){const broken=structuredClone(observation);broken.views.WORKBASKET.applicantObserved=applicantResultContract('WORKBASKET');assert.throws(()=>assertApplicantObservation(broken,variant),/RESULT_EVIDENCE/);}
 }
});
test('native applicant launcher preserves omitted default ARM64 and refuses dirty source',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'run-harness-applicant-results-candidate.mjs'),'utf8');
 assert.match(source,/selected\.ccd\.platform\?\?"linux\/arm64"/);assert.match(source,/RESULT_SOURCE_NOT_CLEAN/);
});
test('matching tampered child and manifest digests cannot replace parent pre-execution observations',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {fixture}=require('./fixtures/applicant-results-test.cjs');const {inputs,mod,digestBytes}=await fixture();
 const {validateApplicantResultsEvidence}=await import('./lib/exui-applicant-results-evidence.mjs');
 for(const key of ['resultExpectedDigest','resultDatesDigest','resultDescriptorDigests','definitionImportDigest']){
  const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'results-capture-mutation-'));
  const write=(relative,value)=>{const file=path.join(directory,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));return {path:relative,digest:digestBytes(fs.readFileSync(file))};};
  try{
   const baseline=structuredClone(inputs[0]);const expected={nativeAuthority:true,runId:baseline.runId,releaseScopeId:baseline.releaseScopeId};
   expected.applicantControllerTerminal=write('independent-controller-terminal.json',{schemaVersion:1,runId:expected.runId,terminal:{code:0,signal:null}});
   const before={capturedBeforeExecution:true,invocationId:'baseline',expected,...Object.fromEntries(['resultExpectedDigest','resultDatesDigest','resultDescriptorDigests','definitionImportDigest'].map(name=>[name,baseline[name]]))};
   const expectation=write('independent-results-baseline.json',before);
   baseline[key]=key==='resultDescriptorDigests'?{...baseline[key],definition:'sha256:'+'9'.repeat(64)}:'sha256:'+'9'.repeat(64);
   if(key==='resultExpectedDigest'){baseline.resultExpected={SEARCH:{changed:true},WORKBASKET:{}};baseline[key]=digestBytes(JSON.stringify(baseline.resultExpected));}
   const input=write('input.json',baseline);write('baseline/manifest.json',{runtimeMetadata:{[key]:baseline[key]}});
   expected.applicantResultsCapture=write('independent-results-capture.json',{schemaVersion:1,completedAfterController:true,baselineInputDigest:input.digest,invocations:mod.applicantResultSequence.map(invocationId=>({invocationId,...(invocationId==='baseline'?{expectation}:{})}))});
   assert.throws(()=>validateApplicantResultsEvidence(directory,expected,{executions:mod.applicantResultSequence.map(invocationId=>({invocationId}))},{code:0,signal:null}),/RESULT_EVIDENCE_INDEPENDENT_OBSERVATION_DIGEST/);
   assert.throws(()=>validateApplicantResultsEvidence(directory,expected,{executions:[]},{code:1,signal:null}),/RESULT_EVIDENCE_OBSERVED_TERMINAL/);
  }finally{fs.rmSync(directory,{recursive:true});}
 }
});
test('standalone result summary withdraws acceptance on final cleanup failure and guards immutable inputs before output creation',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'run-harness-applicant-results.mjs'),'utf8');
 assert.match(source,/status:'BLOCKED',nativeRuntimeAcceptance:false/);
 const terminalGuard=source.indexOf("assert.deepEqual(execution.terminal,{code:0,signal:null},'RESULT_CONTROLLER_FAILED')"),finalCleanup=source.indexOf("phase='validate-final-cleanup';removePrior()");
 assert(terminalGuard>=0&&finalCleanup>=0&&terminalGuard<finalCleanup);
 assert.match(source,/if\(!clean\)\{summary.status='BLOCKED';summary.nativeRuntimeAcceptance=false;\}/);
 assert(source.indexOf('verifyCandidateArtifact(candidate)')<source.indexOf('output=createFreshHarnessOutput'));
 assert.match(source,/createFreshHarnessOutput\(output,\[artifact.candidateRoot,candidate,browserRoot/);
 assert.match(source,/\['baseArchive','derivedArchive','artifactRoot'\]\.map/);
});
