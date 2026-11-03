const { test, expect } = require('@playwright/test');

test.beforeEach(async () => {
  if (process.env.EVIDENCE_PROBE === 'hook') {
    await test.step('harness-assertion:family-membership', async () => expect(false).toBe(true));
  }
});

test.afterEach(() => {
  if (process.env.EVIDENCE_PROBE === 'contaminated') throw new Error('unrelated cleanup failure');
});
test('evidence adapter probe', {
  annotation: { type: 'harness-proof', description: 'wa-family-options' }
}, async ({}, info) => {
  const probe = process.env.EVIDENCE_PROBE;
  if (probe === 'setup') throw new Error('family-membership appears in a setup error');
  await test.step('harness-assertion:family-membership', async () => {
    expect(['assertion', 'contaminated'].includes(probe) || (probe === 'retry' && info.retry === 0)).toBe(false);
  });
});
