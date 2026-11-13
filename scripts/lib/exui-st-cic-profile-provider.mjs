import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ST_CIC_PROVIDER_CASES } from '../fixtures/exui-st-cic-profile.mock.mjs';
import { writeJsonAtomic } from './exui-evidence-io.mjs';

const paths = {
  'st-cic-wa': ['/task/search-for-completable'],
  'st-cic-staff': ['/refdata/internal/staff/usersByServiceName', '/am/role-assignments/query'],
  'st-cic-mapping': ['/refdata/judicial/users/search', '/refdata/judicial/users', '/refdata/location/court-venues/services', '/refdata/location/court-venues/venue-search', '/am/bookings/query'],
  'st-cic-global-search': ['/refdata/location/orgServices', '/refdata/external/v1/organisations', '/aggregated/caseworkers/harness-supervisor/jurisdictions', '/globalSearch'],
  'st-cic-wa-health': ['/health'],
};
function globalBody(value) {
  const copy = structuredClone(value);
  if (Array.isArray(copy?.searchCriteria?.CCDJurisdictionIds)) copy.searchCriteria.CCDJurisdictionIds.sort();
  return copy;
}

// Called after shared authentication handling; false leaves rejection to its fixed-code boundary.
export async function handleStCicProvider(request, response, { facet, journal, output, support }) {
  if (!Object.hasOwn(paths, facet)) return false;
  const fixtures = facet === 'st-cic-wa-health'
    ? [{ method: 'GET', path: '/health', response: { status: 'UP' } }]
    : ST_CIC_PROVIDER_CASES.filter(row => paths[facet].includes(row.path.split('?')[0]));
  const candidates = fixtures.filter(row => row.method === request.method && row.path === request.url);
  if (!candidates.length) return false;
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size <= 4096) chunks.push(bytes);
    }
  } catch { return false; }
  if (size > 4096) return false;
  const raw = Buffer.concat(chunks).toString('utf8');
  let body;
  if (request.method === 'POST') {
    try { body = JSON.parse(raw); } catch { return false; }
  } else if (raw !== '') return false;
  const normalize = request.url === '/globalSearch' ? globalBody : value => value;
  const selected = candidates.find(row =>
    isDeepStrictEqual(normalize(body), normalize(row.body)) &&
    Object.entries(row.requiredHeaders ?? {}).every(([key, value]) => request.headers?.[key] === value));
  if (!selected) return false;
  if (selected.journal === 'support') {
    support.push({ method: selected.method, path: selected.path, status: 200, body: structuredClone(selected.response) });
  } else {
    journal.push({ method: selected.method, path: selected.path, ...(selected.body === undefined ? {} : { body: structuredClone(selected.body) }) });
  }
  writeJsonAtomic(path.join(output, 'profile-st-cic-destinations.json'), journal);
  writeJsonAtomic(path.join(output, 'profile-st-cic-support.json'), support);
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(selected.response));
  return true;
}
