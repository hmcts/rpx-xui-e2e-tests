const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const load = () => import('./lib/exui-st-cic-profile-provider.mjs');
const cases = () => import('./fixtures/exui-st-cic-profile.mock.mjs');
function context(t, facet) {
  const output = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'st-cic-provider-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  return { facet, output, journal: [], support: [] };
}
async function invoke(handler, current, vector, overrides = {}) {
  const bytes = Object.hasOwn(overrides, 'raw') ? overrides.raw : vector.body === undefined ? '' : JSON.stringify(vector.body);
  const request = Readable.from(overrides.chunks ?? [Buffer.from(bytes)]);
  Object.assign(request, { method: vector.method, url: vector.path, headers: { ...vector.requiredHeaders, authorization: 'PRIVATE-AUTH-CANARY', cookie: 'PRIVATE-COOKIE-CANARY' }, ...overrides });
  const response = { status: undefined, body: undefined, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = JSON.parse(body); } };
  const handled = await handler(request, response, current);
  return { handled, response };
}
function saved(current, name) { return JSON.parse(fs.readFileSync(path.join(current.output, name))); }

for (const [facet, indices] of [
  ['st-cic-wa', [0, 1, 2, 3]],
  ['st-cic-staff', [4, 5, 11, 12]],
  ['st-cic-mapping', [6, 7, 8, 9, 10, 13, 14, 15, 16]],
  ['st-cic-global-search', [17, 18, 19, 20, 21]],
]) test(`${facet}: serves only literal upstream source and deliberate-fault vectors`, async t => {
  const { handleStCicProvider } = await load(), { ST_CIC_PROVIDER_CASES } = await cases(), current = context(t, facet);
  for (const index of indices) {
    const vector = ST_CIC_PROVIDER_CASES[index], result = await invoke(handleStCicProvider, current, vector);
    assert.equal(result.handled, true); assert.equal(result.response.status, 200);
    assert.deepEqual(result.response.body, vector.response);
    assert.deepEqual(result.response.headers, { 'content-type': 'application/json' });
  }
  assert.deepEqual(saved(current, 'profile-st-cic-destinations.json'), current.journal);
  if (facet === 'st-cic-global-search') {
    assert.deepEqual(current.support, [{ method: 'GET', path: '/refdata/external/v1/organisations', status: 200, body: {} }]);
    assert.deepEqual(saved(current, 'profile-st-cic-support.json'), current.support);
    assert.equal(current.journal.length, indices.length - 1);
    assert(current.journal.every(row => row.path !== '/refdata/external/v1/organisations'));
  } else assert.equal(current.journal.length, indices.length);
  for (const file of fs.readdirSync(current.output)) {
    assert.equal(fs.statSync(path.join(current.output, file)).mode & 0o777, 0o600);
    assert(!fs.readFileSync(path.join(current.output, file), 'utf8').includes('CANARY'));
  }
});

test('health facet records only empty GET /health and never invents candidate aggregate responses', async t => {
  const { handleStCicProvider } = await load(), current = context(t, 'st-cic-wa-health');
  for (let index = 0; index < 12; index++) {
    const result = await invoke(handleStCicProvider, current, { method: 'GET', path: '/health' });
    assert.equal(result.handled, true); assert.deepEqual(result.response.body, { status: 'UP' });
  }
  assert.deepEqual(saved(current, 'profile-st-cic-destinations.json'), Array.from({ length: 12 }, () => ({ method: 'GET', path: '/health' })));
  assert.equal(current.support.length, 0);
});

test('global query matching normalizes only jurisdiction set ordering, retaining every other field', async t => {
  const { handleStCicProvider } = await load(), { ST_CIC_PROVIDER_CASES } = await cases(), current = context(t, 'st-cic-global-search');
  const vector = structuredClone(ST_CIC_PROVIDER_CASES[20]);
  vector.body.searchCriteria.CCDJurisdictionIds.reverse();
  assert.equal((await invoke(handleStCicProvider, current, vector)).handled, true);
  assert.deepEqual(current.journal[0].body.searchCriteria.CCDJurisdictionIds, ST_CIC_PROVIDER_CASES[20].body.searchCriteria.CCDJurisdictionIds);
  for (const mutate of [
    body => body.searchCriteria.CCDJurisdictionIds.push(body.searchCriteria.CCDJurisdictionIds[0]),
    body => body.searchCriteria.caseReferences.push('9999000011112222'),
    body => body.searchCriteria.CCDJurisdictionIds.push('FOREIGN-CANARY'),
    body => { body.extra = 'PRIVATE-BODY-CANARY'; },
  ]) {
    const bad = structuredClone(vector); mutate(bad.body);
    const result = await invoke(handleStCicProvider, current, bad);
    assert.equal(result.handled, false); assert.equal(result.response.status, undefined);
  }
  assert.equal(current.journal.length, 1);
});

test('role query requires exact single pagination headers and unchanged role order/body', async t => {
  const { handleStCicProvider } = await load(), { ST_CIC_PROVIDER_CASES } = await cases(), current = context(t, 'st-cic-staff'), vector = ST_CIC_PROVIDER_CASES[5];
  for (const headers of [{}, { pagenumber: '1', size: '100000' }, { pagenumber: '0', size: '10' }, { pagenumber: ['0', '0'], size: '100000' }]) {
    assert.equal((await invoke(handleStCicProvider, current, vector, { headers })).handled, false);
  }
  const reversed = structuredClone(vector); reversed.body.roleName.reverse();
  assert.equal((await invoke(handleStCicProvider, current, reversed)).handled, false);
  assert.equal((await invoke(handleStCicProvider, current, vector)).handled, true);
  assert.equal(current.journal.length, 1);
});

