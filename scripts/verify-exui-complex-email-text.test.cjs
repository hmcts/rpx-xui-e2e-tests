const assert = require('node:assert/strict');
const { test } = require('node:test');

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
