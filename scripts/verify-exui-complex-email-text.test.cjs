const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const mock = require('./fixtures/exui-complex-email.mock.cjs');

test('complex email prototype retains the Text source row and declares all seven facets', async () => {
  const m = await import('./lib/exui-complex-email-text.mjs');
  const baseline = m.deriveComplexEmailFixture();
  assert.equal(baseline.binding.obligationId, 'configuration-shape:9a20dc72fb413cd3bd34d97dc415f55c042088bf6b517cda7fc275215c5f7e39');
  assert.deepEqual(Object.keys(m.complexEmailRow(baseline.fixture)).sort(), [...m.COMPLEX_EMAIL_ATTRIBUTES].sort());
  assert.equal(m.complexEmailRow(baseline.fixture).FieldType, 'Text');
  assert.equal(baseline.binding.liveFromDisposition, 'ignored-by-pinned-complex-types-importer');
  assert.equal(baseline.binding.activationClaim, false);
  assert.equal(baseline.binding.catalogueCredit, false);
  assert.equal(baseline.binding.runtimeAcceptance, false);
  const probe = baseline.fixture.sheets.CaseField.find(row => row.ID === 'harnessEmailTypeProbe');
  assert.equal(probe.FieldType, 'EmailInformation');
  assert.equal(probe.Searchable, 'Y');
  assert(!baseline.fixture.sheets.CaseEventToFields.some(row => row.CaseFieldID === probe.ID));
  m.validateComplexEmailFixture(baseline);
});

test('complex email actual importer rejects failed imports and coherent source substitutions before network access', async t => {
  const m = await import('./lib/exui-complex-email-import.mjs');
  const {digestBytes}=await import('./lib/exui-evidence-io.mjs');
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-email-import-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const [index,variant] of ['baseline','email-type','searchable'].entries()) {
    const output=path.join(root,String(index));fs.mkdirSync(output);
    const fixtureDirectory=path.join(output,'fixture');
    await m.prepareComplexEmailImport(fixtureDirectory,variant);
    const state={output,owner:'synthetic-owner',namespace:'a'.repeat(64),images:{definition:{id:'synthetic-image'}}};
    let inspections=0;
    const receipt=await m.importComplexEmail(state,{fixtureDirectory,variant,request:mock.request(variant),inspect:()=>{inspections++;},runDocker:()=>JSON.stringify(mock.metadata(variant))});
    assert.equal(inspections,3);assert.equal(receipt.status,'import-and-complex-metadata-observed');assert.equal(receipt.runtimeAcceptance,false);
    assert.deepEqual(receipt.observations.roles.map(row=>row.role),['caseworker','caseworker-harness','caseworker-harness-allowed','caseworker-harness-observer','caseworker-harness-denied','ccd-import']);
    assert(receipt.observations.roles.every(row=>row.status===201));
    const changed=JSON.parse(fs.readFileSync(fixtureDirectory+'/definition.json'));
    changed.sheets.ComplexTypes.find(r=>r.ID==='EmailInformation'&&r.ListElementCode==='emailAddress').ElementLabel='coherent wrong source';
    fs.writeFileSync(fixtureDirectory+'/definition.json',JSON.stringify(changed));
    const seal=JSON.parse(fs.readFileSync(fixtureDirectory+'/binding.json'));
    seal.definitionDigest=digestBytes(fs.readFileSync(fixtureDirectory+'/definition.json'));fs.writeFileSync(fixtureDirectory+'/binding.json',JSON.stringify(seal));
    let touched=false;
    await assert.rejects(m.importComplexEmail(state,{fixtureDirectory,variant,inspect:()=>{touched=true;}}),/COMPLEX_EMAIL_IMPORT_SOURCE/);assert.equal(touched,false);
  }
  const output=path.join(root,'failed');fs.mkdirSync(output);const fixtureDirectory=path.join(output,'fixture');await m.prepareComplexEmailImport(fixtureDirectory,'baseline');
  await assert.rejects(m.importComplexEmail({output,owner:'synthetic-owner',namespace:'a'.repeat(64),images:{}},{fixtureDirectory,variant:'baseline',inspect:()=>{},request:mock.request('baseline',400),runDocker:()=>{throw Error('unexpected SQL');}}),/COMPLEX_EMAIL_IMPORT_REJECTED/);
  assert.equal(JSON.parse(fs.readFileSync(output+'/complex-email-import/receipt.json')).status,'failed');
});

