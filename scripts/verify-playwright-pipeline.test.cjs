const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, chmodSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, relative } = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { buildConfig, selections } = require('./harness-diagnostic-config.cjs');

test('the Build lint command requires Harness support checks and preserves their failure before downstream checks', () => {
  const lint = JSON.parse(readFileSync('package.json', 'utf8')).scripts.lint;
  const directory = mkdtempSync(join(tmpdir(), 'harness-build-lint-'));
  const callsFile = join(directory, 'calls');
  try {
    writeFileSync(join(directory, 'yarn'), `#!/bin/sh
      printf 'yarn:%s\\n' "$*" >> "$CALLS_FILE"
      if [ "$1" = 'harness:unit' ]; then exit "$HARNESS_UNIT_EXIT"; fi
      exit 0
    `, { mode: 0o755 });
    writeFileSync(join(directory, 'node'), `#!/bin/sh
      printf 'node:%s\\n' "$*" >> "$CALLS_FILE"
      exit 0
    `, { mode: 0o755 });
    const execute = (exitCode) => spawnSync('/bin/sh', ['-c', lint], {
      cwd: directory, encoding: 'utf8',
      env: { PATH: directory, CALLS_FILE: callsFile, HARNESS_UNIT_EXIT: String(exitCode) }
    });
    const failure = execute(23);
    assert.equal(failure.status, 23, failure.stderr);
    assert.deepEqual(readFileSync(callsFile, 'utf8').trim().split('\n'), ['yarn:harness:unit'],
      'no pipeline, TypeScript or ESLint check may run after the Harness support failure');

    rmSync(callsFile);
    const success = execute(0);
    assert.equal(success.status, 0, success.stderr);
    const calls = readFileSync(callsFile, 'utf8').trim().split('\n');
    assert.equal(calls[0], 'yarn:harness:unit');
    assert.ok(calls.length > 1 && calls.slice(1).some((call) => call.startsWith('node:')),
      'passing Harness support checks must allow downstream validation to run');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


for (const pipeline of ['Jenkinsfile_CNP', 'Jenkinsfile_nightly']) {
  test(`${pipeline}: actual supporting-check shell preserves each failure and browser preflight`, () => {
    const source = readFileSync(pipeline, 'utf8');
    const command = source.match(/sh '(corepack yarn lint[^']+)'/)[1];
    const directory = mkdtempSync(join(tmpdir(), 'harness-pipeline-'));
    try {
      mkdirSync(join(directory, 'scripts'));
      mkdirSync(join(directory, 'node_modules/@playwright/test'), { recursive: true });
      writeFileSync(join(directory, 'scripts/verify-playwright-browsers.cjs'), readFileSync('scripts/verify-playwright-browsers.cjs'));
      writeFileSync(join(directory, 'node_modules/@playwright/test/index.js'), `exports.chromium={executablePath:()=>process.env.MISSING_BROWSER==='1'?'/missing/browser':process.execPath,launch:async()=>({close:async()=>{}})};`);
      const calls = join(directory, 'calls');
      writeFileSync(join(directory, 'corepack'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS_FILE"\n[ "$2" != "$FAIL_COMMAND" ] || exit 23\n', { mode: 0o755 });
      writeFileSync(join(directory, 'node'), `#!/bin/sh\nexec '${process.execPath}' "$@"\n`, { mode: 0o755 });
      chmodSync(join(directory, 'node'), 0o755);
      for (const fail of ['lint', 'test:setup:playwright-install-chromium', 'browser', 'harness:support', 'harness:diagnostic:ci', '']) {
        rmSync(calls, { force: true });
        const result = spawnSync('/bin/sh', ['-c', command], {
          cwd: directory, encoding: 'utf8',
          env: { PATH: directory, CALLS_FILE: calls, FAIL_COMMAND: fail, MISSING_BROWSER: fail === 'browser' ? '1' : '0' }
        });
        assert.equal(result.status, fail === 'browser' ? 1 : fail ? 23 : 0, result.stderr);
        const invoked = readFileSync(calls, 'utf8').trim().split('\n');
        if (fail === 'lint') assert.deepEqual(invoked, ['yarn lint']);
        if (fail === 'browser') assert.equal(invoked.some((call) => call.includes('harness:support')), false);
        if (fail === 'harness:support') assert.equal(invoked.some((call) => call.includes('harness:diagnostic:ci')), false);
        if (!fail) assert.equal(invoked.at(-1), 'yarn harness:diagnostic:ci');
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test(`${pipeline}: only validated public summary can be published; no legacy secrets or swallowed failure`, () => {
    const source = readFileSync(pipeline, 'utf8');
    const archived = [...source.matchAll(/archiveArtifacts[^\n]*artifacts:\s*'([^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(archived, ['functional-output/tests/harness/public/release-assurance-summary.json']);
    assert.doesNotMatch(source, /loadVaultSecrets|publishHTML|junit\(|unstable\(|catch\s*\(|test:(?:api|ui|integration|crossbrowser)/);
    assert.ok(source.indexOf('--validate-public-summary') < source.indexOf('archiveArtifacts'));
    assert.match(source, /finally\s*\{/);
    assert.match(source, /no release credit/);
    const directory = mkdtempSync(join(tmpdir(), 'harness-publication-'));
    try {
      const file = join(directory, 'summary.json');
      const valid = { schemaVersion: 1, kind: 'pilot-evidence-summary', status: 'BLOCKED', releaseApproval: false,
        receiptAvailable: false, reasonCodes: [] };
      // Use the real summary writer to create its current allowlisted shape.
      const create = spawnSync(process.execPath, ['--input-type=module', '-e', `import { writePublicSummary } from ${JSON.stringify(require('node:url').pathToFileURL(resolve('scripts/lib/exui-evidence-io.mjs')).href)}; writePublicSummary(${JSON.stringify(file)}, { status:'BLOCKED',exitCode:2,reasons:[] });`], { encoding: 'utf8' });
      assert.equal(create.status, 0, create.stderr);
      const validate = () => spawnSync(process.execPath, [resolve('scripts/write-exui-release-assurance-summary.mjs'), '--validate-public-summary', file], { encoding: 'utf8' });
      assert.equal(validate().status, 0);
      writeFileSync(file, JSON.stringify({ ...valid, credential: 'synthetic-publication-secret' }));
      const rejected = validate();
      assert.notEqual(rejected.status, 0);
      assert.doesNotMatch(rejected.stdout + rejected.stderr, /synthetic-publication-secret/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}

test('diagnostic boundaries fail closed for undeclared environment/toolkit inputs and cannot select native tests', () => {
  const model = buildConfig({ TEST_URL: 'https://ambient.invalid', TEST_ENV: 'aat' });
  assert.equal(model.use.baseURL, 'http://127.0.0.1:3455');
  assert.equal(model.globalSetup, undefined);
  assert.deepEqual(model.testMatch, selections.model);
  assert.equal(model.retries, 0);
  for (const selection of ['frontend', 'environment']) {
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection }), /TEST_URL_AND_TEST_ENV_REQUIRED/);
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, TEST_URL: 'https://user:secret@example.invalid', TEST_ENV: 'aat' }), /HTTP_TARGET_REQUIRED/);
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, TEST_URL: 'https://example.invalid', TEST_ENV: 'aat' }), /IDAM_WEB_URL_REQUIRED/);
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, TEST_URL: 'https://example.invalid', TEST_ENV: 'aat', IDAM_WEB_URL: 'file:///synthetic-idam' }), /HTTP_TARGET_REQUIRED/);
    assert.equal(buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, TEST_URL: 'https://example.invalid', TEST_ENV: 'aat', IDAM_WEB_URL: 'https://idam.example.invalid' }).use.baseURL, 'https://example.invalid');
  }
  assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: 'environment', TEST_URL: 'http://127.0.0.1:3455', TEST_ENV: 'local', IDAM_WEB_URL: 'http://127.0.0.1:5000', API_AUTH_MODE: 'token' }), /UI_SESSION_AUTH_REQUIRED/);
  for (const selection of ['toolkit', 'toolkit-browser']) {
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection }), /EXPLICIT_TOOLKIT_ROOT_REQUIRED/);
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, XUI_WEBAPP_ROOT: '/missing-synthetic-toolkit' }), /INSTALLED_TOOLKIT_REQUIRED/);
  }
  assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: 'candidate' }), /UNKNOWN_HARNESS_DIAGNOSTIC_SELECTION/);
  for (const files of Object.values(selections)) assert.equal(files.some((file) => /harness\/(wa|scope|ccd)\//.test(file)), false);
});

