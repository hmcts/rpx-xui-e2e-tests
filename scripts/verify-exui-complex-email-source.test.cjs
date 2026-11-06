const assert = require('node:assert/strict');
const {test} = require('node:test');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

test('fixed application-source verifier rejects missing, extra, drifted and shadowed evidence', () => {
  const result = spawnSync('python3', [path.join(__dirname, 'verify-complex-email-application-source.test.py')], {encoding: 'utf8', timeout: 30000});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Ran 11 tests/);
});

test('source verifier CLI fails closed without leaking input paths and requires no private helper', () => {
  const args = ['source-archive', 'image-jar', 'java-home', 'lombok', 'mapstruct', 'output'].flatMap(name => ['--' + name, '/private/tmp/credential-canary-not-an-input/' + name]);
  const result = spawnSync('python3', [path.join(__dirname, 'verify-complex-email-application-source.py'), ...args], {encoding: 'utf8', timeout: 30000});
  assert.equal(result.status, 2);
  assert(!result.stdout.includes('credential-canary'));
  assert.equal(result.stderr, '');
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.status, 'BLOCKED');
  for (const flag of ['sourceComplete', 'runtimeAcceptance', 'catalogueCredit', 'releaseCredit']) assert.equal(summary[flag], false);
});
