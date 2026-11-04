const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } = require('node:fs');
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
  test(`${pipeline}: actual supporting-check shell pins tools and stops at every setup or check failure`, () => {
    const source = readFileSync(pipeline, 'utf8');
    const shell = source.match(/sh (?:'''([\s\S]*?)'''|'(corepack yarn[^']+)')/);
    const command = shell[1] ?? shell[2];
    const directory = mkdtempSync(join(tmpdir(), 'harness-pipeline-'));
    try {
      mkdirSync(join(directory, 'scripts'));
      mkdirSync(join(directory, 'node_modules/@playwright/test'), { recursive: true });
      writeFileSync(join(directory, '.nvmrc'), '24.21.0\n');
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ packageManager: 'yarn@4.18.1' }));
      writeFileSync(join(directory, 'scripts/verify-playwright-browsers.cjs'), readFileSync('scripts/verify-playwright-browsers.cjs'));
      writeFileSync(join(directory, 'node_modules/@playwright/test/index.js'), `exports.chromium={executablePath:()=>process.env.MISSING_BROWSER==='1'?'/missing/browser':process.execPath,launch:async()=>({close:async()=>{}})};`);
      const calls = join(directory, 'calls');
      const bootstrap = join(directory, 'bootstrap.sh');
      const fakeNvm = join(directory, 'nvm.sh');
      const actualScript = join(directory, 'supporting-checks.sh');
      writeFileSync(actualScript, command);
      // Shadow tools even before sourcing: a missing activation must never reach ambient HOME/.local/bin.
      writeFileSync(bootstrap, `node() { return 97; }
corepack() { return 97; }
nvm() { return 97; }
source() {
  [[ "$#" == 1 && "$1" == /opt/nvm/nvm.sh ]] || return 96
  builtin source "$FAKE_NVM"
}
`);
      writeFileSync(fakeNvm, `printf '%s\\n' 'nvm:source' >> "$CALLS_FILE"
[[ "$NVM_DIR" == /home/jenkinsssh/.nvm ]] || return 96
[[ "$FAIL_COMMAND" != source ]] || return 23
nvm() {
  printf 'nvm:%s\\n' "$*" >> "$CALLS_FILE"
  [[ "$*" == use ]] || return 96
  [[ "$FAIL_COMMAND" != use ]] || return 23
}
node() {
  if [[ "$1" == -e ]]; then
    printf '%s\\n' 'node:version' >> "$CALLS_FILE"
    [[ "$FAIL_COMMAND" != node-exit ]] || return 23
    "$REAL_NODE" -e 'Object.defineProperty(process.versions, "node", { value: process.env.FAKE_NODE_VERSION }); eval(process.argv[1]);' "$2"
  elif [[ "$1" == -p ]]; then
    printf '%s\\n' 'node:package-manager' >> "$CALLS_FILE"
    [[ "$FAIL_COMMAND" != package-manager ]] || return 23
    "$REAL_NODE" "$@"
  elif [[ "$1" == scripts/observe-harness-worker.mjs ]]; then
    [[ "$#" == 1 ]] || return 96
    printf '%s\\n' 'worker:observe' >> "$CALLS_FILE"
    [[ "$FAIL_COMMAND" != worker ]] || return 23
  elif [[ "$1" == scripts/manage-harness-public-reports.cjs ]]; then
    [[ "$#" == 2 && "$2" == --validate ]] || return 96
    printf '%s\\n' 'report:validate' >> "$CALLS_FILE"
    [[ "$FAIL_COMMAND" != validate ]] || return 23
      elif [[ "$1" == scripts/run-harness-jenkins-assurance.mjs ]]; then
        [[ "$#" == 1 ]] || return 96
        printf '%s\n' 'native-assurance:run' >> "$CALLS_FILE"
        [[ "$FAIL_COMMAND" != native-assurance ]] || return 23
  else
    [[ "$*" == 'scripts/verify-playwright-browsers.cjs chromium' ]] || return 96
    printf '%s\\n' 'browser:preflight' >> "$CALLS_FILE"
    [[ "$PATH" == "$HOME/.local/bin:"* ]] || return 96
    "$REAL_NODE" "$@"
  fi
}
corepack() {
  printf 'corepack:%s\\n' "$*" >> "$CALLS_FILE"
  [[ "$1" == yarn ]] || return 96
  [[ "$FAIL_COMMAND" != "$2" ]] || return 23
  if [[ "$2" == --version ]]; then printf '%s\\n' "$FAKE_YARN_VERSION"; fi
}
`);
      const expectedCalls = [
        'nvm:source', 'nvm:use', 'node:version', 'node:package-manager', 'corepack:yarn --version',
        'worker:observe', 'corepack:yarn test:setup:playwright-install-chromium', 'browser:preflight',
        'native-assurance:run', 'report:validate'
      ];
      const cases = [
        { fail: 'source', status: 23, through: 1 },
        { fail: 'use', status: 23, through: 2 },
        { fail: 'node-exit', status: 23, through: 3 },
        { fail: 'node-version', status: 1, through: 3 },
        { fail: 'package-manager', status: 23, through: 4 },
        { fail: '--version', status: 23, through: 5 },
        { fail: 'yarn-version', status: 1, through: 5 },
        { fail: 'worker', status: 23, through: 6 },
        { fail: 'test:setup:playwright-install-chromium', status: 23, through: 7 },
        { fail: 'browser', status: 1, through: 8 },
        { fail: 'native-assurance', status: 23, through: 9 },
        { fail: 'validate', status: 23, through: 10 },
        { fail: '', status: 0, through: 10 }
      ];
      for (const { fail, status, through } of cases) {
        rmSync(calls, { force: true });
        const result = spawnSync('/bin/bash', ['-c', 'builtin source "$1"; builtin source "$2"', 'harness-shell-test', bootstrap, actualScript], {
          cwd: directory, encoding: 'utf8',
          env: {
            PATH: directory, HOME: process.env.HOME, FAKE_NVM: fakeNvm,
            REAL_NODE: process.execPath, CALLS_FILE: calls, FAIL_COMMAND: fail,
            FAKE_NODE_VERSION: fail === 'node-version' ? '22.0.0' : '24.21.0',
            FAKE_YARN_VERSION: fail === 'yarn-version' ? '1.22.0' : '4.18.1',
            MISSING_BROWSER: fail === 'browser' ? '1' : '0'
          }
        });
        assert.equal(result.status, status, `${fail || 'success'}: ${result.stderr}`);
        const invoked = readFileSync(calls, 'utf8').trim().split('\n');
        assert.deepEqual(invoked, expectedCalls.slice(0, through), fail || 'success');
      }
      assert.match(command, /export CI=true/, 'both reporter selections must be explicit in Jenkins');
      assert.ok(command.startsWith('#!/usr/bin/env bash\n'), 'Jenkins must see the Bash shebang at the first script character');
      assert.equal(spawnSync('/bin/bash', ['-n'], { input: command, encoding: 'utf8' }).status, 0);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test(`${pipeline}: native candidate and CCD assurance follows browser preflight`, () => {
    const source = readFileSync(pipeline, 'utf8');
    const browserCheck = source.indexOf('scripts/verify-playwright-browsers.cjs chromium');
    const assurance = source.indexOf('node scripts/run-harness-jenkins-assurance.mjs');
    const validation = source.indexOf('scripts/manage-harness-public-reports.cjs --validate');
    assert.ok(browserCheck >= 0 && assurance > browserCheck && validation > assurance);
    assert.doesNotMatch(source, /corepack yarn harness:ci/,
      'the combined run must execute diagnostics once, after native evidence');
    assert.doesNotMatch(source, /corepack yarn harness:(?:candidate|assurance)/,
      'native execution must use the guarded job-local orchestration entry point');
  });

  test(`${pipeline}: only validated summary and scoped Odhín HTML can be published; no raw artifacts or swallowed failure`, () => {
    const source = readFileSync(pipeline, 'utf8');
    const archived = [...source.matchAll(/archiveArtifacts[^\n]*artifacts:\s*'([^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(archived, [
      'functional-output/tests/harness/public/release-assurance-summary.json',
      'functional-output/tests/harness/public/native-ci-capabilities.json',
      'functional-output/tests/harness/public/odhin/index.html'
    ]);
    assert.ok(source.indexOf('manage-harness-public-reports.cjs --reset') < source.indexOf('try {'));
    assert.ok(source.indexOf('observe-harness-worker.mjs --reset') < source.indexOf('try {'));
    const workerValidation = source.indexOf('observe-harness-worker.mjs --validate', source.indexOf('finally {'));
    const workerArchive = source.indexOf("artifacts: 'functional-output/tests/harness/public/native-ci-capabilities.json'");
    assert.ok(workerValidation >= 0 && workerValidation < workerArchive);
    assert.doesNotMatch(source, /harness:assurance|harness:candidate/);
    const validation = source.indexOf('manage-harness-public-reports.cjs --validate', source.indexOf('finally {'));
    const publication = source.indexOf("reportDir: 'functional-output/tests/harness/public/odhin'");
    assert.ok(validation >= 0 && validation < publication);
    assert.ok(source.includes("fileExists('functional-output/tests/harness/public/odhin/index.html')"));
    assert.equal((source.match(/publishHTML\(/g) ?? []).length, 1);
    assert.equal((source.match(/includes: 'index.html'/g) ?? []).length, 1);
    assert.equal((source.match(/allowMissing: false/g) ?? []).length, 1);
    assert.doesNotMatch(source, /odhin-support|odhin-model|yarn harness:support|yarn harness:diagnostic:ci/);
    assert.doesNotMatch(source, /loadVaultSecrets|junit\(|unstable\(|catch\s*\(|test:(?:api|ui|integration|crossbrowser)/);
    assert.ok(source.indexOf('--validate-public-summary') < source.indexOf('archiveArtifacts'));
    assert.match(source, /finally\s*\{/);
    assert.doesNotMatch(source, /sh 'node scripts\//, 'report management must reactivate the pinned toolchain');
    assert.match(source, /no full release approval/);
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

test('Jenkins native assurance builds exact webapp master in a private, script-disabled job', () => {
  const source = readFileSync('scripts/run-harness-jenkins-assurance.mjs', 'utf8');
  assert.match(source, /hmcts\/rpx-xui-webapp\.git/);
  assert.match(source, /ARM64_BROWSER_RUNTIME/);
  assert.match(source, /cp -a \/ms-playwright\/\. \/browser\//);
  assert.doesNotMatch(source, /chromium\.executablePath/);
  assert.match(source, /"--branch", "master"/);
  assert.match(source, /rev-parse", "HEAD"/);
  assert.match(source, /YARN_ENABLE_NETWORK: "1", YARN_ENABLE_SCRIPTS: "0"/);
  assert.match(source, /"config",\s*"set",\s*"supportedArchitectures",\s*"--json"/);
  assert.match(source, /os: \["linux"\]/);
  assert.match(source, /cpu: \["arm64"\]/);
  assert.match(source, /libc: \["glibc"\]/);
  assert.match(source, /"install", "--immutable", "--mode=skip-build"/);
  assert.match(source, /fs\.writeFileSync\(yarnConfigurationPath, yarnConfiguration/);
  assert.ok(
    source.indexOf('fs.writeFileSync(yarnConfigurationPath, yarnConfiguration') <
      source.indexOf('scripts/prepare-harness-candidate.mjs'),
  );
  assert.match(source, /scripts\/prepare-harness-candidate\.mjs/);
  assert.match(source, /scripts\/run-harness-assurance\.mjs/);
  assert.match(source, /process\.umask\(0o077\)/);
  assert.match(source, /mode: 0o600/);
  assert.match(source, /validatePublicSummary\(source\)/);
  assert.match(source, /removePrivateDirectory\(privateRoot, temporaryRoot\)/);
  assert.match(source, /scripts\/run-harness-local-poc\.mjs/, 'failed native setup retains one diagnostics-only report');
  assert.doesNotMatch(source, /--aat|(?:NPM|NODE_AUTH|IDAM|AAT)_TOKEN/);
});

test('diagnostic boundaries fail closed for undeclared environment/toolkit inputs and cannot select native tests', () => {
  const model = buildConfig({ TEST_URL: 'https://ambient.invalid', TEST_ENV: 'aat' });
  assert.equal(model.use.baseURL, 'http://127.0.0.1:3455');
  assert.equal(model.globalSetup, undefined);
  assert.deepEqual(model.testMatch, selections.model);
  assert.equal(model.retries, 0);
  for (const selection of ['environment']) {
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection }), /TEST_URL_AND_TEST_ENV_REQUIRED/);
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, TEST_URL: 'https://user:secret@example.invalid', TEST_ENV: 'aat' }), /HTTP_TARGET_REQUIRED/);
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, TEST_URL: 'https://example.invalid', TEST_ENV: 'aat' }), /IDAM_WEB_URL_REQUIRED/);
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, TEST_URL: 'https://example.invalid', TEST_ENV: 'aat', IDAM_WEB_URL: 'file:///synthetic-idam' }), /HTTP_TARGET_REQUIRED/);
    assert.equal(buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, TEST_URL: 'https://example.invalid', TEST_ENV: 'aat', IDAM_WEB_URL: 'https://idam.example.invalid' }).use.baseURL, 'https://example.invalid');
  }
  assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: 'environment', TEST_URL: 'http://127.0.0.1:3455', TEST_ENV: 'local', IDAM_WEB_URL: 'http://127.0.0.1:5000', API_AUTH_MODE: 'token' }), /UI_SESSION_AUTH_REQUIRED/);
  for (const selection of ['toolkit']) {
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection }), /EXPLICIT_TOOLKIT_ROOT_REQUIRED/);
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection, XUI_WEBAPP_ROOT: '/missing-synthetic-toolkit' }), /INSTALLED_TOOLKIT_REQUIRED/);
  }
  for (const selection of ['candidate', 'frontend', 'model-browser', 'toolkit-browser'])
    assert.throws(() => buildConfig({ EXUI_DIAGNOSTIC_SELECTION: selection }), /UNKNOWN_HARNESS_DIAGNOSTIC_SELECTION/);
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
  assert.equal(count, 38);
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
  const combined = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test',
    '--config', 'playwright.harness-ci.config.ts', '--list', '--reporter=json'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true' },
  });
  assert.equal(combined.status, 0, combined.stderr);
  const identities = [];
  const combinedFiles = new Set();
  function collect(suite, parents = []) {
    for (const spec of suite.specs ?? []) {
      combinedFiles.add(spec.file);
      identities.push(JSON.stringify([spec.file, ...parents, spec.title]));
    }
    for (const child of suite.suites ?? []) collect(child, [...parents, child.title]);
  }
  collect(JSON.parse(combined.stdout));
  assert.equal(identities.length, 116);
  assert.equal(new Set(identities).size, 116, 'one execution per reviewed contract');
  assert.deepEqual([...combinedFiles].sort(), [...selected].sort());
  assert.match(readFileSync('scripts/run-harness-local-poc.mjs','utf8'), /runCi \? "--config=playwright.harness-ci.config.ts"/);
  const ciSource = readFileSync('playwright.harness-ci.config.ts','utf8');
  assert.doesNotMatch(ciSource, /process.env.TEST_(?:ENV|URL)\s*=/);
  assert.match(readFileSync('scripts/run-harness-local-poc.mjs','utf8'), /mode !== "environment" && !runCi/);


});