test('bare Playwright discovery selects only the portable models without ambient auth or native inputs', () => {
  const result = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--list', '--reporter=json'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME }
  });
  assert.equal(result.status, 0, result.stderr);
  const files = new Set();
  let count = 0;
  function visit(suite) {
    for (const spec of suite.specs ?? []) { files.add(spec.file); count += 1; }
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(JSON.parse(result.stdout));
  assert.equal(count, 40);
  assert.deepEqual([...files].sort(), [...selections.model].sort());
});

test('mutation and toolkit wrappers opt into the real private diagnostic reporter they advertise', () => {
  for (const [script, selection] of [
    ['run-harness-mutation-proof.mjs', 'model'],
    ['run-harness-ccd-mutation-proof.mjs', 'model'],
    ['run-exui4493-toolkit-demo.mjs', 'toolkit']
  ]) {
    const source = readFileSync(`scripts/${script}`, 'utf8');
    assert.match(source, /EXUI_DIAGNOSTIC_ODHIN:\s*"1"/);
    assert.doesNotMatch(source, /PLAYWRIGHT_REPORTERS|PW_ODHIN_OUTPUT|PW_ODHIN_INDEX/);
    const directory = mkdtempSync(join(tmpdir(), 'toolkit-reporter-contract-'));
    try {
      const pkg = join(directory, 'node_modules/@hmcts/ccd-case-ui-toolkit');
      mkdirSync(pkg, { recursive: true });
      writeFileSync(join(pkg, 'package.json'), '{}');
      const config = buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, EXUI_DIAGNOSTIC_ODHIN: '1', XUI_WEBAPP_ROOT: directory });
      const reporter = config.reporter.find(([name]) => name.includes('odhin-adaptive'));
      assert.ok(reporter);
      assert.equal(source.match(/const reportOutput = "([^"]+)"/)[1], reporter[1].outputFolder);
      assert.equal(source.match(/const reportIndex = "([^"]+)"/)[1], reporter[1].indexFilename);
      assert.match(source, /no release credit/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});


test('every remaining API test file is explicitly selected as Harness support or a model', () => {
  const result = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test',
    '--config', 'playwright.harness-support.config.ts', '--list', '--reporter=json'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME }
  });
  assert.equal(result.status, 0, result.stderr);
  const selected = new Set(selections.model);
  const report = JSON.parse(result.stdout);
  function visit(suite) {
    for (const spec of suite.specs ?? []) selected.add(relative(process.cwd(), resolve(report.config.rootDir, spec.file)).replaceAll('\\', '/'));
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(report);
  const sources = readdirSync('src/tests/api', { recursive: true })
    .filter(file => file.endsWith('.api.ts')).map(file => `src/tests/api/${file.replaceAll('\\', '/')}`);
  assert.deepEqual(sources.filter(file => !selected.has(file)).sort(), [],
    'select useful Harness regressions or retire obsolete tests; do not leave silent unselected suites');
});
