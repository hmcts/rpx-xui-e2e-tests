import { test, expect } from '@playwright/test';

import { __test__ as fixturesTest } from '../../fixtures/api';

test.describe('Helper utilities and retry logic', { tag: '@svc-internal' }, () => {

  test('fixture helpers cover default headers and request recovery', async () => {
    await test.step('harness-check:fixtures-headers-recovery', async () => {
      const headers = await fixturesTest.buildDefaultHeaders('solicitor', {
        shouldAutoInjectXsrf: () => true,
        getStoredCookie: async () => 'token',
      });
      expect(headers['X-XSRF-TOKEN']).toBe('token');

      const noXsrf = await fixturesTest.buildDefaultHeaders('solicitor', {
        shouldAutoInjectXsrf: () => false,
        getStoredCookie: async () => 'token',
      });
      expect(noXsrf['X-XSRF-TOKEN']).toBeUndefined();

      const anonymous = await fixturesTest.buildDefaultHeaders('anonymous', {
        shouldAutoInjectXsrf: () => true,
        getStoredCookie: async () => 'token',
      });
      expect(anonymous['X-XSRF-TOKEN']).toBeUndefined();

      let calls = 0;
      const fakeContext = {} as unknown as Awaited<ReturnType<typeof fixturesTest.buildRequestContext>>;
      const requestFactory = async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('Unexpected end of JSON input');
        }
        return fakeContext;
      };
      const recovered = await fixturesTest.buildRequestContext(
        'solicitor',
        'state-1',
        {},
        {
          requestFactory,
          ensureStorageState: async () => 'state-2',
          unlink: async () => {},
        }
      );
      expect(recovered).toBe(fakeContext);

      let unlinkCalls = 0;
      let unlinkFactoryCalls = 0;
      const unlinkFactory = async () => {
        unlinkFactoryCalls += 1;
        if (unlinkFactoryCalls === 1) {
          throw new Error('Unexpected end of JSON input');
        }
        return fakeContext;
      };
      const recoveredAfterUnlink = await fixturesTest.buildRequestContext(
        'solicitor',
        'state-1',
        {},
        {
          requestFactory: unlinkFactory,
          ensureStorageState: async () => 'state-2',
          unlink: async () => {
            unlinkCalls += 1;
            throw new Error('unlink failed');
          },
        }
      );
      expect(recoveredAfterUnlink).toBe(fakeContext);
      expect(unlinkCalls).toBe(1);

      let missingStateCalls = 0;
      const missingStateFactory = async () => {
        missingStateCalls += 1;
        if (missingStateCalls === 1) {
          throw new Error("ENOENT: no such file or directory, open 'test-results/storage-states/api/aat/solicitor.json'");
        }
        return fakeContext;
      };
      const recoveredAfterMissingState = await fixturesTest.buildRequestContext(
        'solicitor',
        'state-1',
        {},
        {
          requestFactory: missingStateFactory,
          ensureStorageState: async () => 'state-2',
          unlink: async () => {},
        }
      );
      expect(recoveredAfterMissingState).toBe(fakeContext);

      const failingFactory = async () => {
        throw new Error('boom');
      };
      await expect(
        fixturesTest.buildRequestContext('solicitor', 'state-1', {}, { requestFactory: failingFactory })
      ).rejects.toThrow('boom');
    });
  });

  test('fixture helpers rebuild stale authenticated API storage before use', async () => {
    await test.step('harness-check:fixtures-stale-state', async () => {
      type RequestContext = Awaited<ReturnType<typeof fixturesTest.buildRequestContext>>;

      let staleDisposed = false;
      const staleContext = {
        get: async () => ({
          status: () => 200,
          json: async () => false,
        }),
        dispose: async () => {
          staleDisposed = true;
        },
      } as unknown as RequestContext;
      const freshContext = {
        get: async () => ({
          status: () => 200,
          json: async () => true,
        }),
        dispose: async () => undefined,
      } as unknown as RequestContext;
      const contexts = [staleContext, freshContext];
      const requestedStorageStates: Array<string | undefined> = [];
      let unlinkCalls = 0;

      const context = await fixturesTest.buildAuthenticatedRequestContext('solicitor', 'state-1', {}, {
        requestFactory: async (options) => {
          requestedStorageStates.push(typeof options?.storageState === 'string' ? options.storageState : undefined);
          const nextContext = contexts.shift();
          if (!nextContext) {
            throw new Error('unexpected request context build');
          }
          return nextContext;
        },
        ensureStorageState: async () => 'state-2',
        unlink: async () => {
          unlinkCalls += 1;
        },
      });

      expect(context).toBe(freshContext);
      expect(staleDisposed).toBe(true);
      expect(unlinkCalls).toBe(1);
      expect(requestedStorageStates).toEqual(['state-1', 'state-2']);
    });
  });
});