test('complex email role registration refusal stops before import and retains only safe statuses', async t => {
  const m=await import('./lib/exui-complex-email-import.mjs');
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-email-role-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const fixtureDirectory=path.join(root,'fixture');await m.prepareComplexEmailImport(fixtureDirectory,'baseline');
  const calls=[];const request=mock.request('baseline');
  await assert.rejects(m.importComplexEmail({output:root,owner:'synthetic-owner',namespace:'a'.repeat(64),images:{}},{fixtureDirectory,variant:'baseline',inspect:()=>{},runDocker:()=>{throw Error('unexpected SQL');},request:(state,port,route,options)=>{
    calls.push(route);
    if(route==='/api/user-role') {
      assert.equal(options.method,'PUT');assert.deepEqual(options.body,{role:'caseworker',security_classification:'PUBLIC'});
      return {status:403,body:{sensitive:'canary-not-retained'}};
    }
    return request(state,port,route,options);
  }}),/COMPLEX_EMAIL_ROLE_REGISTRATION/);
  assert(!calls.includes('/import'));
  const raw=fs.readFileSync(root+'/complex-email-import/receipt.json','utf8');const receipt=JSON.parse(raw);
  assert.equal(receipt.status,'failed');assert.deepEqual(receipt.observations.roles,[{role:'caseworker',status:403}]);assert(!raw.includes('canary-not-retained'));
});

test('complex email descriptors and outcome cannot turn malformed imports or unrelated failures green',async()=>{
  const {validateComplexEmailDefinition}=await import('./lib/exui-complex-email-import.mjs');
  for(const variant of ['baseline','email-type'])validateComplexEmailDefinition(mock.definition(variant),variant);
  for(const mutate of [x=>x.case_fields[0].field_type.collection_field_type.id='Wrong',x=>x.case_fields[0].field_type.collection_field_type.complex_fields[0].field_type.complex_fields[0].security_classification='PRIVATE',x=>x.case_fields[1].field_type.complex_fields[0].label='Wrong']) {
    const bad=mock.definition();mutate(bad);assert.throws(()=>validateComplexEmailDefinition(bad,'baseline'),/COMPLEX_EMAIL_/);
  }
  const {assertComplexEmailUiOutcome,CALLBACK_UI_SOURCES}=await import('./run-harness-recipient-callback-ui.mjs');
  for(const variant of ['baseline','email-type']) {
    const {terminal,observed,report}=mock.outcome(variant);assertComplexEmailUiOutcome(variant,terminal,observed,report);
    for(const mutate of [x=>x.observed.catalogueCredit=true,x=>x.observed.healthy.status=500,x=>x.observed.probe.validation.status=500,x=>x.report.suites[0].specs[0].tests[0].results[0].retry=1,x=>x.terminal.signal='SIGTERM']) {
      const bad=mock.outcome(variant);mutate(bad);assert.throws(()=>assertComplexEmailUiOutcome(variant,bad.terminal,bad.observed,bad.report));
    }
  }
  const bad=mock.outcome('email-type');bad.report.suites[0].specs[0].tests[0].results[0].error.message='timeout';
  assert.throws(()=>assertComplexEmailUiOutcome('email-type',bad.terminal,bad.observed,bad.report));
  for(const file of ['scripts/lib/exui-complex-email-classification.mjs','scripts/lib/exui-complex-email-text.mjs','scripts/lib/exui-complex-email-import.mjs','src/fixtures/harnessComplexEmail.ts','src/tests/harness/callback-feasibility/complex-email-text.spec.ts'])assert(CALLBACK_UI_SOURCES.includes(file));
  CALLBACK_UI_SOURCES.forEach(file=>assert(fs.statSync(path.join(__dirname,'..',file)).isFile()));
  const {RESULTS_UI_SOURCES}=await import('./run-harness-results-ui.mjs');
  for(const file of ['scripts/lib/exui-complex-email-classification.mjs','scripts/lib/exui-complex-email-text.mjs','scripts/lib/exui-complex-email-import.mjs'])assert(RESULTS_UI_SOURCES.includes(file));
  for(const runner of ['run-harness-recipient-callback-ui.mjs','run-harness-results-ui.mjs']) {
    const source=fs.readFileSync(path.join(__dirname,runner),'utf8');
    assert.match(source,/plan\.proofArguments=\['scripts\/recipient-callback-ui-tools\.mjs','--inside-proof'\]/);
  }
});

