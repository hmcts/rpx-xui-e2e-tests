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

function runManifest({ strict = false, duplicateProfile = false } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'exui-manifest-'));
  try {
    const source = JSON.parse(readFileSync(resolve('src/data/exui-central-assurance-source.json'), 'utf8'));
    if (duplicateProfile) source.serviceDefinitionProfiles.profiles.push(source.serviceDefinitionProfiles.profiles[0]);
    mkdirSync(join(fixture, 'src/data'), { recursive: true });
    mkdirSync(join(fixture, 'webapp/config'), { recursive: true });
    writeFileSync(join(fixture, 'src/data/exui-central-assurance-source.json'), JSON.stringify(source));
    copyFileSync(resolve('src/data/exui-release-assurance-evidence.json'), join(fixture, 'src/data/exui-release-assurance-evidence.json'));
    const expected = source.rpxXuiWebapp['config/default.json'];
    const hearings = { hearingsJurisdictions: expected.hearings.hearingsJurisdictions.join(',') };
    for (const [family, caseTypes] of Object.entries(expected.hearings.caseTypesByJurisdiction)) {
      hearings[family.toLowerCase()] = { caseTypes: caseTypes.join(',') };
    }
    const defaults = { services: { hearings }, serviceRefDataMapping: expected.serviceRefDataMapping };
    for (const key of ['jurisdictions', 'globalSearchServices', 'waSupportedJurisdictions', 'staffSupportedJurisdictions']) defaults[key] = expected[key].join(',');
    writeFileSync(join(fixture, 'webapp/config/default.json'), JSON.stringify(defaults));
    const expectedEnv = source.rpxXuiWebapp['config/custom-environment-variables.json'];
    writeFileSync(join(fixture, 'webapp/config/custom-environment-variables.json'), JSON.stringify({
      ...expectedEnv,
      serviceRefDataMapping: { __name: expectedEnv.serviceRefDataMapping },
      services: { hearings: { hearingsJurisdictions: expectedEnv.hearingsJurisdictions } }
    }));
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

test('source manifest success remains diagnostic and reports an unavailable definition source', () => {
  const result = runManifest();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /catalogue diagnostic/i);
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

test('PCS keeps its configured service-code mapping without gaining release coverage', () => {
  // Owning webapp config/default.json at ffedc9fad762f9de05f7d87e9e49ec4f6182e991.
  assert.deepEqual(catalogue.EXUI_SERVICE_REF_DATA_MAPPING.PCS, ['AAA3']);
  const source = JSON.parse(readFileSync(resolve('src/data/exui-central-assurance-source.json'), 'utf8'));
  assert.deepEqual(source.rpxXuiWebapp['config/default.json'].serviceRefDataMapping.find((item) => item.service === 'PCS').serviceCodes, ['AAA3']);
  assert.equal(catalogue.EXUI_SERVICE_FAMILY_COVERAGE_DECISIONS.find((item) => item.serviceFamily === 'PCS').disposition, 'canary');
});
