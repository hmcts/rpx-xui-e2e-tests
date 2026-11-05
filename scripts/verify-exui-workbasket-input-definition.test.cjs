const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const load = () => import('./lib/exui-workbasket-input-definition.mjs');

test('source-bound workbasket import retains all ten pinned input rows and their dependencies without credit', async () => {
  const { buildWorkbasketInputDefinition, validateWorkbasketInputDefinition } = await load();
  const source = JSON.parse(fs.readFileSync('scripts/fixtures/ccd/workbasket-input.source.json'));
  const { definitionDigest } = await import('./lib/exui-definition-references.mjs');
  const definition = buildWorkbasketInputDefinition();
  const normalize = row => ({ ...row, CaseTypeID: 'HarnessResultsPRL' });
  assert.deepEqual(definition.sheets.WorkBasketInputFields, source.sources[0].rows.map(item => normalize(item.row)));
  assert.equal(definition.sheets.WorkBasketInputFields.length, 10);
  assert.equal(definition.sheets.FixedLists.length, 22);
  for (const item of source.sources.slice(1, 3).flatMap(file => file.rows)) {
    assert.deepEqual(definition.sheets.CaseField.find(row => row.ID === item.row.ID), normalize(item.row));
  }
  assert.deepEqual(definition.sheets.FixedLists, source.sources[3].rows.map(item => item.row));
  assert.deepEqual(definition.workbasketInputBindings.map(item => item.obligationId), source.sources[0].rows.map(item =>
    'configuration-shape:' + definitionDigest({ source: 'prl-ccd-definitions:' + source.sources[0].path, row: item.row }).slice(7)));
  assert(definition.bindings.every(item => item.obligationId.startsWith('configuration-shape:')));
  for (const key of ['runtimeAcceptance', 'catalogueCredit', 'releaseCredit']) assert.equal(definition[key], false);
  validateWorkbasketInputDefinition(definition);
});

test('source-bound workbasket definition rejects changed rows, dependencies and credit flags', async () => {
  const { buildWorkbasketInputDefinition, validateWorkbasketInputDefinition } = await load();
  for (const change of [
    value => { value.sheets.WorkBasketInputFields[1].FieldShowCondition = 'wrong'; },
    value => { value.sheets.CaseField.find(row => row.ID === 'dfjArea').FieldType = 'Text'; },
    value => { value.sheets.FixedLists[0].ListElement = 'wrong'; },
    value => { value.workbasketInputBindings.pop(); },
    value => { value.catalogueCredit = true; },
  ]) {
    const altered = buildWorkbasketInputDefinition();
    change(altered);
    assert.throws(() => validateWorkbasketInputDefinition(altered), /WORKBASKET_INPUT_DEFINITION_DRIFT/);
  }
});

test('workbasket workbook preparation is deterministic and refuses output reuse', async t => {
  const { prepareWorkbasketInputDefinition } = await import('./prepare-harness-workbasket-input.mjs');
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workbasket-input-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const first = path.join(parent, 'first'), second = path.join(parent, 'second');
  const binding = await prepareWorkbasketInputDefinition(first);
  assert.deepEqual(await prepareWorkbasketInputDefinition(second), binding);
  assert.deepEqual(fs.readFileSync(path.join(first, 'definition.xlsx')), fs.readFileSync(path.join(second, 'definition.xlsx')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(first, 'definition.json'))).sheets.WorkBasketInputFields.length, 10);
  assert.equal(binding.catalogueCredit, false);
  await assert.rejects(prepareWorkbasketInputDefinition(first));
});

test('real CCD workbasket descriptor binds source rows, field types and fixed-list choices', async () => {
  const { validateWorkbasketInputDescriptor } = await import('./lib/exui-workbasket-input-import.mjs');
  const { buildWorkbasketInputDefinition } = await load();
  const observed = JSON.parse(fs.readFileSync('scripts/fixtures/ccd/workbasket-input.observed.json'));
  const definition = buildWorkbasketInputDefinition();
  assert.equal(validateWorkbasketInputDescriptor(observed, definition).length, 10);
  for (const change of [
    value => { value.workbasketInputs[0].label = 'Changed area'; },
    value => { value.workbasketInputs[1].field.show_condition = null; },
    value => { value.workbasketInputs[2].field.field_type.fixed_list_items[0].code = 'WRONG'; },
    value => { value.workbasketInputs[3].order = 4; },
    value => { value.workbasketInputs[4].field.field_type.type = 'Text'; },
    value => { value.workbasketInputs.pop(); },
  ]) {
    const altered = structuredClone(observed);
    change(altered);
    assert.throws(() => validateWorkbasketInputDescriptor(altered, definition));
  }
});

test('workbasket importer uses the real CCD V2 route and records no catalogue credit', async t => {
  const { importWorkbasketInputs } = await import('./lib/exui-workbasket-input-import.mjs');
  const runtime = await import('./lib/exui-ccd-runtime.mjs');
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workbasket-import-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const pins = runtime.ccdImagePins();
  const state = { owner: 'harness-workbasket-test', namespace: 'a'.repeat(64), output: parent,
    images: Object.fromEntries(Object.entries(pins).map(([name, pin]) => [name,
      { id: pin.manifestDigest, architecture: 'arm64', repoDigests: [pin.reference] }])),
    containers: Object.fromEntries(Object.keys(pins).map(name => [name, name === 'database' ? 'a'.repeat(64) : name])) };
  const identities = runtime.ccdRuntimeImageIds(state);
  const inspectContainer = id => {
    const service = Object.keys(state.containers).find(name => state.containers[name] === id);
    return { Image: identities[service], Config: { Labels: { 'exui.harness.owner': state.owner,
      'exui.harness.service': service } }, HostConfig: { NetworkMode: service === 'database' ? 'none' : `container:${state.namespace}` }, State: { Running: true } };
  };
  const observed = JSON.parse(fs.readFileSync('scripts/fixtures/ccd/workbasket-input.observed.json'));
  const calls = [];
  const request = (_state, port, route, options = {}) => {
    calls.push({ port, route, headers: options.headers });
    if (route === '/testing-support/accounts') return { status: 201, body: {} };
    if (route === '/o/token') return { status: 200, body: { access_token: 'synthetic-token' } };
    if (route === '/details') return { status: 200, body: { id: 'observer-id' } };
    if (route === '/testing-support/lease') return { status: 200, body: 'synthetic-service-token' };
    if (route === '/api/user-role') return { status: 201, body: {} };
    if (route === '/import') return { status: 201, body: {} };
    if (route === '/api/data/case-type/HarnessResultsPRL') return { status: 200, body: { id: 'HarnessResultsPRL' } };
    if (route === '/internal/case-types/HarnessResultsPRL/work-basket-inputs') return { status: 200, body: observed };
    throw Error('Unexpected request');
  };
  const receipt = await importWorkbasketInputs(state, { request, inspectContainer });
  assert.equal(receipt.status, 'import-and-inputs-observed');
  assert.equal(receipt.catalogueCredit, false);
  assert.equal(receipt.bindings.length, 10);
  assert.equal(receipt.observations.inputs.status, 200);
  assert(calls.some(call => call.port === 4452 && call.headers.experimental === 'true' &&
    call.headers.accept.includes('ui-workbasket-input-details.v2+json')));
  assert(!JSON.stringify(receipt).includes('synthetic-token'));
  await assert.rejects(importWorkbasketInputs(state, { request, inspectContainer }), /EEXIST/);
});
