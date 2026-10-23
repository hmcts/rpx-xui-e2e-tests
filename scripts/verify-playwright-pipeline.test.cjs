const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

// Execute the actual Jenkins shell guard with a controlled browser package.
for (const pipeline of ['Jenkinsfile_CNP', 'Jenkinsfile_nightly']) {
  test(`${pipeline}: unavailable browsers stop the suite; valid browsers permit it`, () => {
    const source = readFileSync(pipeline, 'utf8');
    const line = source.split('\n').find((entry) => !entry.includes('def ') && (entry.includes('${command}') || entry.includes('${shellCommand}')));
    assert.ok(line, 'suite shell command exists');
    const directory = mkdtempSync(join(tmpdir(), 'playwright-preflight-'));
    try {
      mkdirSync(join(directory, 'scripts'));
      mkdirSync(join(directory, 'node_modules/@playwright/test'), { recursive: true });
      writeFileSync(join(directory, 'scripts/verify-playwright-browsers.cjs'), readFileSync('scripts/verify-playwright-browsers.cjs'));
      writeFileSync(join(directory, 'node_modules/@playwright/test/index.js'), `
        const fs = require('node:fs');
        for (const name of ['chromium', 'firefox', 'webkit']) exports[name] = {
          executablePath: () => process.env.FAIL_BROWSER === name && process.env.FAIL_MODE === 'missing' ? '/missing/browser' : process.execPath,
          launch: async () => {
            if (process.env.FAIL_BROWSER === name && process.env.FAIL_MODE === 'launch') throw Error('Browser launch failed');
            fs.appendFileSync('verified', name + '\\n');
            return { close: async () => {} };
          }
        };
      `);
      const browsers = pipeline === 'Jenkinsfile_CNP' ? 'chromium' : 'firefox webkit';
      const shell = line
        .replace('${browsers ? "node scripts/verify-playwright-browsers.cjs ${browsers} &&" : ""}', `node scripts/verify-playwright-browsers.cjs ${browsers} &&`)
        .replace('${browsers}', browsers)
        .replace(/\$\{(?:shellCommand|command)\}/g, 'touch suite-started');
      for (const browser of browsers.split(' ')) {
        for (const mode of ['missing', 'launch']) {
          const result = spawnSync('bash', ['-c', shell], { cwd: directory, env: { PATH: process.env.PATH, FAIL_BROWSER: browser, FAIL_MODE: mode } });
          assert.equal(result.status, 1, `${browser} ${mode} must preserve the preflight failure`);
          assert.match(result.stderr.toString(), mode === 'missing' ? new RegExp(`Missing Playwright ${browser} executable`) : /Browser launch failed/);
          assert.equal(existsSync(join(directory, 'suite-started')), false, 'suite must not execute after failed preflight');
          if (pipeline === 'Jenkinsfile_nightly') {
            const finalisationDir = join(directory, `${browser}-${mode}`);
            mkdirSync(finalisationDir);
            const reports = runNightlyFinalisation(finalisationDir);
            for (const report of reports) assert.equal(report.status, 0, report.stderr);
            const reportPath = join(finalisationDir, nightlyReportEnv.PLAYWRIGHT_REPORT_FOLDER, nightlyReportFile);
            assert.ok(existsSync(reportPath), 'reached finalisation must create the nightly fallback after preflight failure');
            const html = readFileSync(reportPath, 'utf8');
            assert.match(html, /results are unavailable/i);
            assert.doesNotMatch(html, /integration command failed|never ran|not run/i);
          }
        }
      }
      rmSync(join(directory, 'verified'), { force: true });
      const success = spawnSync('bash', ['-c', shell], { cwd: directory, env: { ...process.env, FAIL_BROWSER: '' } });
      assert.equal(success.status, 0, success.stderr.toString());
      assert.equal(existsSync(join(directory, 'suite-started')), true);
      assert.deepEqual(readFileSync(join(directory, 'verified'), 'utf8').trim().split('\n').sort(), browsers.split(' ').sort());
      const suiteFailure = spawnSync('bash', ['-c', shell.replace('touch suite-started', 'exit 23')], { cwd: directory, env: { ...process.env, FAIL_BROWSER: '' } });
      assert.equal(suiteFailure.status, 23, 'test failure must remain a failure');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}


test('every configured Jenkins test suite selects its required browsers', () => {
  const cnp = readFileSync('Jenkinsfile_CNP', 'utf8');
  const suiteCalls = cnp.split('\n').filter((line) => /runPlaywrightShell\(['"]corepack yarn (?:harness:ci|test:)/.test(line));
  assert.equal(suiteCalls.length, 4);
  for (const line of suiteCalls) assert.match(line, /, ['"]chromium['"]\)/);
  const nightly = readFileSync('Jenkinsfile_nightly', 'utf8');
  assert.match(nightly, /def runPlaywrightCommand = \{ String command, String browsers = "chromium" ->/);
  assert.match(nightly, /runPlaywrightCommand\('test:crossbrowser:raw', 'firefox webkit'\)/);
});

const extractStageBlock = (source, stageName) => {
  const marker = `stage('${stageName}')`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${stageName} stage exists`);
  const remainder = source.slice(start + marker.length);
  const nextStage = remainder.search(/\n\s+stage\('/);
  return source.slice(start, nextStage === -1 ? source.length : start + marker.length + nextStage);
};

const nightlySource = readFileSync('Jenkinsfile_nightly', 'utf8');
const nightlyUi = extractStageBlock(nightlySource, 'UI nightly');
const nightlyFinalisation = nightlyUi.slice(nightlyUi.indexOf('} finally {'));
const nightlyRecipeName = nightlyUi.match(/runPlaywrightCommand\('([^']+)', 'firefox webkit'\)/)[1];
const nightlyRecipe = JSON.parse(readFileSync('package.json', 'utf8')).scripts[nightlyRecipeName];
const nightlyReportFile = nightlyRecipe.match(/PW_ODHIN_INDEX=([^\s;]+)/)[1];
const nightlySuiteName = nightlyUi.match(/def uiReportSuiteName = '([^']+)'/)?.[1];
const nightlyReportEnv = Object.fromEntries([...nightlyUi.matchAll(/'((?:PLAYWRIGHT_REPORT_|PW_ODHIN_)[A-Z_]+)=([^'$]*)'/g)]
  .map((match) => [match[1], match[2]]));
const finalisationScripts = [...nightlyFinalisation.matchAll(/runOptionalPlaywrightNodeScript\('([^']+)'/g)].map((match) => match[1]);

// Execute the source-selected helpers; Jenkins Groovy control flow is checked separately below.
const runNightlyFinalisation = (cwd, env = {}) => finalisationScripts.map((script) =>
  spawnSync(process.execPath, [resolve(script)], {
    cwd, encoding: 'utf8', env: {
      PATH: process.env.PATH, ...nightlyReportEnv, PW_ODHIN_LINK_COVERAGE: 'false',
      PW_ODHIN_FALLBACK_SUITE_NAME: nightlySuiteName, ...env
    }
  }));

test('nightly UI publishes the recipe filename after copy, ensure and an independent missing-file check', () => {
  assert.equal(nightlyRecipeName, 'test:crossbrowser:raw');
  assert.equal(nightlyReportFile, 'playwright-odhin-nightly.html');
  assert.equal(nightlyUi.match(/reportFiles\s*:\s*'([^']+)'/)[1], nightlyReportFile);
  assert.equal(nightlyReportEnv.PW_ODHIN_INDEX, nightlyReportFile);
  assert.equal(nightlyReportEnv.PLAYWRIGHT_REPORT_INDEX_FILENAME, nightlyReportFile);
  assert.equal(extractStageBlock(nightlySource, 'API nightly').match(/reportFiles\s*:\s*'([^']+)'/)[1], 'playwright-odhin.html');
  assert.equal(extractStageBlock(nightlySource, 'Integration tests').match(/reportFiles\s*:\s*'([^']+)'/)[1], 'playwright-odhin-integration-nightly.html');
  assert.deepEqual(finalisationScripts, ['scripts/copy-odhin-report.cjs', 'scripts/ensure-odhin-report.cjs']);
  const ensureAt = nightlyFinalisation.indexOf("runOptionalPlaywrightNodeScript('scripts/ensure-odhin-report.cjs'");
  const checkAt = nightlyFinalisation.indexOf(`if (!fileExists('${nightlyReportEnv.PLAYWRIGHT_REPORT_FOLDER}/${nightlyReportFile}'))`);
  const diagnosticAt = nightlyFinalisation.indexOf('UI nightly HTML report remains unavailable after finalisation');
  assert.ok(ensureAt >= 0 && checkAt > ensureAt && diagnosticAt > checkAt && nightlyFinalisation.indexOf('publishHTML(') > diagnosticAt);
  assert.match(nightlyUi, /catch \(Error\)\s*\{\s*unstable\(message: "\$\{STAGE_NAME\} is unstable: " \+ Error\.toString\(\)\)/);
  assert.match(nightlyUi, /allowMissing\s*:\s*true/);
  assert.match(nightlyFinalisation, /withEnv\(uiOdhinEnv \+ \["PW_ODHIN_FALLBACK_SUITE_NAME=\$\{uiReportSuiteName\}"\]\)/);
  assert.equal((nightlyUi.match(/runOptionalPlaywrightNodeScript\('scripts\/ensure-odhin-report.cjs'/g) || []).length, 1);
});

test('nightly raw recipe preserves a Playwright failure while creating the expected fallback', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nightly-raw-report-'));
  try {
    mkdirSync(join(directory, 'scripts'));
    mkdirSync(join(directory, 'node_modules/.bin'), { recursive: true });
    writeFileSync(join(directory, 'scripts/ensure-odhin-report.cjs'), readFileSync('scripts/ensure-odhin-report.cjs'));
    writeFileSync(join(directory, 'node_modules/.bin/playwright'), '#!/bin/sh\n[ "$1" = test ] || exit 99\necho synthetic-playwright-failure >&2\nexit 23\n', { mode: 0o755 });
    const result = spawnSync('sh', ['-c', nightlyRecipe], {
      cwd: directory, encoding: 'utf8', env: { PATH: process.env.PATH, PLAYWRIGHT_SKIP_INSTALL: 'true' }
    });
    assert.equal(result.status, 23, result.stderr);
    assert.match(result.stderr, /synthetic-playwright-failure/);
    const html = readFileSync(join(directory, 'functional-output/tests/playwright-e2e/odhin-report', nightlyReportFile), 'utf8');
    assert.match(html, /results are unavailable/i);
    assert.doesNotMatch(html, /integration command failed|never ran|not run/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const sameDirectory of [true, false]) {
  test(`nightly copy then ensure preserves genuine report bytes (same directory: ${sameDirectory})`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'nightly-genuine-report-'));
    try {
      const source = join(directory, 'source');
      const target = sameDirectory ? source : join(directory, 'target');
      mkdirSync(source);
      const bytes = Buffer.from('<!doctype html>\r\n<html><body>Genuine Odhín report — π</body></html>\n');
      writeFileSync(join(source, nightlyReportFile), bytes);
      const copy = spawnSync(process.execPath, [resolve(finalisationScripts[0])], {
        cwd: directory, encoding: 'utf8', env: {
          PATH: process.env.PATH, PLAYWRIGHT_REPORT_FOLDER: source, PW_ODHIN_TARGET: target,
          PW_ODHIN_SKIP_API_ENDPOINTS: 'true', PW_ODHIN_LINK_COVERAGE: 'false'
        }
      });
      assert.equal(copy.status, 0, copy.stderr);
      assert.deepEqual(readFileSync(join(target, nightlyReportFile)), bytes, 'actual copy must produce unchanged bytes');
      const ensure = spawnSync(process.execPath, [resolve(finalisationScripts[1])], {
        cwd: directory, encoding: 'utf8', env: {
          PATH: process.env.PATH, ...nightlyReportEnv, PLAYWRIGHT_REPORT_FOLDER: target,
          PW_ODHIN_FALLBACK_SUITE_NAME: 'UI not run - must not replace genuine HTML'
        }
      });
      assert.equal(ensure.status, 0, ensure.stderr);
      assert.deepEqual(readFileSync(join(target, nightlyReportFile)), bytes);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('helper CLI failure is visible even when the actual optional shell returns zero', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nightly-helper-failure-'));
  try {
    const blocker = join(directory, 'blocked');
    writeFileSync(blocker, 'synthetic fixture');
    const reportDir = join(blocker, 'reports');
    const env = { PATH: process.env.PATH, ...nightlyReportEnv, PLAYWRIGHT_REPORT_FOLDER: reportDir };
    const script = resolve('scripts/ensure-odhin-report.cjs');
    const direct = spawnSync(process.execPath, [script], { cwd: directory, env, encoding: 'utf8' });
    assert.equal(direct.status, 1);
    assert.match(direct.stderr, /ensure-odhin-report:.*ENOTDIR/);
    const closure = nightlySource.slice(nightlySource.indexOf('def runOptionalPlaywrightNodeScript ='), nightlySource.indexOf('def recordPlaywrightContainerDiagnostics ='));
    assert.match(closure, /if \(!fileExists\(scriptPath\)\)/);
    assert.match(closure, /Skipping.*is unavailable in the current workspace/);
    const shell = closure.match(/steps\.sh """([\s\S]*?)"""/)[1]
      .replaceAll('${scriptPath}', script)
      .replaceAll('${context}', 'UI unavailable Odhín report generation')
      .replace(/\\\$/g, '$');
    const optional = spawnSync('bash', ['-c', shell], { cwd: directory, env, encoding: 'utf8' });
    assert.equal(optional.status, 0);
    assert.match(optional.stdout, /failed with status 1/);
    assert.match(optional.stderr, /ensure-odhin-report:.*ENOTDIR/);
    assert.equal(existsSync(join(reportDir, nightlyReportFile)), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('UI nightly marks an unavailable finalised HTML report unstable', () => {
  const guard = nightlyFinalisation.match(/if \(!fileExists\('([^']+)'\)\) \{([\s\S]*?)\n\s+\}/);
  assert.ok(guard, 'UI finalisation checks whether its expected report exists');
  assert.equal(guard[1], 'functional-output/tests/playwright-e2e/odhin-report/playwright-odhin-nightly.html');
  assert.match(guard[2], /unstable\(message:.*UI nightly HTML report remains unavailable/);
});

test('credential predicate contract labels only skipped UI results and does not expose synthetic credentials', () => {
  assert.match(nightlySource, /def hasCourtAdminUiCredentials = \{\s*env\.COURT_ADMIN_USERNAME\?\.trim\(\) && env\.COURT_ADMIN_PASSWORD\?\.trim\(\)\s*\}/);
  const skip = nightlyUi.match(/if \(!hasCourtAdminUiCredentials\(\)\) \{([\s\S]*?)\} else \{/)[1];
  assert.doesNotMatch(skip, /runPlaywrightCommand/);
  const skippedLabelMatch = skip.match(/uiReportSuiteName = '([^']+)'/);
  assert.ok(skippedLabelMatch, 'credential skip must supply an explicit UI not-run label');
  const skippedLabel = skippedLabelMatch[1];
  assert.equal(nightlySuiteName, 'Playwright E2E Cross-Browser');
  const directory = mkdtempSync(join(tmpdir(), 'nightly-credential-label-'));
  try {
    // Predicate fixture only: Groovy/authentication execution remains a Jenkins acceptance check.
    const cases = [[undefined, 'synthetic-password', false], ['', 'synthetic-password', false], [' \t', 'synthetic-password', false],
      ['synthetic-user', undefined, false], ['synthetic-user', '', false], ['synthetic-user', ' \t', false], ['synthetic-user', 'synthetic-password', true]];
    for (const [index, [username, password, shouldRun]] of cases.entries()) {
      const enabled = Boolean(username?.trim() && password?.trim());
      assert.equal(enabled, shouldRun);
      const reportDir = join(directory, String(index));
      const results = runNightlyFinalisation(directory, {
        PLAYWRIGHT_REPORT_FOLDER: reportDir, PW_ODHIN_TARGET: reportDir,
        PW_ODHIN_FALLBACK_SUITE_NAME: enabled ? nightlySuiteName : skippedLabel,
        COURT_ADMIN_USERNAME: username ?? '', COURT_ADMIN_PASSWORD: password ?? ''
      });
      for (const result of results) assert.equal(result.status, 0, result.stderr);
      const html = readFileSync(join(reportDir, nightlyReportFile), 'utf8');
      assert.match(html, /results are unavailable/i);
      if (shouldRun) assert.doesNotMatch(html, /not run/i);
      else assert.match(html, /Playwright UI nightly - not run \(required credentials unavailable\)/);
      assert.doesNotMatch(html, /synthetic-user|synthetic-password|integration command failed|\b\d+ passed\b/i);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [pipeline, stageNames] of Object.entries({
  Jenkinsfile_CNP: ['UI tests', 'Integration tests'],
  Jenkinsfile_nightly: ['API nightly', 'UI nightly', 'Integration tests']
})) {
  test(`${pipeline}: source contract wires Vault globals and the parameterized bypass to each lane`, () => {
    const source = readFileSync(pipeline, 'utf8');
    const secretMapping = source.indexOf("secret('xui-playwright-global-excluded-tags', 'PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS')");
    const vaultLoad = source.indexOf('loadVaultSecrets(secrets)');
    assert.ok(secretMapping > -1 && secretMapping < vaultLoad, 'Vault mapping is declared before the secret load');
    for (const stageName of stageNames) {
      assert.match(
        extractStageBlock(source, stageName),
        /PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES=\$\{params\.PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES\}/,
        `${stageName} must receive the parameterized bypass`
      );
    }
  });
}

// Exercise the real pure resolver on the supported Node 20 runtime without a TS loader dependency.
const tagUtils = import(`data:text/javascript;base64,${Buffer.from(require('typescript').transpileModule(
  readFileSync('playwright-config-utils.ts', 'utf8'),
  { compilerOptions: { module: require('typescript').ModuleKind.ESNext, target: require('typescript').ScriptTarget.ES2022 } }
).outputText).toString('base64')}`);

const e2eFilters = async (env = {}) => (await tagUtils).resolveTagFilters({
  env,
  configPathEnvVar: 'E2E_PW_TAG_FILTER_CONFIG',
  defaultConfigPath: 'src/tests/e2e/tag-filter.json',
  includeTagsEnvVar: 'E2E_PW_INCLUDE_TAGS',
  excludedTagsEnvVar: 'E2E_PW_EXCLUDED_TAGS_OVERRIDE',
  globalExcludedTagsEnvVar: 'PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS',
  globalExcludedTagsPattern: /^@e2e(?:-|$)/,
  suiteTag: '@e2e'
});

test('shared globals intersect the local catalog and report unmatched scoped tags in CI without logging the raw value', async (t) => {
  const rawGlobalTags = ' @e2e-search-case,  @e2e-civil-data-loss @e2e-typo @svc-auth @integration-case-list ';
  const globalSentinels = ['@e2e-search-case', '@e2e-civil-data-loss', '@e2e-typo', '@svc-auth', '@integration-case-list'];
  const filters = await e2eFilters({
    PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS: rawGlobalTags,
    E2E_PW_EXCLUDED_TAGS_OVERRIDE: '@none'
  });
  assert.deepEqual(filters.globalExcludedTags, ['@e2e-search-case']);
  assert.deepEqual(filters.unmatchedGlobalExcludedTags, ['@e2e-civil-data-loss', '@e2e-typo']);
  assert.deepEqual(filters.ignoredGlobalExcludedTags, ['@svc-auth', '@integration-case-list']);
  assert.deepEqual(filters.excludedTags, ['@e2e-search-case']);
  assert.equal(filters.grepInvert.test('@e2e-search-case'), true);
  const stderr = t.mock.method(process.stderr, 'write', () => true);
  const stdout = t.mock.method(process.stdout, 'write', () => true);
  (await tagUtils).logResolvedTagFilters('E2E', filters, { CI: 'true', PLAYWRIGHT_LOG_TAG_FILTERS: 'false' });
  assert.equal(stderr.mock.callCount(), 1);
  assert.match(stderr.mock.calls[0].arguments[0], /unapplied global exclusions count=2.*foreign.*stale.*typo/i);
  assert.equal(stderr.mock.calls[0].arguments[0].includes(rawGlobalTags), false);
  for (const sentinel of globalSentinels) assert.equal(stderr.mock.calls[0].arguments[0].includes(sentinel), false, sentinel);
  assert.equal(stdout.mock.callCount(), 0);
  (await tagUtils).logResolvedTagFilters('E2E', filters, { CI: 'true', PLAYWRIGHT_LOG_TAG_FILTERS: 'true' });
  assert.match(stdout.mock.calls[0].arguments[0], /globalAppliedCount=1.*globalIgnoredCount=2.*globalUnmatchedCount=2/);
  for (const sentinel of globalSentinels) assert.equal(stdout.mock.calls[0].arguments[0].includes(sentinel), false, sentinel);
  (await tagUtils).logResolvedTagFilters('E2E', filters, {});
  assert.equal(stderr.mock.callCount(), 2, 'local defaults stay quiet');
  for (const marker of ['BUILD_NUMBER', 'JENKINS_URL']) {
    (await tagUtils).logResolvedTagFilters('E2E', filters, { [marker]: 'jenkins', PLAYWRIGHT_LOG_TAG_FILTERS: 'false' });
  }
  assert.equal(stderr.mock.callCount(), 4, 'Jenkins warnings do not depend on CI being set');
});

test('absent, empty and @none globals preserve local defaults; bypass keeps local overrides', async () => {
  const baseline = await e2eFilters();
  for (const raw of ['', '@none', ' , @none @none ']) {
    assert.deepEqual((await e2eFilters({ PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS: raw })).excludedTags, baseline.excludedTags);
  }
  const filters = await e2eFilters({
    PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS: '@e2e-search-case @e2e-typo',
    PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES: 'true',
    E2E_PW_EXCLUDED_TAGS_OVERRIDE: '@e2e-document-upload'
  });
  assert.deepEqual(filters.excludedTags, ['@e2e-document-upload']);
  assert.deepEqual(filters.globalExcludedTags, []);
  assert.deepEqual(filters.unmatchedGlobalExcludedTags, []);
  assert.equal(filters.grepInvert.test('@e2e-document-upload-v1'), true, 'existing prefix regex contract remains');
});

test('local @none clears configured exclusions while preserving explicit local exclusions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'playwright-tag-config-'));
  const configPath = join(directory, 'tag-filter.json');
  writeFileSync(configPath, JSON.stringify({
    excludedTags: ['@e2e-document-upload'],
    availableTags: ['@e2e', '@e2e-document-upload', '@e2e-search-case']
  }));
  try {
    const filters = await e2eFilters({
      E2E_PW_TAG_FILTER_CONFIG: configPath,
      E2E_PW_EXCLUDED_TAGS_OVERRIDE: '@none,@e2e-search-case'
    });
    assert.deepEqual(filters.excludedTags, ['@e2e-search-case']);
    assert.equal(filters.grepInvert.test('@e2e-document-upload'), false);
    assert.equal(filters.grepInvert.test('@e2e-search-case'), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('explicit unknown selections remain strict; globals cannot empty the selected suite', async () => {
  for (const key of ['E2E_PW_INCLUDE_TAGS', 'E2E_PW_EXCLUDED_TAGS_OVERRIDE']) {
    for (const value of ['@e2e-typo', '@e2e-.*']) {
      await assert.rejects(e2eFilters({ [key]: value }), /unknown tag/);
    }
  }
  await assert.rejects(e2eFilters({ PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS: '@e2e' }), /leave no tagged functional tests/);
  await assert.rejects(e2eFilters({
    PLAYWRIGHT_ALLOW_EMPTY_TAG_SELECTION: 'false',
    PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS: '@e2e'
  }), /leave no tagged functional tests/);
  await assert.rejects(e2eFilters({
    E2E_PW_INCLUDE_TAGS: '@e2e-search-case',
    E2E_PW_EXCLUDED_TAGS_OVERRIDE: '@none',
    PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS: '@e2e-search-case',
    PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES: 'false'
  }), /leave no tagged functional tests/);
  await assert.rejects(e2eFilters({
    E2E_PW_INCLUDE_TAGS: '@e2e',
    E2E_PW_EXCLUDED_TAGS_OVERRIDE: '@e2e-case-flags @e2e-case-file-view @e2e-create-case @e2e-document-upload @e2e-document-upload-v1 @e2e-manage-tasks @e2e-media-viewer @e2e-search-case @e2e-smoke @nightly @e2e-update-case'
  }), /leave no tagged functional tests/);
});
