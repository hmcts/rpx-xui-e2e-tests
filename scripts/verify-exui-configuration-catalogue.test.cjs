const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { before, test } = require('node:test');
const snapshot = JSON.parse(readFileSync('scripts/fixtures/exui-configuration-source.json', 'utf8'));
const review = JSON.parse(readFileSync('scripts/fixtures/exui-configuration-review.json', 'utf8'));
let api;
before(async () => { api = await import('./lib/exui-configuration-catalogue.mjs'); });
const source = (copy, fragment) => copy.sources.find((item) => item.path.includes(fragment));
const build = (input = snapshot) => api.buildConfigurationCatalogue(input, review);

test('candidate source validation requires reviewed config bytes before any runtime override', () => {
  const { createHash } = require('node:crypto');
  const directory = mkdtempSync(join(tmpdir(), 'exui-candidate-source-'));
  try {
    mkdirSync(join(directory, 'config'));
    const localReview = { sourceFileDigests: {} };
    for (const name of ['default', 'custom-environment-variables']) {
      const path = `config/${name}.json`;
      const bytes = JSON.stringify({ waSupportedJurisdictions: name });
      writeFileSync(join(directory, path), bytes);
      localReview.sourceFileDigests[`rpx-xui-webapp:${path}`] = createHash('sha256').update(bytes).digest('hex');
    }
    assert.equal(api.assertCandidateConfigurationSources(directory, localReview).length, 2);
    writeFileSync(join(directory, 'config/local-harness.jsonc'), '{"jurisdictions":"UNREVIEWED"}');
    assert.throws(() => api.assertCandidateConfigurationSources(directory, localReview), /UNREVIEWED_CANDIDATE/);
    rmSync(join(directory, 'config/local-harness.jsonc'));
    writeFileSync(join(directory, 'config/default.json'), '{"waSupportedJurisdictions":"UNREVIEWED"}');
    assert.throws(() => api.assertCandidateConfigurationSources(directory, localReview), /SOURCE_DRIFT/);
    delete localReview.sourceFileDigests['rpx-xui-webapp:config/default.json'];
    assert.throws(() => api.assertCandidateConfigurationSources(directory, localReview), /MISSING_REVIEWED/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('catalogue command requires explicit actual source paths and rejects unsupported input', () => {
  const { spawnSync } = require('node:child_process');
  for (const args of [[], ['--webapp', '/missing', '--definitions', '/missing', '--output', '/missing'], ['--snapshot', 'unchecked.json']]) {
    const result = spawnSync(process.execPath, ['scripts/check-exui-configuration-catalogue.mjs', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BLOCKED/);
  }
});

test('source catalogue discovers all 13 families from the portable baseline without runtime credit', () => {
  const result = build();
  assert.deepEqual(result.families.map((item) => item.id).sort(), [...review.families].sort());
  assert.equal(result.releaseCredit, false);
  assert.equal(result.boundary, 'source-and-catalogue');
  assert.equal(result.pilotCells.length, 16);
  assert.ok(result.features.some((item) => item.nestingDepth >= 3));
  assert.ok(result.features.some((item) => item.fieldType === 'Collection'));
  assert.ok(result.features.some((item) => item.display === 'READONLY'));
  assert.ok(result.features.some((item) => item.callbackStages.includes('CallBackURLMidEvent')));
  assert.ok(result.features.some((item) => item.kind === 'SearchResultFields'));
  assert.ok(result.features.some((item) => item.kind === 'WorkBasketInputFields'));
  assert.equal(result.configurationProfiles.length, 1);
  assert.equal(result.configurationProfiles[0].diagnosticOnly, false);
});

test('explicit independent examples validate allowed/denied role outcomes and retain the denominator', () => {
  const result = api.validateConfigurationCatalogue({ snapshot, review, catalogue: build() });
  assert.deepEqual(result.errors, []);
  assert.equal(result.denominator.validPilotCells, 16);
  assert.equal(result.denominator.cataloguedPilotCells, 16);
  assert.equal(result.coverage.candidate, 0);
  assert.equal(result.coverage.ccd, 0);
  assert.ok(result.gaps.includes('owner-grouping-acceptance-pending'));
  assert.ok(result.gaps.includes('effective-environment-values-unavailable'));
  assert.equal(result.releaseCredit, false);
});

test('known valid role/case-type exclusion remains a gap rather than shrinking coverage', () => {
  const catalogue = build();
  catalogue.pilotCells = catalogue.pilotCells.filter((cell) => !(cell.role.endsWith('-readonly') && cell.caseType === 'PRLAPPS'));
  const result = api.validateConfigurationCatalogue({ snapshot, review, catalogue });
  assert.equal(result.denominator.validPilotCells, 16);
  assert.equal(result.denominator.cataloguedPilotCells, 8);
  assert.ok(result.errors.some((error) => error.startsWith('missing-valid-cell:')));
});

test('condition collapse fails independent email/post witnesses', () => {
  const changed = structuredClone(snapshot);
  const rows = source(changed, 'AdditionalRecipients/CaseEventToComplexTypes').document;
  for (const row of rows) if (row.FieldShowCondition?.includes('="post"')) row.FieldShowCondition = 'sodAdditionalRecipientsList.serveByPostOrEmail="email"';
  const catalogue = build(changed);
  const result = api.validateConfigurationCatalogue({ snapshot: changed, review, catalogue });
  assert.ok(result.errors.some((error) => error.startsWith('missing-distinction:')));
  assert.notEqual(catalogue.obligations.map((item) => item.id).join(), build().obligations.map((item) => item.id).join());
});

test('nested feature inside known family creates a new obligation and source drift blocks acceptance', () => {
  const changed = structuredClone(snapshot);
  const row = source(changed, 'AdditionalRecipients/CaseEventToComplexTypes').document[0];
  source(changed, 'AdditionalRecipients/CaseEventToComplexTypes').document.push({ ...row, ListElementCode: 'emailInformation.newChild', FieldShowCondition: 'sodAdditionalRecipientsList.serveByPostOrEmail="email"' });
  const catalogue = build(changed);
  assert.equal(catalogue.obligations.length, build().obligations.length + 1);
  const result = api.validateConfigurationCatalogue({ snapshot: changed, review, catalogue, expectedSnapshot: snapshot });
  assert.ok(result.errors.some((error) => error.startsWith('source-drift:')));
  assert.ok(result.gaps.some((gap) => gap.startsWith('unreviewed-shape:')));
});

test('signatures preserve conditional expressions, role permissions and values', () => {
  for (const change of [
    (copy) => { source(copy, 'AdditionalRecipients/CaseEventToComplexTypes').document[13].FieldShowCondition = 'sodAdditionalRecipientsList.serveByPostOrEmail="post"'; },
    (copy) => { source(copy, 'AuthorisationCaseEvent/ServiceOfDocuments').document[0].AccessControl[1].CRUD = 'CRU'; },
    (copy) => { source(copy, 'config/default.json').document.serviceRefDataMapping.find((row) => row.service === 'PCS').serviceCodes = ['CHANGED']; }
  ]) {
    const copy = structuredClone(snapshot); change(copy);
    assert.notDeepEqual(build(copy).obligations.map((item) => item.id), build().obligations.map((item) => item.id));
  }
  const catalogue = build();
  assert.notEqual(catalogue.pilotCells.find((cell) => cell.recipientCount === 1).id, catalogue.pilotCells.find((cell) => cell.recipientCount === 2).id);
});

test('unknown families and malformed/unsupported definition input never silently disappear', () => {
  const copy = structuredClone(snapshot);
  source(copy, 'config/default.json').document.waSupportedJurisdictions += ',NEWFAMILY';
  const catalogue = build(copy);
  assert.ok(catalogue.families.some((item) => item.id === 'NEWFAMILY'));
  assert.ok(api.validateConfigurationCatalogue({ snapshot: copy, review, catalogue }).errors.includes('unknown-family:NEWFAMILY'));
  source(copy, 'AdditionalRecipients/CaseEventToComplexTypes').document = {};
  assert.throws(() => build(copy), /definition.*array/i);
});

test('direct definition changes select dependent shared renderer and permission obligations', () => {
  const catalogue = build();
  const selected = api.selectConfigurationObligations(catalogue, [{ repository: 'prl-ccd-definitions', path: 'definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json' }]);
  assert.equal(selected.mode, 'focused');
  assert.ok(selected.obligationIds.some((id) => id.startsWith('configuration-cell:')));
  assert.ok(selected.obligationIds.includes('configuration-shared:nested-renderer'));
  assert.ok(selected.obligationIds.includes('configuration-shared:role-policy'));
  assert.ok(selected.obligationIds.length < catalogue.obligations.length);
});

test('unknown paths/features, empty input and new overlay impact select all obligations', () => {
  const catalogue = build();
  for (const paths of [[], [{ repository: 'rpx-xui-webapp', path: 'src/new-renderer.ts' }], [{ repository: 'rpx-xui-webapp', path: 'config/new-overlay.json' }], [{ repository: 'new-repository', path: 'new.json' }]]) {
    const selected = api.selectConfigurationObligations(catalogue, paths);
    assert.equal(selected.mode, 'broad');
    assert.deepEqual(selected.obligationIds, catalogue.obligations.map((item) => item.id));
  }
});

test('selection/execution accounting cannot turn helper evidence into candidate or CCD coverage', () => {
  const catalogue = build();
  const selectedIds = catalogue.obligations.map((item) => item.id);
  const result = api.validateConfigurationCatalogue({ snapshot, review, catalogue, selectedIds, executedProofs: [
    { obligationId: selectedIds[0], boundary: 'model', status: 'passed' },
    { obligationId: 'invented', boundary: 'candidate', status: 'passed' }
  ] });
  assert.equal(result.coverage.model, 1);
  assert.equal(result.coverage.candidate, 0);
  assert.equal(result.coverage.ccd, 0);
  assert.equal(result.coverage.selected, selectedIds.length);
  assert.equal(result.coverage.missingCandidateOrCcd.length, selectedIds.length);
  assert.ok(result.errors.includes('unknown-executed-obligation:invented'));
});

test('source reader uses real paths, projects allowlisted keys and discovers new configuration overlays', () => {
  const directory = mkdtempSync(join(tmpdir(), 'exui-shapes-'));
  try {
    for (const item of snapshot.sources) {
      const root = join(directory, item.repository);
      const path = join(root, item.path);
      mkdirSync(require('node:path').dirname(path), { recursive: true });
      const document = structuredClone(item.document);
      if (item.repository === 'rpx-xui-webapp') document.secretSentinel = 'DO-NOT-COPY';
      writeFileSync(path, JSON.stringify(document));
    }
    writeFileSync(join(directory, 'rpx-xui-webapp/config/new-overlay.json'), '{"waSupportedJurisdictions":"NEWFAMILY","secret":"DO-NOT-COPY"}');
    const result = api.readConfigurationSources({ webappRoot: join(directory, 'rpx-xui-webapp'), definitionsRoot: join(directory, 'prl-ccd-definitions') });
    assert.ok(result.sources.some((item) => item.path === 'config/new-overlay.json'));
    assert.ok(!JSON.stringify(result).includes('DO-NOT-COPY'));
    assert.ok(build(result).diagnosticFamilies.some((item) => item.id === 'NEWFAMILY'));
    rmSync(join(directory, 'prl-ccd-definitions/definitions/private-law/json/CaseField/ServiceOfDocuments/CaseField.json'));
    assert.throws(() => api.readConfigurationSources({ webappRoot: join(directory, 'rpx-xui-webapp'), definitionsRoot: join(directory, 'prl-ccd-definitions') }), /ENOENT/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('unprojected file or source revision drift is explicit rather than hidden by feature projection', () => {
  for (const key of ['fileDigest', 'revision']) {
    const changed = structuredClone(snapshot);
    changed.sources[0][key] = key === 'fileDigest' ? '0'.repeat(64) : '1'.repeat(40);
    const result = api.validateConfigurationCatalogue({ snapshot: changed, review, catalogue: build(changed) });
    assert.ok(result.errors.some((error) => error.startsWith(key === 'fileDigest' ? 'source-file-drift:' : 'source-revision-drift:')));
  }
});

test('reviewed source additions can be approved without freezing obsolete signatures', () => {
  const changed = structuredClone(snapshot);
  const selected = source(changed, 'AdditionalRecipients/CaseEventToComplexTypes');
  selected.document.push({ ...selected.document[0], ListElementCode: 'emailInformation.newChild' });
  const updatedReview = structuredClone(review);
  const crypto = require('node:crypto');
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
  const key = `${selected.repository}:${selected.path}`;
  updatedReview.sourceFragmentDigests[key] = hash(selected.document);
  updatedReview.definitionRowDigests[key] = selected.document.map(hash);
  const result = api.validateConfigurationCatalogue({ snapshot: changed, review: updatedReview, catalogue: api.buildConfigurationCatalogue(changed, updatedReview) });
  assert.deepEqual(result.errors, []);
  assert.ok(!result.gaps.some((gap) => gap.startsWith('unreviewed-shape:')));
});

test('mixed attempts or duplicate selections do not inflate a passing coverage count', () => {
  const catalogue = build();
  const id = catalogue.obligations[0].id;
  const result = api.validateConfigurationCatalogue({ snapshot, review, catalogue, selectedIds: [id, id], executedProofs: [
    { obligationId: id, boundary: 'candidate', status: 'passed' },
    { obligationId: id, boundary: 'candidate', status: 'failed' }
  ] });
  assert.ok(result.errors.includes('duplicate-selection'));
  assert.ok(result.errors.includes(`conflicting-executions:${id}:candidate`));
  assert.equal(result.coverage.candidate, 0);
});

test('clean source checkout does not require ignored developer overlays', () => {
  const clean = structuredClone(snapshot);
  clean.sources = clean.sources.filter((item) => item.tracked);
  const catalogue = build(clean);
  const result = api.validateConfigurationCatalogue({ snapshot: clean, review, catalogue });
  assert.deepEqual(result.errors, []);
  assert.ok(snapshot.sources.every((item) => item.tracked));
  assert.equal(catalogue.configurationProfiles.length, 1);
});

test('added untracked overlay is visible diagnostics without changing mandatory obligations', () => {
  const clean = structuredClone(snapshot);
  clean.sources = clean.sources.filter((item) => item.tracked);
  const withLocal = structuredClone(clean);
  withLocal.sources.push({ repository: 'rpx-xui-webapp', revision: clean.sources[0].revision, path: 'config/local-review.json', tracked: false, fileDigest: '0'.repeat(64), document: { jurisdictions: 'NEWFAMILY' } });
  const catalogue = build(withLocal);
  const result = api.validateConfigurationCatalogue({ snapshot: withLocal, review, catalogue });
  assert.deepEqual(catalogue.obligations, build(clean).obligations);
  assert.ok(catalogue.configurationProfiles.some((item) => item.path === 'config/local-review.json' && item.diagnosticOnly));
  assert.ok(catalogue.diagnosticFamilies.some((item) => item.id === 'NEWFAMILY'));
  assert.ok(result.gaps.some((gap) => gap.includes('config/local-review.json')));
  assert.deepEqual(result.errors, []);
});

test('supported node-config non-JSON formats fail with an explicit source gap', () => {
  const directory = mkdtempSync(join(tmpdir(), 'exui-configuration-format-'));
  try {
    mkdirSync(join(directory, 'config'));
    for (const extension of ['jsonc', 'json5', 'yaml', 'yml', 'js', 'cjs', 'mjs', 'ts', 'hjson', 'toml', 'coffee', 'iced', 'cson', 'properties', 'xml', 'boolean', 'number']) {
      const path = join(directory, `config/local-review.${extension}`);
      writeFileSync(path, '{"jurisdictions":"NEWFAMILY"}');
      assert.throws(() => api.readConfigurationSources({ webappRoot: directory, definitionsRoot: directory }), new RegExp(`unsupported-configuration-format:config/local-review\\.${extension}`));
      rmSync(path);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('event authorisation for another case type cannot satisfy PRLAPPS pilot examples', () => {
  const changed = structuredClone(snapshot);
  source(changed, 'AuthorisationCaseEvent/ServiceOfDocuments').document[0].CaseTypeID = 'OTHER';
  const catalogue = build(changed);
  const result = api.validateConfigurationCatalogue({ snapshot: changed, review, catalogue, expectedSnapshot: changed });
  assert.ok(catalogue.pilotCells.every((cell) => cell.caseType === 'OTHER'));
  assert.ok(result.errors.some((error) => error.startsWith('missing-valid-cell:PRLAPPS|')));
  assert.equal(result.denominator.validPilotCells, 16);
  assert.equal(result.denominator.cataloguedPilotCells, 0);
});
