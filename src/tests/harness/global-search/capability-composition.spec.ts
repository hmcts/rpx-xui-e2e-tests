import fs from 'node:fs';

import { test, expect } from '../../../fixtures/harnessGlobalSearch';
import { EXPECTED_GLOBAL_SERVICES, assertGlobalSearchMutationSubmission, globalSearchJournal, observeGlobalSearchPost } from '../../../harness/globalSearch';

const resultUrl = 'http://127.0.0.1:3100/api/globalsearch/results';

test('actual Global Search services compose into rendered All-search scope through the candidate Node handler', {
  annotation: { type: 'harness-proof', description: process.env.EXUI_HARNESS_MUTATION ? 'global-search-wa-list' : 'global-search-all-services' },
}, async ({ page }) => {
  const servicesReady = page.waitForResponse(response => response.url() === 'http://127.0.0.1:3100/api/globalSearch/services' && response.request().method() === 'GET');
  await page.goto('/search');
  const servicesResponse = await servicesReady;
  expect(servicesResponse.status()).toBe(200);
  const delivered = await servicesResponse.json();
  expect(Array.isArray(delivered)).toBe(true);
  const select = page.getByRole('combobox', { name: 'Services', exact: true });
  // Synchronization only: the independent nine-ID oracle runs after the mutant's valid POST.
  const options = select.locator('option:not([value="ALL"])');
  await expect(options).toHaveCount(delivered.length);
  await expect(select).toHaveValue('ALL');
  const rendered = await options.evaluateAll(items => items.map(item => ({ id: (item as HTMLOptionElement).value, label: item.textContent?.trim() ?? '' })));
  await page.locator('form').getByLabel('16-digit case reference', { exact: true }).fill('1111222233334444');
  const before = globalSearchJournal().length;
  const postRequest = page.waitForRequest(request => request.url() === resultUrl && request.method() === 'POST');
  const postResponse = page.waitForResponse(response => response.url() === resultUrl && response.request().method() === 'POST');
  const auxiliary = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === 'http://127.0.0.1:3100' && decodeURIComponent(url.pathname) === '/aggregated/caseworkers/:uid/jurisdictions' && url.searchParams.size === 1 && url.searchParams.get('access') === 'read' && response.request().method() === 'GET';
  });
  await page.locator('form').getByRole('button', { name: 'Search', exact: true }).click();
  const [browserPost, response, jurisdictionResponse] = await Promise.all([postRequest, postResponse, auxiliary]);
  expect(response.status()).toBe(200);
  expect(jurisdictionResponse.status()).toBe(200);
  const observed = observeGlobalSearchPost(browserPost.url(), browserPost.method(), await browserPost.allHeaders());
  const journal = globalSearchJournal();
  expect(journal).toContainEqual({ port: 3101, method: 'GET', path: '/refdata/location/orgServices', query: [], body: null });
  expect(journal).toContainEqual({ port: 3101, method: 'GET', path: '/aggregated/caseworkers/harness-supervisor/jurisdictions', query: [['access', 'read']], body: null });
  const posts = journal.slice(before).filter(item => item.port === 3101 && item.method === 'POST' && item.path === '/globalSearch');
  expect(posts).toHaveLength(1);
  const upstream = posts[0].body as { searchCriteria: { CCDJurisdictionIds: string[]; caseReferences: string[] } };
  expect(upstream.searchCriteria.caseReferences).toEqual(['1111222233334444']);
  fs.writeFileSync(`${process.env.EXUI_GLOBAL_SEARCH_EVIDENCE}/global-search-browser-observation.json`, JSON.stringify({ ...observed, delivered, rendered, upstream }, null, 2));
  assertGlobalSearchMutationSubmission(upstream.searchCriteria.CCDJurisdictionIds, process.env.EXUI_HARNESS_MUTATION);

  await test.step('harness-assertion:global-search-capability-scope', async () => {
    expect(rendered.map(item => item.id).sort()).toEqual(EXPECTED_GLOBAL_SERVICES.map(item => item.id).sort());
    expect(upstream.searchCriteria.CCDJurisdictionIds.slice().sort()).toEqual(EXPECTED_GLOBAL_SERVICES.map(item => item.id).sort());
    expect(rendered.slice().sort((a, b) => a.id.localeCompare(b.id))).toEqual(EXPECTED_GLOBAL_SERVICES.slice().sort((a, b) => a.id.localeCompare(b.id)));
  });
});
