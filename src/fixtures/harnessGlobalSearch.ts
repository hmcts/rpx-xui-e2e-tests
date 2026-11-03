import fs from 'node:fs';

import { isGlobalSearchAsset } from '../harness/globalSearch';
import { verifyRoutingAsset } from '../harness/routing';

import { installCandidateBrowserSeams } from './harness';
import { test as base, expect } from './harnessIdentity';

// Use only the shared egress/flag seam, never the older main-filename observation fixture.
export const test = base.extend<{ globalSearchAssets: void }>({
  globalSearchAssets: [async ({ context, page, apiIdentity }, use, testInfo) => {
    void apiIdentity;
    const manifest = JSON.parse(fs.readFileSync(process.env.EXUI_CANDIDATE_RUN_MANIFEST!, 'utf8'));
    expect(manifest.releaseScopeId).toBe('exui-global-search-pilot');
    const checks: Promise<void>[] = [], served: { path: string; digest: string }[] = [];
    context.on('response', response => {
      if (!isGlobalSearchAsset(response.url(), response.request().resourceType())) return;
      checks.push((async () => { served.push(verifyRoutingAsset(process.env.EXUI_CANDIDATE_ASSETS!, new URL(response.url()).pathname, await response.body())); })());
    });
    const rejected = await installCandidateBrowserSeams(context);
    try {
      await use();
    } finally {
      // Asset and egress failures remain teardown failures even when the proof fails.
      await Promise.all(checks);
      fs.writeFileSync(`${process.env.EXUI_GLOBAL_SEARCH_EVIDENCE}/global-search-assets.json`, JSON.stringify(served, null, 2));
      expect(served.length, 'actual candidate scripts consumed').toBeGreaterThan(0);
      expect(rejected, 'undeclared browser destinations prevent credit').toEqual([]);
      if (testInfo.status !== testInfo.expectedStatus)
        fs.writeFileSync(`${process.env.EXUI_GLOBAL_SEARCH_EVIDENCE}/global-search-ui-state.json`, JSON.stringify({ url: page.url(), body: await page.locator('body').innerText() }, null, 2));
    }
  }, { auto: true }],
});
export { expect };
