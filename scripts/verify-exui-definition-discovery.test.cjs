const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { before, describe, test } = require('node:test');

function temporary(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'definition-discovery-')));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const harness = path.join(root, 'harness');
  fs.mkdirSync(harness, { mode: 0o700 });
  return { root, harness };
}

describe('private source diagnostic output', () => {
  let create;
  before(async () => {
    create = (await import('./lib/exui-output-boundary.mjs')).createPrivateSourceDiagnosticOutput;
    assert.equal(typeof create, 'function', 'private source diagnostic factory is required');
  });

  test('fresh owned output and raw files are private without a public summary', async (t) => {
    const { root, harness } = temporary(t);
    const output = path.join(root, 'output');
    assert.equal(create(output, harness, [harness]), output);
    const info = fs.statSync(output);
    assert.equal(info.mode & 0o777, 0o700);
    assert.equal(info.uid, process.getuid());
    const { writeJsonAtomic } = await import('./lib/exui-evidence-io.mjs');
    writeJsonAtomic(path.join(output, 'inventory.json'), { data: 'source-only' });
    assert.equal(fs.statSync(path.join(output, 'inventory.json')).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(output), ['inventory.json']);
  });

  test('existing destination preserves its marker', (t) => {
    const { root, harness } = temporary(t);
    const output = path.join(root, 'output');
    fs.mkdirSync(output, { mode: 0o700 });
    fs.writeFileSync(path.join(output, 'marker'), 'preserve');
    assert.throws(() => create(output, harness, [harness]), /FRESH_SOURCE_DIAGNOSTIC_OUTPUT_REQUIRED/);
    assert.equal(fs.readFileSync(path.join(output, 'marker'), 'utf8'), 'preserve');
  });

  test('output and existing-parent aliases reject before any creation', (t) => {
    const { root, harness } = temporary(t);
    const target = path.join(root, 'target');
    fs.mkdirSync(target, { mode: 0o700 });
    const alias = path.join(root, 'alias');
    fs.symlinkSync(target, alias);
    for (const output of [alias, path.join(alias, 'new')]) {
      assert.throws(() => create(output, harness, [harness]), /SOURCE_DIAGNOSTIC_OUTPUT_ALIAS/);
    }
    assert.deepEqual(fs.readdirSync(target), []);
  });

  test('input ancestors, descendants and the review file are protected', (t) => {
    const { root, harness } = temporary(t);
    const source = path.join(root, 'source');
    fs.mkdirSync(source, { mode: 0o700 });
    const review = path.join(source, 'review.json');
    fs.writeFileSync(review, '{}');
    for (const [output, inputs] of [
      [path.join(source, 'new'), [source]],
      [path.join(root, 'ancestor'), [path.join(root, 'ancestor', 'source')]],
      [review, [review]],
    ]) {
      assert.throws(() => create(output, harness, inputs), /SOURCE_DIAGNOSTIC_OUTPUT_IMMUTABLE_INPUT_OVERLAP/);
    }
    assert.equal(fs.readFileSync(review, 'utf8'), '{}');
    assert.deepEqual(fs.readdirSync(source), ['review.json']);
    assert(!fs.existsSync(path.join(root, 'ancestor')));
  });

  test('known public report roots reject independently of source overlap', (t) => {
    const { root, harness } = temporary(t);
    for (const relative of ['functional-output/tests/harness/public', 'playwright-report', 'test-results/odhin-report']) {
      const output = path.join(harness, relative);
      fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
      assert.throws(() => create(output, harness, [harness]), /SOURCE_DIAGNOSTIC_PUBLIC_OUTPUT_FORBIDDEN/);
      assert(!fs.existsSync(output));
    }
    assert(fs.existsSync(root));
  });

  test('filesystem root input protects every descendant', (t) => {
    const { root, harness } = temporary(t);
    const output = path.join(root, 'new');
    assert.throws(() => create(output, harness, ['/']), /SOURCE_DIAGNOSTIC_OUTPUT_IMMUTABLE_INPUT_OVERLAP/);
    assert(!fs.existsSync(output));
  });

  test('canonical target of a public report alias remains forbidden', (t) => {
    const { root, harness } = temporary(t);
    const target = path.join(root, 'public-target');
    fs.mkdirSync(target, { mode: 0o700 });
    fs.writeFileSync(path.join(target, 'marker'), 'preserve');
    fs.symlinkSync(target, path.join(harness, 'playwright-report'));
    assert.throws(() => create(path.join(target, 'new'), harness, []), /SOURCE_DIAGNOSTIC_PUBLIC_OUTPUT_FORBIDDEN/);
    assert.deepEqual(fs.readdirSync(target), ['marker']);
    assert.equal(fs.readFileSync(path.join(target, 'marker'), 'utf8'), 'preserve');
  });

  test('unsafe or missing parents reject without making directories', (t) => {
    const { root, harness } = temporary(t);
    const unsafe = path.join(root, 'unsafe');
    fs.mkdirSync(unsafe, { mode: 0o755 });
    fs.chmodSync(unsafe, 0o755);
    for (const parent of [unsafe, path.join(root, 'missing')]) {
      assert.throws(() => create(path.join(parent, 'output'), harness, [harness]), /SOURCE_DIAGNOSTIC_OUTPUT_PRIVATE_PARENT_REQUIRED/);
      assert(!fs.existsSync(path.join(parent, 'output')));
    }
  });
});

