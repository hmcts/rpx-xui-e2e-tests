const assert = require('node:assert/strict');
const test = require('node:test');

test('provider initialization timings are ordered diagnostics and report failed steps without masking errors', async () => {
  const { timeProviderInitializationStep, providerInitializationDiagnostic } = await import('./run-harness-native-tools.mjs');
  const records = [];
  let now = 0;
  const clock = () => { now += 5; return now; };
  assert.deepEqual(await timeProviderInitializationStep(records, 'browser-seal', async () => 'verified', clock), 'verified');
  await timeProviderInitializationStep(records, 'harness-source-validation', () => true, clock);
  const partial = providerInitializationDiagnostic(records);
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.steps.map(row => row.step), ['harness-source-validation', 'browser-seal']);
  assert(partial.steps.every(row => row.status === 'completed' && row.durationMs === 5));
  assert.equal(partial.proofAuthority, false);
  assert.equal(partial.catalogueCredit, false);

  const failure = new Error('private setup failure');
  await assert.rejects(timeProviderInitializationStep(records, 'candidate-seal', () => { throw failure; }, clock), error => error === failure);
  const failed = providerInitializationDiagnostic(records);
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.steps.map(row => row.step), ['harness-source-validation', 'browser-seal', 'candidate-seal']);
  assert.equal(failed.steps.at(-1).status, 'failed');
});
