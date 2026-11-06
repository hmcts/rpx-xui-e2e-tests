const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const load = () => import('./lib/exui-conditional-warning-contract.mjs');

test('conditional warning retains the complete source row and exact interpolation dependencies', async () => {
  const m = await load(), baseline = m.deriveConditionalWarningFixture();
  assert.deepEqual(m.conditionalWarningRow(baseline.fixture), {
    LiveFrom: '01/09/2024', CaseTypeID: 'HarnessNestedPRL', CaseEventID: 'serviceOfDocuments',
    CaseFieldID: 'missingAddressWarningTextLabel', DisplayContext: 'READONLY', PageID: 2,
    PageDisplayOrder: 2, PageFieldDisplayOrder: 1, ShowSummaryChangeOption: 'N',
    FieldShowCondition: 'missingAddressWarningText!=""',
  });
  assert.equal(baseline.binding.obligationId, 'configuration-shape:6720379b6c70609aec057b75a0d290a3e79a4839757c127c1330736a61bec593');
  assert.equal(m.WARNING_ATTRIBUTES.length, 10);
  const fields = baseline.fixture.sheets.CaseField.filter(r => ['missingAddressWarningText', 'missingAddressWarningTextLabel'].includes(r.ID));
  assert.deepEqual(fields.map(r => [r.ID,r.FieldType,r.Label,r.LiveFrom,r.Searchable,r.SecurityClassification]), [
    ['missingAddressWarningText','Text',' ','01/12/2022','N','Public'],
    ['missingAddressWarningTextLabel','Label','${missingAddressWarningText}','01/12/2022','N','Public'],
  ]);
  for (const key of ['activationClaim','sourceComplete','runtimeAcceptance','catalogueCredit','releaseCredit']) assert.equal(baseline.binding[key],false);
});

test('the fault changes exactly one selected source condition cell, never readonly/summary/backing data', async () => {
  const m = await load(), baseline = m.deriveConditionalWarningFixture(), fault = m.deriveConditionalWarningFixture('condition-equals-empty');
  const expected = structuredClone(baseline.fixture);
  m.conditionalWarningRow(expected).FieldShowCondition = 'missingAddressWarningText=""';
  assert.deepEqual(fault.fixture,expected);
  assert.notDeepEqual(fault.fixture,baseline.fixture,'WARNING_FAULT_MUST_CHANGE_CONDITION');
  assert.deepEqual(m.conditionalWarningMutation(),{sheet:'CaseEventToFields',event:'serviceOfDocuments',field:'missingAddressWarningTextLabel',column:'FieldShowCondition',before:'missingAddressWarningText!=""',after:'missingAddressWarningText=""'});
  assert.throws(()=>m.deriveConditionalWarningFixture('editable-label'),/WARNING_VARIANT/);
  assert.throws(()=>m.validateConditionalWarningFixture(baseline,'condition-equals-empty'),/WARNING_CANONICAL/);
});

test('selected source facets, dependencies and provenance cannot drift coherently', async () => {
  const m = await load(), baseline = m.deriveConditionalWarningFixture();
  for (const key of m.WARNING_ATTRIBUTES) {
    const changed = structuredClone(baseline);m.conditionalWarningRow(changed.fixture)[key]='foreign';
    assert.throws(()=>m.validateConditionalWarningFixture(changed),/WARNING_CANONICAL/,key);
  }
  for (const mutate of [
    x=>x.fixture.sheets.CaseField.find(r=>r.ID==='missingAddressWarningTextLabel').Label='fixed warning',
    x=>x.fixture.sheets.CaseField.find(r=>r.ID==='missingAddressWarningText').Searchable='Y',
    x=>x.fixture.sheets.CaseEventToFields.push({...m.conditionalWarningRow(x.fixture)}),
    x=>x.binding.sourceRevision='0'.repeat(40),
    x=>x.binding.sourceComplete=true,
    x=>x.binding.supportingContext.neighbouringCallback='live-business-service',
  ]) {const changed=structuredClone(baseline);mutate(changed);assert.throws(()=>m.validateConditionalWarningFixture(changed),/WARNING_CANONICAL/);}
});