function sourceRepository(t, files = { 'CaseType.json': [{ ID: 'Example' }], 'CaseEvent/CaseEvent.json': [{ CaseTypeID: 'Example', ID: 'create' }] }) {
  const { root } = temporary(t);
  const source = path.join(root, 'source'); fs.mkdirSync(source, { mode: 0o700 });
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0' };
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Harness fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: source, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const definitionRoot = 'definitions/private-law/json';
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(source, definitionRoot, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value));
  }
  git('init', '-q'); git('add', '.'); git('commit', '-qm', 'Synthetic definition source fixture');
  const review = { definitionDiscovery: { schemaVersion: 1, repository: 'prl-ccd-definitions', root: definitionRoot, revision: git('rev-parse', 'HEAD'), gitTree: git('rev-parse', `HEAD:${definitionRoot}`), projection: Object.keys(files).map(name => ({ path: `${definitionRoot}/${name}`, allRows: true })) } };
  return { source, review, definitionRoot };
}

describe('definition file discovery', () => {
  let api;
  before(async () => { api = await import('./lib/exui-definition-discovery.mjs'); });
  function reviewed(fixture) {
    const observed = api.collectDefinitionDiscovery({ repositoryRoot: fixture.source, review: fixture.review });
    fixture.review.definitionDiscovery.pins = api.summarizeDefinitionDiscovery(observed).pins;
    return observed;
  }
  test('complete synthetic source has independent Git baseline and validated graph; summaries cannot focus', (t) => {
    const fixture = sourceRepository(t), observed = reviewed(fixture);
    const result = api.validateDefinitionDiscovery({ discovery: observed, review: fixture.review });
    assert.deepEqual(result.errors, []); assert.deepEqual(result.gaps, []); assert.equal(result.canFocus, true);
    const summary = api.summarizeDefinitionDiscovery(observed);
    assert.equal(summary.graphAvailable, false);
    const forged = { ...summary, graphAvailable: true, narrowingAllowed: true, canFocus: true };
    const blocked = api.validateDefinitionDiscovery({ discovery: forged, review: fixture.review });
    assert.equal(blocked.canFocus, false);
    assert(blocked.gaps.some(g => g.includes('graph-unavailable')));
  });
  test('add remove and byte changes outside the former selected files are named before narrowing', (t) => {
    const fixture = sourceRepository(t), observed = reviewed(fixture);
    const added = `${fixture.definitionRoot}/ComplexTypes/new/ComplexTypes.json`;
    fs.mkdirSync(path.dirname(path.join(fixture.source, added)), { recursive: true });
    fs.writeFileSync(path.join(fixture.source, added), '[{"ID":"New","ListElementCode":"child","FieldType":"Unknown"}]');
    let result = api.validateDefinitionDiscovery({ discovery: observed, review: fixture.review });
    assert(result.errors.includes(`definition-file-added:${added}`)); assert.equal(result.canFocus, false);
    fs.rmSync(path.join(fixture.source, added));
    const original = `${fixture.definitionRoot}/CaseType.json`, file = path.join(fixture.source, original), bytes = fs.readFileSync(file);
    fs.writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n')]));
    result = api.validateDefinitionDiscovery({ discovery: observed, review: fixture.review });
    assert(result.errors.includes(`definition-file-changed:${original}`));
    fs.rmSync(file);
    result = api.validateDefinitionDiscovery({ discovery: observed, review: fixture.review });
    assert(result.errors.includes(`definition-file-removed:${original}`));
  });
  test('decoded duplicate JSON keys, unsupported files and symlinks cannot disappear', (t) => {
    const fixture = sourceRepository(t); reviewed(fixture);
    const name = `${fixture.definitionRoot}/CaseType.json`;
    fs.writeFileSync(path.join(fixture.source, name), '[{"ID":"Example","\\u0049D":"Other"}]');
    const unknown = path.join(fixture.source, fixture.definitionRoot, 'unknown.yaml'); fs.writeFileSync(unknown, 'field: value');
    fs.symlinkSync(path.dirname(unknown), path.join(path.dirname(unknown), 'alias'));
    const observed = api.collectDefinitionDiscovery({ repositoryRoot: fixture.source, review: fixture.review });
    assert(observed.gaps.some(g => g.includes(`duplicate-json-key:${name}`)));
    assert(observed.gaps.some(g => g.includes('unsupported-extension:') && g.includes('unknown.yaml')));
    assert(observed.gaps.some(g => g.includes('nonregular-entry:') && g.includes('alias')));
    assert(observed.entries.some(e => e.path.endsWith('/alias') && e.kind === 'symlink'));
  });
  test('reviewed reference witnesses bind source, target and all candidate paths', (t) => {
    const fixture = sourceRepository(t), observed = reviewed(fixture);
    fixture.review.definitionDiscovery.referenceWitnesses = [{
      sourcePath: `${fixture.definitionRoot}/CaseEvent/CaseEvent.json`, row: 0, kind: 'case-type', target: 'Example', status: 'resolved', candidatePaths: [`${fixture.definitionRoot}/CaseType.json`],
    }];
    assert.deepEqual(api.validateDefinitionDiscovery({ discovery: observed, review: fixture.review }).errors, []);
    fixture.review.definitionDiscovery.referenceWitnesses[0].target = 'Unreviewed';
    assert(api.validateDefinitionDiscovery({ discovery: observed, review: fixture.review }).errors.some(item => item.startsWith('definition-reference-witness-drift:')));
  });

  test('missing expected Git object reports baseline unavailable rather than inventing named changes', (t) => {
    const fixture = sourceRepository(t); reviewed(fixture);
    fixture.review.definitionDiscovery.revision = 'a'.repeat(40);
    const observed = api.collectDefinitionDiscovery({ repositoryRoot: fixture.source, review: fixture.review });
    assert.equal(observed.baseline.status, 'unavailable');
    assert.deepEqual(observed.baseline.diffs, []);
    assert(api.validateDefinitionDiscovery({ discovery: observed, review: fixture.review }).gaps.some(g => g.includes('baseline-comparison-unavailable')));
  });
});