test('complex email Playwright discovery selects only the opted-in prototype and rejects unsupported variants',()=>{
  for(const variant of ['baseline','email-type','searchable']) {
    const result=spawnSync(process.execPath,[path.join(__dirname,'../node_modules/@playwright/test/cli.js'),'test','--list','--config','playwright.callback-feasibility.config.mjs','--reporter=list'],{cwd:path.join(__dirname,'..'),env:{...process.env,EXUI_CALLBACK_FEASIBILITY:'true',EXUI_COMPLEX_EMAIL_TEXT:'true',EXUI_CALLBACK_VARIANT:variant},encoding:'utf8',timeout:30000});
    if(variant==='searchable'){assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,/COMPLEX_EMAIL_FEASIBILITY_SELECTION/);}
    else {assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/complex-email-text.spec.ts/);assert.match(result.stdout,/Total: 1 test in 1 file/);}
  }
});

test('complex email faults change one selected source cell and never the synthetic ancestor', async () => {
  const m = await import('./lib/exui-complex-email-text.mjs');
  const baseline = m.deriveComplexEmailFixture();
  for (const [variant, column, value] of [['email-type', 'FieldType', 'Email'], ['searchable', 'Searchable', 'Y']]) {
    const fault = m.deriveComplexEmailFixture(variant);
    const expected = structuredClone(baseline.fixture);
    m.complexEmailRow(expected)[column] = value;
    assert.deepEqual(fault.fixture, expected);
    m.validateComplexEmailFixture(fault, variant);
    assert.equal(fault.binding.catalogueCredit, false);
  }
  assert.throws(() => m.deriveComplexEmailFixture('email-to-text'), /COMPLEX_EMAIL_VARIANT/);
  for (const change of [
    x => { m.complexEmailRow(x.fixture).ElementLabel = 'Changed'; },
    x => { x.fixture.sheets.ComplexTypes.push(structuredClone(m.complexEmailRow(x.fixture))); },
    x => { x.fixture.sheets.CaseField.find(row => row.ID === 'harnessEmailTypeProbe').Searchable = 'N'; },
    x => { x.binding.activationClaim = true; },
    x => { x.binding.catalogueCredit = true; },
  ]) {
    const bad = structuredClone(baseline); change(bad);
    assert.throws(() => m.validateComplexEmailFixture(bad), /COMPLEX_EMAIL_/);
  }
});

test('complex email imported metadata binds the exact type path and typed PUBLIC/non-searchable attributes', async () => {
  const m = await import('./lib/exui-complex-email-text.mjs');
  const context = { owner: 'prototype-owner', namespace: 'a'.repeat(64), version: 2 };
  const rows = [{case_type:'HarnessNestedPRL',version:2,field:'sodAdditionalRecipientsList',parent:'ServeOrgDetails',branch:'emailInformation',type:'EmailInformation',reference:'emailAddress',label:'Email address',field_type:'Text',security:'PUBLIC',searchable:false,searchable_sql_type:'boolean'}];
  const value = m.validateComplexEmailMetadata(rows, context);
  assert.equal(value.catalogueCredit, false);
  assert.equal(value.activationClaim, false);
  for (const change of [x=>{x[0].version=1;},x=>{x[0].parent='Other';},x=>{x[0].field_type='Email';},x=>{x[0].security='PRIVATE';},x=>{x[0].searchable='false';},x=>{x[0].searchable=true;},x=>{x[0].live_from='2022-12-01';},x=>{x.push({...x[0]});}]) {
    const bad=structuredClone(rows);change(bad);
    assert.throws(()=>m.validateComplexEmailMetadata(bad,context),/COMPLEX_EMAIL_/);
  }
  assert.throws(()=>m.complexEmailMetadataSql('2;DROP TABLE case_type'),/COMPLEX_EMAIL_VERSION/);
  const sql=m.complexEmailMetadataSql(2);
  assert(sql.startsWith('BEGIN READ ONLY;'));
  assert(sql.includes('ct.version=2'));
  assert(!sql.includes('live_from'));
});

