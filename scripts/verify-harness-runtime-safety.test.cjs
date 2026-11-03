const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const runner = resolve('scripts/run-harness-local-poc.mjs');
const publicSummary = 'functional-output/tests/harness/public/release-assurance-summary.json';

function runDiagnostic(args, assertions, prepare = () => {}, extraEnv = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'harness-runtime-safety-'));
  try {
    const preload = join(directory, 'capture-boundaries.mjs');
    writeFileSync(preload, `
      import childProcess from 'node:child_process';
      import { appendFileSync, readFileSync } from 'node:fs';
      import { EventEmitter } from 'node:events';
      import { syncBuiltinESMExports } from 'node:module';
      const summary = () => JSON.parse(readFileSync('${publicSummary}', 'utf8'));
      globalThis.fetch = async () => {
        appendFileSync('contacts.jsonl', JSON.stringify({ network: true, summary: summary() }) + '\\n');
        return { status: 200 };
      };
      childProcess.spawn = (command, args, options) => {
        const reporting = Object.fromEntries(Object.entries(options.env).filter(([key]) => /^(PLAYWRIGHT_|PW_ODHIN_|PW_API_ENDPOINTS_OUTPUT|PW_NODE_API_LOG_ROOT|PW_TEST_REPORTER)/.test(key)));
        appendFileSync('contacts.jsonl', JSON.stringify({ command, args, reporting, summary: summary() }) + '\\n');
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', 0));
        return child;
      };
      syncBuiltinESMExports();
    `);
    mkdirSync(join(directory, 'test-results/storage-states/ui/synthetic.lock'), { recursive: true });
    mkdirSync(join(directory, 'functional-output/tests/harness/public'), { recursive: true });
    writeFileSync(join(directory, publicSummary), JSON.stringify({ status: 'PASS', stale: 'stale-summary-sentinel' }));
    writeFileSync(join(directory, '.env'), 'TEST_URL=https://dotenv-sentinel.invalid\n');
    prepare(directory);
    const result = spawnSync(process.execPath, ['--import', preload, runner, ...args], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        PATH: process.env.PATH,
        TEST_URL: 'https://destination-sentinel.invalid',
        TEST_ENV: 'aat',
        SOLICITOR_PASSWORD: 'credential-sentinel',
        SERVICES_CALLBACK_URL: 'https://callback-sentinel.invalid',
        ...extraEnv
      }
    });
    assertions(result, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const args of [
  ['--release'],
  ['--ci', '--candidate', 'candidate-sentinel.json'],
  ['--candidate=candidate-sentinel.json'],
  ['--mode', 'release']
]) {
  test(`unsupported candidate/release execution stops before side effects: ${args.join(' ')}`, () => {
    runDiagnostic(args, (result, directory) => {
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /BLOCKED.*diagnostic.*isolated candidate/i);
      assert.equal(existsSync(join(directory, 'contacts.jsonl')), false, 'no network or child process before denial');
      assert.equal(existsSync(join(directory, 'test-results/storage-states/ui/synthetic.lock')), true, 'no session cleanup before denial');
      assert.doesNotMatch(result.stdout + result.stderr, /destination-sentinel|dotenv-sentinel|credential-sentinel|callback-sentinel|candidate-sentinel/);
    });
  });
}

test('CI diagnostics select only portable models and keep raw output private', () => {
  runDiagnostic(['--ci'], (result, directory) => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /diagnostic.*no release credit/i);
    const calls = readFileSync(join(directory, 'contacts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const playwrightCalls = calls.filter((call) => call.command === './node_modules/.bin/playwright');
    assert.equal(playwrightCalls.length, 1);
    assert.ok(playwrightCalls[0].args.includes('--config=playwright.harness-diagnostic.config.ts'));
    assert.ok(playwrightCalls[0].args.includes('--output=functional-output/tests/harness/private/diagnostics/model/test-results'));
    assert.equal(calls.some((call) => call.network), false);
  });
});

test('default diagnostics run only portable models with an explicit no-release-credit label', () => {
  runDiagnostic([], (result, directory) => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /diagnostic.*no release credit/i);
    const calls = readFileSync(join(directory, 'contacts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls.some((call) => call.network || call.args?.includes('scripts/bootstrap-harness-local-sessions.mjs')), false);
    assert.equal(calls.filter((call) => call.command === './node_modules/.bin/playwright').length, 1);
  });
});

