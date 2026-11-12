const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const contract = () => import('./lib/exui-st-cic-profile-contract.mjs');
const consumers = () => import('./lib/exui-st-cic-profile-consumers.mjs');
const mock = () => import('./fixtures/exui-st-cic-profile.mock.mjs');
const temp = t => { const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'st-cic-unit-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; };

test('fixed ST_CIC contract identifies one published consumer and five no-credit facets', async () => {
  const m = await contract(), value = m.stCicProfileContract();
  assert.equal(value.obligationId, 'configuration-profile:31fed7b5d70bd2e333287f0b982632381576d11fbc15d71e90f27c14d986983b');
  assert.equal(value.consumerRevision, '1a986f4dc87e6ea4598e30c042bf2b3072122b75');
  assert.equal(value.sourceKey, 'rpx-xui-webapp:config/default.json');
  assert.deepEqual(value.capabilities, ['globalSearchServices','waSupportedJurisdictions','staffSupportedJurisdictions','serviceRefDataMapping']);
  assert.equal(value.facets.length, 5); assert.equal(new Set(value.facets.map(row => row.fault)).size, 5);
  for (const key of ['runtimeAcceptance','catalogueCredit','wholeProfileSatisfied','releaseCredit','releaseApproval']) assert.equal(value[key], false);
  const artifact = { provenance: { sourceMethod: 'git-archive', webappCommit: value.consumerRevision }, identity: { webappCommit: value.consumerRevision } };
  m.assertStCicProfileArtifact(artifact);
  for (const mutate of [a => a.provenance.webappCommit = '20c6ec129fc1e81061c733e164198ec63a33e71a', a => a.identity.webappCommit = 'foreign', a => a.provenance.sourceMethod = 'working-tree']) { const bad = structuredClone(artifact); mutate(bad); assert.throws(() => m.assertStCicProfileArtifact(bad), /ST_CIC_CONSUMER_INVALID/); }
  assert.throws(() => m.stCicFacet('divorce-staff'), /ST_CIC_FACET_INVALID/);
  assert.throws(() => m.stCicFacet('st-cic-staff', 'source-profile-drop-divorce-staff'), /ST_CIC_FAULT_INVALID/);
});

test('each declared configuration fault changes exactly its setting and never a neighbour', async t => {
  const m = await contract();
  const source = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/exui-configuration-source.json'))).sources.find(row => row.path === 'config/default.json').document;
  for (const { facet, fault } of m.ST_CIC_PROFILE_FACETS) {
    const expected = structuredClone(source);
    if (facet === 'st-cic-global-search') expected.globalSearchServices = 'IA,CIVIL,PRIVATELAW,PUBLICLAW,EMPLOYMENT,PROBATE,PCS,DIVORCE';
    if (facet === 'st-cic-wa') expected.waSupportedJurisdictions = 'IA,CIVIL,PRIVATELAW,PUBLICLAW,EMPLOYMENT,PCS';
    if (facet === 'st-cic-staff') expected.staffSupportedJurisdictions = 'CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS';
    if (facet === 'st-cic-mapping') expected.serviceRefDataMapping.find(row => row.service === 'ST_CIC').serviceCodes = ['ZZZ1'];
    if (facet === 'st-cic-wa-health') expected.feature.workAllocationEnabled = true;
    assert.deepEqual(m.applyStCicProfileFault(structuredClone(source), facet, fault), expected);
    assert.deepEqual(m.applyStCicProfileFault(structuredClone(source), facet, null), source);
  }
  const root = temp(t); fs.mkdirSync(path.join(root,'config')); fs.writeFileSync(path.join(root,'config/default.json'), '{}');
  assert.throws(() => m.stCicProfileConfiguration(root, 'st-cic-wa'), /SOURCE_PROFILE_CONFIG_DRIFT/);
});

function faultEvidence(facet, baseline) {
  const actual = structuredClone(baseline);
  if (facet === 'st-cic-wa') {
    for (const index of [0,2]) actual.observations[index].body = [];
    actual.observations.forEach((row,index) => row.outboundCount = [0,1,1,2][index]);
    actual.journal = actual.journal.filter(row => row.body.case_jurisdiction !== 'ST_CIC');
  } else if (facet === 'st-cic-staff') {
    actual.observations[0].body = actual.observations[0].body.filter(id => id !== 'ST_CIC');
    for (const index of [1,2]) actual.observations[index].body = actual.observations[index].body.filter(row => row.service !== 'ST_CIC');
    actual.journal[0].path = '/refdata/internal/staff/usersByServiceName?ccd_service_names=CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS&page_size=100000';
    actual.journal[1].body.attributes.jurisdiction = actual.journal[1].body.attributes.jurisdiction.filter(id => id !== 'ST_CIC');
  } else {
    const person = {idamId:'judicial-ZZZ1',fullName:'Synthetic ZZZ1',emailId:'zzz1@example.invalid'};
    const venue = {epimms_id:'100002',site_name:'Synthetic ZZZ1',region_id:'1',court_type_id:'18',service_code:'ZZZ1',is_case_management_location:'Y',is_hearing_location:'Y'};
    const bodies = [[{...person,name:'Synthetic ZZZ1',email:'zzz1@example.invalid',id:'judicial-ZZZ1'}],[person],[{id:'100002',locationName:'Synthetic ZZZ1'}],[venue],[{regionId:'1',locations:['100002']}],[{id:'booking-100001',locationId:'100001',locationName:null},{id:'booking-100002',locationId:'100002',locationName:'Synthetic ZZZ1'}],[venue]];
    for (let index = 1; index < actual.observations.length; index++) actual.observations[index].body = bodies[index-1];
    actual.journal = JSON.parse(JSON.stringify(actual.journal).replaceAll('BBA2','ZZZ1'));
  }
  return actual;
}
for (const facet of ['st-cic-wa','st-cic-staff','st-cic-mapping']) {
  test(`${facet}: independent literal fixture passes baseline, effective fault fails fixed oracle and ineffective fault is rejected`, async () => {
    const m = await consumers(), c = await contract(), fixtures = await mock();
    const expected = m.stCicConsumerEvidence(facet);
    assert.deepEqual(fixtures.ST_CIC_CANDIDATE_RESPONSES[facet], expected.observations);
    assert.deepEqual(fixtures.ST_CIC_BASELINE_JOURNALS[facet], expected.journal);
    assert.equal(m.validateStCicConsumerObservations(facet, expected.observations, expected.journal).catalogueCredit, false);
    const fault = c.stCicFacet(facet).fault, changed = faultEvidence(facet, expected), name = `ST_CIC_${facet.slice(7).replaceAll('-','_').toUpperCase()}_ASSERTION`;
    assert.throws(() => m.validateStCicConsumerObservations(facet, changed.observations, changed.journal, fault), error => error.message === name);
    assert.throws(() => m.validateStCicConsumerObservations(facet, expected.observations, expected.journal, fault), /ST_CIC_FAULT_NOT_EFFECTIVE/);
    for (const change of [e => e.observations[0].status = 500, e => e.observations.pop(), e => e.observations[0].entrypoint = '/wrong']) { const invalid = structuredClone(changed); change(invalid); assert.throws(() => m.validateStCicConsumerObservations(facet, invalid.observations, invalid.journal, fault), error => error.message !== name); }
    const stale = structuredClone(expected); stale.journal.push(stale.journal[0]); assert.throws(() => m.validateStCicConsumerObservations(facet, stale.observations, stale.journal));
  });
  test(`${facet}: fake-fetch probe retains actual route/method/CSRF and raw journal without secrets`, async t => {
    const m = await consumers(), fixtures = await mock(), output = temp(t), expected = m.stCicConsumerEvidence(facet);
    let index = 0, journal = [];
    await m.probeStCicConsumers({ facet, output, cookie: 'COOKIE-CANARY', readJournal: () => structuredClone(journal), request: async (url, options) => {
      const row = fixtures.ST_CIC_CANDIDATE_RESPONSES[facet][index++];
      assert.equal(url, 'http://127.0.0.1:3100' + row.entrypoint); assert.equal(options.redirect, 'manual');
      if (options.method === 'POST') {
        assert.equal(options.headers['x-xsrf-token'], 'CSRF-CANARY');
        const expectedBody = facet === 'st-cic-wa' ? index === 3
          ? { searchRequest: { ccdId:'5555666677778888',jurisdiction:'ST_CIC',caseTypeId:'HarnessPositiveSTCIC',eventId:'profilePostSTCIC' } }
          : { searchRequest: { ccdId:'7777888899990000',jurisdiction:'IA',caseTypeId:'HarnessPositiveIA',eventId:'profilePostIA' } }
          : facet === 'st-cic-staff' ? { services:['ST_CIC','IA'],term:'' }
          : ({ 2:{searchOptions:{searchTerm:'Synthetic',userRole:'Judicial',services:['ST_CIC']}}, 3:{userIds:['profile-judge'],services:['ST_CIC']}, 6:{serviceIds:['ST_CIC']}, 7:{userId:'profile-judge',bookableServices:['ST_CIC']}, 8:{searchTerm:'Synthetic',serviceIds:['ST_CIC'],locationType:'case_management',userLocations:[]} })[index];
        assert.deepEqual(JSON.parse(options.body), expectedBody);
      }
      journal = fixtures.ST_CIC_BASELINE_JOURNALS[facet].slice(0,row.outboundCount);
      return { status: 200, headers: { getSetCookie: () => ['XSRF-TOKEN=CSRF-CANARY; Secure'] }, json: async () => row.body };
    } });
    const raw = fs.readFileSync(path.join(output,'profile-st-cic-observations.json'),'utf8');
    assert(!/COOKIE-CANARY|CSRF-CANARY/.test(raw)); assert.deepEqual(JSON.parse(raw).observations, fixtures.ST_CIC_CANDIDATE_RESPONSES[facet]);
    assert.equal(index, expected.observations.length);
  });
}

test('global-search browser fixed oracle rejects ST_CIC removal while preserving every other service', async () => {
  const m = await consumers(), c = await contract(), e = m.stCicGlobalSearchEvidence(), fault = c.stCicFacet('st-cic-global-search').fault;
  assert.equal(m.validateStCicGlobalSearchBrowser(e.observation,e.journal).catalogueCredit, false);
  const changed = structuredClone(e);
  for (const key of ['delivered','warm']) changed.observation[key] = changed.observation[key].filter(row => row.serviceId !== 'ST_CIC');
  changed.observation.rendered = changed.observation.rendered.filter(row => row.id !== 'ST_CIC');
  changed.observation.upstream.searchCriteria.CCDJurisdictionIds = changed.observation.upstream.searchCriteria.CCDJurisdictionIds.filter(id => id !== 'ST_CIC');
  changed.journal[1].body.searchCriteria.CCDJurisdictionIds = changed.journal[1].body.searchCriteria.CCDJurisdictionIds.filter(id => id !== 'ST_CIC');
  assert.throws(() => m.validateStCicGlobalSearchBrowser(changed.observation,changed.journal,fault), /ST_CIC_GLOBAL_SEARCH_ASSERTION/);
  assert.throws(() => m.validateStCicGlobalSearchBrowser(e.observation,e.journal,fault), /ST_CIC_FAULT_NOT_EFFECTIVE/);
  changed.observation.rendered = changed.observation.rendered.filter(row => row.id !== 'IA');
  assert.throws(() => m.validateStCicGlobalSearchBrowser(changed.observation,changed.journal,fault), /ST_CIC_GLOBAL_SEARCH_CONTROL/);
});

test('shared health oracle remains default-false under fault and rejects transport/unhealthy substitutions', async t => {
  const m = await consumers(), c = await contract(), fault = c.stCicFacet('st-cic-wa-health').fault;
  const names = ['ccdComponentApi','ccdDataApi','docassemblyApi','documentsApi','documentsApiV2','idamApi','idamWeb','s2s'];
  const observation = { status:200,body: { status:'UP',...Object.fromEntries(names.map(name => [name,{status:'UP'}])) } }, journal = names.map(() => ({method:'GET',path:'/health'}));
  assert.equal(m.validateStCicWaHealth(observation,journal).catalogueCredit,false);
  const changed = structuredClone(observation); for (const name of ['workAllocationApi','caseworkerRefApi','roleApi','judicialApi']) changed.body[name] = {status:'UP'};
  assert.throws(() => m.validateStCicWaHealth(changed,[...journal,...Array.from({length:4},()=>({method:'GET',path:'/health'}))],fault), /ST_CIC_WA_HEALTH_ASSERTION/);
  assert.throws(() => m.validateStCicWaHealth(observation,journal,fault), /ST_CIC_FAULT_NOT_EFFECTIVE/);
  changed.body.roleApi.status = 'DOWN'; assert.throws(() => m.validateStCicWaHealth(changed,journal,fault), /ST_CIC_HEALTH_PROTOCOL/);
  const output = temp(t); let calls = [];
  await m.probeStCicConsumers({facet:'st-cic-wa-health',output,readJournal:()=>structuredClone(calls),request:async(url,options)=>{assert.equal(url,'http://127.0.0.1:3100/health');assert.equal(options.method,'GET');calls=journal;return{status:200,json:async()=>observation.body};}});
  assert.equal(JSON.parse(fs.readFileSync(path.join(output,'profile-st-cic-health.json'))).catalogueCredit,false);
});

test('mock provider and consumer oracle do not import one another', async () => {
  const fixture = fs.readFileSync(path.join(__dirname,'fixtures/exui-st-cic-profile.mock.mjs'),'utf8'), oracle = fs.readFileSync(path.join(__dirname,'lib/exui-st-cic-profile-consumers.mjs'),'utf8');
  assert(!fixture.includes('stCicConsumerEvidence')); assert(!oracle.includes('exui-st-cic-profile.mock'));
});

test('fake transport, missing or ambiguous CSRF cannot become a named capability fault', async t => {
  const m = await consumers();
  for (const tokens of [null, [], ['XSRF-TOKEN=one','XSRF-TOKEN=two'], ['XSRF-TOKEN=bad%20token']]) {
    const output = temp(t);
    await assert.rejects(m.probeStCicConsumers({ facet:'st-cic-wa',mutation:'source-profile-remove-st-cic-wa-membership',cookie:'COOKIE-CANARY',output,readJournal:()=>[],request:async()=>({status:tokens===null?503:200,headers:{getSetCookie:()=>tokens},json:async()=>[]}) }), /ST_CIC_TRANSPORT|ST_CIC_CSRF/);
    assert.equal(fs.existsSync(path.join(output,'profile-st-cic-observations.json')),false);
  }
});

for (const facet of ['st-cic-wa','st-cic-staff','st-cic-mapping','st-cic-global-search','st-cic-wa-health']) {
  test(`${facet}: unrelated journal or partial effect cannot be attributed to the declared fault`, async () => {
    const m = await consumers(), c = await contract(), fault = c.stCicFacet(facet).fault;
    const name = `ST_CIC_${facet.slice(7).replaceAll('-','_').toUpperCase()}_ASSERTION`;
    let baseline, validate, partial;
    if (facet === 'st-cic-global-search') {
      baseline = m.stCicGlobalSearchEvidence();
      validate = value => m.validateStCicGlobalSearchBrowser(value.observation,value.journal,fault);
      partial = structuredClone(baseline); partial.observation.rendered = partial.observation.rendered.filter(row => row.id !== 'ST_CIC');
    } else if (facet === 'st-cic-wa-health') {
      const names = ['ccdComponentApi','ccdDataApi','docassemblyApi','documentsApi','documentsApiV2','idamApi','idamWeb','s2s'];
      baseline = {observation:{status:200,body:{status:'UP',...Object.fromEntries(names.map(key=>[key,{status:'UP'}]))}},journal:names.map(()=>({method:'GET',path:'/health'}))};
      validate = value => m.validateStCicWaHealth(value.observation,value.journal,fault);
      partial = structuredClone(baseline); partial.observation.body.workAllocationApi = {status:'UP'}; partial.journal.push({method:'GET',path:'/health'});
    } else {
      baseline = m.stCicConsumerEvidence(facet);
      validate = value => m.validateStCicConsumerObservations(facet,value.observations,value.journal,fault);
      partial = structuredClone(baseline);
      if (facet === 'st-cic-wa') partial.observations[0].body = [];
      if (facet === 'st-cic-staff') partial.observations[0].body = partial.observations[0].body.filter(id=>id!=='ST_CIC');
      if (facet === 'st-cic-mapping') partial.observations[1].body[0].idamId = 'judicial-ZZZ1';
    }
    for (const bad of [{...structuredClone(baseline),journal:[...baseline.journal,{method:'GET',path:'/health'}]}, partial])
      assert.throws(()=>validate(bad),error=>error.message!==name,'unrelated/partial damage must not become the expected named fault');
  });
}

test('health missing base controls and a wrong journal are distinct from WA-enable failure', async () => {
  const m = await consumers(), fault = 'source-profile-enable-st-cic-wa-health';
  const names = ['ccdComponentApi','ccdDataApi','docassemblyApi','documentsApi','documentsApiV2','idamApi','idamWeb','s2s'];
  const body = {status:'UP',...Object.fromEntries(names.map(key=>[key,{status:'UP'}]))};
  const journal = names.map(()=>({method:'GET',path:'/health'}));
  for (const mutation of [null,fault]) {
    const missing = structuredClone(body); delete missing.ccdDataApi;
    assert.throws(()=>m.validateStCicWaHealth({status:200,body:missing},journal,mutation),error=>error.message!=='ST_CIC_WA_HEALTH_ASSERTION');
    assert.throws(()=>m.validateStCicWaHealth({status:200,body},journal.slice(1),mutation),error=>error.message!=='ST_CIC_WA_HEALTH_ASSERTION');
  }
});

// Independent of transport fixtures: court type remains14 when only service code changes.
test('mapping fixed oracle requires court type14 and attributes only the declared service-code change', async () => {
  const m = await consumers(), baseline = m.stCicConsumerEvidence('st-cic-mapping');
  baseline.journal[7].path = '/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=14&service_code=BBA2';
  assert.equal(m.validateStCicConsumerObservations('st-cic-mapping', baseline.observations, baseline.journal).catalogueCredit, false);
  const fault = 'source-profile-change-st-cic-code', changed = faultEvidence('st-cic-mapping', baseline);
  assert.equal(changed.journal[7].path, '/refdata/location/court-venues/venue-search?search-string=Synthetic&court-type-id=14&service_code=ZZZ1');
  assert.throws(() => m.validateStCicConsumerObservations('st-cic-mapping', changed.observations, changed.journal, fault), error => error.message === 'ST_CIC_MAPPING_ASSERTION');
  for (const court of ['', '18']) {
    for (const [evidence, mutation] of [[baseline, null], [changed, fault]]) {
      const invalid = structuredClone(evidence);
      invalid.journal[7].path = invalid.journal[7].path.replace('court-type-id=14&', `court-type-id=${court}&`);
      assert.throws(() => m.validateStCicConsumerObservations('st-cic-mapping', invalid.observations, invalid.journal, mutation), error => mutation === null || error.message !== 'ST_CIC_MAPPING_ASSERTION');
    }
  }
});
