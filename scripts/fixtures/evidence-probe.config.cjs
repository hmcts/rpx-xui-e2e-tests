module.exports = {
  testDir: __dirname,
  testMatch: 'evidence-probe.spec.cjs',
  workers: 1,
  retries: process.env.EVIDENCE_PROBE === 'retry' ? 1 : 0,
  reporter: [[require.resolve('../lib/exui-playwright-evidence-reporter.mjs')]],
  globalTeardown: require.resolve('./evidence-probe-teardown.cjs')
};