describe('definition reference graph', () => {
  let graph;
  before(async () => { graph = (await import('./lib/exui-definition-references.mjs')).buildDefinitionReferenceGraph; });
  const document = (name, values) => ({ path: `definitions/private-law/json/${name}`, format: 'array', rows: values.map((value, index) => ({ index, value })) });
  const make = (documents) => graph({ documents, projection: documents.map(({ path }) => ({ path, allRows: true })) });

  test('cross-file collection and nested references retain actual dependencies and external AddressUK boundary', () => {
    const docs = [
      document('CaseType.json', [{ ID: 'PRLAPPS' }]),
      document('CaseField/Recipients/CaseField.json', [{ CaseTypeID: 'PRLAPPS', ID: 'recipients', FieldType: 'Collection', FieldTypeParameter: 'Recipient' }]),
      document('ComplexTypes/Recipient/ComplexTypes.json', [{ ID: 'Recipient', ListElementCode: 'postal', FieldType: 'Postal' }]),
      document('ComplexTypes/Postal/ComplexTypes.json', [{ ID: 'Postal', ListElementCode: 'address', FieldType: 'AddressUK' }]),
      document('CaseEvent/Create/CaseEvent.json', [{ CaseTypeID: 'PRLAPPS', ID: 'create' }]),
      document('CaseEventToComplexTypes/Recipients/CaseEventToComplexTypes.json', [{ ID: 'Recipient', CaseTypeID: 'PRLAPPS', CaseEventID: 'create', CaseFieldID: 'recipients', ListElementCode: 'postal.address.PostCode' }]),
    ];
    const result = make(docs);
    assert(result.edges.some(e => e.kind === 'collection-type' && e.target === 'Recipient' && e.candidates.length === 1));
    assert(result.gaps.some(g => g.kind === 'external-type' && g.target === 'AddressUK.PostCode'));
    const consumer = result.nodes.find(n => n.kind === 'CaseEventToComplexTypes');
    assert(result.dependencies[consumer.id].includes(docs[2].path));
    assert(result.dependencies[consumer.id].includes(docs[3].path));
  });

  test('duplicate competing event declarations remain ambiguous rather than selecting first', () => {
    const result = make([
      document('CaseType.json', [{ ID: 'PRLAPPS' }]),
      document('CaseEvent/A/CaseEvent-prod.json', [{ ID: 'create', CaseTypeID: 'PRLAPPS' }]),
      document('CaseEvent/A/CaseEvent-nonprod.json', [{ ID: 'create', CaseTypeID: 'PRLAPPS' }]),
      document('CaseEventToFields/A/CaseEventToFields.json', [{ CaseTypeID: 'PRLAPPS', CaseEventID: 'create', CaseFieldID: 'missing' }]),
    ]);
    assert(result.edges.some(e => e.kind === 'case-event' && e.status === 'ambiguous' && e.candidates.length === 2));
    assert(result.gaps.some(g => g.kind === 'unresolved-reference' && g.target === 'PRLAPPS|missing'));
  });

  test('cycles, opaque conditions and unselected rows are named gaps', () => {
    const documents = [document('ComplexTypes/A/ComplexTypes.json', [
      { ID: 'A', ListElementCode: 'b', FieldType: 'B' },
      { ID: 'B', ListElementCode: 'a', FieldType: 'A', FieldShowCondition: 'unknown="yes"' },
    ])];
    const result = graph({ documents, projection: [{ path: documents[0].path, ids: ['A'] }] });
    for (const kind of ['reference-cycle', 'opaque-expression', 'unreviewed-row']) assert(result.gaps.some(g => g.kind === kind), kind);
  });

  test('complete reviewed case-type/event fixture has no manufactured external-type assumptions', () => {
    const result = make([document('CaseType.json', [{ ID: 'Example' }]), document('CaseEvent/CaseEvent.json', [{ CaseTypeID: 'Example', ID: 'create' }])]);
    assert.deepEqual(result.gaps, []);
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].status, 'resolved');
  });

  test('missing custom type and fixed list are named independently without guessed built-ins', () => {
    const result = make([
      document('CaseType.json', [{ ID: 'Example' }]),
      document('CaseField/CaseField.json', [
        { CaseTypeID: 'Example', ID: 'nested', FieldType: 'Collection', FieldTypeParameter: 'MissingCustomType' },
        { CaseTypeID: 'Example', ID: 'choice', FieldType: 'FixedList', FieldTypeParameter: 'MissingList' },
      ]),
    ]);
    assert(result.gaps.some(item => item.kind === 'external-type' && item.target === 'MissingCustomType'));
    assert(result.gaps.some(item => item.kind === 'unresolved-reference' && item.target === 'MissingList'));
  });

  test('unselected empty documents are named even without row nodes', () => {
    const empty = document('CaseField/Empty.json', []);
    const result = graph({ documents: [empty], projection: [] });
    assert(result.gaps.some(item => item.kind === 'unreviewed-empty-document' && item.source.path === empty.path));
    assert.deepEqual(graph({ documents: [empty], projection: [{ path: empty.path, allRows: true }] }).gaps, []);
  });

  test('singleton and unknown document shapes remain visible and projection selectors cannot miss', () => {
    const singleton = { path: 'definitions/private-law/json/CaseField/Single.json', format: 'object', rows: [] };
    const result = graph({ documents: [singleton], projection: [] });
    assert(result.gaps.some(g => g.kind === 'unsupported-document-format' && g.source.path === singleton.path));
    assert.throws(() => graph({ documents: [document('CaseType.json', [{ ID: 'A' }])], projection: [{ path: 'definitions/private-law/json/CaseType.json', ids: ['missing'] }] }), /PROJECTION_SELECTOR_NO_MATCH/);
  });
});


