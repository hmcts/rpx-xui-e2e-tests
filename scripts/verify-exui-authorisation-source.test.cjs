const assert = require('node:assert/strict');
const {test} = require('node:test');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

test('fixed Auth source verifier checks archive, class inventory, shadows, input drift and owned compiler closure', () => {
  const result = spawnSync('python3', ['-B', path.join(__dirname, 'verify-authorisation-standard-arm-source.test.py')], {
    encoding: 'utf8', timeout: 30000,
    env: {PATH: process.env.PATH, HOME: process.env.HOME},
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /Ran 14 tests/);
});

test('fixed Auth source CLI rejects invalid inputs without leaking private paths or granting credit', () => {
  const args = ['source-archive', 'base-archive', 'java-home', 'lombok-jar', 'output']
    .flatMap(name => ['--' + name, '/private/tmp/auth-source-private-canary/' + name]);
  const result = spawnSync('python3', ['-B', path.join(__dirname, 'verify-authorisation-standard-arm-source.py'), ...args], {
    encoding: 'utf8', timeout: 30000,
    env: {PATH: process.env.PATH, HOME: process.env.HOME},
  });
  assert.equal(result.status, 2);
  assert.equal(result.stderr, '');
  assert(!result.stdout.includes('private-canary'));
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 'rejected', code: 'AUTH_SOURCE_REPRODUCTION_FAILED',
    sourceComplete: false, runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false,
  });
});
