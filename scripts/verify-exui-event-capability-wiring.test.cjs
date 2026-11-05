const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { completeRun } = require('./fixtures/exui-release-evidence.mock.cjs');
const ROOT = path.resolve(__dirname, '..');
const SCOPE = 'exui-ccd-event-capability-pilot';
const MUTATION = 'ccd-enable-judge-event';

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

test('support only: old CCD selection excludes both new event-capability proofs', async t => {
  const { result, specs } = await collection(t, 'exui-ccd-pilot');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(specs.map(spec => path.basename(spec.file)).sort(), [
    'case-event-policy.spec.ts', 'nested-conditional.spec.ts', 'postal-conditional.spec.ts', 'role-revocation.spec.ts', 'workbasket-inputs.spec.ts',
  ]);
  const selected = await collection(t, 'exui-ccd-pilot', {}, ['event-capability.spec.ts']);
  assert.notEqual(selected.result.status, 0, 'an explicit filename must not bypass the old scope inventory');
});

test('support only: event scope selects every source-shape baseline and its exact fault', async t => {
  const baseline = await collection(t, SCOPE, { EXUI_HARNESS_SLICE: 'ccd-event-capability' });
  assert.equal(baseline.result.status, 0, baseline.result.stderr + baseline.result.stdout);
  assert.deepEqual(baseline.specs.map(spec => path.basename(spec.file)).sort(), ['courtadmin-cell.spec.ts', 'courtadmin-read.spec.ts', 'courtadmin-read.spec.ts', 'event-capability.spec.ts', 'readonly-update.spec.ts', 'source-shapes.spec.ts', 'source-shapes.spec.ts', 'source-shapes.spec.ts', 'source-shapes.spec.ts', 'source-shapes.spec.ts', 'source-shapes.spec.ts']);
  assert.deepEqual(baseline.specs.flatMap(spec => spec.tests.flatMap(item => item.annotations.filter(annotation => annotation.type === 'harness-proof').map(annotation => annotation.description))).sort(), ['ccd-courtadmin-read-recipient-shapes', 'ccd-courtadmin-update-recipient-shapes', 'ccd-event-create-denied', 'ccd-readonly-read-recipient-shapes', 'ccd-readonly-update-recipient-shapes-denied', 'ccd-source-shape-case-field-recipient-selector', 'ccd-source-shape-conditional-email-complex', 'ccd-source-shape-optional-postal-line-two', 'ccd-source-shape-postal-recipient-name', 'ccd-source-shape-recipient-collection', 'ccd-source-shape-required-delivery-radio']);
  for (const shape of ['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two']) {
    const fault = await collection(t,SCOPE,{EXUI_HARNESS_SLICE:'ccd-event-capability',EXUI_HARNESS_MUTATION:`ccd-shape-${shape}`});
    assert.equal(fault.result.status,0,fault.result.stderr+fault.result.stdout);
    assert.deepEqual(fault.specs.map(spec=>path.basename(spec.file)),['source-shapes.spec.ts']);
    assert.deepEqual(fault.specs.flatMap(spec=>spec.tests.flatMap(item=>item.annotations.filter(a=>a.type==='harness-proof').map(a=>a.description))),[`ccd-source-shape-${shape}-fault`]);
  }
  const mutant = await collection(t, SCOPE, { EXUI_HARNESS_SLICE: 'ccd-event-capability', EXUI_HARNESS_MUTATION: MUTATION });
  assert.equal(mutant.result.status, 0, mutant.result.stderr + mutant.result.stdout);
  assert.deepEqual(mutant.specs.map(spec => path.basename(spec.file)), ['event-capability.spec.ts']);
  assert.deepEqual(mutant.specs[0].tests[0].annotations.filter(annotation => annotation.type === 'harness-proof').map(({ type, description }) => ({ type, description })), [{ type: 'harness-proof', description: 'ccd-event-create-enabled' }]);
  const readFault = await collection(t, SCOPE, { EXUI_HARNESS_SLICE: 'ccd-event-capability', EXUI_HARNESS_MUTATION: 'ccd-remove-courtadmin-recipient-read' });
  assert.equal(readFault.result.status, 0, readFault.result.stderr + readFault.result.stdout);
  assert.deepEqual(readFault.specs.map(spec => path.basename(spec.file)), ['courtadmin-read.spec.ts']);
  assert.deepEqual(readFault.specs[0].tests[0].annotations.filter(annotation => annotation.type === 'harness-proof').map(({ description }) => description), ['ccd-courtadmin-read-shapes-hidden']);
  const courtadminFault = await collection(t, SCOPE, { EXUI_HARNESS_SLICE: 'ccd-event-capability', EXUI_HARNESS_MUTATION: 'ccd-remove-courtadmin-event-create' });
  assert.equal(courtadminFault.result.status, 0, courtadminFault.result.stderr + courtadminFault.result.stdout);
  assert.deepEqual(courtadminFault.specs.map(spec => path.basename(spec.file)), ['courtadmin-cell.spec.ts']);
  assert.deepEqual(courtadminFault.specs.flatMap(spec => spec.tests.flatMap(item => item.annotations.filter(annotation => annotation.type === 'harness-proof').map(annotation => annotation.description))), ['ccd-courtadmin-update-recipient-shapes-denied']);
  const updateFault = await collection(t, SCOPE, { EXUI_HARNESS_SLICE: 'ccd-event-capability', EXUI_HARNESS_MUTATION: 'ccd-enable-readonly-recipient-update' });
  assert.equal(updateFault.result.status, 0, updateFault.result.stderr + updateFault.result.stdout);
  assert.deepEqual(updateFault.specs.map(spec => path.basename(spec.file)), ['readonly-update.spec.ts']);
  assert.deepEqual(updateFault.specs.flatMap(spec => spec.tests.flatMap(item => item.annotations.filter(annotation => annotation.type === 'harness-proof').map(annotation => annotation.description))), ['ccd-readonly-update-recipient-shapes-enabled']);
  const readonlyFault = await collection(t, SCOPE, { EXUI_HARNESS_SLICE: 'ccd-event-capability', EXUI_HARNESS_MUTATION: 'ccd-remove-readonly-recipient-read' });
  assert.equal(readonlyFault.result.status, 0, readonlyFault.result.stderr + readonlyFault.result.stdout);
  assert.deepEqual(readonlyFault.specs.flatMap(spec => spec.tests.flatMap(item => item.annotations.filter(annotation => annotation.type === 'harness-proof').map(annotation => annotation.description))), ['ccd-readonly-read-shapes-hidden']);
  for (const [scope, env] of [
    ['exui-ccd-pilot', { EXUI_HARNESS_SLICE: 'ccd-event-capability' }],
    [SCOPE, {}],
    [SCOPE, { EXUI_HARNESS_SLICE: 'ccd-event-capability', EXUI_HARNESS_MUTATION: 'ccd-drop-child' }],
    [SCOPE, { EXUI_HARNESS_SLICE: 'ccd-event-capability', EXUI_HARNESS_SELECTION: 'candidate' }],
  ]) {
    const rejected = await collection(t, scope, env);
    assert.notEqual(rejected.result.status, 0);
    assert.match(rejected.result.stdout + rejected.result.stderr, /CCD_EVENT_CAPABILITY_(?:SCOPE|SELECTION|MUTATION)_REQUIRED/);
  }
});