test('complex email observer API omission never substitutes for stored PUBLIC classification', async()=>{
 const {validateComplexEmailObserver,validateComplexEmailStoredClassification}=await import('./lib/exui-complex-email-classification.mjs');
 const empty={case_data:{sodAdditionalRecipientsList:[]},data_classification:{}};validateComplexEmailObserver(empty);
 for(const state of [null,{}, {...empty,data_classification:null},{...empty,data_classification:[]},{...empty,data_classification:{sodAdditionalRecipientsList:{value:[]}}}])assert.throws(()=>validateComplexEmailObserver(state),/COMPLEX_EMAIL_OBSERVER_/);
 for(const variant of ['baseline','email-type']) {
  const {rows,observed,context}=mock.classification(variant);assert.equal(validateComplexEmailStoredClassification(rows,observed,context).catalogueCredit,false);
  for(const mutate of [x=>x.pop(),x=>x[0].reference='9999999999999999',x=>x[0].case_type='Wrong',x=>x[0].version++,x=>x[0].data.sodAdditionalRecipientsList.pop(),x=>{x[0].data.sodAdditionalRecipientsList[0].id='99999999-2222-3333-4444-555555555555';x[0].data_classification.sodAdditionalRecipientsList.value[0].id='99999999-2222-3333-4444-555555555555';},x=>delete x[0].data_classification.sodAdditionalRecipientsList,x=>x[0].data_classification.sodAdditionalRecipientsList.value[0].id='wrong-recipient',x=>x[0].data_classification.sodAdditionalRecipientsList.value[0].value.emailInformation.value.emailAddress='PRIVATE',x=>x[0].events[0].case_type_version++,x=>x[0].events[0].user_id='foreign-actor']) {
   const bad=structuredClone(rows);mutate(bad);assert.throws(()=>validateComplexEmailStoredClassification(bad,observed,context),/COMPLEX_EMAIL_/);
  }
 }
});

