const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { completeRun } = require('./fixtures/exui-release-evidence.mock.cjs');
const ROOT = path.resolve(__dirname, '..');
const SCOPE = 'exui-shared-nested-renderer-pilot';

async function collection(t, scope, extraEnv = {}, extraArgs = []) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'event-proof-selection-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { manifest } = completeRun();
  const policy = (await import('./lib/exui-release-policy.mjs')).getReleasePolicy(scope);
  Object.assign(manifest, { releaseScopeId: scope, policyDigest: policy.policyDigest, requiredObligationIds: policy.requiredObligationIds });
  const manifestFile = path.join(directory, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const reportFile = path.join(directory, 'proof-report.json');
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.harness.config.ts', '--list', '--reporter=json', ...extraArgs,
  ], { cwd: ROOT, encoding: 'utf8', env: {
    PATH: process.env.PATH,
    EXUI_HARNESS_SELECTION: 'ccd', EXUI_CANDIDATE_RUN_MANIFEST: manifestFile,
    EXUI_CANDIDATE_URL: 'http://127.0.0.1:3100', EXUI_EVIDENCE_CONTEXT: path.join(directory, 'context.json'),
    EXUI_EVIDENCE_REPORT: reportFile, ...extraEnv,
  } });
  assert.equal(fs.existsSync(reportFile), false, 'collection must not execute or finalize evidence');
  if (result.status !== 0) return { result };
  const report = JSON.parse(result.stdout), specs = [];
  const visit = suite => { specs.push(...(suite.specs ?? [])); for (const child of suite.suites ?? []) visit(child); };
  for (const suite of report.suites) visit(suite);
  assert.deepEqual(report.errors, []);
  assert(specs.every(spec => spec.tests.every(item => item.results.length === 0)));
  return { result, specs };
}


test('standalone renderer selects exactly four facets or one precise fault and cannot enter default CCD',async t=>{
 const all=await collection(t,SCOPE,{EXUI_HARNESS_SLICE:'ccd-shared-nested'});assert.equal(all.result.status,0,all.result.stdout+all.result.stderr);
 const proofs=specs=>specs.flatMap(row=>row.tests.flatMap(item=>item.annotations.filter(a=>a.type==='harness-proof').map(a=>a.description)));
 assert.deepEqual(proofs(all.specs),['shared-nested-email-1','shared-nested-email-2','shared-nested-post-1','shared-nested-post-2']);
 for(const [mutation,proof]of [['ccd-drop-child','shared-nested-email-child-loss'],['ccd-drop-postal-optional-child','shared-nested-post-child-loss'],['shared-nested-drop-second-recipient','shared-nested-sibling-loss']]){const chosen=await collection(t,SCOPE,{EXUI_HARNESS_SLICE:'ccd-shared-nested',EXUI_HARNESS_MUTATION:mutation});assert.equal(chosen.result.status,0,chosen.result.stdout+chosen.result.stderr);assert.deepEqual(proofs(chosen.specs),[proof]);}
 for(const [scope,env,args]of [['exui-ccd-pilot',{EXUI_HARNESS_SLICE:'ccd-shared-nested'},[]],[SCOPE,{EXUI_HARNESS_SLICE:'family'},[]],[SCOPE,{EXUI_HARNESS_SLICE:'ccd-shared-nested',EXUI_HARNESS_MUTATION:'ccd-broaden-access'},[]],[SCOPE,{EXUI_HARNESS_SLICE:'ccd-shared-nested'},['nested-conditional.spec.ts']]])assert.notEqual((await collection(t,scope,env,args)).result.status,0);
 const original=await collection(t,'exui-ccd-pilot');assert.equal(original.result.status,0);assert.equal(original.specs.length,5);assert(original.specs.every(row=>!row.file.includes('shared-nested')));
});

