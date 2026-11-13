import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { CANDIDATE_URL } from './exui-candidate-runtime.mjs';
import { BASE_HEALTH, WA_HEALTH } from './exui-source-profile-wa-health.mjs';
import { stCicFacet } from './exui-st-cic-profile-contract.mjs';

const noCredit = { runtimeAcceptance: false, catalogueCredit: false, wholeProfileSatisfied: false, releaseCredit: false };
const staff = 'ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS'.split(',');
const roles = ['hearing-centre-admin','case-manager','ctsc','tribunal-caseworker','hmcts-legal-operations','task-supervisor','hmcts-admin','national-business-centre','senior-tribunal-caseworker','case-allocator','regional-centre-admin'];
const get = path => ({ method: 'GET', path });
const post = (path, body) => ({ method: 'POST', path, body });
const users = [
  { email: 'st_cic@example.invalid', firstName: 'Synthetic ST_CIC', idamId: 'profile-st_cic', lastName: 'Staff', location: { id: '100001', locationName: 'Synthetic staff location' }, roleCategories: ['ADMIN'], service: 'ST_CIC' },
  { email: 'ia@example.invalid', firstName: 'Synthetic IA', idamId: 'profile-ia', lastName: 'Staff', location: { id: '100001', locationName: 'Synthetic staff location' }, roleCategories: ['LEGAL_OPERATIONS'], service: 'IA' },
];
const person = { idamId: 'judicial-BBA2', fullName: 'Synthetic BBA2', emailId: 'bba2@example.invalid' };
const venue = { epimms_id: '100001', site_name: 'Synthetic BBA2', region_id: '1', court_type_id: '18', service_code: 'BBA2', is_case_management_location: 'Y', is_hearing_location: 'Y' };
const waCalls = [
  { path: '/workallocation/case/tasks/1111222233334444/event/profileRouteSTCIC/caseType/HarnessPositiveSTCIC/jurisdiction/ST_CIC', family: 'ST_CIC', caseId: '1111222233334444', event: 'profileRouteSTCIC', type: 'HarnessPositiveSTCIC', marker: 'positive-st-cic-route' },
  { path: '/workallocation/case/tasks/3333444455556666/event/profileRouteIA/caseType/HarnessPositiveIA/jurisdiction/IA', family: 'IA', caseId: '3333444455556666', event: 'profileRouteIA', type: 'HarnessPositiveIA', marker: 'positive-ia-route' },
  { path: '/workallocation/searchForCompletable', family: 'ST_CIC', caseId: '5555666677778888', event: 'profilePostSTCIC', type: 'HarnessPositiveSTCIC', marker: 'positive-st-cic-post', body: { searchRequest: { ccdId: '5555666677778888', jurisdiction: 'ST_CIC', caseTypeId: 'HarnessPositiveSTCIC', eventId: 'profilePostSTCIC' } } },
  { path: '/workallocation/searchForCompletable', family: 'IA', caseId: '7777888899990000', event: 'profilePostIA', type: 'HarnessPositiveIA', marker: 'positive-ia-post', body: { searchRequest: { ccdId: '7777888899990000', jurisdiction: 'IA', caseTypeId: 'HarnessPositiveIA', eventId: 'profilePostIA' } } },
];
const mappingCalls = [
  { path: '/workallocation/findPerson', body: { searchOptions: { searchTerm: 'Synthetic', userRole: 'Judicial', services: ['ST_CIC'] } } },
  { path: '/workallocation/getJudicialUsers', body: { userIds: ['profile-judge'], services: ['ST_CIC'] } },
  { path: '/workallocation/location?serviceCodes=ST_CIC' },
  { path: '/workallocation/full-location?serviceCodes=ST_CIC' },
  { path: '/workallocation/region-location', body: { serviceIds: ['ST_CIC'] } },
  { path: '/am/getBookings', body: { userId: 'profile-judge', bookableServices: ['ST_CIC'] } },
  { path: '/api/locations/getLocations', body: { searchTerm: 'Synthetic', serviceIds: ['ST_CIC'], locationType: 'case_management', userLocations: [] } },
];
function callsFor(facet) {
  if (facet === 'st-cic-wa') return waCalls;
  assert(['st-cic-staff', 'st-cic-mapping'].includes(facet), 'ST_CIC_API_FACET_INVALID');
  return [{ path: '/api/staff-supported-jurisdiction/get' }, ...(facet === 'st-cic-staff'
    ? [0, 1].map(() => ({ path: '/workallocation/caseworker/getUsersByServiceName', body: { services: ['ST_CIC','IA'], term: '' } })) : mappingCalls)];
}
// Baseline oracle is independent of provider fixtures and never adapts to faulty configuration.
export function stCicConsumerEvidence(facet) {
  stCicFacet(facet);
  const observation = (entrypoint, body, outboundCount) => ({ entrypoint, status: 200, body, outboundCount });
  let observations, journal;
  if (facet === 'st-cic-wa') {
    journal = waCalls.map(call => post('/task/search-for-completable', { case_id: call.caseId, case_jurisdiction: call.family, case_type: call.type, event_id: call.event }));
    observations = waCalls.map((call, index) => observation(call.path, [{ id: call.marker, name: 'Synthetic positive membership task' }], index + 1));
  } else {
    observations = [observation('/api/staff-supported-jurisdiction/get', staff, 0)];
    if (facet === 'st-cic-staff') {
      journal = [get('/refdata/internal/staff/usersByServiceName?ccd_service_names=ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS&page_size=100000'), post('/am/role-assignments/query', { attributes: { jurisdiction: staff }, roleName: roles, roleType: ['ORGANISATION'] })];
      observations.push(...[0,1].map(() => observation('/workallocation/caseworker/getUsersByServiceName', users, 2)));
    } else {
      assert.equal(facet, 'st-cic-mapping', 'ST_CIC_API_FACET_INVALID');
      const locationCall = get('/refdata/location/court-venues/services?service_code=BBA2');
      journal = [post('/refdata/judicial/users/search', { searchString: 'Synthetic', serviceCode: 'BBA2' }), post('/refdata/judicial/users', { sidam_ids: ['profile-judge'], serviceCode: 'BBA2' }), locationCall, locationCall, locationCall, post('/am/bookings/query', { queryRequest: { userIds: ['profile-judge'] } }), locationCall, get('/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=14&service_code=BBA2')];
      const bodies = [[{ ...person, name: person.fullName, email: person.emailId, id: person.idamId }], [person], [{ id: '100001', locationName: 'Synthetic BBA2' }], [venue], [{ regionId: '1', locations: ['100001'] }], [{ id: 'booking-100001', locationId: '100001', locationName: 'Synthetic BBA2' }, { id: 'booking-100002', locationId: '100002', locationName: null }], [venue]];
      mappingCalls.forEach((call, index) => observations.push(observation(call.path, bodies[index], [1,2,3,4,5,7,8][index])));
    }
  }
  return structuredClone({ observations, journal, mutation: null, ...noCredit });
}
// Fault attribution admits only the finite declared delta; the baseline oracle below stays unchanged.
function assertDeclaredApiFault(facet, actual, baseline, mutation) {
  if (mutation === null) return;
  if (isDeepStrictEqual(actual, baseline)) throw new Error('ST_CIC_FAULT_NOT_EFFECTIVE');
  const permitted = structuredClone(baseline);
  if (facet === 'st-cic-wa') {
    for (const index of [0,2]) permitted.observations[index].body = [];
    permitted.observations.forEach((row,index) => { row.outboundCount = [0,1,1,2][index]; });
    permitted.journal = permitted.journal.filter(row => row.body.case_jurisdiction !== 'ST_CIC');
  } else if (facet === 'st-cic-staff') {
    permitted.observations[0].body = permitted.observations[0].body.filter(id => id !== 'ST_CIC');
    for (const index of [1,2]) permitted.observations[index].body = [users[1]];
    permitted.journal[0].path = '/refdata/internal/staff/usersByServiceName?ccd_service_names=CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS&page_size=100000';
    permitted.journal[1].body.attributes.jurisdiction = staff.filter(id => id !== 'ST_CIC');
  } else {
    const wrongPerson = { idamId:'judicial-ZZZ1',fullName:'Synthetic ZZZ1',emailId:'zzz1@example.invalid' };
    const wrongVenue = { epimms_id:'100002',site_name:'Synthetic ZZZ1',region_id:'1',court_type_id:'18',service_code:'ZZZ1',is_case_management_location:'Y',is_hearing_location:'Y' };
    const bodies = [[{...wrongPerson,name:'Synthetic ZZZ1',email:'zzz1@example.invalid',id:'judicial-ZZZ1'}],[wrongPerson],[{id:'100002',locationName:'Synthetic ZZZ1'}],[wrongVenue],[{regionId:'1',locations:['100002']}],[{id:'booking-100001',locationId:'100001',locationName:null},{id:'booking-100002',locationId:'100002',locationName:'Synthetic ZZZ1'}],[wrongVenue]];
    for (let index = 1; index < permitted.observations.length; index++) permitted.observations[index].body = bodies[index-1];
    permitted.journal = JSON.parse(JSON.stringify(permitted.journal).replaceAll('BBA2','ZZZ1'));
  }
  if (!isDeepStrictEqual(actual, permitted)) throw new Error('ST_CIC_FAULT_EVIDENCE_INVALID');
}
export function validateStCicConsumerObservations(facet, observations, journal, mutation = null) {
  stCicFacet(facet, mutation);
  const expected = stCicConsumerEvidence(facet);
  assert.equal(observations.length, expected.observations.length, 'ST_CIC_OBSERVATIONS_INVALID');
  observations.forEach((row, index) => {
    assert.equal(row.entrypoint, expected.observations[index].entrypoint, 'ST_CIC_ROUTE_INVALID');
    assert.equal(row.status, 200, 'ST_CIC_TRANSPORT');
    assert(Number.isSafeInteger(row.outboundCount) && row.outboundCount >= 0, 'ST_CIC_JOURNAL_INVALID');
  });
  if (facet === 'st-cic-wa') {
    for (const index of [1,3]) assert.deepEqual(observations[index].body, expected.observations[index].body, 'ST_CIC_WA_CONTROL');
    assert.deepEqual(journal.filter(row => row.body?.case_jurisdiction === 'IA'), expected.journal.filter(row => row.body.case_jurisdiction === 'IA'), 'ST_CIC_WA_CONTROL');
  }
  if (facet === 'st-cic-staff') {
    assert.deepEqual(observations[0].body.filter(id => id !== 'ST_CIC'), staff.filter(id => id !== 'ST_CIC'), 'ST_CIC_STAFF_CONTROL');
    for (const index of [1,2]) assert.deepEqual(observations[index].body.filter(row => row.service === 'IA'), [users[1]], 'ST_CIC_STAFF_CONTROL');
  }
  if (facet === 'st-cic-mapping') assert.deepEqual(observations[0], expected.observations[0], 'ST_CIC_MAPPING_CONTROL');
  assertDeclaredApiFault(facet, { observations, journal }, { observations: expected.observations, journal: expected.journal }, mutation);
  const failure = `ST_CIC_${facet.slice(7).replaceAll('-', '_').toUpperCase()}_ASSERTION`;
  if (!isDeepStrictEqual(observations, expected.observations) || !isDeepStrictEqual(journal, expected.journal)) throw new Error(failure);
  assert.equal(mutation, null, 'ST_CIC_FAULT_NOT_EFFECTIVE');
  return { facet, ...noCredit };
}
export async function probeStCicConsumers({ facet, cookie, output, readJournal, mutation = null, request = fetch }) {
  stCicFacet(facet, mutation);
  if (facet === 'st-cic-wa-health') {
    const before = readJournal();
    const response = await request(CANDIDATE_URL + '/health', { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, 'ST_CIC_TRANSPORT');
    const observation = { status: response.status, body: await response.json() }, journal = readJournal();
    assert.deepEqual(journal.slice(0, before.length), before, 'ST_CIC_JOURNAL_INVALID');
    const delta = journal.slice(before.length);
    fs.writeFileSync(path.join(output, 'profile-st-cic-health.json'), JSON.stringify({ observation, before, fullJournal: journal, journal: delta, mutation, ...noCredit }), { mode: 0o600 });
    return validateStCicWaHealth(observation, delta, mutation);
  }
  assert(typeof cookie === 'string' && cookie.length > 0, 'ST_CIC_SESSION_REQUIRED');
  assert.deepEqual(readJournal(), [], 'ST_CIC_JOURNAL_INVALID');
  const observations = [];
  let csrf;
  for (const call of callsFor(facet)) {
    const response = await request(CANDIDATE_URL + call.path, {
      method: call.body ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { cookie: `xui-webapp=${encodeURIComponent(cookie)}`, ...(call.body ? { 'content-type': 'application/json', 'x-xsrf-token': csrf } : {}) },
      ...(call.body ? { body: JSON.stringify(call.body) } : {}),
    });
    assert.equal(response.status, 200, 'ST_CIC_TRANSPORT');
    if (!call.body) {
      const tokens = response.headers.getSetCookie().filter(value => value.startsWith('XSRF-TOKEN='));
      assert.equal(tokens.length, 1, 'ST_CIC_CSRF');
      csrf = decodeURIComponent(tokens[0].split(';',1)[0].slice(11));
      assert(/^[A-Za-z0-9_-]{1,512}$/.test(csrf), 'ST_CIC_CSRF');
    }
    observations.push({ entrypoint: call.path, status: response.status, body: await response.json(), outboundCount: readJournal().length });
  }
  const journal = readJournal();
  fs.writeFileSync(path.join(output, 'profile-st-cic-observations.json'), JSON.stringify({ observations, journal, mutation, ...noCredit }), { mode: 0o600 });
  return validateStCicConsumerObservations(facet, observations, journal, mutation);
}
export function validateStCicWaHealth(observation, journal, mutation = null) {
  stCicFacet('st-cic-wa-health', mutation);
  assert.equal(observation.status, 200, 'ST_CIC_TRANSPORT');
  assert.equal(observation.body.status, 'UP', 'ST_CIC_HEALTH_PROTOCOL');
  const names = Object.keys(observation.body).filter(key => !['status','buildInfo'].includes(key)).sort();
  assert(names.every(key => [...BASE_HEALTH,...WA_HEALTH].includes(key)), 'ST_CIC_HEALTH_PROTOCOL');
  for (const key of names) assert.equal(observation.body[key]?.status, 'UP', 'ST_CIC_HEALTH_PROTOCOL');
  assert(BASE_HEALTH.every(key => names.includes(key)), 'ST_CIC_HEALTH_CONTROL');
  if (!isDeepStrictEqual(journal, names.map(() => ({ method:'GET',path:'/health' })))) throw new Error('ST_CIC_JOURNAL_INVALID');
  if (mutation !== null) {
    if (isDeepStrictEqual(names, BASE_HEALTH)) throw new Error('ST_CIC_FAULT_NOT_EFFECTIVE');
    if (!isDeepStrictEqual(names, [...BASE_HEALTH,...WA_HEALTH].sort())) throw new Error('ST_CIC_FAULT_EVIDENCE_INVALID');
  }
  if (!isDeepStrictEqual(names, BASE_HEALTH)) throw new Error('ST_CIC_WA_HEALTH_ASSERTION');
  assert.equal(mutation, null, 'ST_CIC_FAULT_NOT_EFFECTIVE');
  return { facet: 'st-cic-wa-health', ...noCredit };
}
const services = [['IA','Immigration'],['CIVIL','Civil'],['PRIVATELAW','Private Law'],['PUBLICLAW','Public Law'],['EMPLOYMENT','Employment'],['ST_CIC','Special Tribunals'],['PROBATE','Probate'],['PCS','Possession'],['DIVORCE','Divorce']];
export function stCicGlobalSearchEvidence() {
  const delivered = services.map(([id,label]) => ({ serviceId: id, serviceName: `Synthetic ${label}` }));
  const upstream = { searchCriteria: { CCDCaseTypeIds: null, CCDJurisdictionIds: ['IA','CIVIL','PRIVATELAW','PUBLICLAW','EMPLOYMENT','ST_CIC','PROBATE','PCS','DIVORCE'], caseManagementBaseLocationIds: null, caseManagementRegionIds: null, caseReferences: ['1111222233334444'], otherReferences: null, parties: [], stateIds: null }, sortCriteria: null, maxReturnRecordCount: 25, startRecordNumber: 1 };
  return { observation: { facet: 'st-cic-global-search', url: CANDIDATE_URL + '/search', status: 200, delivered, warm: structuredClone(delivered), rendered: services.map(([id,label]) => ({ id, label: `Synthetic ${label}` })), selected: 'ALL', postStatus: 200, csrfHeaderPresent: true, upstream },
    journal: [get('/refdata/location/orgServices'), post('/globalSearch', structuredClone(upstream)), get('/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read')] };
}
export function validateStCicGlobalSearchBrowser(observation, journal, mutation = null) {
  stCicFacet('st-cic-global-search', mutation);
  assert.equal(observation.status, 200, 'ST_CIC_TRANSPORT');
  assert.equal(observation.postStatus, 200, 'ST_CIC_TRANSPORT');
  assert.equal(observation.csrfHeaderPresent, true, 'ST_CIC_CSRF');
  const expected = stCicGlobalSearchEvidence(), actual = structuredClone({ observation, journal });
  for (const value of [actual, expected]) {
    value.observation.delivered.sort((a,b) => a.serviceId.localeCompare(b.serviceId));
    value.observation.warm.sort((a,b) => a.serviceId.localeCompare(b.serviceId));
    value.observation.rendered.sort((a,b) => a.id.localeCompare(b.id));
    value.observation.upstream.searchCriteria.CCDJurisdictionIds.sort();
    for (const entry of value.journal.filter(entry => entry.method === 'POST')) entry.body.searchCriteria.CCDJurisdictionIds.sort();
    // EXUI subscribes to these independent results requests together.
    if (value.journal.length === 3 &&
        isDeepStrictEqual(value.journal[1], get('/aggregated/caseworkers/harness-supervisor/jurisdictions?access=read')) &&
        value.journal[2]?.method === 'POST' && value.journal[2]?.path === '/globalSearch') {
      [value.journal[1], value.journal[2]] = [value.journal[2], value.journal[1]];
    }
  }
  for (const key of ['delivered','warm','rendered']) {
    const familyKey = key === 'rendered' ? 'id' : 'serviceId';
    assert.deepEqual(actual.observation[key].filter(row => row[familyKey] !== 'ST_CIC'), expected.observation[key].filter(row => row[familyKey] !== 'ST_CIC'), 'ST_CIC_GLOBAL_SEARCH_CONTROL');
  }
  assert.deepEqual(actual.observation.upstream.searchCriteria.CCDJurisdictionIds.filter(id => id !== 'ST_CIC'), expected.observation.upstream.searchCriteria.CCDJurisdictionIds.filter(id => id !== 'ST_CIC'), 'ST_CIC_GLOBAL_SEARCH_CONTROL');
  if (mutation !== null) {
    if (isDeepStrictEqual(actual, expected)) throw new Error('ST_CIC_FAULT_NOT_EFFECTIVE');
    const permitted = structuredClone(expected);
    for (const key of ['delivered','warm']) permitted.observation[key] = permitted.observation[key].filter(row => row.serviceId !== 'ST_CIC');
    permitted.observation.rendered = permitted.observation.rendered.filter(row => row.id !== 'ST_CIC');
    permitted.observation.upstream.searchCriteria.CCDJurisdictionIds = permitted.observation.upstream.searchCriteria.CCDJurisdictionIds.filter(id => id !== 'ST_CIC');
    permitted.journal[1].body.searchCriteria.CCDJurisdictionIds = permitted.journal[1].body.searchCriteria.CCDJurisdictionIds.filter(id => id !== 'ST_CIC');
    if (!isDeepStrictEqual(actual, permitted)) throw new Error('ST_CIC_FAULT_EVIDENCE_INVALID');
  }
  if (!isDeepStrictEqual(actual, expected)) throw new Error('ST_CIC_GLOBAL_SEARCH_ASSERTION');
  assert.equal(mutation, null, 'ST_CIC_FAULT_NOT_EFFECTIVE');
  return { facet: 'st-cic-global-search', ...noCredit };
}
