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

test('pinned decentralised case-type destinations and empty service map remain distinct from environment JSON mappings', () => {
  const defaults = source(snapshot, 'config/default.json');
  assert.deepEqual(defaults.document.decentralisedCaseTypeConfig, { PCS: { webUrl: 'https://pcs.platform.hmcts.net', nocBaseUrl: 'http://pcs-api-prod.service.core-compute-prod.internal' } });
  assert.deepEqual(defaults.document.decentralisedServiceMap, {});
  const env = source(snapshot, 'config/custom-environment-variables.json').document;
  assert.deepEqual(env.decentralisedCaseTypeConfig, { __name: 'DECENTRALISED_CASE_TYPE_CONFIG', __format: 'json' });
  assert.deepEqual(env.decentralisedServiceMap, { __name: 'DECENTRALISED_SERVICE_MAP', __format: 'json' });
  assert.deepEqual(env.services.hearings.pcs, {
    caseTypes: 'SERVICES_HEARINGS_CASETYPES_PCS',
    serviceApiEnvironment: 'SERVICES_HEARINGS_COMPONENT_API_PCS',
  });
  assert.equal(defaults.fileDigest, 'ab78791c4a5ced4341e79cd6fabe114e12e06b667f59936d66ffb513433c65d1');
  assert.equal(source(snapshot, 'config/custom-environment-variables.json').fileDigest, '094eb0b44b3161095b0b8ec484ae3d047ad5d8a880d08d199d7aae4d2e2e4b9d');
  for (const item of snapshot.sources.filter(item => item.repository === 'rpx-xui-webapp')) assert.equal(item.revision, '20c6ec129fc1e81061c733e164198ec63a33e71a');
  const catalogue = build();
  const routes = catalogue.obligations.filter(item => item.kind === 'configuration-decentralisation');
  assert.equal(routes.length, 1);
  assert.equal(routes[0].signature.caseTypePrefix, 'PCS');
  assert.equal(routes[0].requiredBoundary, 'candidate');
  const result = api.validateConfigurationCatalogue({ snapshot, review, catalogue });
  assert.deepEqual(result.errors, []);
  assert.equal(result.denominator.requiredObligations, 112);
  assert.equal(result.coverage.candidate, 0);
  assert(result.coverage.missingCandidateOrCcd.includes(routes[0].id));
  const modelAndCcd = api.validateConfigurationCatalogue({ snapshot, review, catalogue, executedProofs: [
    { obligationId: routes[0].id, boundary: 'model', status: 'passed' },
    { obligationId: routes[0].id, boundary: 'ccd', status: 'passed' },
  ] });
  assert.equal(modelAndCcd.coverage.candidate, 0);
  assert(modelAndCcd.coverage.missingCandidateOrCcd.includes(routes[0].id));
  for (const path of ['config/custom-environment-variables.json', 'common/decentralisation/decentralised-redirect.util.ts', 'src/decentralisation/decentralised-redirect.service.ts', 'api/noc/index.ts']) {
    const selection = api.selectConfigurationObligations(catalogue, [{ repository: 'rpx-xui-webapp', path }], { snapshot, review });
    assert.equal(selection.mode, 'broad'); assert.equal(selection.obligationIds.length, 112);
  }
});

test('missing PCS routing never silently removes the independently reviewed routing denominator', () => {
  const changed = structuredClone(snapshot);
  source(changed, 'config/default.json').document.decentralisedCaseTypeConfig = {};
  const catalogue = build(changed);
  const result = api.validateConfigurationCatalogue({ snapshot: changed, review, catalogue });
  assert.equal(result.denominator.requiredObligations, 112);
  assert(result.errors.some(item => item.startsWith('missing-reviewed-routing:')));
  const present = build();
  present.obligations = present.obligations.filter(item => item.kind !== 'configuration-decentralisation');
  const excluded = api.validateConfigurationCatalogue({ snapshot, review, catalogue: present });
  assert.equal(excluded.denominator.requiredObligations, 112);
  assert(excluded.errors.some(item => item.startsWith('missing-reviewed-routing:')));
});

