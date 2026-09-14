import { test, expect } from '@playwright/test';

import { resolveSharedDocId, uploadSyntheticDoc } from '../../../utils/api/evidenceManagerUtils';

import { documentUploadScenario } from './document-setup-support';

test.describe('Document setup contract', { tag: '@svc-internal' }, () => {
  test('configured document bypasses upload', async () => {
    const scenario = documentUploadScenario({ failureAt: 'post' });
    expect(await resolveSharedDocId('configured-document', () => uploadSyntheticDoc(scenario.deps))).toBe('configured-document');
    expect(scenario.posts()).toBe(0);
  });

  test('successful upload returns actual ID and disposes once', async () => {
    const scenario = documentUploadScenario();
    expect(await uploadSyntheticDoc(scenario.deps)).toBe('uploaded-document');
    expect(scenario.posts()).toBe(1);
    expect(scenario.disposed()).toBe(1);
  });

  for (const status of [401, 403, 500, 502]) {
    test(`HTTP ${status} fails setup instead of inventing a document`, async () => {
      const scenario = documentUploadScenario({ status });
      await expect(uploadSyntheticDoc(scenario.deps)).rejects.toThrow(`HTTP ${status}`);
      expect(scenario.posts()).toBe(1);
      expect(scenario.disposed()).toBe(1);
    });
  }

  for (const id of [null, '', '   ']) {
    test(`missing or blank uploaded ID ${JSON.stringify(id)} fails setup`, async () => {
      const scenario = documentUploadScenario({ id });
      await expect(uploadSyntheticDoc(scenario.deps)).rejects.toThrow('document ID');
      expect(scenario.disposed()).toBe(1);
    });
  }

  for (const failureAt of ['session', 'cookie', 'context', 'post', 'json'] as const) {
    test(`${failureAt} failure retains the original cause and cleans up if created`, async () => {
      const scenario = documentUploadScenario({ failureAt });
      await expect(uploadSyntheticDoc(scenario.deps)).rejects.toBe(scenario.original);
      expect(scenario.disposed()).toBe(['post', 'json'].includes(failureAt) ? 1 : 0);
    });
  }

  test('cleanup failure does not replace a request failure', async () => {
    const scenario = documentUploadScenario({ failureAt: 'post', cleanupFailure: true });
    await expect(uploadSyntheticDoc(scenario.deps)).rejects.toBe(scenario.original);
    expect(scenario.disposed()).toBe(1);
  });

  test('cleanup failure after successful upload remains a failure', async () => {
    const scenario = documentUploadScenario({ cleanupFailure: true });
    await expect(uploadSyntheticDoc(scenario.deps)).rejects.toBe(scenario.cleanup);
    expect(scenario.disposed()).toBe(1);
  });
});
