const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {completeRun}=require('./fixtures/exui-release-evidence.mock.cjs');
const ROOT=path.resolve(__dirname,'..');
const SCOPE='exui-ccd-applicant-results-pilot';
const variants=['baseline','applicant-binding','applicant-label','applicant-order'];
function directory(t) {const value=fs.mkdtempSync(path.join(os.tmpdir(),'applicant-wiring-'));t.after(()=>fs.rmSync(value,{recursive:true,force:true}));return value;}

test('native applicant tools select only the CCD applicant slice for all four invocations',async t=>{
 const {nativeProofConfiguration}=await import('./run-harness-native-tools.mjs');
 const root=directory(t);fs.writeFileSync(path.join(root,'provider-ready.json'),JSON.stringify({cookie:'synthetic'}));
 for(const variant of variants) {
  const invocation={invocationId:variant,...(variant==='baseline'?{}:{mutation:variant})};
  const config=nativeProofConfiguration({releaseScopeId:SCOPE,browserExecutable:'/browser/chromium'},invocation,root);
  assert.equal(config.env.EXUI_HARNESS_SELECTION,'ccd');assert.equal(config.env.EXUI_HARNESS_SLICE,'ccd-applicant-results');
  assert.equal(config.env.EXUI_CCD_RESULTS_INPUT,path.join(root,'result-input.json'));
  assert.equal(config.env.EXUI_HARNESS_MUTATION,invocation.mutation);
 }
});

test('native applicant gateway requires explicit result transport and forbids synthetic gateway faults',async()=>{
 const {startCcdGateway}=await import('./lib/exui-ccd-browser-runtime.mjs');
 await assert.rejects(startCcdGateway('/unused',{},null,SCOPE),/APPLICANT_RESULTS_GATEWAY_REQUIRED/);
 await assert.rejects(startCcdGateway('/unused',{},'applicant-label',SCOPE,{resultColumns:true}),/RESULT_UI_BASELINE_ONLY/);
 await assert.rejects(startCcdGateway('/unused',{},null,SCOPE,{resultColumns:true,workbasket:true}),/RESULT_UI_GATEWAY_EXCLUSIVE/);
});

test('provider binds expectations to the parent-captured backend receipt and typed dates',async t=>{
 const {validateApplicantResultsInput}=await import('./run-harness-native-tools.mjs');
 const {applicantResultDateRecord,expectedApplicantResultDates}=await import('./lib/exui-applicant-result-dates.mjs');
 const {resultsSupportingScaffold,resultsSupportingScaffoldDigest}=await import('./lib/exui-results-ui-contract.mjs');
 const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const root=directory(t),invocation={invocationId:'baseline'},output=path.join(root,'baseline');fs.mkdirSync(output);
 const ccd={owner:'harness-'+ 'a'.repeat(16),namespace:'b'.repeat(64),images:{data:{id:'sha256:'+'c'.repeat(64)},definition:{id:'sha256:'+'d'.repeat(64)}}};
 const definition={definitionVersion:1,fixtureDigest:'sha256:'+'e'.repeat(64)};
 const expected={SEARCH:{marker:'search'},WORKBASKET:{marker:'workbasket'}};
 const backend={status:'both-use-cases-observed',observations:Object.fromEntries(Object.entries(expected).map(([view,body])=>[view,{body}]))};
 const bytes=JSON.stringify(backend);fs.writeFileSync(path.join(output,'backend-search.json'),bytes);
 const input={variant:'baseline',ccd,definition,storedResultDates:applicantResultDateRecord(expectedApplicantResultDates(1),ccd,1,{workbookDigest:definition.fixtureDigest}),supportingScaffold:resultsSupportingScaffold(),supportingScaffoldDigest:resultsSupportingScaffoldDigest(),resultExpected:expected,resultExpectedDigest:digestBytes(JSON.stringify(expected)),resultBackendReceipt:{path:'baseline/backend-search.json',digest:digestBytes(bytes)}};
 validateApplicantResultsInput(input,invocation,output);
 for(const change of [
  x=>{x.resultBackendReceipt.path='../backend-search.json';},
  x=>{x.resultBackendReceipt.digest='sha256:'+'f'.repeat(64);},
  x=>{x.resultExpected.SEARCH.marker='self-authored';x.resultExpectedDigest=digestBytes(JSON.stringify(x.resultExpected));},
  x=>{x.storedResultDates.rows[0].live_from='2020-01-01';},
  x=>{x.variant='applicant-label';},
 ]) {const altered=structuredClone(input);change(altered);assert.throws(()=>validateApplicantResultsInput(altered,invocation,output));}
});

test('Playwright discovers one aggregate applicant proof and rejects cross-scope selection',async t=>{
 const root=directory(t),{manifest}=completeRun();
 const policy=(await import('./lib/exui-release-policy.mjs')).getReleasePolicy(SCOPE);
 Object.assign(manifest,{releaseScopeId:SCOPE,policyDigest:policy.policyDigest,requiredObligationIds:policy.requiredObligationIds});
 const file=path.join(root,'manifest.json');fs.writeFileSync(file,JSON.stringify(manifest));
 const collect=extra=>spawnSync(process.execPath,[path.join(ROOT,'node_modules/@playwright/test/cli.js'),'test','--config','playwright.harness.config.ts','--list','--reporter=json'],{cwd:ROOT,encoding:'utf8',env:{PATH:process.env.PATH,EXUI_HARNESS_SELECTION:'ccd',EXUI_HARNESS_SLICE:'ccd-applicant-results',EXUI_CANDIDATE_RUN_MANIFEST:file,EXUI_CANDIDATE_URL:'http://127.0.0.1:3100',EXUI_EVIDENCE_CONTEXT:path.join(root,'context.json'),EXUI_EVIDENCE_REPORT:path.join(root,'report.json'),...extra}});
 for(const variant of variants) {
  const result=collect(variant==='baseline'?{}:{EXUI_HARNESS_MUTATION:variant});assert.equal(result.status,0,result.stderr+result.stdout);
  const report=JSON.parse(result.stdout),specs=[];const visit=s=>{specs.push(...(s.specs??[]));for(const child of s.suites??[])visit(child);};report.suites.forEach(visit);
  assert.equal(specs.length,1);assert.equal(path.basename(specs[0].file),'applicant-results.spec.ts');
  const proof=specs[0].tests[0].annotations.filter(a=>a.type==='harness-proof').map(a=>a.description);
  assert.deepEqual(proof,['ccd-applicant-results-source-contract'+(variant==='baseline'?'':'-'+variant)]);
  assert.equal(specs[0].tests[0].results.length,0);
 }
 for(const extra of [{EXUI_HARNESS_SELECTION:'candidate'},{EXUI_HARNESS_SLICE:'ccd-event-capability'},{EXUI_HARNESS_MUTATION:'ccd-drop-child'}]) assert.notEqual(collect(extra).status,0);
});