test('support only: actual native proof command selects the scoped configuration without adding a gateway fault', async t => {
  const { nativeProofConfiguration } = await import('./run-harness-native-tools.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'event-native-command-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'provider-ready.json'), JSON.stringify({ cookie: 'synthetic-signed-cookie' }));
  const input = { releaseScopeId: SCOPE, browserExecutable: '/browser/chrome' };
  for (const invocation of [{ invocationId: 'baseline', kind: 'baseline', mutation: null }, { invocationId: MUTATION, kind: 'mutation', mutation: MUTATION }]) {
    const { args, env } = nativeProofConfiguration(input, invocation, directory);
    assert.deepEqual(args, ['/harness/node_modules/@playwright/test/cli.js', 'test', '--config', '/harness/playwright.harness.config.ts']);
    assert.equal(env.EXUI_HARNESS_SELECTION, 'ccd');
    assert.equal(env.EXUI_HARNESS_SLICE, 'ccd-event-capability');
    assert.equal(env.EXUI_HARNESS_MUTATION, invocation.mutation ?? undefined);
    assert.equal(env.EXUI_CCD_PERSONAS, path.join(directory, 'personas.json'));
    assert.equal(env.EXUI_CCD_EVIDENCE, directory);
    assert.equal(env.EXUI_SESSION_COOKIE, 'synthetic-signed-cookie');
    assert.equal(Object.hasOwn(env, 'EXUI_ROUTING_SESSIONS'), false);
  }
  const original = nativeProofConfiguration({ ...input, releaseScopeId: 'exui-ccd-pilot' }, { invocationId: 'ccd-drop-child', mutation: 'ccd-drop-child' }, directory);
  assert.equal(original.args.at(-1), 'nested-conditional.spec.ts');
  assert.equal(original.env.EXUI_HARNESS_SLICE, 'family');
});
test('callback exact scope collects one baseline or omission proof, without entering old event or CCD inventory',async t=>{
 const scope='exui-ccd-recipient-callback-pilot';
 for(const mutation of [undefined,'ccd-omit-recipient-mid-event']){
  const selected=await collection(t,scope,{EXUI_HARNESS_SLICE:'ccd-recipient-callback',...(mutation?{EXUI_HARNESS_MUTATION:mutation}:{})});
  assert.equal(selected.result.status,0,selected.result.stderr+selected.result.stdout);assert.equal(selected.specs.length,1);assert.equal(path.basename(selected.specs[0].file),'recipient-callback.spec.ts');
  assert.deepEqual(selected.specs[0].tests[0].annotations.filter(a=>a.type==='harness-proof').map(a=>a.description),[mutation?'callback-recipient-binding-omitted':'callback-recipient-row']);
 }
 for(const [selectedScope,env] of [[scope,{EXUI_HARNESS_SLICE:'family'}],[scope,{EXUI_HARNESS_SLICE:'ccd-recipient-callback',EXUI_HARNESS_MUTATION:'ccd-enable-judge-event'}],['exui-ccd-pilot',{EXUI_HARNESS_SLICE:'ccd-recipient-callback'}],[SCOPE,{EXUI_HARNESS_SLICE:'ccd-event-capability',EXUI_HARNESS_MUTATION:'ccd-omit-recipient-mid-event'}]])assert.notEqual((await collection(t,selectedScope,env)).result.status,0);
 assert.notEqual((await collection(t,'exui-ccd-pilot',{},['recipient-callback.spec.ts'])).result.status,0);
});