describe('guarded catalogue impact selection', () => {
  let catalogueApi;
  before(async () => { catalogueApi = await import('./lib/exui-configuration-catalogue.mjs'); });
  const load = () => ({ snapshot: JSON.parse(fs.readFileSync('scripts/fixtures/exui-configuration-source.json')), review: JSON.parse(fs.readFileSync('scripts/fixtures/exui-configuration-review.json')) });
  const changed = [{ repository: 'prl-ccd-definitions', path: 'definitions/private-law/json/CaseField/ServiceOfDocuments/CaseField.json' }];
  async function completeContext(t, additionalFiles = {}) {
    const fixture = sourceRepository(t, {
      'CaseType.json': [{ ID: 'Example' }],
      'CaseEvent/CaseEvent.json': [{ CaseTypeID: 'Example', ID: 'serviceOfDocuments' }],
      'AuthorisationCaseEvent/AuthorisationCaseEvent.json': [{ CaseTypeID: 'Example', CaseEventID: 'serviceOfDocuments' }],
      ...additionalFiles,
    });
    const discoveryApi = await import('./lib/exui-definition-discovery.mjs');
    const { definitionDigest } = await import('./lib/exui-definition-references.mjs');
    const { snapshot, review } = load();
    Object.assign(review, { definitionDiscovery: fixture.review.definitionDiscovery, ownerAcceptance: 'accepted', families: [], pilotRoles: [], knownValid: [], knownInvalid: [], distinctions: [], sourceSequences: [], knownValidSequences: [], knownInvalidSequences: [] });
    delete review.decentralisedRouting;
    const discovery = discoveryApi.collectDefinitionDiscovery({ repositoryRoot: fixture.source, review });
    review.definitionDiscovery.pins = discoveryApi.summarizeDefinitionDiscovery(discovery).pins;
    const defaults = structuredClone(snapshot.sources.find(item => item.path === 'config/default.json'));
    defaults.document = {};
    snapshot.sources = [defaults, ...discoveryApi.selectReviewedDefinitionSources({ discovery, review })];
    snapshot.definitionDiscovery = discovery;
    for (const key of ['sourceFileDigests', 'sourceFragmentDigests', 'sourceRevisions', 'definitionRowDigests']) review[key] = {};
    for (const source of snapshot.sources) {
      const key = `${source.repository}:${source.path}`;
      review.sourceFileDigests[key] = source.fileDigest;
      review.sourceFragmentDigests[key] = definitionDigest(source.document).slice(7);
      review.sourceRevisions[key] = source.revision;
      if (Array.isArray(source.document)) review.definitionRowDigests[key] = source.document.map(row => definitionDigest(row).slice(7));
    }
    return { fixture, snapshot, review };
  }
  test('actual corpus cardinality of named gaps survives discovery, catalogue and broad selection', async (t) => {
    const count = 165416;
    const row = { ID: 'Example', ...Object.fromEntries(Array.from({ length: count }, (_, index) => [`unreviewed${index}`, index])) };
    const context = await completeContext(t, { 'CaseType.json': [row] });
    assert.equal(context.snapshot.definitionDiscovery.graph.gaps.length, count);
    const catalogue = catalogueApi.buildConfigurationCatalogue(context.snapshot, context.review);
    const result = catalogueApi.validateConfigurationCatalogue({ ...context, catalogue });
    assert.deepEqual(result.errors, []);
    assert.equal(result.gaps.filter(gap => gap.startsWith('uninterpreted-row-key:')).length, count);
    const selected = catalogueApi.selectConfigurationObligations(catalogue, [{ repository: 'prl-ccd-definitions', path: `${context.fixture.definitionRoot}/CaseType.json` }], context);
    assert.equal(selected.mode, 'broad');
    assert.deepEqual(selected.obligationIds, catalogue.obligations.map(item => item.id));
    assert.equal(catalogue.definitionDiscovery.pins.graphGaps, count);
    assert.equal(catalogue.definitionDiscovery.pins.graphDigest, context.review.definitionDiscovery.pins.graphDigest);
  });

  test('a fully reviewed synthetic graph narrows through references; physical mutation after capture blocks it', async (t) => {
    const context = await completeContext(t), catalogue = catalogueApi.buildConfigurationCatalogue(context.snapshot, context.review);
    const changedPaths = [{ repository: 'prl-ccd-definitions', path: context.review.definitionDiscovery.projection[1].path }];
    const selected = catalogueApi.selectConfigurationObligations(catalogue, changedPaths, context);
    assert.equal(selected.mode, 'focused');
    const dependent = catalogue.features.find(item => item.kind === 'AuthorisationCaseEvent');
    assert(selected.obligationIds.includes(dependent.id));
    assert(selected.obligationIds.includes('configuration-shared:role-policy'));
    assert(selected.obligationIds.length < catalogue.obligations.length);
    const extra = path.join(context.fixture.source, context.fixture.definitionRoot, 'new.json');
    fs.writeFileSync(extra, '[]');
    const blocked = catalogueApi.selectConfigurationObligations(catalogue, changedPaths, context);
    assert.equal(blocked.mode, 'broad');
    assert.deepEqual(blocked.obligationIds, catalogue.obligations.map(item => item.id));
    const api = await import('./lib/exui-definition-discovery.mjs');
    const fresh = api.validateDefinitionDiscovery({ discovery: context.snapshot.definitionDiscovery, review: context.review });
    assert(fresh.errors.includes(`definition-file-added:${context.fixture.definitionRoot}/new.json`));
    assert(fresh.inventory.entries.some(item => item.path.endsWith('/new.json')));
    assert.equal(fresh.inventory.summary.pins.graphDigest, fresh.summary.pins.graphDigest);
    assert(!Object.hasOwn(fresh.inventory, 'rawFiles'));
  });
  test('a reviewed additional source file adds an obligation without a code path allowlist or changing earlier objects', async (t) => {
    const original = await completeContext(t), expanded = await completeContext(t, {
      'CaseEvent/Additional/CaseEvent.json': [{ CaseTypeID: 'Example', ID: 'additionalReviewedEvent' }],
    });
    const before = catalogueApi.buildConfigurationCatalogue(original.snapshot, original.review);
    const after = catalogueApi.buildConfigurationCatalogue(expanded.snapshot, expanded.review);
    assert.equal(after.obligations.length, before.obligations.length + 1);
    for (const obligation of before.obligations) assert.deepEqual(after.obligations.find(item => item.id === obligation.id), obligation);
    assert.deepEqual(catalogueApi.validateConfigurationCatalogue({ ...expanded, catalogue: after }).errors, []);
    const chosen = catalogueApi.selectConfigurationObligations(after, [{ repository: 'prl-ccd-definitions', path: `${expanded.fixture.definitionRoot}/CaseEvent/Additional/CaseEvent.json` }], expanded);
    assert.equal(chosen.mode, 'focused');
    assert(chosen.obligationIds.includes(after.features.find(item => item.event === 'additionalReviewedEvent').id));
  });
  test('missing trusted context structurally rejects both real and forged denominators', async (t) => {
    const { snapshot, review } = await completeContext(t);
    const candidates = [{ obligations: [] }, { obligations: [{ id: 'invented' }] }, catalogueApi.buildConfigurationCatalogue(snapshot, review)];
    for (const catalogue of candidates) assert.throws(
      () => catalogueApi.selectConfigurationObligations(catalogue, changed), /TRUSTED_CONFIGURATION_CONTEXT_REQUIRED/);
  });
  test('caller truncation and forged summary readiness cannot reduce independently rebuilt obligations', () => {
    const context = load(), authoritative = catalogueApi.buildConfigurationCatalogue(context.snapshot, context.review);
    const forged = structuredClone(authoritative); forged.obligations = forged.obligations.slice(0, 2);
    forged.definitionDiscovery = { evidenceMode: 'live-source', canFocus: true, graphAvailable: true, gaps: [] };
    const selected = catalogueApi.selectConfigurationObligations(forged, changed, context);
    assert.equal(selected.mode, 'broad');
    assert.deepEqual(selected.obligationIds, authoritative.obligations.map(item => item.id));
    const pinned = catalogueApi.selectConfigurationObligations(authoritative, changed, context);
    assert.equal(pinned.mode, 'broad'); assert.equal(pinned.obligationIds.length, 112);
  });
});
