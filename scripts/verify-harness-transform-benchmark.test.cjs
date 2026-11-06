const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

test('benchmark computes actual cache bytes, stable sorted IDs, latest result and median', async () => {
  const { cacheBytes, reportTests, median } = await import('./benchmark-harness-transform.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'harness-benchmark-unit-'));
  try {
    mkdirSync(join(directory, 'nested'));
    writeFileSync(join(directory, 'one'), 'abc');
    writeFileSync(join(directory, 'nested', 'two'), '12345');
    assert.equal(cacheBytes(directory), 8);
    assert.equal(median([5, 1, 3, 2, 4]), 3);
    const report = { suites: [{ specs: [{ id: 'b', title: 'B', tests: [{ projectId: 'p', results: [{ status: 'failed' }, { status: 'passed' }] }] }], suites: [{ specs: [{ id: 'a', title: 'A', tests: [{ projectId: 'p', results: [] }] }] }] }] };
    assert.deepEqual(reportTests(report), [{ id: 'a:p', title: 'A', status: undefined }, { id: 'b:p', title: 'B', status: 'passed' }]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test('benchmark rejects tsconfig and selected JSON source drift before another measurement', async () => {
  const { freezeBenchmarkIdentity } = await import('./benchmark-harness-transform.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'harness-benchmark-identity-'));
  try {
    mkdirSync(join(directory, 'src', 'data'), { recursive: true });
    const fixture = join(directory, 'src', 'data', 'exui-defect-intake-rules.json');
    writeFileSync(fixture, '{}');
    mkdirSync(join(directory, 'scripts'));
    for (const file of ['package.json', 'yarn.lock', 'playwright.harness-support.config.ts']) writeFileSync(join(directory, file), 'unchanged');
    writeFileSync(join(directory, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}');
    const identity = freezeBenchmarkIdentity(directory);
    identity.assertUnchanged();
    assert.ok(identity.frozen.some(entry => entry.file === 'tsconfig.json'));
    assert.ok(identity.frozen.some(entry => entry.file === 'src/data/exui-defect-intake-rules.json'));
    writeFileSync(join(directory, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2021"}}');
    assert.throws(() => identity.assertUnchanged(), /benchmark runtime identity changed/);
    writeFileSync(join(directory, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}');
    identity.assertUnchanged();
    writeFileSync(fixture, '{"changed":true}');
    assert.throws(() => identity.assertUnchanged(), /benchmark runtime identity changed/);
    writeFileSync(fixture, '{}');
    identity.assertUnchanged();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
