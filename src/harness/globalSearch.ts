import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

// Literal browser oracle, separately authored from upstream reference-data fixtures and candidate config.
export const EXPECTED_GLOBAL_SERVICES = [
  { id: 'IA', label: 'Synthetic Immigration' },
  { id: 'CIVIL', label: 'Synthetic Civil' },
  { id: 'PRIVATELAW', label: 'Synthetic Private Law' },
  { id: 'PUBLICLAW', label: 'Synthetic Public Law' },
  { id: 'EMPLOYMENT', label: 'Synthetic Employment' },
  { id: 'ST_CIC', label: 'Synthetic Special Tribunals' },
  { id: 'PROBATE', label: 'Synthetic Probate' },
  { id: 'PCS', label: 'Synthetic Possession' },
  { id: 'DIVORCE', label: 'Synthetic Divorce' },
];
export function isGlobalSearchAsset(url: string, resourceType: string) {
  const parsed = new URL(url);
  return parsed.origin === 'http://127.0.0.1:3100' && (resourceType === 'script' || /\.m?js$/.test(parsed.pathname));
}
export function observeGlobalSearchPost(url: string, method: string, headers: Record<string, string>) {
  assert(url === 'http://127.0.0.1:3100/api/globalsearch/results' && method === 'POST', 'GLOBAL_SEARCH_POST_CONTRACT');
  const token = headers['x-xsrf-token'];
  assert(typeof token === 'string' && token.trim().length > 0, 'ACTUAL_BROWSER_CSRF_HEADER_REQUIRED');
  return { url, method, csrfHeaderPresent: true, csrfHeaderDigest: `sha256:${createHash('sha256').update(token).digest('hex')}` };
}
export function assertGlobalSearchMutationSubmission(ids: string[], mutation: string | undefined) {
  if (mutation !== 'global-search-wa-capability') return;
  // The fault is eligible only after its independently expected seven-service request completed.
  assert.deepEqual(ids.slice().sort(), ['IA', 'CIVIL', 'PRIVATELAW', 'PUBLICLAW', 'EMPLOYMENT', 'ST_CIC', 'PCS'].sort(), 'GLOBAL_SEARCH_MUTANT_POST_MUST_BE_WA_SEVEN');
}
export interface GlobalSearchJournalEntry {
  port: number;
  method: string;
  path: string;
  query: string[][];
  body: unknown;
}
export function globalSearchJournal(): GlobalSearchJournalEntry[] {
  const file = `${process.env.EXUI_GLOBAL_SEARCH_EVIDENCE}/global-search-destinations.jsonl`;
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}
