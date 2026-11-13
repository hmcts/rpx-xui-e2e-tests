import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

export function reportTests(report) {
  const visit = (suite) => [
    ...(suite.specs ?? []).flatMap(spec => spec.tests.map(test => ({ id: `${spec.id}:${test.projectId}`, title: spec.title, status: test.results.at(-1)?.status }))),
    ...(suite.suites ?? []).flatMap(visit)
  ];
  return report.suites.flatMap(visit).sort((a, b) => a.id.localeCompare(b.id));
}
export function cacheBytes(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const filename = path.join(directory, entry.name);
    return total + (entry.isDirectory() ? cacheBytes(filename) : statSync(filename).size);
  }, 0);
}
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
export function freezeBenchmarkIdentity(repository) {
  const sourceFiles = directory => readdirSync(path.join(repository, directory), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:ts|cjs|mjs|json)$/.test(file) ? [file] : [];
  });
  const files = ['package.json', 'yarn.lock', 'tsconfig.json', 'playwright.harness-support.config.ts', ...sourceFiles('src'), ...sourceFiles('scripts')].sort();
  const identity = () => files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(path.join(repository, file))).digest('hex') }));
  const frozen = identity();
  return { frozen, assertUnchanged: () => assert.deepEqual(identity(), frozen, 'benchmark runtime identity changed') };
}

export function benchmark() {
  assert.equal(process.versions.node, '24.22.3', 'use the deliberate controller Node pin');
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const output = mkdtempSync(path.join(tmpdir(), 'harness-transform-'));
  const { frozen, assertUnchanged } = freezeBenchmarkIdentity(repository);
  const cli = path.join(repository, 'node_modules/@playwright/test/cli.js');
  const common = ['test', '-c', 'playwright.harness-support.config.ts', '--reporter=json', '--workers=1'];
  const version = JSON.parse(readFileSync(path.join(repository, 'node_modules/playwright/package.json'))).version;
  assert.equal(version, '1.65.0');
  function run(label, cache, list = false) {
    assertUnchanged();
    const runOutput = path.join(output, label);
    mkdirSync(runOutput);
    mkdirSync(cache, { recursive: true });
    const command = [cli, ...common, `--output=${path.join(runOutput, 'test-results')}`, ...(list ? ['--list'] : [])];
    const startedAt = new Date().toISOString();
    const start = performance.now();
    const child = spawnSync(process.execPath, command, {
      cwd: repository, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000,
      env: { ...process.env, PLAYWRIGHT_TRANSFORM_CACHE_DIR: cache, PLAYWRIGHT_JSON_ONLY_FAILURES: 'false', PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(runOutput, 'playwright.json') }
    });
    const wallMs = performance.now() - start;
    writeFileSync(path.join(runOutput, 'terminal.log'), `${child.stdout ?? ''}${child.stderr ?? ''}`);
    assert.equal(child.status, 0, `benchmark ${label} failed: ${runOutput}/terminal.log`);
    assertUnchanged();
    const report = JSON.parse(readFileSync(path.join(runOutput, 'playwright.json')));
    const tests = reportTests(report);
    assert.ok(tests.length > 0);
    if (!list) assert.ok(tests.every(test => test.status === 'passed'), `non-passing result in ${label}`);
    return { label, startedAt, wallMs, reportDurationMs: report.stats.duration, cacheBytes: cacheBytes(cache), tests, command: [process.execPath, ...command], output: runOutput, cache };
  }
  const discovery = run('discovery', path.join(output, 'discovery-cache'), true);
  const ids = discovery.tests.map(test => test.id);
  const measured = [];
  for (let index = 1; index <= 5; index++) measured.push(run(`cold-${index}`, path.join(output, `cold-cache-${index}`)));
  const warmCache = path.join(output, 'warm-cache');
  const prime = run('prime', warmCache);
  for (let index = 1; index <= 5; index++) measured.push(run(`warm-${index}`, warmCache));
  for (const run of [prime, ...measured]) assert.deepEqual(run.tests.map(test => test.id), ids, `selection drift: ${run.label}`);
  const summary = {
    node: process.versions.node, playwright: version, platform: process.platform, arch: process.arch,
    identity: frozen, discovery, prime, measured,
    medians: Object.fromEntries(['cold', 'warm'].map(kind => [kind, {
      wallMs: median(measured.filter(run => run.label.startsWith(kind)).map(run => run.wallMs)),
      reportDurationMs: median(measured.filter(run => run.label.startsWith(kind)).map(run => run.reportDurationMs))
    }])),
    limitation: 'Wall time includes process startup, discovery, tests and reporting; no isolated transform phase is measured.'
  };
  writeFileSync(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(path.join(output, 'summary.json'));
  return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) benchmark();
