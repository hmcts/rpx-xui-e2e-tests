const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
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
          const result = spawnSync('bash', ['-c', shell], { cwd: directory, env: { ...process.env, FAIL_BROWSER: browser, FAIL_MODE: mode } });
          assert.notEqual(result.status, 0, `${browser} ${mode} must fail`);
          assert.equal(existsSync(join(directory, 'suite-started')), false, 'suite must not execute after failed preflight');
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

for (const pipeline of ['Jenkinsfile_CNP', 'Jenkinsfile_nightly']) {
  test(`${pipeline}: Vault globals reach every lane with the parameter-controlled bypass`, () => {
    const source = readFileSync(pipeline, 'utf8');
    assert.match(source, /secret\('xui-playwright-global-excluded-tags', 'PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS'\)/);
    assert.match(source, /withNightlyPipeline[\s\S]*loadVaultSecrets\(secrets\)/);
    const assignments = source.split('\n').filter((line) => line.includes('PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES='));
    assert.equal(assignments.length, 3);
    for (const assignment of assignments) {
      assert.ok(assignment.includes('${params.PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES}'), assignment);
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

test('shared globals intersect the local catalog and report unmatched scoped tags even with quiet CI logging', async (t) => {
  const filters = await e2eFilters({
    PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS: 'e2e-search-case, @e2e-search-case @e2e-civil-data-loss @e2e-typo @svc-auth @integration-case-list',
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
  assert.match(stderr.mock.calls[0].arguments[0], /unapplied.*@e2e-civil-data-loss.*@e2e-typo.*foreign.*stale.*typo/i);
  assert.equal(stdout.mock.callCount(), 0);
  (await tagUtils).logResolvedTagFilters('E2E', filters, {});
  assert.equal(stderr.mock.callCount(), 1, 'local defaults stay quiet');
  for (const marker of ['BUILD_NUMBER', 'JENKINS_URL']) {
    (await tagUtils).logResolvedTagFilters('E2E', filters, { [marker]: 'jenkins', PLAYWRIGHT_LOG_TAG_FILTERS: 'false' });
  }
  assert.equal(stderr.mock.callCount(), 3, 'Jenkins warnings do not depend on CI being set');
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

test('explicit unknown selections remain strict; globals cannot empty the selected suite', async () => {
  for (const key of ['E2E_PW_INCLUDE_TAGS', 'E2E_PW_EXCLUDED_TAGS_OVERRIDE']) {
    for (const value of ['@e2e-typo', '@e2e-.*']) {
      await assert.rejects(e2eFilters({ [key]: value }), /unknown tag/);
    }
  }
  await assert.rejects(e2eFilters({ PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS: '@e2e' }), /leave no tagged functional tests/);
  await assert.rejects(e2eFilters({
    E2E_PW_INCLUDE_TAGS: '@e2e-search-case',
    E2E_PW_EXCLUDED_TAGS_OVERRIDE: '@none',
    PLAYWRIGHT_GLOBAL_EXCLUDED_TAGS: '@e2e-search-case',
    PLAYWRIGHT_IGNORE_GLOBAL_EXCLUDES: 'false'
  }), /leave no tagged functional tests/);
});