test('declared synthetic predecessor/seed grants remain separate from the selected source row', async () => {
  const m=await load(), {fixture,binding}=m.deriveConditionalWarningFixture();
  const predecessor=fixture.sheets.CaseEventToFields.filter(r=>r.CaseEventID==='serviceOfDocuments'&&r.CaseFieldID==='protectedValue');
  assert.equal(predecessor.length,1);assert.equal(predecessor[0].PageID,'harnessBefore');assert.equal(predecessor[0].PageDisplayOrder,1);assert.equal(predecessor[0].ShowSummaryChangeOption,'Y');
  const seeds=fixture.sheets.CaseEventToFields.filter(r=>r.CaseEventID==='create'&&r.CaseFieldID.startsWith('missingAddress'));
  assert.deepEqual(seeds.map(r=>[r.CaseFieldID,r.DisplayContext,r.PageFieldDisplayOrder]),[['missingAddressWarningText','OPTIONAL',10]]);
  assert.equal(fixture.sheets.CaseEventToFields.filter(r=>r.CaseEventID==='serviceOfDocuments'&&r.CaseFieldID==='missingAddressWarningText').length,0);
  assert.equal(binding.supportingContext.neighbouringCallback,'omitted-controlled-context-no-business-workflow-claim');
  for(const row of fixture.sheets.CaseEventToFields)assert.equal(row.CallBackURLMidEvent,undefined);
  const labelGrants=fixture.sheets.AuthorisationCaseField.filter(r=>r.CaseFieldID==='missingAddressWarningTextLabel');
  const sourceControl=fixture.sheets.AuthorisationCaseField.filter(r=>r.CaseFieldID==='sodAdditionalRecipients');
  assert.deepEqual(labelGrants,sourceControl.map(r=>({...r,CaseFieldID:'missingAddressWarningTextLabel'})));
});

test('real deterministic workbook projection preserves the ten source cells and only changes the condition', async t => {
  const m=await load(), root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'warning-workbook-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const a=await m.prepareConditionalWarningWorkbook(path.join(root,'a'));
  const b=await m.prepareConditionalWarningWorkbook(path.join(root,'b'));
  const fault=await m.prepareConditionalWarningWorkbook(path.join(root,'fault'),'condition-equals-empty');
  assert.deepEqual(a,b);assert.notEqual(a.workbookDigest,fault.workbookDigest);
  const readWorkbook=`import json,sys,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]);n={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
w=E.fromstring(z.read('xl/workbook.xml')); names=[s.attrib['name'] for s in w.find('m:sheets',n)]
root=E.fromstring(z.read('xl/worksheets/sheet'+str(names.index('CaseEventToFields')+1)+'.xml'));rows=root.find('m:sheetData',n)
def cells(r):return {c.attrib['r'].rstrip('0123456789'):{'value':c.find('m:v',n).text,'type':c.attrib.get('t'),'style':c.attrib.get('s')} for c in r}
h={k:v['value'] for k,v in cells(rows[2]).items()}; result=[]
for r in list(rows)[3:]:
 d={h[k]:v for k,v in cells(r).items()}
 if d.get('CaseEventID',{}).get('value')=='serviceOfDocuments' and d.get('CaseFieldID',{}).get('value')=='missingAddressWarningTextLabel':result.append(d)
print(json.dumps(result))`;
  const rows=folder=>JSON.parse(execFileSync('python3',['-B','-c',readWorkbook,path.join(root,folder,'definition.xlsx')],{encoding:'utf8'}));
  const actual=rows('a');assert.equal(actual.length,1);assert.deepEqual(Object.keys(actual[0]).sort(),[...m.WARNING_ATTRIBUTES].sort());
  assert.deepEqual(actual[0].LiveFrom,{value:'45536',type:'n',style:'1'});
  for(const [key,value]of Object.entries(m.conditionalWarningRow(m.deriveConditionalWarningFixture().fixture)))if(key!=='LiveFrom')assert.equal(actual[0][key].value,String(value),key);
  const changed=structuredClone(actual);changed[0].FieldShowCondition.value='missingAddressWarningText=""';assert.deepEqual(rows('fault'),changed);
  await assert.rejects(m.prepareConditionalWarningWorkbook(path.join(root,'a')),/FRESH_CANDIDATE_DERIVATION_OUTPUT_REQUIRED/);
  const canary=path.join(root,'a','canary');fs.writeFileSync(canary,'preserve');await assert.rejects(m.prepareConditionalWarningWorkbook(path.join(root,'a')));assert.equal(fs.readFileSync(canary,'utf8'),'preserve');
});