test('all six default policy objects and their policy digests stay identical to f34fce1',async()=>{
 const {getReleasePolicy}=await import('./lib/exui-release-policy.mjs');const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 const pins=[
 ['exui-wa-family-pilot','a9c6dd75394cace607ae4bf13dc1c9091565c64fc73d95d32a4426e3cfb7b43f','08fc3dee3a5181bf7e8950850b3da345dc58cf4bc9039a544119f2dc3f69d59f'],
 ['exui-wa-scope-pilot','7f870c55aff532dbba8196503505bfbcbf48274785eefe67a2c6798aacdedfd0','1a68f3242e615eb389a5ba6f914081947db5283aa82cdac4aba788f5f9efe6d3'],
 ['exui-ccd-pilot','dd0cdf377d3a46b93ae0c8114ee6b00158b7b8b91f3de6851e76fc1a75d14a23','736324df28b414f974044bbab9cf8c5acc83eb43ea86ab47f5f278f21863c507'],
 ['exui-ccd-event-capability-pilot','8937adc94c18e03e1656d48bb1e509c994ee7b12b98082cbc25bbddacd46fda3','dc12422290003e597b89f63a07cae6970e19e71f95b4ed1299475324d5d7eebd'],
 ['exui-decentralised-routing-pilot','a0710040edd2b505a2bfcbe8c0b97c94de36420c1d9843a864d69fa6083c65c5','7c324c89cce8b6692785aa8d93ffd348354d87f65921e3e5a071608c781380dc'],
 ['exui-ccd-recipient-callback-pilot','027e4e0834de7b3a947d2cecae2c93139875fc3af657ee9494640387a747250b','02f8e50a2c1928fcd9b62c3d458be4a33a785a40deb344cea98fe94114c38af9']];
 for(const [name,policy,object]of pins){const actual=getReleasePolicy(name);assert.equal(actual.policyDigest,'sha256:'+policy);assert.equal(digestBytes(JSON.stringify(actual)),'sha256:'+object);}
 assert.deepEqual(getReleasePolicy('exui-ccd-pilot').obligations.flatMap(row=>row.requiredProofIds).sort(),['ccd-nested-roundtrip','ccd-postal-two-roundtrip','ccd-prl-workbasket-inputs','ccd-role-policy','ccd-role-revocation']);
 const calls=[];await(await import('./run-harness-ci.mjs')).runFixedCiPilots({phase:async name=>{calls.push(name);return {status:'PASS',exitCode:0}},derive:async()=>{},start:async()=>{},stop:async()=>{},startEvent:async()=>{},stopEvent:async()=>{},startCallback:async()=>{},stopCallback:async()=>{}});assert.deepEqual(calls,['family','scope','ccd','eventCapability','routing','recipientCallback','selectorEventRow']);
});

test('lightweight standalone policy pins the unchanged full reviewed renderer contract',async()=>{
 const {SHARED_NESTED_CONTRACT_DIGEST}=await import('./lib/exui-shared-nested-scope.mjs');
 const {sharedNestedContract}=await import('./lib/exui-shared-nested-contract.mjs');const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
 assert.equal(digestBytes(JSON.stringify(sharedNestedContract())),SHARED_NESTED_CONTRACT_DIGEST);
});

test('actual producer configuration keeps standalone gateway options and browser slice distinct',async t=>{
 const {nativeCcdGatewayArguments,nativeProofConfiguration}=await import('./run-harness-native-tools.mjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shared-nested-producer-config-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));fs.writeFileSync(path.join(directory,'provider-ready.json'),JSON.stringify({cookie:'synthetic-fixed-session'}));
 for(const mutation of [null,'ccd-drop-child','ccd-drop-postal-optional-child','shared-nested-drop-second-recipient']) {
  const input={releaseScopeId:SCOPE,browserExecutable:'/browser/chromium'},invocation={mutation};
  assert.deepEqual(nativeCcdGatewayArguments(input,invocation),[mutation,SCOPE,{}]);
  const proof=nativeProofConfiguration(input,invocation,directory);
  assert.equal(proof.env.EXUI_HARNESS_SELECTION,'ccd');assert.equal(proof.env.EXUI_HARNESS_SLICE,'ccd-shared-nested');
  assert.equal(proof.env.EXUI_HARNESS_MUTATION,mutation??undefined);assert.equal(proof.args.at(-1),'shared-nested-renderer.spec.ts');
 }
 for(const [input,expected,slice]of [[{releaseScopeId:'exui-ccd-pilot'}, {},'family'],[{releaseScopeId:'exui-ccd-pilot',workbasket:true},{workbasket:true},'family'],[{releaseScopeId:'exui-ccd-recipient-callback-pilot'},{recipientCallback:{invocationId:'recipient-callback-native'}},'ccd-recipient-callback'],[{releaseScopeId:'exui-ccd-applicant-results-pilot'},{resultColumns:true},'ccd-applicant-results'],[{releaseScopeId:'exui-ccd-selector-event-row-pilot'}, {},'ccd-selector-event-row']]) {
  assert.deepEqual(nativeCcdGatewayArguments(input,{mutation:null}),[null,input.releaseScopeId,expected]);
  assert.equal(nativeProofConfiguration(input,{mutation:null},directory).env.EXUI_HARNESS_SLICE,slice);
  if(input.releaseScopeId==='exui-ccd-selector-event-row-pilot')assert.deepEqual(nativeCcdGatewayArguments(input,{mutation:'ccd-hide-selector-summary'}),[null,input.releaseScopeId,{}]);
 }
});
