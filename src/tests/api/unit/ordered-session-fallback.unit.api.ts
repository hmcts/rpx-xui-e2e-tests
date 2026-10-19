import { expect, test } from '@playwright/test';

import { withOrderedSessionFallback } from '../../common/orderedSessionFallback.js';

const candidate = (userIdentifier: string, email: string) => ({
  userIdentifier,
  email,
  password: 'test-password',
});

test.describe('ordered session fallback', { tag: '@svc-internal' }, () => {
  test('falls back after an explicit IDAM rejection', async () => {
    const attempted: string[] = [];
    const result = await withOrderedSessionFallback(
      [candidate('primary', 'primary@example.test'), candidate('secondary', 'secondary@example.test')],
      async (identity) => {
        attempted.push(identity.userIdentifier);
        if (identity.userIdentifier === 'primary') {
          throw new Error('Login page error: email or password is incorrect');
        }
        return 'session';
      }
    );

    expect(result).toEqual({ selectedUserIdentifier: 'secondary', value: 'session' });
    expect(attempted).toEqual(['primary', 'secondary']);
  });

  test('does not rotate on an unrelated capture failure', async () => {
    const attempted: string[] = [];
    await expect(
      withOrderedSessionFallback(
        [candidate('primary', 'primary@example.test'), candidate('secondary', 'secondary@example.test')],
        async (identity) => {
          attempted.push(identity.userIdentifier);
          throw new Error('Failed parsing storage file');
        }
      )
    ).rejects.toThrow('Failed parsing storage file');
    expect(attempted).toEqual(['primary']);
  });

  test('allows one bounded probe after an unexplained IDAM login failure', async () => {
    const attempted: string[] = [];
    await expect(
      withOrderedSessionFallback(
        [
          candidate('primary', 'primary@example.test'),
          candidate('secondary', 'secondary@example.test'),
          candidate('tertiary', 'tertiary@example.test'),
        ],
        async (identity) => {
          attempted.push(identity.userIdentifier);
          throw new Error('Login did not establish session cookies for primary.');
        }
      )
    ).rejects.toThrow('Login did not establish session cookies');
    expect(attempted).toEqual(['primary', 'secondary']);
  });

  test('rotates through all identities for login-surface failures', async () => {
    const attempted: string[] = [];
    const result = await withOrderedSessionFallback(
      [
        candidate('primary', 'primary@example.test'),
        candidate('secondary', 'secondary@example.test'),
        candidate('tertiary', 'tertiary@example.test'),
      ],
      async (identity) => {
        attempted.push(identity.userIdentifier);
        if (identity.userIdentifier !== 'tertiary') {
          throw new Error(`Unable to capture UI session for ${identity.userIdentifier}. Attempts: Login page did not render.`);
        }
        return 'session';
      }
    );

    expect(result).toEqual({ selectedUserIdentifier: 'tertiary', value: 'session' });
    expect(attempted).toEqual(['primary', 'secondary', 'tertiary']);
  });

  test('bounds genuine auth-cookie capture timeouts to one probe', async () => {
    const attempted: string[] = [];
    await expect(
      withOrderedSessionFallback(
        [
          candidate('primary', 'primary@example.test'),
          candidate('secondary', 'secondary@example.test'),
          candidate('tertiary', 'tertiary@example.test'),
        ],
        async (identity) => {
          attempted.push(identity.userIdentifier);
          throw new Error(
            `Unable to capture UI session for ${identity.userIdentifier}. Attempts: Timed out waiting for auth cookies.`
          );
        }
      )
    ).rejects.toThrow('Timed out waiting for auth cookies');
    expect(attempted).toEqual(['primary', 'secondary']);
  });

  test('deduplicates candidates that resolve to the same email', async () => {
    const attempted: string[] = [];
    const result = await withOrderedSessionFallback(
      [candidate('primary', 'same@example.test'), candidate('alias', 'SAME@example.test')],
      async (identity) => {
        attempted.push(identity.userIdentifier);
        return 'session';
      }
    );

    expect(result.selectedUserIdentifier).toBe('primary');
    expect(attempted).toEqual(['primary']);
  });
});
