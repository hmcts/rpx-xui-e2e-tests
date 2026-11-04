const test = require('node:test');
const assert = require('node:assert/strict');
const api = () => import('./lib/exui-source-shape-contract.mjs');
const baseline = async () => (await import('./lib/exui-ccd-event-capability.mjs')).buildEventCapabilityFixtures().baseline;

test('source shape rows retain every source facet including import-only dates and blank labels', async () => {
  const {assertSourceShapeRows} = await api(), fixture = await baseline();
  assertSourceShapeRows(fixture);
  for (const [key,value] of [['LiveFrom','01/09/2099'],['EventElementLabel','Invented label'],['FieldDisplayOrder','99'],['DisplayContext','READONLY']]) {
    const changed = structuredClone(fixture);
    changed.sheets.EventToComplexTypes.find(row => row.CaseEventID === 'serviceOfDocuments' && row.CaseFieldID === 'sodAdditionalRecipientsList' && row.ListElementCode === 'serveByPostOrEmail')[key] = value;
    assert.throws(() => assertSourceShapeRows(changed), /SHAPE_SOURCE_FACET_DRIFT/);
  }
});
test('each independent fault changes one event facet and cannot broaden a role or alter bootstrap', async () => {
  const {SOURCE_SHAPE_ROWS,deriveSourceShapeFault,validateSourceShapeFault} = await api(), fixture = await baseline();
  for (const row of SOURCE_SHAPE_ROWS) {
    const mutant = deriveSourceShapeFault(row.id,fixture);
    validateSourceShapeFault(row.id,fixture,mutant);
    assert.deepEqual(mutant.sheets.AuthorisationCaseEvent,fixture.sheets.AuthorisationCaseEvent);
    const tampered = structuredClone(mutant);
    tampered.sheets.EventToComplexTypes.find(item => item.CaseEventID === 'create').DisplayContext='READONLY';
    assert.throws(() => validateSourceShapeFault(row.id,fixture,tampered), /SHAPE_SINGLE_FACET_FAULT_REQUIRED/);
    assert.throws(() => deriveSourceShapeFault(row.id,mutant), /SHAPE_CANONICAL_BASELINE_REQUIRED/);
  }
});
test('observed source shape requires real event context and exact normalized metadata', async () => {
  const {SOURCE_SHAPE_ROWS,assertObservedSourceShape} = await api();
  for (const contract of SOURCE_SHAPE_ROWS) {
    const child={reference:contract.reference,label:contract.label,order:contract.order,displayContext:contract.context,showCondition:contract.condition};
    const observed={id:'HarnessNestedPRL',events:[{id:'serviceOfDocuments',case_fields:[{case_field_id:'sodAdditionalRecipientsList',case_fields_complex:[child]}]}]};
    assertObservedSourceShape(observed,contract.id);
    for (const key of ['label','order','displayContext','showCondition']) {
      const original=child[key];child[key]='unexpected';
      assert.throws(()=>assertObservedSourceShape(observed,contract.id),/SHAPE_/);child[key]=original;
    }
    observed.events[0].case_fields[0].case_fields_complex.push({...child});
    assert.throws(()=>assertObservedSourceShape(observed,contract.id),/SHAPE_RUNTIME_ROW_REQUIRED/);
  }
});

