const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { after, before, test } = require('node:test');
const ts = require('typescript');

let catalogue;
let directory;
before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'exui-catalogue-'));
  const source = readFileSync(resolve('src/data/exui-central-assurance.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  });
  writeFileSync(join(directory, 'catalogue.mjs'), compiled.outputText);
  for (const name of ['exui-defect-intake-rules.json', 'exui-release-assurance-evidence.json']) {
    copyFileSync(resolve('src/data', name), join(directory, name));
  }
  catalogue = await import(pathToFileURL(join(directory, 'catalogue.mjs')).href);
});
after(() => rmSync(directory, { recursive: true, force: true }));

test('complete catalogue metadata and a recorded mutation pass cannot approve a release', () => {
  const result = catalogue.buildReleaseAssuranceVerdict({ failures: [], mutationEvidenceStatus: 'passed' });
  assert.notEqual(result.overallStatus, 'pass');
  assert.equal(result.kind, 'catalogue-diagnostic');
  assert.equal(result.releaseApproval, false);
  assert.ok(result.releaseBlockingSourceProfiles.includes('CIVIL'));
  assert.ok(result.executionGaps.some((gap) => /candidate/.test(gap)));
  assert.ok(result.executionGaps.some((gap) => /CCD/.test(gap)));
  assert.ok(result.executionGaps.some((gap) => /denied/.test(gap)));
  assert.ok(result.executionGaps.some((gap) => /constraint/.test(gap)));
});

test('historic supporting checks do not claim to have caught product regressions', () => {
  const summary = catalogue.buildHistoricFailureCoverageSummary();
  assert.deepEqual(summary['covered-now'], []);
  assert.ok(summary['supporting-only'].includes('protected-endpoint-auth-negative'));
  assert.ok(catalogue.EXUI_HISTORIC_FAILURE_COVERAGE.every((failure) => failure.wouldHaveCaught !== true));
});

for (const [name, change] of [
  ['empty references', (decisions) => { decisions[0].representativeScenarioIds = []; }],
  ['unknown reference', (decisions) => { decisions[0].representativeScenarioIds = ['not-a-scenario']; }],
  ['duplicate references', (decisions) => { decisions[0].representativeScenarioIds.push(decisions[0].representativeScenarioIds[0]); }],
  ['duplicate normalized family', (decisions) => { decisions.push({ ...decisions[0], serviceFamily: ` ${decisions[0].serviceFamily.toLowerCase()} ` }); }]
]) {
  test(`catalogue rejects ${name} instead of counting a family as classified`, () => {
    const decisions = structuredClone(catalogue.EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS);
    change(decisions);
    const result = catalogue.buildReleaseAssuranceVerdict({ decisions });
    assert.equal(result.overallStatus, 'fail');
    assert.ok(result.failReasons.length > 0);
    assert.equal(result.releaseApproval, false);
  });
}

test('valid catalogue mappings remain available as diagnostic metadata', () => {
  const result = catalogue.buildReleaseEvidenceSummary();
  assert.deepEqual(result.verdict.failReasons, []);
  assert.equal(result.ownerSliceCatalogue.length, 13);
  assert.equal(result.verdict.mutationEvidence.boundary, 'source-and-model');
  assert.equal(result.verdict.mutationEvidence.releaseCredit, false);
});

