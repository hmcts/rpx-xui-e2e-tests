import assert from 'node:assert/strict';
import fs from 'node:fs';
import { definitionDigest } from './exui-definition-references.mjs';
import { buildResultColumnDefinition } from './exui-result-columns-definition.mjs';

const sourcePath = new URL('../fixtures/ccd/workbasket-input.source.json', import.meta.url);
const sourceDigest = 'sha256:fb09d21ac646edbb01f16946253e55393f8733771f7da9ae984e0aff6e2a6a31';
const prefix = 'definitions/private-law/json/';
const paths = ['WorkBasketInputFields.json', 'CaseField/CaseField.json', 'CaseField/DFJArea/CaseField.json', 'FixedLists.json'];
const target = 'HarnessResultsPRL';
const fieldIds = ['applicantCaseName', 'caseTypeOfApplication', 'familymanCaseNumber', 'dateSubmitted',
  'dfjArea', 'swanseaDFJCourt', 'humbersideDFJCourt', 'essexAndSuffolkDFJCourt', 'wolverhamptonDFJCourt'];

function source() {
  const value = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  assert.equal(definitionDigest(value), sourceDigest, 'WORKBASKET_INPUT_SOURCE_DRIFT');
  assert.equal(value.schemaVersion, 1, 'WORKBASKET_INPUT_SOURCE_SCHEMA');
  assert.equal(value.repository, 'hmcts/prl-ccd-definitions', 'WORKBASKET_INPUT_SOURCE_REPOSITORY');
  assert.equal(value.revision, '694b9951e94369f1394380506960c4f04f25755d', 'WORKBASKET_INPUT_SOURCE_REVISION');
  assert.deepEqual(value.sources.map(item => item.path), paths.map(item => prefix + item), 'WORKBASKET_INPUT_SOURCE_PATHS');
  for (const file of value.sources) {
    assert(/^sha256:[a-f0-9]{64}$/.test(file.fileDigest), 'WORKBASKET_INPUT_FILE_DIGEST');
    for (const item of file.rows) {
      assert.equal(definitionDigest(item.row), item.rowDigest, 'WORKBASKET_INPUT_ROW_DRIFT');
      assert(Number.isSafeInteger(item.index) && item.index >= 0, 'WORKBASKET_INPUT_SOURCE_INDEX');
    }
  }
  assert.equal(value.sources[0].rows.length, 10, 'WORKBASKET_INPUT_ROW_COUNT');
  assert.deepEqual(value.sources.slice(1, 3).flatMap(file => file.rows.map(item => item.row.ID)).sort(), [...fieldIds].sort(), 'WORKBASKET_INPUT_FIELD_DEPENDENCIES');
  const groups = [...new Set(value.sources[3].rows.map(item => item.row.ID))].sort();
  assert.deepEqual(groups, ['CaseTypeOfApplicationEnum', 'DFJArea', 'EssexAndSuffolkDFJCourts', 'HumbersideDFJCourts', 'SwanseaDFJCourts', 'WolverhamptonDFJCourts'].sort(), 'WORKBASKET_INPUT_LIST_DEPENDENCIES');
  return value;
}

export function buildWorkbasketInputDefinition() {
  const pinned = source();
  const definition = buildResultColumnDefinition();
  const normalize = row => ({ ...row, CaseTypeID: target });
  const inputs = pinned.sources[0].rows.map(item => normalize(item.row));
  const fields = pinned.sources.slice(1, 3).flatMap(file => file.rows.map(item => normalize(item.row)));
  for (const field of fields) {
    const existing = definition.sheets.CaseField.find(row => row.ID === field.ID);
    if (existing) assert.deepEqual(existing, field, 'WORKBASKET_INPUT_SHARED_FIELD_DRIFT');
    else {
      definition.sheets.CaseField.push(field);
      definition.sheets.AuthorisationCaseField.push({ LiveFrom: '01/01/2020', CaseTypeID: target,
        CaseFieldID: field.ID, UserRole: 'caseworker-harness', CRUD: 'CR' });
    }
  }
  definition.sheets.WorkBasketInputFields = inputs;
  definition.sheets.FixedLists = pinned.sources[3].rows.map(item => ({ ...item.row }));
  definition.kind = 'source-bound-workbasket-input-import';
  definition.workbasketInputSource = { repository: pinned.repository, revision: pinned.revision,
    sourceDigest, files: pinned.sources.map(file => ({ path: file.path, fileDigest: file.fileDigest })) };
  definition.workbasketInputBindings = pinned.sources[0].rows.map(item => ({
    obligationId: 'configuration-shape:' + definitionDigest({ source: 'prl-ccd-definitions:' + pinned.sources[0].path, row: item.row }).slice(7),
    sourceIndex: item.index, rowDigest: item.rowDigest, field: item.row.CaseFieldID,
  }));
  definition.syntheticScaffolding.sheets = definition.syntheticScaffolding.sheets.filter(name => !['WorkBasketInputFields', 'FixedLists'].includes(name));
  definition.exclusions = [
    'Source rows and dependencies are import inputs only; no CCD or candidate runtime credit is granted by preparation.',
    'Results columns and search inputs remain separate feasibility scopes.',
  ];
  return definition;
}

export function validateWorkbasketInputDefinition(value) {
  assert.deepEqual(value, buildWorkbasketInputDefinition(), 'WORKBASKET_INPUT_DEFINITION_DRIFT');
}