test('accepted complete evidence credits only the three exact source shapes in addition to existing role cells', async t => {
  const {createEventTransitionFixture}=require('./fixtures/exui-event-transition-evidence.mock.cjs');
  const {projectConfigurationCoverage}=await import('./lib/exui-configuration-runtime-coverage.mjs');
  const f=await createEventTransitionFixture(t);
  const report=projectConfigurationCoverage({eventPhaseDirectory:f.directory}).report;
  assert.deepEqual(report.executedProofs.filter(row=>row.obligationId.startsWith('configuration-shape:')).map(row=>row.obligationId),
    ['configuration-shape:69bcacf62a9db6f81914356612c4c4d770865dd287bc48704f88be54013bbe49',
      'configuration-shape:02958e8aee4cc1376f6b6607883e90293d8d2c765b4e9796884a61e24123919e',
      'configuration-shape:9ece0d15adfefeabf964c0905981f1343b26487ad4e68f47a9d7bcbf73aaa757']);
});
for (const name of ['required-delivery-radio','conditional-email-complex','optional-postal-line-two'])
  test(`wrong effective fault oracle for ${name} cannot credit source shapes`,async t=>{
    const {createEventTransitionFixture}=require('./fixtures/exui-event-transition-evidence.mock.cjs');
    const {projectConfigurationCoverage}=await import('./lib/exui-configuration-runtime-coverage.mjs');
    const f=await createEventTransitionFixture(t);
    f.shapeFaults.find(item=>item.id===`ccd-shape-${name}`).execution.report.tests[0].failureId='unrelated-browser-failure';
    f.write();
    const report=projectConfigurationCoverage({eventPhaseDirectory:f.directory}).report;
    assert.equal(report.executedProofs.filter(row=>row.obligationId.startsWith('configuration-shape:')).length,0);
  });

test('source LiveFrom reaches each selected workbook row as an Excel date rather than text', () => {
  const {spawnSync}=require('node:child_process');
  const path=require('node:path');
  const result=spawnSync('python3',['-c',`
import zipfile,xml.etree.ElementTree as E,json,datetime,sys
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 names=[x.attrib['name'] for x in E.fromstring(z.read('xl/workbook.xml')).find('x:sheets',ns)]
 rows=E.fromstring(z.read('xl/worksheets/sheet%d.xml'%(names.index('EventToComplexTypes')+1))).find('x:sheetData',ns)
 def cells(row): return {c.attrib['r'].rstrip('0123456789'):(c,c.find('x:v',ns).text) for c in row}
 headers={k:v[1] for k,v in cells(rows[2]).items()}
 selected=[]
 for row in rows[3:]:
  mapped={headers[k]:v for k,v in cells(row).items()}
  if mapped['CaseEventID'][1]=='serviceOfDocuments' and mapped['CaseFieldID'][1]=='sodAdditionalRecipientsList' and mapped['ListElementCode'][1] in ['serveByPostOrEmail','emailInformation','postalInformation.postalAddress.AddressLine2']:
   c,value=mapped['LiveFrom']; selected.append([mapped['ListElementCode'][1],c.attrib.get('t'),c.attrib.get('s'),int(value)])
 print(json.dumps(selected))
`,path.join(__dirname,'fixtures/ccd/event-capability/baseline.xlsx')],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),[
    ['serveByPostOrEmail','n','1',45536],['emailInformation','n','1',45536],['postalInformation.postalAddress.AddressLine2','n','1',45536],
  ]);
});

