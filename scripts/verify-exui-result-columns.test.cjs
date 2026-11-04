const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const load = () => import('./lib/exui-result-columns.mjs');
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ccd/result-columns.json')));

test('support only: result metadata preserves fourteen source columns and eight exact field types', async () => {
  const api = await load();
  const result = api.buildResultColumnFixture();
  assert.deepEqual(result, fixture());
  assert.deepEqual(result.sheets.SearchResultFields.map(row => [row.CaseFieldID, row.Label, row.DisplayOrder]), [
    ['applicantCaseName', 'Case name', 1], ['selectedCaseTypeID', 'Case type', 2],
    ['[CREATED_DATE]', 'Case created date ', 3], ['applicantName', 'Applicant name', 4],
    ['respondentName', 'Respondent name', 5], ['childName', 'Child name', 6], ['dateSubmitted', 'Date submitted', 7],
  ]);
  assert.deepEqual(result.sheets.WorkBasketResultFields.map(row => [row.CaseFieldID, row.Label, row.DisplayOrder, row.ResultsOrdering ?? null]), [
    ['applicantCaseName', 'Case', 1, null], ['familymanCaseNumber', 'Familyman number', 2, null],
    ['selectedCaseTypeID', 'Case type', 3, null], ['[STATE]', 'State', 4, null],
    ['applicantName', 'Applicant name', 5, null], ['respondentName', 'Respondent name', 6, null],
    ['caseSubmittedTimeStamp', 'Submitted date and time', 7, '1:DESC'],
  ]);
  assert.deepEqual(result.sheets.CaseField.map(row => [row.ID, row.FieldType]), [
    ['applicantName', 'Text'], ['childName', 'Text'], ['respondentName', 'Text'],
    ['applicantCaseName', 'Text'], ['selectedCaseTypeID', 'Text'], ['familymanCaseNumber', 'Text'],
    ['dateSubmitted', 'Date'], ['caseSubmittedTimeStamp', 'DateTime'],
  ]);
  assert(Object.values(result.sheets).flat().every(row => row.CaseTypeID === 'HarnessResultsPRL'));
  assert.equal(result.runtimeAcceptance, false);
  assert.equal(result.releaseCredit, false);
  assert.equal(result.catalogueCredit, false);
  assert.deepEqual(result.gaps.map(gap => gap.field), ['[CREATED_DATE]', '[STATE]']);
  assert(result.gaps.every(gap => gap.kind === 'ccd-runtime-metadata-required' && gap.fieldType === null));
  assert.equal(result.bindings.length, 14);
  assert.equal(new Set(result.bindings.map(row => row.obligationId)).size, 14);
  api.validateResultColumnFixture(result);
});

test('support only: changed column interpretation, type, source binding or false credit cannot validate', async () => {
  const api = await load();
  const original = api.buildResultColumnFixture();
  for (const change of [
    value => { value.sheets.SearchResultFields[0].Label = 'Case'; },
    value => { value.sheets.SearchResultFields[0].CaseFieldID = 'respondentName'; },
    value => { value.sheets.SearchResultFields[0].DisplayOrder = 2; },
    value => { value.sheets.SearchResultFields[2].CaseFieldID = 'createdDate'; },
    value => { value.sheets.WorkBasketResultFields[6].ResultsOrdering = '1:ASC'; },
    value => { value.sheets.CaseField.find(row => row.ID === 'dateSubmitted').FieldType = 'Text'; },
    value => { value.sheets.CaseField.find(row => row.ID === 'caseSubmittedTimeStamp').FieldType = 'Date'; },
    value => { value.sheets.CaseField.push({ ID: '[STATE]', FieldType: 'Text', CaseTypeID: 'HarnessResultsPRL' }); },
    value => { value.bindings[0].rowDigest = value.bindings[1].rowDigest; },
    value => { value.gaps = []; },
    value => { value.releaseCredit = true; },
    value => { value.catalogueCredit = true; },
    value => { value.runtimeAcceptance = true; },
  ]) {
    const changed = structuredClone(original); change(changed);
    assert.throws(() => api.validateResultColumnFixture(changed), /RESULT_COLUMN_FIXTURE_DRIFT/);
  }
});

test('support only: result columns bind exact current catalogue source rows and reject forged source', async () => {
  const api = await load();
  const { definitionDigest } = await import('./lib/exui-definition-references.mjs');
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ccd/result-columns.source.json')));
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/exui-configuration-source.json')));
  for (const selected of source.sources.filter(item => !item.path.includes('/CaseField/'))) {
    const original = snapshot.sources.find(item => item.path === selected.path);
    assert.equal(selected.fileDigest, 'sha256:' + original.fileDigest);
    assert.deepEqual(selected.rows.map(item => item.row), original.document);
    assert(selected.rows.every(item => item.rowDigest === definitionDigest(item.row)));
  }
  const expectedIds = snapshot.sources.filter(item => [
    'definitions/private-law/json/SearchResultFields.json',
    'definitions/private-law/json/WorkBasketResultFields.json',
  ].includes(item.path)).flatMap(item => item.document.map(row =>
    'configuration-shape:' + definitionDigest({ source: 'prl-ccd-definitions:' + item.path, row }).slice(7)));
  assert.deepEqual(api.buildResultColumnFixture().bindings.map(item => item.obligationId), expectedIds);
  for (const change of [
    value => { value.revision = '0'.repeat(40); },
    value => { value.sources[0].rows.pop(); },
    value => { value.sources[2].rows.push(structuredClone(value.sources[2].rows[0])); },
    value => { value.sources[2].rows[0].row.FieldType = 'Date'; value.sources[2].rows[0].rowDigest = definitionDigest(value.sources[2].rows[0].row); },
  ]) {
    const changed = structuredClone(source); change(changed);
    assert.throws(() => api.buildResultColumnFixture(changed), /RESULT_COLUMN_SOURCE_DRIFT/);
  }
});