test('diagnostic startup replaces a stale PASS with a safe BLOCKED summary before any contact', () => {
  runDiagnostic(['--ci'], (result, directory) => {
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(readFileSync(join(directory, publicSummary), 'utf8'));
    assert.equal(summary.status, 'BLOCKED');
    assert.equal(summary.receiptAvailable, false);
    assert.equal(summary.releaseApproval, false);
    assert.doesNotMatch(JSON.stringify(summary), /stale-summary-sentinel|credential-sentinel/);
    const calls = readFileSync(join(directory, 'contacts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    for (const call of calls) assert.deepEqual(call.summary, summary, 'blocked summary exists before execution');
  });
});

test('unwritable public summary blocks diagnostics before network or child execution', () => {
  runDiagnostic(['--ci'], (result, directory) => {
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /BLOCKED.*summary/i);
    assert.equal(existsSync(join(directory, 'contacts.jsonl')), false);
    assert.doesNotMatch(result.stdout + result.stderr, /credential-sentinel|ENOTDIR|EACCES/);
  }, (directory) => {
    const publicDirectory = join(directory, 'functional-output/tests/harness/public');
    rmSync(publicDirectory, { recursive: true });
    writeFileSync(publicDirectory, 'synthetic-file-blocks-directory');
  });
});

test('CI reporting overrides cannot send raw Harness artifacts to conventional publication paths', () => {
  const escaped = 'functional-output/tests/playwright-api/odhin-report/escape-sentinel';
  const outputKeys = ['PW_ODHIN_OUTPUT', 'PW_ODHIN_TARGET', 'PLAYWRIGHT_REPORT_FOLDER', 'PLAYWRIGHT_REPORT_TARGET',
    'PLAYWRIGHT_JUNIT_OUTPUT', 'PLAYWRIGHT_JUNIT_OUTPUT_FILE', 'PLAYWRIGHT_JSON_OUTPUT', 'PLAYWRIGHT_JSON_OUTPUT_FILE',
    'PLAYWRIGHT_PERFETTO_OUTPUT_FILE', 'PLAYWRIGHT_HTML_OUTPUT', 'PLAYWRIGHT_HTML_OUTPUT_DIR', 'PLAYWRIGHT_HTML_REPORT',
    'PLAYWRIGHT_LAST_RUN_OUTPUT_FILE', 'PLAYWRIGHT_OUTPUT_DIR', 'PLAYWRIGHT_TEST_OUTPUT_DIR', 'PW_API_ENDPOINTS_OUTPUT', 'PW_NODE_API_LOG_ROOT'];
  runDiagnostic(['--ci'], (result, directory) => {
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(join(directory, 'contacts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const reporting = calls.find((call) => call.command === './node_modules/.bin/playwright').reporting;
    assert.equal(reporting.PLAYWRIGHT_REPORTERS, 'list,odhin,junit');
    for (const key of outputKeys) assert.ok(reporting[key].startsWith('functional-output/tests/harness/private/'), `${key} stays private`);
    assert.equal(reporting.PW_ODHIN_INDEX, 'harness-diagnostic.html');
    assert.equal(reporting.PLAYWRIGHT_REPORT_INDEX_FILENAME, 'harness-diagnostic.html');
    assert.equal(reporting.PW_ODHIN_START_SERVER, 'false');
    assert.equal(reporting.PW_TEST_REPORTER, '', 'Playwright cannot append an arbitrary inherited reporter');
    assert.doesNotMatch(JSON.stringify(reporting), /escape-sentinel|arbitrary-reporter/);
  }, () => {}, {
    ...Object.fromEntries(outputKeys.map((key) => [key, escaped])),
    PLAYWRIGHT_REPORTERS: 'html,../arbitrary-reporter.cjs',
    PW_TEST_REPORTER: '../arbitrary-reporter.cjs',
    PW_ODHIN_INDEX: '../../escape-sentinel.html',
    PLAYWRIGHT_REPORT_INDEX_FILENAME: '../../escape-sentinel.html',
    PW_ODHIN_START_SERVER: 'true'
  });
});