const storedDateRows=()=>['emailInformation','postalInformation.postalAddress.AddressLine2','serveByPostOrEmail'].map(reference=>({case_type:'HarnessNestedPRL',version:7,event:'serviceOfDocuments',field:'sodAdditionalRecipientsList',reference,live_from:'2024-09-01',sql_type:'date'}));
test('stored shape dates bind exact typed rows, source identities, version and owned namespace',async()=>{
 const {sourceShapeDateRecord,assertStoredSourceShapeDates}=await import('./lib/exui-source-shape-dates.mjs');
 const state={owner:'harness-synthetic',namespace:'a'.repeat(64)},record=sourceShapeDateRecord(storedDateRows(),state,7);
 assert.equal(record.activationClaim,false);assert.equal(record.sourceRows.length,3);assertStoredSourceShapeDates(record,state,7);
 assert.throws(()=>assertStoredSourceShapeDates(undefined,state,7),/SHAPE_STORED_DATES_REQUIRED/);
 for(const alter of [r=>r.rows.pop(),r=>r.rows.push(r.rows[0]),r=>r.rows[0].live_from='2024-01-09',r=>r.rows[0].sql_type='text',r=>r.rows[0].version=8,r=>r.rows[0].event='create',r=>r.rows[0].field='other',r=>r.rows[0].reference='anotherReference',r=>r.rows[0].case_type='PRLAPPS',r=>r.namespace='b'.repeat(64),r=>r.owner='different',r=>r.definitionVersion=8,r=>r.sourceRows[0].rowDigest='sha256:'+'0'.repeat(64),r=>r.sourceRevision='other',r=>r.sourceProjectionDigest='sha256:'+'0'.repeat(64),r=>r.sourcePath='other',r=>r.activationClaim=true]){
  const changed=structuredClone(record);alter(changed);assert.throws(()=>assertStoredSourceShapeDates(changed,state,7),/SHAPE_STORED_DATE/);
 }
});
test('stored shape date transport is fixed read-only SQL between owned identity checks',async()=>{
 const {readStoredSourceShapeDates}=await import('./lib/exui-source-shape-dates.mjs');
 const state={owner:'harness-synthetic',namespace:'a'.repeat(64)},calls=[];
 const inspect=s=>{assert.equal(s,state);calls.push('inspect');};
 const runDocker=(args,sql)=>{calls.push('query');assert.deepEqual(args,['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition']);assert.match(sql,/^BEGIN READ ONLY;/);assert.match(sql,/ct.version=7\n/);assert.match(sql,/pg_typeof\(ec.live_from\)/);return JSON.stringify(storedDateRows());};
 readStoredSourceShapeDates(state,7,{inspect,runDocker});assert.deepEqual(calls,['inspect','query','inspect']);
 assert.throws(()=>readStoredSourceShapeDates(state,'7; DROP',{inspect,runDocker}),/SHAPE_DATE_VERSION_REQUIRED/);assert.equal(calls.length,3);
 assert.throws(()=>readStoredSourceShapeDates(state,7,{inspect:()=>{throw Error('ownership');},runDocker}),/ownership/);assert.equal(calls.length,3);
 assert.throws(()=>readStoredSourceShapeDates(state,7,{inspect,runDocker:()=>'{invalid'}),/SHAPE_DATE_RESPONSE_INVALID/);
 assert.throws(()=>readStoredSourceShapeDates(state,7,{inspect,runDocker:()=>{throw Error('private diagnostic');}}),/^Error: SHAPE_DATE_QUERY_FAILED$/);
 assert.throws(()=>readStoredSourceShapeDates(state,7,{inspect,runDocker:()=>JSON.stringify(storedDateRows().slice(1))}),/SHAPE_STORED_DATE_ROWS_MISMATCH/);
});
for(const [name,change] of [['missing',r=>delete r.storedSourceShapeDates],['wrong-date',r=>r.storedSourceShapeDates.rows[0].live_from='2020-01-01'],['wrong-namespace',r=>r.storedSourceShapeDates.namespace='f'.repeat(64)],['wrong-source',r=>r.storedSourceShapeDates.sourceRows[0].rowDigest='sha256:'+'0'.repeat(64)]])
 test(`rehashed ${name} stored date evidence cannot replay or credit source rows`,async t=>{
  const {createEventTransitionFixture}=require('./fixtures/exui-event-transition-evidence.mock.cjs');
  const {validateEventTransitionEvidence}=await import('./lib/exui-ccd-event-transition.mjs');
  const {projectConfigurationCoverage}=await import('./lib/exui-configuration-runtime-coverage.mjs');
  const f=await createEventTransitionFixture(t),loaded=await f.loaded();change(f.variants.mutant.imported);
  f.runtimeRecord.definitionImportDigest=f.put('definition-import.json',f.variants.mutant.imported,f.variants.mutant.state.output).digest;
  f.fault.current.runtimeMetadata.definitionImportDigest=f.runtimeRecord.definitionImportDigest;
  f.write();
  assert.throws(()=>validateEventTransitionEvidence(f.directory,f.expected,loaded),/SHAPE_STORED_DATE/);
  assert.throws(()=>projectConfigurationCoverage({eventPhaseDirectory:f.directory}),/SHAPE_STORED_DATE/);
 });
