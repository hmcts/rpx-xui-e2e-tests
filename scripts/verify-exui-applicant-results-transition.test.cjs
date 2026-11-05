const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const hash=n=>'sha256:'+String(n).padStart(64,'0');
const {fixture}=require('./fixtures/applicant-results-test.cjs');
test('results transitions require exact order, fresh runtime and preserved baseline identity',async()=>{
 const {mod,inputs,record}=await fixture();
 for(let index=1;index<4;index++)assert.deepEqual(mod.selectApplicantResultRuntime(inputs[0],inputs[index].variant,record(index)),inputs[index]);
 for(const edit of [r=>r.invocationId='applicant-order',r=>r.runId='other',r=>r.request.priorInvocationId='applicant-label',r=>r.runtime.definition.fixtureDigest=hash(99),r=>r.runtime.ccd.namespace=inputs[0].ccd.namespace,r=>r.runtime.ccd.images.data.id=hash(99),r=>r.runtime.storedResultDates.rows[0].live_from='2020-01-01',r=>r.runtime.harnessSourceDigest=hash(99),r=>r.runtime.credentials.allowed={headers:{Authorization:'Bearer other'}},r=>r.runtime.resultExpected={SEARCH:[]}]){
  const value=structuredClone(record(1));edit(value);assert.throws(()=>mod.selectApplicantResultRuntime(inputs[0],'applicant-binding',value));
 }
 assert.throws(()=>mod.applicantResultTransitionRequest(inputs[0],'applicant-order',inputs[0]),/RESULT_TRANSITION_VARIANT/);
});
test('results ACK publication is immutable; wait rejects wrong request, cancellation and timeout',async()=>{
 const {mod,inputs,record}=await fixture();const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'results-transition-test-'));
 try{
  mod.publishApplicantResultRuntime(output,record(1));assert.throws(()=>mod.publishApplicantResultRuntime(output,record(1)),/EEXIST/);
  assert.deepEqual(await mod.waitForApplicantResultRuntime(inputs[0],output,'applicant-binding',inputs[0]),inputs[1]);
  await assert.rejects(mod.waitForApplicantResultRuntime(inputs[0],output,'applicant-binding',inputs[0],{isCancelled:()=>true}),/RESULT_TRANSITION_CANCELLED/);
  await assert.rejects(mod.waitForApplicantResultRuntime(inputs[0],output,'applicant-label',inputs[1],{timeoutMs:0}),/RESULT_TRANSITION_ACK_TIMEOUT/);
  const wrong=record(2);wrong.request.priorNamespace='9'.repeat(64);mod.publishApplicantResultRuntime(output,wrong);
  await assert.rejects(mod.waitForApplicantResultRuntime(inputs[0],output,'applicant-label',inputs[1]),/RESULT_TRANSITION_REQUEST/);
 }finally{fs.rmSync(output,{recursive:true});}
});
test('parent watcher enforces fixed three transitions and immutable already-observed requests',async()=>{
 const {mod,inputs,record}=await fixture();const {createApplicantResultWatcher}=await import('./lib/exui-applicant-results-watch.mjs');
 const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'results-watch-test-'));const calls=[];
 const state=()=>({input:inputs[0],handoff:{},expected:{nativeAuthority:true},isTerminated:()=>false});
 const check=createApplicantResultWatcher(output,async request=>{calls.push(request.invocationId);return record(mod.applicantResultSequence.indexOf(request.invocationId));},state);
 const write=index=>fs.writeFileSync(path.join(output,`results-transition-${inputs[index].variant}.json`),JSON.stringify(record(index).request));
 try{for(let index=1;index<4;index++){write(index);await check();await check();}assert.deepEqual(calls,mod.applicantResultSequence.slice(1));
  write(1);await assert.rejects(check(),/RESULT_TRANSITION_REQUEST_CHANGED/);
 }finally{fs.rmSync(output,{recursive:true});}
});
test('parent watcher rejects premature, out-of-order, terminated and failed preparation without advancing',async()=>{
 const {inputs,record}=await fixture();const {createApplicantResultWatcher}=await import('./lib/exui-applicant-results-watch.mjs');
 for(const mode of ['before-preparation','out-of-order','terminated','failed-import']){
  const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'results-watch-negative-'));
  try{const index=mode==='out-of-order'?2:1;fs.writeFileSync(path.join(output,`results-transition-${inputs[index].variant}.json`),JSON.stringify(record(index).request));let calls=0;
   const check=createApplicantResultWatcher(output,async()=>{calls++;throw Error('RESULT_IMPORT_REJECTED');},()=>({input:inputs[0],handoff:{},expected:mode==='before-preparation'?undefined:{},isTerminated:()=>mode==='terminated'}));
   await assert.rejects(check(),/RESULT_/);assert.equal(calls,mode==='failed-import'?1:0);
  }finally{fs.rmSync(output,{recursive:true});}
 }
});
test('baseline cannot execute until independent source-bound capture is present',async()=>{
 const {mod,inputs}=await fixture();const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'results-baseline-capture-'));
 try{
  await assert.rejects(mod.waitForApplicantResultBaselineCapture(inputs[0],output,{timeoutMs:0}),/RESULT_BASELINE_CAPTURE_TIMEOUT/);
  await assert.rejects(mod.waitForApplicantResultBaselineCapture(inputs[0],output,{isCancelled:()=>true}),/RESULT_TRANSITION_CANCELLED/);
  const input=inputs[0],capture={capturedBeforeExecution:true,expected:{runId:input.runId,harnessCommit:input.harnessCommit,releaseScopeId:input.releaseScopeId,harnessSourceDigest:input.harnessSourceDigest},definition:input.definition,ccd:input.ccd};
  fs.writeFileSync(path.join(output,'independent-results-baseline.json'),JSON.stringify(capture));await mod.waitForApplicantResultBaselineCapture(input,output);
  capture.expected.runId='other';fs.writeFileSync(path.join(output,'independent-results-baseline.json'),JSON.stringify(capture));await assert.rejects(mod.waitForApplicantResultBaselineCapture(input,output),/RESULT_BASELINE_CAPTURE_IDENTITY/);
 }finally{fs.rmSync(output,{recursive:true});}
});
