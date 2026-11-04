const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const load = () => import('./lib/exui-result-columns-definition.mjs');

test('support only: result import retains every source attribute and labels scaffolding without credit', async () => {
  const { buildResultColumnDefinition, validateResultColumnDefinition } = await load();
  const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/ccd/result-columns.json'));
  const definition = buildResultColumnDefinition();
  for (const [name, rows] of Object.entries(fixture.sheets)) assert.deepEqual(definition.sheets[name], rows);
  assert.equal(definition.sheets.CaseField.length, 8);
  assert.equal(definition.sheets.SearchResultFields.length, 7);
  assert.equal(definition.sheets.WorkBasketResultFields.length, 7);
  assert.deepEqual(definition.sheets.CaseField.map(row => row.FieldType), ['Text','Text','Text','Text','Text','Text','Date','DateTime']);
  assert(!definition.sheets.CaseField.some(row => row.ID.startsWith('[')));
  assert.deepEqual(definition.syntheticScaffolding.sheets.sort(), Object.keys(definition.sheets).filter(name => !Object.hasOwn(fixture.sheets, name)).sort());
  for (const key of ['runtimeAcceptance', 'catalogueCredit', 'releaseCredit']) assert.equal(definition[key], false);
  validateResultColumnDefinition(buildResultColumnDefinition());
});

test('support only: result import rejects changed fields, columns, scaffolding and invented metadata', async () => {
  const { buildResultColumnDefinition, validateResultColumnDefinition } = await load();
  for (const tamper of [
    d => { d.sheets.CaseField[6].FieldType = 'Text'; },
    d => { d.sheets.CaseField[3].HintText = 'replacement'; },
    d => { d.sheets.SearchResultFields[2].Label = 'Case created date'; },
    d => { d.sheets.WorkBasketResultFields[6].ResultsOrdering = '1:ASC'; },
    d => { d.sheets.AuthorisationCaseType[0].CRUD = 'CRUD'; },
    d => { d.sheets.CaseField.push({ ID: '[STATE]', FieldType: 'Text' }); },
    d => { d.source.revision = 'changed'; },
    d => { d.syntheticScaffolding.sheets.pop(); },
    d => { d.runtimeAcceptance = true; },
  ]) {
    const altered = buildResultColumnDefinition(); tamper(altered);
    assert.throws(() => validateResultColumnDefinition(altered), /RESULT_COLUMN_DEFINITION_DRIFT/);
  }
  const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/ccd/result-columns.json'));
  fixture.sheets.CaseField[0].CaseTypeID = 'PRLAPPS';
  assert.throws(() => buildResultColumnDefinition(fixture), /RESULT_COLUMN_FIXTURE_DRIFT/);
});

test('support only: deterministic workbook round trips all rows, dates and whitespace; output is immutable', async t => {
  const { prepareResultColumnDefinition } = await import('./prepare-harness-result-columns.mjs');
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'results-workbook-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const first = path.join(parent, 'first'), second = path.join(parent, 'second');
  const binding = await prepareResultColumnDefinition(first);
  assert.deepEqual(await prepareResultColumnDefinition(second), binding);
  const retained = 'scripts/fixtures/ccd/result-columns-import';
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(retained, 'binding.json'))), binding);
  for (const name of ['definition.json', 'definition.xlsx']) assert.deepEqual(fs.readFileSync(path.join(retained, name)), fs.readFileSync(path.join(first, name)));
  await assert.rejects(prepareResultColumnDefinition(first));
  const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  assert.equal(binding.workbookDigest, sha(fs.readFileSync(path.join(first, 'definition.xlsx'))));
  assert.equal(binding.definitionDigest, sha(fs.readFileSync(path.join(first, 'definition.json'))));
  assert.deepEqual(fs.readFileSync(path.join(first, 'definition.xlsx')), fs.readFileSync(path.join(second, 'definition.xlsx')));
  const check = spawnSync('python3', ['-c', `
import json,sys,zipfile,datetime,xml.etree.ElementTree as E
root=sys.argv[1]; expected=json.load(open(root+'/definition.json'))['sheets']
z=zipfile.ZipFile(root+'/definition.xlsx'); assert z.testzip() is None
assert all(i.date_time==(2020,1,1,0,0,0) for i in z.infolist())
assert not any('externalLink' in n for n in z.namelist())
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
names=[s.attrib['name'] for s in E.fromstring(z.read('xl/workbook.xml')).findall('.//x:sheet',ns)]
assert names==list(expected)
for index,name in enumerate(names,1):
 rows=E.fromstring(z.read('xl/worksheets/sheet%d.xml'%index)).findall('.//x:row',ns)
 headers=[c.find('x:v',ns).text for c in rows[2]]
 decoded=[]
 for row in rows[3:]:
  entry={}
  for cell in row:
   key=headers[ord(cell.attrib['r'][0])-65]; value=cell.find('x:v',ns).text
   if cell.attrib.get('s')=='1': value=(datetime.datetime(1899,12,30)+datetime.timedelta(days=int(value))).strftime('%d/%m/%Y')
   entry[key]=value
  decoded.append(entry)
 assert decoded==[{k:str(v) for k,v in r.items() if v!=''} for r in expected[name]], name
`, first], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});
