import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';

import { expect, test } from '@playwright/test';
import ts from 'typescript';

type HelperExports = typeof import('../../integration/helpers/caseViewerMockRoutes.helper.js');
type Variant = Parameters<HelperExports['openCaseViewer']>[2];
type Response = { status: number; contentType: string; body: string };
type RouteHandler = (route: { fulfill: (response: Response) => Promise<void> }) => Promise<void>;

const helperPath = fileURLToPath(new URL('../../integration/helpers/caseViewerMockRoutes.helper.ts', import.meta.url));
// Execute the actual helper without importing session/auth code or adding a TS loader.
const executeHelper = compileFunction(ts.transpileModule(readFileSync(helperPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, ['exports', 'require'], { filename: helperPath });

function subject() {
  const calls: string[] = [];
  const routes: { pattern: string; handler: RouteHandler }[] = [];
  const session = { applySessionCookies: async () => { calls.push('session'); } };
  const base = { setupNgIntegrationBaseRoutes: async () => { calls.push('base'); } };
  const jurisdiction = { setupCaseworkerJurisdictionsRoute: async () => { calls.push('jurisdiction'); } };
  const builtVariants: Variant[] = [];
  const dependencies: Record<string, unknown> = {
    './sessionUser.helper.js': session,
    './ngIntegrationMockRoutes.helper.js': base,
    './caseworkerJurisdictionMockRoutes.helper.js': jurisdiction,
    '../mocks/caseViewer.mock.js': {
      buildCaseViewerMock: (variant: Variant) => { builtVariants.push(variant); return { variant }; },
      CASE_VIEWER_CASE_REFERENCE: 'synthetic-case',
      CASE_VIEWER_CASE_TYPE: 'synthetic-type',
      CASE_VIEWER_JURISDICTION: 'synthetic-jurisdiction',
    },
  };
  const exports = {} as HelperExports;
  executeHelper(exports, (name: string) => {
    if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected helper dependency: ${name}`);
    return dependencies[name];
  });
  const page = {
    async route(pattern: string, handler: RouteHandler) { calls.push('route'); routes.push({ pattern, handler }); },
    async goto(url: string) { calls.push(url); },
  };
  const viewer = { async waitForReady() { calls.push('ready'); } };
  return { ...exports, page, viewer, calls, routes, session, base, jurisdiction, builtVariants };
}

type Subject = ReturnType<typeof subject>;
type Reject = () => Promise<never>;
const failurePoints = {
  applySessionCookies: (s: Subject, fail: Reject) => { s.session.applySessionCookies = fail; },
  setupNgIntegrationBaseRoutes: (s: Subject, fail: Reject) => { s.base.setupNgIntegrationBaseRoutes = fail; },
  setupCaseworkerJurisdictionsRoute: (s: Subject, fail: Reject) => { s.jurisdiction.setupCaseworkerJurisdictionsRoute = fail; },
  route: (s: Subject, fail: Reject) => { s.page.route = fail; },
  goto: (s: Subject, fail: Reject) => { s.page.goto = fail; },
};
const viewerUrl = '/cases/case-details/synthetic-jurisdiction/synthetic-type/synthetic-case';

async function caseResponse(s: Subject) {
  expect(s.routes.map(({ pattern }) => pattern)).toEqual(['**/data/internal/cases/synthetic-case*']);
  const responses: Response[] = [];
  await s.routes[0].handler({ fulfill: async (value) => { responses.push(value); } });
  expect(responses).toHaveLength(1);
  return responses[0];
}

test.describe('case viewer mock route readiness', { tag: '@svc-internal' }, () => {
  for (const variant of [undefined, 'populated', 'empty', 'shuttered'] as const) {
    test(`HTTP 200 ${variant ?? 'default'} waits for normal readiness after setup and navigation`, async () => {
      const s = subject();
      await s.openCaseViewer(s.page as never, s.viewer as never, variant);
      expect(s.calls).toEqual(['session', 'base', 'jurisdiction', 'route', viewerUrl, 'ready']);
      const response = await caseResponse(s);
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ variant: variant ?? 'populated' });
      expect(s.builtVariants).toEqual([variant ?? 'populated']);
    });
  }

  for (const status of [500, 404]) {
    test(`deliberate HTTP ${status} returns to caller assertions without normal readiness`, async () => {
      const s = subject();
      s.viewer.waitForReady = async () => {
        throw new Error('Normal viewer readiness cannot succeed on the deliberate error response');
      };
      await s.openCaseViewer(s.page as never, s.viewer as never, 'populated', status);
      expect(s.calls).toEqual(['session', 'base', 'jurisdiction', 'route', viewerUrl]);
      const response = await caseResponse(s);
      expect(response.status).toBe(status);
      expect(response.contentType).toBe('application/json');
      expect(JSON.parse(response.body)).toEqual({ message: 'case-viewer-load-failed' });
      expect(s.builtVariants).toEqual([]);
    });
  }

  for (const status of [200, 500]) {
    for (const [method, replace] of Object.entries(failurePoints)) {
      test(`HTTP ${status} propagates ${method} failure without reaching readiness`, async () => {
        const s = subject();
        const failure = new Error(`${method} failed`);
        replace(s, async () => { throw failure; });
        await expect(s.openCaseViewer(s.page as never, s.viewer as never, 'populated', status)).rejects.toBe(failure);
        expect(s.calls).not.toContain('ready');
        expect(s.calls).not.toContain(viewerUrl);
      });
    }
  }

  test('HTTP 200 propagates normal readiness failure', async () => {
    const s = subject();
    const failure = new Error('Case details tabs did not become visible');
    s.viewer.waitForReady = async () => { throw failure; };
    await expect(s.openCaseViewer(s.page as never, s.viewer as never)).rejects.toBe(failure);
  });

  for (const [status, method] of [[200, 'waitForReady'], [500, 'goto']] as const) {
    test(`HTTP ${status} awaits ${method} before returning`, async () => {
      const s = subject();
      let release!: () => void;
      const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
      let completed = false;
      let callCount = 0;
      const deferred = () => { callCount++; return gate; };
      if (status === 200) s.viewer.waitForReady = deferred;
      else s.page.goto = deferred;
      const opening = s.openCaseViewer(s.page as never, s.viewer as never, 'populated', status).then(() => { completed = true; });
      try {
        await new Promise<void>(setImmediate);
        expect(callCount).toBe(1);
        expect(completed).toBe(false);
      } finally {
        release();
        await opening;
      }
      expect(completed).toBe(true);
    });
  }
});