test('body limit accepts the exact 4096-byte fixture and rejects valid JSON above the limit across chunks', async t => {
  const { handleStCicProvider } = await load(), { ST_CIC_PROVIDER_CASES } = await cases(), current = context(t, 'st-cic-mapping'), vector = ST_CIC_PROVIDER_CASES[6];
  const raw = JSON.stringify(vector.body).padEnd(4096, ' ');
  assert.equal((await invoke(handleStCicProvider, current, vector, { raw })).handled, true);
  for (const chunks of [[Buffer.from(raw + ' ')], [Buffer.from(raw.slice(0, 2000)), Buffer.from(raw.slice(2000) + ' ')]]) {
    assert.equal((await invoke(handleStCicProvider, current, vector, { chunks })).handled, false);
  }
  assert.equal(current.journal.length, 1);
  assert.equal(saved(current, 'profile-st-cic-destinations.json').length, 1);
});

test('malformed, excessive, foreign and wrong-method traffic returns false without response or raw diagnostics', async t => {
  const { handleStCicProvider } = await load(), { ST_CIC_PROVIDER_CASES } = await cases(), current = context(t, 'st-cic-mapping'), vector = ST_CIC_PROVIDER_CASES[6];
  for (const overrides of [
    { raw: '{PRIVATE-JSON-CANARY' }, { raw: 'x'.repeat(4097) },
    { chunks: [Buffer.alloc(2000, 'x'), Buffer.alloc(2000, 'x'), Buffer.from('PRIVATE-BODY-CANARY'.repeat(10))] },
    { method: 'DELETE' }, { url: '/foreign/PRIVATE-PATH-CANARY' },
    { url: vector.path + '?token=PRIVATE-QUERY-CANARY' },
  ]) {
    const result = await invoke(handleStCicProvider, current, vector, overrides);
    assert.equal(result.handled, false); assert.equal(result.response.status, undefined); assert.equal(result.response.body, undefined);
  }
  assert.equal((await invoke(handleStCicProvider, current, ST_CIC_PROVIDER_CASES[4])).handled, false, 'another facet remains foreign');
  assert.equal((await invoke(handleStCicProvider, current, { method: 'POST', path: '/o/token' }, { raw: 'password=PRIVATE-PASSWORD-CANARY' })).handled, false, 'authentication remains shared');
  assert.deepEqual(current.journal, []); assert.deepEqual(current.support, []); assert.deepEqual(fs.readdirSync(current.output), []);
});

test('GET bodies, invalid facets and transport read failures cannot emit fixtures or leak diagnostics', async t => {
  const { handleStCicProvider } = await load(), current = context(t, 'st-cic-global-search');
  for (const raw of [' ', 'PRIVATE-GET-CANARY']) assert.equal((await invoke(handleStCicProvider, current, { method: 'GET', path: '/refdata/location/orgServices' }, { raw })).handled, false);
  assert.equal((await invoke(handleStCicProvider, { ...current, facet: 'foreign-CANARY' }, { method: 'GET', path: '/refdata/location/orgServices' })).handled, false);
  const request = { method: 'POST', url: '/globalSearch', headers: {}, async *[Symbol.asyncIterator]() { throw Error('PRIVATE-STREAM-CANARY'); } };
  assert.equal(await handleStCicProvider(request, {}, current), false);
  assert.deepEqual(current.journal, []); assert.deepEqual(fs.readdirSync(current.output), []);
  const source = fs.readFileSync(path.join(__dirname, 'lib/exui-st-cic-profile-provider.mjs'), 'utf8');
  assert(!source.includes('ST_CIC_CANDIDATE_RESPONSES')); assert(!source.includes('exui-st-cic-profile-consumers'));
});

// Pinned 20c6ec1 computes ST_CIC court type14 before mapping its service code.
test('mapping venue search requires literal court type14 for baseline and mapping-only fault', async t => {
  const { handleStCicProvider } = await load(), current = context(t, 'st-cic-mapping');
  for (const [service, id] of [['BBA2', '100001'], ['ZZZ1', '100002']]) {
    const literal = { method: 'GET', path: `/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=14&service_code=${service}` };
    const result = await invoke(handleStCicProvider, current, literal);
    assert.equal(result.handled, true);
    assert.equal(result.response.status, 200);
    assert.equal(result.response.body[0].service_code, service);
    assert.equal(result.response.body[0].epimms_id, id);
    for (const court of ['', '18', '14,18']) {
      const rejected = await invoke(handleStCicProvider, current, { ...literal, path: literal.path.replace('court-type-id=14&', `court-type-id=${court}&`) });
      assert.equal(rejected.handled, false);
      assert.equal(rejected.response.status, undefined);
    }
  }
  assert.deepEqual(current.journal, [
    { method: 'GET', path: '/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=14&service_code=BBA2' },
    { method: 'GET', path: '/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=14&service_code=ZZZ1' },
  ]);
});