test('complex email classification read is bound to owned imported runtime and remains read only',async t=>{
 const {readComplexEmailStoredClassification}=await import('./lib/exui-complex-email-classification.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-email-stored-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(root+'/complex-email-import');
 const {rows,observed,context}=mock.classification();
 const state={output:root,owner:context.owner,namespace:context.namespace,images:{data:{id:'pinned-data-image'}}};
 const imported={owner:state.owner,namespace:state.namespace,images:state.images,status:'import-and-complex-metadata-observed',descriptor:{version:2}};
 let inspected=0,queried=0;
 const options={inspect:()=>{inspected++;},runDocker:(args,sql)=>{
  queried++;assert.deepEqual(args,['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_data']);
  assert.match(sql,/^BEGIN READ ONLY;/);assert.match(sql,/ROLLBACK;$/);assert(!/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(sql));assert.match(sql,/case_type_id='HarnessNestedPRL'/);return JSON.stringify(rows);
 }};
 for(const change of [x=>x.owner='foreign-owner',x=>x.namespace='b'.repeat(64),x=>x.images={}]) {
  const bad=structuredClone(imported);change(bad);assert.throws(()=>readComplexEmailStoredClassification(state,bad,observed,options),/COMPLEX_EMAIL_RUNTIME_IDENTITY/);
 }
 assert.equal(queried,0);assert.equal(inspected,0);
 const result=readComplexEmailStoredClassification(state,imported,observed,options);assert.equal(inspected,2);assert.equal(queried,1);assert.equal(result.definitionVersion,2);assert.equal(result.catalogueCredit,false);
 assert.equal(fs.readFileSync(root+'/complex-email-import/stored-classification-rows.json','utf8'),JSON.stringify(rows));
 const blocked={...options,inspect:()=>{throw Error('CCD_RUNTIME_OWNER_MISMATCH');}};
 assert.throws(()=>readComplexEmailStoredClassification(state,imported,observed,blocked),/CCD_RUNTIME_OWNER_MISMATCH/);assert.equal(queried,1);
});

test('complex email new recipients require generated unique IDs with the submitted associations',async()=>{
 const {validateComplexEmailRecipientIds}=await import('./lib/exui-complex-email-classification.mjs');
 const sent=[0,1].map(index=>({id:null,value:{serveByPostOrEmail:'email',emailInformation:{emailName:`Synthetic ${index}`,emailAddress:`person${index}@harness.example.com`}}}));
 const saved=sent.map((item,index)=>({...structuredClone(item),id:`11111111-2222-3333-4444-55555555555${index}`}));
 validateComplexEmailRecipientIds(saved,sent);
 for(const mutate of [x=>delete x[0].id,x=>x[0].id=null,x=>x[0].id=x[1].id,x=>x[0].id='wrong',x=>x.reverse(),x=>x[0].value.emailInformation.emailAddress='wrong']) {
  const bad=structuredClone(saved);mutate(bad);assert.throws(()=>validateComplexEmailRecipientIds(bad,sent),/(?:COMPLEX_EMAIL_|SHARED_NESTED_)/);
 }
 const bad=structuredClone(sent);bad[0].id=saved[0].id;assert.throws(()=>validateComplexEmailRecipientIds(saved,bad),/COMPLEX_EMAIL_NEW_RECIPIENT_ID/);
});

test('shared feasibility lifecycle requires positive cleanup after start or create in every mode',async t=>{
 for(const scenario of ['complex-email-text','recipient-callback','selector-event-row'])for(const mode of ['no-start','precreation-missing','started-missing','created-missing','started-incomplete','started-complete','throwing-create-complete','invalid-create-complete']) {
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-cleanup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const observed=await mock.runFeasibilityCleanup(root,mode,scenario),safe=['no-start','precreation-missing','started-complete'].includes(mode);
  assert.equal(observed.receipt.cleanup.cleanupComplete,safe,scenario+':'+mode);
  assert.equal(observed.receipt.status==='cleanup-uncertain',!safe,scenario+':'+mode);
  assert.deepEqual([observed.receipt.runtimeAcceptance,observed.receipt.catalogueCredit,observed.receipt.releaseCredit],[false,false,false]);
  if(mode==='created-missing')assert(observed.calls.includes('create'));
 }
});

test('failed host cleanup stays uncertain after successful final retry and preserves private workspace',async t=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-retry-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const observed=await mock.runFeasibilityCleanup(root,'host-retry');
 assert(observed.calls.includes('remove-host'));assert.equal(observed.receipt.nativeCleanupComplete,false);
 assert.equal(observed.receipt.status,'cleanup-uncertain');assert.equal(observed.receipt.workspaceCleanupComplete,false);assert.equal(observed.workspaceExists,true);
});


test('unobserved feasibility host stop retains ownership and prevents CCD or workspace teardown',async t=>{
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'complex-stop-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const observed=await mock.runFeasibilityCleanup(root,'host-stop-failure');
 assert.equal(observed.retained,2);assert.equal(observed.calls.filter(call=>call==='remove-host').length,1);
 assert(!observed.calls.includes('cleanup'));assert.equal(observed.receipt.nativeCleanupComplete,false);assert.equal(observed.receipt.cleanup.cleanupComplete,false);
 assert.equal(observed.receipt.status,'cleanup-uncertain');assert.equal(observed.workspaceExists,true);
});
