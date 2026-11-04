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