test('Jenkins report-management wrapper pins Node before reset or validation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'harness-report-node-'));
  try {
    writeFileSync(join(directory, '.nvmrc'), process.versions.node + '\n');
    const bootstrap = join(directory, 'bootstrap.sh');
    const actual = resolve('scripts/harness-jenkins-node.sh');
    writeFileSync(bootstrap, `source() {
      [[ "$#" == 1 && "$1" == /opt/nvm/nvm.sh ]] || return 96
      [[ "$FAIL_AT" != source ]] || return 23
    }
    nvm() { [[ "$*" == use && "$NVM_DIR" == /home/jenkinsssh/.nvm ]] || return 96; [[ "$FAIL_AT" != use ]] || return 23; }
    node() {
      if [[ "$1" == -e ]]; then
        "$REAL_NODE" -e 'if(process.env.FAIL_AT === "version") Object.defineProperty(process.versions,"node",{value:"0.0.0"}); eval(process.argv[1]);' "$2"
      else
        [[ "$FAIL_AT" != command ]] || return 23
        printf '%s\\n' "$*" > "$CALLS_FILE"
      fi
    }
    `);
    for (const command of ['scripts/manage-harness-public-reports.cjs --reset', 'scripts/manage-harness-public-reports.cjs --validate']) {
      for (const [failAt, expected] of [['source',23],['use',23],['version',1],['command',23],['',0]]) {
        const calls = join(directory, 'calls');
        rmSync(calls, { force: true });
        const result = spawnSync('/bin/bash', ['-c', 'builtin source "$1"; shift; builtin source "$1" "${@:2}"', 'report-wrapper', bootstrap, actual, ...command.split(' ')], {
          cwd: directory, encoding: 'utf8', env: { PATH: directory, REAL_NODE: process.execPath, FAIL_AT: failAt, CALLS_FILE: calls }
        });
        assert.equal(result.status, expected, `${command}/${failAt}: ${result.stderr}`);
        assert.equal(existsSync(calls), expected === 0);
        if (expected === 0) assert.equal(readFileSync(calls,'utf8').trim(), command);
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