test('routing map structures reject malformed destinations and custom environment mappings without inventing an HTTPS requirement', () => {
  for (const change of [
    d => d.decentralisedCaseTypeConfig = null,
    d => d.decentralisedServiceMap = [],
    d => d.decentralisedCaseTypeConfig.PCS.webUrl = 12,
    d => d.decentralisedCaseTypeConfig.PCS.nocBaseUrl = false,
    d => d.decentralisedCaseTypeConfig.PCS = 'not-an-entry',
    d => d.decentralisedServiceMap.other = {},
  ]) {
    const copy = structuredClone(snapshot); change(source(copy, 'config/default.json').document);
    assert.throws(() => build(copy), /invalid-decentralised/);
  }
  for (const value of [{ PCS: { webUrl: 'http://local' } }, { __name: 'CONFIG', __format: 'yaml' }, 'CONFIG']) {
    const copy = structuredClone(snapshot);
    source(copy, 'config/custom-environment-variables.json').document.decentralisedCaseTypeConfig = value;
    assert.throws(() => build(copy), /invalid-decentralised/);
  }
  const copy = structuredClone(snapshot);
  source(copy, 'config/default.json').document.decentralisedCaseTypeConfig.PCS = {};
  const route = build(copy).obligations.find(item => item.kind === 'configuration-decentralisation');
  assert.equal(route.signature.webUrl, null);
  assert.equal(route.signature.nocBaseUrl, null);
  assert(api.validateConfigurationCatalogue({ snapshot: copy, review, catalogue: build(copy) }).errors.some(item => item.startsWith('missing-reviewed-routing:')));
});

test('unreviewed case-type and service-map entries are explicit source gaps, never PCS destination credit', () => {
  const copy = structuredClone(snapshot);
  const document = source(copy, 'config/default.json').document;
  document.decentralisedCaseTypeConfig.OTHER = { webUrl: 'http://other.invalid' };
  document.decentralisedCaseTypeConfig.PCS.unknownDestination = 'http://unknown.invalid';
  document.decentralisedServiceMap.AAA3 = { baseUrl: 'http://header.invalid' };
  const catalogue = build(copy), result = api.validateConfigurationCatalogue({ snapshot: copy, review, catalogue });
  assert.equal(catalogue.obligations.filter(item => item.kind === 'configuration-decentralisation').length, 2);
  assert.equal(result.denominator.requiredObligations, 113);
  assert(result.gaps.includes('unreviewed-decentralised-case-type-entry:OTHER'));
  assert(result.gaps.includes('unreviewed-decentralised-service-entry:AAA3'));
  assert(result.gaps.includes('unreviewed-decentralised-case-type-property:PCS:unknownDestination'));
  assert.equal(result.coverage.candidate, 0);
  assert.equal(result.coverage.missingCandidateOrCcd.length, 113);
  assert.equal(result.releaseCredit, false);
});

test('non-default routing-map overlays stay unsupported rather than using a shallow effective merge', () => {
  for (const key of ['decentralisedCaseTypeConfig', 'decentralisedServiceMap']) {
    const copy = structuredClone(snapshot), overlay = structuredClone(source(copy, 'config/default.json'));
    overlay.path = 'config/preview.json'; overlay.document = { [key]: {} }; copy.sources.push(overlay);
    assert.throws(() => build(copy), /unsupported-decentralised-routing-overlay:config\/preview.json/);
  }
});

test('an absent service map remains distinct from the reviewed empty service map', () => {
  const copy = structuredClone(snapshot);
  delete source(copy, 'config/default.json').document.decentralisedServiceMap;
  const catalogue = build(copy), result = api.validateConfigurationCatalogue({ snapshot: copy, review, catalogue });
  assert(result.errors.includes('source-drift:rpx-xui-webapp:config/default.json'));
  assert(result.gaps.includes('unreviewed-decentralised-service-map'));
  assert.notEqual(catalogue.configurationProfiles[0].digest, build().configurationProfiles[0].digest);
});

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

test('committed discovery pins keep direct definition changes broad while preserving shared obligations', () => {
  const catalogue = build();
  const selected = api.selectConfigurationObligations(catalogue, [{ repository: 'prl-ccd-definitions', path: 'definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json' }], { snapshot, review });
  assert.equal(selected.mode, 'broad');
  assert.equal(selected.reason, 'unverified-discovery');
  assert.ok(selected.obligationIds.some((id) => id.startsWith('configuration-cell:')));
  assert.ok(selected.obligationIds.includes('configuration-shared:nested-renderer'));
  assert.ok(selected.obligationIds.includes('configuration-shared:role-policy'));
  assert.equal(selected.obligationIds.length, catalogue.obligations.length);
});

