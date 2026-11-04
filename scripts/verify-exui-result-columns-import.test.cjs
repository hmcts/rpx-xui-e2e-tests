const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

async function setup(t, alter = () => {}) {
  const runtime = await import('./lib/exui-ccd-runtime.mjs');
  const { buildResultColumnDefinition } = await import('./lib/exui-result-columns-definition.mjs');
  const definition = buildResultColumnDefinition();
  const output = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'result-import-test-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const pins = runtime.ccdImagePins('linux/arm64', { elasticsearch: true });
  const state = { output, owner:'harness-result-test', namespace:'a'.repeat(64), elasticsearch:true, images:Object.fromEntries(Object.entries(pins).map(([name,pin])=>[name,{id:pin.configDigest??pin.manifestDigest,architecture:'arm64',repoDigests:[pin.reference]}])), containers:Object.fromEntries(Object.keys(pins).map(name=>[name,name==='database'?'a'.repeat(64):name])), caseType:'HarnessNestedPRL' };
  const images = runtime.ccdRuntimeImageIds(state);
  const inspectContainer = id => {
    const service = Object.keys(state.containers).find(key => state.containers[key]===id);
    return { Image:images[service], Config:{ Labels:{'exui.harness.owner':state.owner,'exui.harness.service':service}}, HostConfig:{NetworkMode:service==='database'?'none':`container:${state.namespace}`}, State:{Running:true} };
  };
  const descriptor = { id:'HarnessResultsPRL', version:{number:1}, case_fields:definition.sheets.CaseField.map(row=>({id:row.ID,field_type:{id:row.FieldType}})) };
  const layout = sheet => ({case_type_id:'HarnessResultsPRL',fields:definition.sheets[sheet].map(row=>({case_field_id:row.CaseFieldID,label:row.Label,order:row.DisplayOrder,metadata:row.CaseFieldID.startsWith('['),sort_order:row.ResultsOrdering?{direction:'DESC',priority:1}:null}))});
  const values = { definition:descriptor, search:layout('SearchResultFields'), workbasket:layout('WorkBasketResultFields') };
  alter(values);
  const calls=[];
  const request = (_state,port,route) => {
    calls.push({port,route});
    if(route==='/testing-support/accounts')return {status:201,body:{}};
    if(route==='/o/token')return {status:200,body:{access_token:'synthetic-test-token'}};
    if(route==='/details')return {status:200,body:{id:'observer-id'}};
    if(route==='/testing-support/lease')return {status:200,body:'synthetic-service-token'};
    if(route==='/api/user-role')return {status:201,body:{}};
    if(route==='/import')return {status:values.importStatus??201,body:{message:'synthetic import observation'}};
    if(route.includes('/data/case-type/'))return {status:200,body:values.definition};
    if(route.includes('/search-result-definition/'))return {status:200,body:values.search};
    if(route.includes('/work-basket-definition/'))return {status:200,body:values.workbasket};
    if(route.startsWith('/_alias/'))return {status:200,body:{harnessresultsprl_cases_v1:{aliases:{harnessresultsprl_cases:{}}}}};
    if(route.endsWith('/_mapping'))return {status:200,body:{harnessresultsprl_cases_v1:{mappings:{properties:{data:{properties:{}}}}}}};
    throw Error('Unexpected test route');
  };
  return {state,request,inspectContainer,calls,output};
}

test('support only: importer uses distinct result routes/receipt, retains observed metadata and grants no credit',async t=>{
 const {importResultColumns}=await import('./lib/exui-result-columns-import.mjs');
 const run=await setup(t); const before=structuredClone(run.state);
 const receipt=await importResultColumns(run.state,run);
 assert.equal(receipt.status,'import-and-readback-observed');
 assert.equal(receipt.caseType,'HarnessResultsPRL');
 assert.deepEqual(run.state,before);
 assert.equal(receipt.runtimeAcceptance,false);assert.equal(receipt.catalogueCredit,false);
 assert(run.calls.some(c=>c.port===9200&&c.route==='/harnessresultsprl_cases/_mapping'));
 assert(!fs.existsSync(path.join(run.output,'definition-import.json')));
 await assert.rejects(importResultColumns(run.state,run),/EEXIST/);
});
for(const [name,alter,code] of [
 ['import rejection',v=>{v.importStatus=400},'RESULT_IMPORT_REJECTED'],
 ['wrong case type',v=>{v.definition.id='Other'},'RESULT_IMPORT_CASE_TYPE'],
 ['altered column label',v=>{v.search.fields[0].label='wrong'},'RESULT_IMPORT_COLUMN_LABEL'],
 ['missing metadata flag',v=>{delete v.search.fields[2].metadata},'RESULT_IMPORT_COLUMN_METADATA'],
 ['changed type',v=>{v.definition.case_fields[6].field_type.id='Text'},'RESULT_IMPORT_FIELD_TYPE'],
 ['unknown layout schema',v=>{v.workbasket={columns:[]}},'RESULT_IMPORT_LAYOUT_CASE_TYPE'],
])test('support only: importer preserves failed observations for '+name,async t=>{
 const {importResultColumns}=await import('./lib/exui-result-columns-import.mjs');const run=await setup(t,alter);
 await assert.rejects(importResultColumns(run.state,run),new RegExp(code));
 const receipt=JSON.parse(fs.readFileSync(path.join(run.output,'result-columns-import/receipt.json')));
 assert.equal(receipt.status,'failed');assert.equal(receipt.catalogueCredit,false);
 assert(receipt.observations.import);assert(!JSON.stringify(receipt).includes('synthetic-test-token'));
});
for (const file of ['definition.json','definition.xlsx','binding.json']) test('support only: tampered '+file+' is rejected before identity or import calls',async t=>{
 const {importResultColumns}=await import('./lib/exui-result-columns-import.mjs');const run=await setup(t);
 const fixtures=path.join(run.output,'fixtures');fs.cpSync('scripts/fixtures/ccd/result-columns-import',fixtures,{recursive:true});
 fs.appendFileSync(path.join(fixtures,file),'tampered');
 await assert.rejects(importResultColumns(run.state,{...run,fixtureDirectory:fixtures}),/RESULT_IMPORT_SEAL_MISMATCH/);
 assert.deepEqual(run.calls,[]);
});
