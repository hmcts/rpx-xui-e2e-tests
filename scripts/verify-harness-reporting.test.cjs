const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fullMachineReporters } = require('./harness-reporting.cjs');
const { buildConfig } = require('./harness-diagnostic-config.cjs');

test('diagnostics retain full JSON and JUnit alongside failures terminal', () => {
  const reporters = buildConfig({}).reporter;
  assert.equal(reporters[0][0], 'failures');
  assert.deepEqual(reporters.slice(1), fullMachineReporters('functional-output/tests/harness/private/diagnostics/model', {}));
});
for (const reporter of ['JSON', 'JUNIT']) {
  const key = `PLAYWRIGHT_${reporter}_ONLY_FAILURES`;
  for (const alias of [key, `npm_config_${key.toLowerCase()}`, `npm_package_config_${key.toLowerCase()}`]) {
    test(`authoritative reports reject ambient truncation via ${alias}`, () => {
      for (const value of ['true', '1', 'FALSE']) assert.throws(() => fullMachineReporters('/private/output', { [alias]: value }), /REPORT_REQUIRED/);
      for (const value of ['', 'false', '0']) assert.equal(fullMachineReporters('/private/output', { [alias]: value }).length, 2);
    });
  }
  test(`${key} follows installed Playwright environment precedence`, () => {
    assert.equal(fullMachineReporters('/private/output', { [key]: 'false', [`npm_config_${key.toLowerCase()}`]: 'true' }).length, 2);
  });
}