test('unknown paths/features, empty input and new overlay impact select all obligations', () => {
  const catalogue = build();
  for (const paths of [[], [{ repository: 'rpx-xui-webapp', path: 'src/new-renderer.ts' }], [{ repository: 'rpx-xui-webapp', path: 'config/new-overlay.json' }], [{ repository: 'new-repository', path: 'new.json' }]]) {
    const selected = api.selectConfigurationObligations(catalogue, paths, { snapshot, review });
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
  const directory = require('node:fs').realpathSync(mkdtempSync(join(tmpdir(), 'exui-shapes-')));
  try {
    for (const item of snapshot.sources) {
      const root = join(directory, item.repository);
      const path = join(root, item.path);
      mkdirSync(require('node:path').dirname(path), { recursive: true });
      const document = structuredClone(item.document);
      if (item.repository === 'rpx-xui-webapp') document.secretSentinel = 'DO-NOT-COPY';
      writeFileSync(path, JSON.stringify(document));
    }
    for (const item of snapshot.deploymentSources.sources) {
      const path = join(directory, item.repository, item.path);
      mkdirSync(require('node:path').dirname(path), { recursive: true });
      const document = item.path.endsWith('Chart.yaml') ? item.document : { nodejs: { environment: Object.fromEntries(
        Object.entries(item.document.environment).filter(([, entry]) => entry.present).map(([key, entry]) => [key, entry.value])) } };
      writeFileSync(path, require('js-yaml').dump(document));
    }
    writeFileSync(join(directory, 'rpx-xui-webapp/config/new-overlay.json'), '{"waSupportedJurisdictions":"NEWFAMILY","secret":"DO-NOT-COPY"}');
    const result = api.readConfigurationSources({ webappRoot: join(directory, 'rpx-xui-webapp'), definitionsRoot: join(directory, 'prl-ccd-definitions'), review });
    for (const path of ['config/default.json', 'config/custom-environment-variables.json']) {
      for (const key of ['decentralisedCaseTypeConfig', 'decentralisedServiceMap']) assert.deepEqual(source(result, path).document[key], source(snapshot, path).document[key]);
    }
    assert.ok(result.sources.some((item) => item.path === 'config/new-overlay.json'));
    assert.ok(!JSON.stringify(result).includes('DO-NOT-COPY'));
    assert.ok(build(result).diagnosticFamilies.some((item) => item.id === 'NEWFAMILY'));
    rmSync(join(directory, 'prl-ccd-definitions/definitions/private-law/json/CaseField/ServiceOfDocuments/CaseField.json'));
    assert.throws(() => api.readConfigurationSources({ webappRoot: join(directory, 'rpx-xui-webapp'), definitionsRoot: join(directory, 'prl-ccd-definitions'), review }), /PROJECTION_SOURCE_MISSING/);
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

test('current pinned seven-family source is accepted while the previous six-family source and missing PCS are rejected', () => {
  const expected = ['CIVIL', 'EMPLOYMENT', 'IA', 'PCS', 'PRIVATELAW', 'PUBLICLAW', 'ST_CIC'];
  const current = source(snapshot, 'config/default.json');
  assert.deepEqual(current.document.waSupportedJurisdictions.split(',').sort(), expected);
  assert.equal(current.revision, '20c6ec129fc1e81061c733e164198ec63a33e71a');
  assert.equal(current.fileDigest, 'ab78791c4a5ced4341e79cd6fabe114e12e06b667f59936d66ffb513433c65d1');
  assert.deepEqual(current.document.serviceRefDataMapping.find((row) => row.service === 'PCS').serviceCodes, ['AAA3']);
  assert.deepEqual(api.validateConfigurationCatalogue({ snapshot, review, catalogue: build() }).errors, []);
  for (const historical of [false, true]) {
    const changed = structuredClone(snapshot);
    const defaults = source(changed, 'config/default.json');
    defaults.document.waSupportedJurisdictions = defaults.document.waSupportedJurisdictions.split(',').filter((id) => id !== 'PCS').join(',');
    if (historical) {
      defaults.revision = 'ffedc9fad762f9de05f7d87e9e49ec4f6182e991';
      defaults.fileDigest = 'f00a7587da43f097e523cbe26626d637d37b275fcfb7dd757ab8bf2387c9a1c2';
    }
    const result = api.validateConfigurationCatalogue({ snapshot: changed, review, catalogue: build(changed) });
    assert.ok(result.errors.includes('source-drift:rpx-xui-webapp:config/default.json'));
    if (historical) {
      assert.ok(result.errors.includes('source-file-drift:rpx-xui-webapp:config/default.json'));
      assert.ok(result.errors.includes('source-revision-drift:rpx-xui-webapp:config/default.json'));
    }
    assert.equal(result.denominator.validPilotCells, 16);
  }
});

test('checked-in Helm overrides stay explicit source inventory and do not approve unavailable deployed profiles', () => {
  const profiles = review.checkedInDeploymentProfiles;
  assert.equal(profiles.boundary, 'checked-in-source-inventory');
  assert.equal(profiles.ownerAcceptance, 'pending');
  assert.equal(profiles.renderedOrDeployedEnvironment, 'unavailable');
  assert.equal(review.ownerAcceptance, 'pending');
  assert.deepEqual(Object.keys(profiles.profiles).sort(), ['aat', 'base', 'preview']);
  for (const profile of Object.values(profiles.profiles)) {
    assert.deepEqual(profile.environment.WA_SUPPORTED_JURISDICTIONS, { present: false });
    assert.ok(!Object.hasOwn(profile, 'sourceDerivedWaFamilies'));
    assert.equal(profile.renderedOrDeployedEnvironment, 'unavailable');
  }
  assert.deepEqual(profiles.profiles.base.environment.FEATURE_WORKALLOCATION_ENABLED, { present: true, value: false });
  assert.deepEqual(profiles.profiles.aat.environment.FEATURE_WORKALLOCATION_ENABLED, { present: true, value: false });
  assert.deepEqual(profiles.profiles.preview.environment.FEATURE_WORKALLOCATION_ENABLED, { present: true, value: true });
  assert.ok(profiles.profiles.preview.environment.JURISDICTIONS.value.split(',').includes('PT'));
  assert.ok(!review.families.includes('PT'));
  const result = api.validateConfigurationCatalogue({ snapshot, review, catalogue: build() });
  assert.ok(result.gaps.includes('effective-environment-values-unavailable'));
  assert.ok(result.gaps.includes('owner-grouping-acceptance-pending'));
  assert.equal(result.releaseCredit, false);
});

test('routing projection preserves historical IDs and non-profile objects apart from explicit shared source provenance', () => {
  const { createHash } = require('node:crypto');
  const catalogue = build();
  const id = 'configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed';
  const oldSnapshot = structuredClone(snapshot);
  for (const item of oldSnapshot.sources.filter(item => item.repository === 'rpx-xui-webapp')) {
    delete item.document.decentralisedCaseTypeConfig; delete item.document.decentralisedServiceMap;
  }
  const previous = build(oldSnapshot);
  const original = previous.obligations.filter(item => item.id !== id).map(item => item.id).sort();
  assert.equal(previous.obligations.length, 111);
  assert.equal(catalogue.obligations.length, 112);
  assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'), 'f5671fcc666657de7ca663d3763754ad4698020dceca8e8659e8af7f90aa7207');
  const remaining = catalogue.obligations.filter(item => !['configuration-profile', 'configuration-decentralisation'].includes(item.kind));
  assert.equal(remaining.length, 98);
  assert.deepEqual(remaining, previous.obligations.filter(item => item.kind !== 'configuration-profile'));
  const historicalRemaining = remaining.map(item => item.kind === 'shared-policy' ? { ...item, sourceKeys: [] } : item);
  assert.equal(createHash('sha256').update(JSON.stringify(historicalRemaining)).digest('hex'), '518b0a661b7b3fbf942754b0bd1560ba6fde1ee61896a58204b78d46f1b16551');
  const shared = remaining.filter(item => item.kind === 'shared-policy');
  assert.equal(shared.length, 2);
  assert(shared.every(item => item.sourceKeys.length >= 4 && item.sourceKeys.every(key => Object.hasOwn(review.sourceFileDigests, key))));
  const profiles = catalogue.obligations.filter(item => item.kind === 'configuration-profile');
  assert.equal(profiles.length, 13);
  for (const old of previous.obligations.filter(item => item.kind === 'configuration-profile')) {
    assert.notEqual(profiles.find(item => item.family === old.family).id, old.id);
    assert(!catalogue.obligations.some(item => item.id === old.id), 'old IDs are not aliases');
  }
  assert.equal(catalogue.pilotCells.length, 16);
  const obligation = catalogue.obligations.find(item => item.id === id);
  assert.equal(obligation.requiredBoundary, 'ccd');
  assert.equal(obligation.signature.runtimeCaseType, 'HarnessNestedPRL');
  assert.equal(obligation.signature.recipientCount, 2);
  assert.equal(obligation.signature.channel, 'post');
  assert.equal(api.validateConfigurationCatalogue({ snapshot, review, catalogue }).coverage.missingCandidateOrCcd.length, 112);
});

test('postal source sequence cannot disappear or collapse independently reviewed semantics', () => {
  const id = 'configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed';
  const catalogue = build();
  catalogue.obligations = catalogue.obligations.filter(item => item.id !== id);
  const missing = api.validateConfigurationCatalogue({ snapshot, review, catalogue });
  assert.equal(missing.denominator.requiredObligations, 112);
  assert(missing.errors.includes(`missing-valid-sequence:${id}`));
  assert(missing.errors.includes(`missing-obligation:${id}`));
  for (const change of [
    copy => { const row = source(copy, 'AdditionalRecipients/CaseEventToComplexTypes').document.find(row => row.ListElementCode === 'postalInformation.postalAddress.PostCode' && row.CaseFieldID === 'sodAdditionalRecipientsList'); row.DisplayContext = 'OPTIONAL'; },
    copy => { const row = source(copy, 'AdditionalRecipients/CaseEventToComplexTypes').document.find(row => row.ListElementCode === 'postalInformation' && row.CaseFieldID === 'sodAdditionalRecipientsList'); row.FieldShowCondition = 'sodAdditionalRecipientsList.serveByPostOrEmail="email"'; },
  ]) {
    const changed = structuredClone(snapshot); change(changed);
    const result = api.validateConfigurationCatalogue({ snapshot: changed, review, catalogue: build(changed) });
    assert(result.errors.some(error => error.startsWith('sequence-source-shape-drift:')));
  }
});

test('postal sequence retains its source impact dependencies and unknown fixed-list changes broaden to112', () => {
  const catalogue = build(), id = review.knownValidSequences[0].id;
  for (const [repository, path] of [
    ['rpx-xui-webapp', 'config/default.json'],
    ['prl-ccd-definitions', 'definitions/private-law/json/ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json'],
    ['prl-ccd-definitions', 'definitions/private-law/json/CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json'],
  ]) assert(api.selectConfigurationObligations(catalogue, [{ repository, path }], { snapshot, review }).obligationIds.includes(id));
  const selection = api.selectConfigurationObligations(catalogue, [{ repository: 'prl-ccd-definitions', path: 'definitions/private-law/json/FixedLists.json' }], { snapshot, review });
  assert.equal(selection.mode, 'broad');assert.equal(selection.obligationIds.length, 112);
});

for (const [crud, expectedAccess] of [['CR', 'allowed'], ['RU', 'denied']]) {
  test(`event submission requires event C permission, independently of U (${crud})`, () => {
    const changed = structuredClone(snapshot);
    const event = source(changed, 'AuthorisationCaseEvent/ServiceOfDocuments/').document.find(row => row.CaseEventID === 'serviceOfDocuments');
    const role = review.pilotRoles[0];
    event.AccessControl.find(entry => entry.UserRoles.includes(role)).CRUD = crud;
    const catalogue = build(changed);
    const cells = catalogue.pilotCells.filter(cell => cell.role === role && cell.action === 'update');
    assert.equal(cells.length, 4);
    assert(cells.every(cell => cell.expectedAccess === expectedAccess));
    // Synthetic counterexamples exercise interpretation; they cannot approve changed source pins.
    assert(api.validateConfigurationCatalogue({ snapshot: changed, review, catalogue }).errors.some(error => error.startsWith('source-drift:')));
    assert.equal(catalogue.releaseCredit, false);
  });
}
