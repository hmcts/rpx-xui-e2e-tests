import type { uploadSyntheticDoc } from '../../../utils/api/evidenceManagerUtils';

type UploadDeps = Parameters<typeof uploadSyntheticDoc>[0];
type Scenario = { status?: number; id?: string | null; failureAt?: 'session' | 'cookie' | 'context' | 'post' | 'json'; cleanupFailure?: boolean };

export function documentUploadScenario(scenario: Scenario = {}) {
  const original = new Error('Original setup failure');
  const cleanup = new Error('Context disposal failure');
  let disposed = 0;
  let posts = 0;
  const context = {
    post: async () => {
      posts++;
      if (scenario.failureAt === 'post') throw original;
      return {
        ok: () => (scenario.status ?? 200) >= 200 && (scenario.status ?? 200) < 300,
        status: () => scenario.status ?? 200,
        json: async () => {
          if (scenario.failureAt === 'json') throw original;
          return { documents: [{ documentId: scenario.id === undefined ? 'uploaded-document' : scenario.id }] };
        },
      };
    },
    dispose: async () => {
      disposed++;
      if (scenario.cleanupFailure) throw cleanup;
    },
  };
  const deps: UploadDeps = {
    ensureStorageState: async () => {
      if (scenario.failureAt === 'session') throw original;
      return 'synthetic-state.json';
    },
    getStoredCookie: async () => {
      if (scenario.failureAt === 'cookie') throw original;
      return undefined;
    },
    requestFactory: async () => {
      if (scenario.failureAt === 'context') throw original;
      return context as never;
    },
  };
  return { deps, original, cleanup, disposed: () => disposed, posts: () => posts };
}