function runManifest({ strict = false, duplicateProfile = false, fromPinnedProjection = false, unknownFamily = false } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'exui-manifest-'));
  try {
    const source = JSON.parse(readFileSync(resolve('src/data/exui-central-assurance-source.json'), 'utf8'));
    if (duplicateProfile) source.serviceDefinitionProfiles.profiles.push(source.serviceDefinitionProfiles.profiles[0]);
    mkdirSync(join(fixture, 'src/data'), { recursive: true });
    mkdirSync(join(fixture, 'scripts/fixtures'), { recursive: true });
    mkdirSync(join(fixture, 'webapp/config'), { recursive: true });
    writeFileSync(join(fixture, 'src/data/exui-central-assurance-source.json'), JSON.stringify(source));
    copyFileSync(resolve('src/data/exui-release-assurance-evidence.json'), join(fixture, 'src/data/exui-release-assurance-evidence.json'));
    copyFileSync(resolve('scripts/fixtures/exui-pcs-generated-definition-manifest.json'), join(fixture, 'scripts/fixtures/exui-pcs-generated-definition-manifest.json'));
    const expected = source.rpxXuiWebapp['config/default.json'];
    const hearings = { hearingsJurisdictions: expected.hearings.hearingsJurisdictions.join(',') };
    for (const [family, caseTypes] of Object.entries(expected.hearings.caseTypesByJurisdiction)) {
      hearings[family.toLowerCase()] = { caseTypes: caseTypes.join(',') };
    }
    const defaults = { services: { hearings }, serviceRefDataMapping: expected.serviceRefDataMapping };
    for (const key of ['jurisdictions', 'globalSearchServices', 'waSupportedJurisdictions', 'staffSupportedJurisdictions']) defaults[key] = expected[key].join(',');
    const projected = JSON.parse(readFileSync(resolve('scripts/fixtures/exui-configuration-source.json'), 'utf8')).sources;
    const actualDefaults = fromPinnedProjection ? projected.find(item => item.repository === 'rpx-xui-webapp' && item.path === 'config/default.json').document : defaults;
    if (unknownFamily) actualDefaults.globalSearchServices += ',UNREVIEWED_FAMILY';
    writeFileSync(join(fixture, 'webapp/config/default.json'), JSON.stringify(actualDefaults));
    const expectedEnv = source.rpxXuiWebapp['config/custom-environment-variables.json'];
    const actualEnv = fromPinnedProjection ? projected.find(item => item.repository === 'rpx-xui-webapp' && item.path === 'config/custom-environment-variables.json').document : {
      ...expectedEnv,
      serviceRefDataMapping: { __name: expectedEnv.serviceRefDataMapping },
      services: { hearings: { hearingsJurisdictions: expectedEnv.hearingsJurisdictions } }
    };
    writeFileSync(join(fixture, 'webapp/config/custom-environment-variables.json'), JSON.stringify(actualEnv));
    return spawnSync(process.execPath, [resolve('scripts/check-exui-harness-manifest.mjs')], {
      cwd: fixture,
      env: {
        RPX_XUI_WEBAPP_DIR: join(fixture, 'webapp'),
        PRL_CCD_DEFINITIONS_DIR: join(fixture, 'missing-prl'),
        HARNESS_MANIFEST_EXTERNAL_SOURCE_MODE: strict ? 'strict' : 'optional'
      },
      encoding: 'utf8'
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test('source-aligned manifest keeps the PCS CCD evidence gap while reporting a diagnostic', () => {
  const result = runManifest();
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /catalogue diagnostic/i);
  assert.match(result.stderr, /PCS: required configured family has no CCD-backed source profile/);
  assert.doesNotMatch(result.stdout, /release assurance verdict=/i);
  assert.doesNotMatch(result.stdout, /normalized slice\(s\) are present/i);
});

test('strict source checking rejects missing PRL definitions', () => {
  const result = runManifest({ strict: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PRL.*(?:unavailable|missing|not present)/i);
});

test('source manifest rejects duplicate family profiles hidden by set comparison', () => {
  const result = runManifest({ duplicateProfile: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate.*profile/i);
});

test('PCS generated CCD definition snapshot is source-backed but grants no runtime or release credit', () => {
  // Owning webapp config/default.json at the current reviewed source revision.
  assert.deepEqual(catalogue.EXUI_SERVICE_REF_DATA_MAPPING.PCS, ['AAA3']);
  const source = JSON.parse(readFileSync(resolve('src/data/exui-central-assurance-source.json'), 'utf8'));
  assert.deepEqual(source.rpxXuiWebapp['config/default.json'].serviceRefDataMapping.find((item) => item.service === 'PCS').serviceCodes, ['AAA3']);
  assert.equal(catalogue.EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.find((item) => item.serviceFamily === 'PCS').disposition, 'release-blocking');
  assert(!catalogue.EXUI_CANARY_SERVICE_FAMILIES.includes('PCS'));
  const profile = catalogue.EXUI_SERVICE_DEFINITION_PROFILES.find(item => item.serviceFamily === 'PCS');
  assert.equal(profile.proofLevel, 'config-backed');
  assert.deepEqual(profile.representativeCaseTypes, ['PCS']);
  assert.equal(profile.repos.length, 1);
  const repo = profile.repos[0];
  assert.equal(repo.fullName, 'hmcts/pcs-api');
  assert.equal(repo.url, 'https://github.com/hmcts/pcs-api');
  assert.equal(repo.revision, '6f96b528dc13b96f5ce66f3930fa5fc31c231748');
  assert.equal(repo.visibility, 'public');
  assert.equal(repo.defaultBranch, 'master');
  assert.equal(repo.updatedAt, '2026-11-06T22:13:07Z');
  assert.equal(repo.definitionRoot, 'src/main/java/uk/gov/hmcts/reform/pcs/ccd');
  assert.deepEqual(repo.evidenceRefs, [
    'src/main/java/uk/gov/hmcts/reform/pcs/ccd/CaseType.java',
    'src/main/java/uk/gov/hmcts/reform/pcs/ccd/domain/PCSCase.java',
    'src/main/java/uk/gov/hmcts/reform/pcs/ccd/PCSCaseView.java',
    'build.gradle'
  ]);
  for (const metric of ['jsonFiles', 'caseEventToFields', 'caseEventToComplexTypes', 'authorisationCaseField', 'caseField', 'complexTypes'])
    assert.equal(repo[metric], 0, metric);
  assert.deepEqual(repo.generatedDefinitions, {
    manifestPath: 'scripts/fixtures/exui-pcs-generated-definition-manifest.json',
    generatorTask: 'generateCCDConfig', outputRoot: 'build/definitions/PCS', fileCount: 397, bytes: 3955448,
    manifestDigest: '3556df4962e5e51beeec67551c6f890ddf6f6710474cde2bde630e0c62c67e8e'
  });
  assert.match(repo.notes, /397-file.*source-generation.*does not prove.*runtime/i);
  assert.match(profile.rationale, /CASE_TYPE_SUFFIX.*deployed identity.*remain unresolved/);
  assert.match(profile.nextAction, /generated event.*import.*candidate-bound EXUI behaviour/i);
  assert.deepEqual(profile, source.serviceDefinitionProfiles.profiles.find(item => item.serviceFamily === 'PCS'));
  assert.deepEqual(catalogue.findReleaseBlockingFamiliesWithoutCcdBackedProfile(), ['PCS']);
  const verdict = catalogue.buildReleaseAssuranceVerdict();
  assert(verdict.knownGaps.includes('release-blocking family without CCD-backed profile: PCS'));
  assert(!verdict.releaseBlockingSourceProfiles.includes('PCS'));
  assert(verdict.executionGaps.includes('No real CCD import/persistence evidence is supplied by the catalogue.'));
  assert.equal(verdict.releaseApproval, false);
});


for (const [key, exported] of [
  ['globalSearchServices', 'EXUI_GLOBAL_SEARCH_SERVICE_FAMILIES'],
  ['waSupportedJurisdictions', 'EXUI_WA_SUPPORTED_SERVICE_FAMILIES'],
  ['staffSupportedJurisdictions', 'EXUI_STAFF_SUPPORTED_SERVICE_FAMILIES'],
]) {
  test(`independent committed projection requires current ${key} in JSON and model`, () => {
    const projection = JSON.parse(readFileSync(resolve('scripts/fixtures/exui-configuration-source.json'), 'utf8')).sources.find(item => item.repository === 'rpx-xui-webapp' && item.path === 'config/default.json');
    assert.equal(projection.revision, '20c6ec129fc1e81061c733e164198ec63a33e71a');
    const expected = projection.document[key].split(',');
    const legacy = JSON.parse(readFileSync(resolve('src/data/exui-central-assurance-source.json'), 'utf8'));
    assert.deepEqual(legacy.rpxXuiWebapp['config/default.json'][key], expected);
    assert.deepEqual(catalogue[exported], expected);
  });
}

test('pinned source and generated PCS definitions match while runtime evidence remains unavailable', () => {
  const result = runManifest({ fromPinnedProjection: true });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /config matches/);
  assert.match(result.stdout, /global=9, wa=7, staff=12/);
  assert.doesNotMatch(result.stderr, /drift detected|globalSearchServices drifted|waSupportedJurisdictions drifted|staffSupportedJurisdictions drifted/);
  assert.match(result.stderr, /PCS: required configured family has no CCD-backed source profile/);
  assert.match(result.stdout, /does not prove candidate\/CCD execution/);
});

test('unreviewed source membership still fails drift checking and preserves known assurance gap', () => {
  const result = runManifest({ fromPinnedProjection: true, unknownFamily: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /globalSearchServices drifted/);
  assert.match(result.stderr, /UNREVIEWED_FAMILY/);
  assert.match(result.stderr, /PCS: required configured family has no CCD-backed source profile/);
});
