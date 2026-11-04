import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ccdCredentials, ccdRequest, verifyCcdContainerIdentity } from './exui-ccd-runtime.mjs';
import { readResultSeedRows, validateResultSeedRows } from './exui-result-row-seed.mjs';

const caseType = 'HarnessResultsPRL';
// Source reference, not a runtime image binding: ccd-data-store-api
// 96eaf99f25bf447559be12e06050444877744e7e UICaseSearchController,
// CaseSearchResultViewGenerator, SearchResultViewHeader, HeaderGroupMetadata.
// No sort or _source: those would bypass configured ordering or use-case columns.
export function resultCcdSearchBody(references) {
  assert(Array.isArray(references) && references.length === 3 && new Set(references).size === 3 && references.every(ref => typeof ref === 'string' && /^\d{16}$/.test(ref)), 'RESULT_CCD_SEARCH_REFERENCES');
  return { native_es_query: { query: { terms: { 'reference.keyword': references } }, size: 3, from: 0 } };
}
const timestamp = value => {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?$/.test(value), 'RESULT_CCD_SEARCH_TIMESTAMP_SCHEMA');
  return value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
};
export function validateResultCcdSearch(body, layout, definition, rows, useCase) {
  assert(['SEARCH', 'WORKBASKET'].includes(useCase), 'RESULT_CCD_SEARCH_USE_CASE');
  assert.equal(layout.case_type_id, caseType, 'RESULT_CCD_SEARCH_LAYOUT_TYPE');
  assert.equal(body.total, 3, 'RESULT_CCD_SEARCH_TOTAL');
  assert(Array.isArray(body.headers) && body.headers.length === 1, 'RESULT_CCD_SEARCH_HEADER_GROUP');
  const group = body.headers[0];
  assert.deepEqual(group.metadata, { jurisdiction: 'HARNESS', case_type_id: caseType }, 'RESULT_CCD_SEARCH_METADATA');
  assert.deepEqual([...group.cases].sort(), rows.map(row => row.reference).sort(), 'RESULT_CCD_SEARCH_HEADER_CASES');
  assert(Array.isArray(group.fields) && group.fields.length === layout.fields.length, 'RESULT_CCD_SEARCH_COLUMNS');
  const columns = [...group.fields].sort((a,b) => a.order-b.order);
  const expected = [...layout.fields].sort((a,b) => a.order-b.order);
  for (let i = 0; i < columns.length; i++) {
    const field = columns[i], descriptor = expected[i];
    for (const key of ['case_field_id', 'label', 'order', 'metadata']) assert.deepEqual(field[key], descriptor[key], 'RESULT_CCD_SEARCH_COLUMN_BINDING');
    assert(typeof field.case_field_type?.id === 'string' && field.case_field_type.id.length > 0, 'RESULT_CCD_SEARCH_FIELD_TYPE');
    if (!field.metadata) {
      const source = definition.case_fields.find(item => item.id === field.case_field_id);
      assert(source, 'RESULT_CCD_SEARCH_SOURCE_FIELD');
      assert.equal(field.case_field_type.id, source.field_type.id, 'RESULT_CCD_SEARCH_FIELD_TYPE');
    }
  }
  assert(Array.isArray(body.cases) && body.cases.length === 3, 'RESULT_CCD_SEARCH_CASE_COUNT');
  assert.deepEqual(body.cases.map(item => item.case_id).sort(), rows.map(row => row.reference).sort(), 'RESULT_CCD_SEARCH_CASE_REFS');
  for (const item of body.cases) {
    const row = rows.find(value => value.reference === item.case_id);
    for (const column of columns) {
      const field = column.case_field_id;
      assert(Object.hasOwn(item.fields, field), 'RESULT_CCD_SEARCH_MISSING_CELL');
      const expectedValue = field === '[CREATED_DATE]' ? row.created_date : field === '[STATE]' ? row.state : row.data[field];
      if (field === '[CREATED_DATE]' || field === 'caseSubmittedTimeStamp') assert.equal(timestamp(item.fields[field]), timestamp(expectedValue), 'RESULT_CCD_SEARCH_DATE_VALUE');
      else assert.deepEqual(item.fields[field], expectedValue, 'RESULT_CCD_SEARCH_CELL_ASSOCIATION');
    }
  }
  if (useCase === 'WORKBASKET') {
    const sort = expected.filter(field => field.sort_order != null);
    assert.equal(sort.length, 1, 'RESULT_CCD_SEARCH_DEFAULT_SORT');
    assert.equal(sort[0].case_field_id, 'caseSubmittedTimeStamp', 'RESULT_CCD_SEARCH_DEFAULT_SORT');
    assert.deepEqual(sort[0].sort_order, { direction: 'DESC', priority: 1 }, 'RESULT_CCD_SEARCH_DEFAULT_SORT');
    const order = [...rows].sort((a,b) => b.data.caseSubmittedTimeStamp.localeCompare(a.data.caseSubmittedTimeStamp)).map(row=>row.reference);
    assert.deepEqual(body.cases.map(item=>item.case_id), order, 'RESULT_CCD_SEARCH_DEFAULT_ORDER');
  }
  return { useCase, references: body.cases.map(item=>item.case_id), columns: columns.map(field=>({ field:field.case_field_id,label:field.label,order:field.order,metadata:field.metadata,type:field.case_field_type })) };
}

export function proveResultCcdSearch(state, { request = ccdRequest, readRows = readResultSeedRows, inspectContainer } = {}) {
  assert.equal(state.elasticsearch, true, 'RESULT_CCD_SEARCH_ES_REQUIRED');
  verifyCcdContainerIdentity(state, inspectContainer);
  const seed = JSON.parse(fs.readFileSync(path.join(state.output, 'result-row-seed/receipt.json')));
  const imported = JSON.parse(fs.readFileSync(path.join(state.output, 'result-columns-import/receipt.json')));
  for (const receipt of [seed, imported]) {
    assert.equal(receipt.owner, state.owner, 'RESULT_CCD_SEARCH_OWNER');
    assert.equal(receipt.namespace, state.namespace, 'RESULT_CCD_SEARCH_NAMESPACE');
  }
  assert.equal(seed.status, 'persisted-rows-indexed', 'RESULT_CCD_SEARCH_SEED_REQUIRED');
  assert.equal(imported.status, 'import-and-readback-observed', 'RESULT_CCD_SEARCH_IMPORT_REQUIRED');
  const body = resultCcdSearchBody(seed.references);
  const rows = validateResultSeedRows(readRows(state, seed.references), seed.references);
  const output = path.join(state.output, 'result-ccd-search');
  fs.mkdirSync(output, { mode: 0o700 });
  const receipt = { schemaVersion:1, kind:'result-ccd-search-feasibility', owner:state.owner, namespace:state.namespace, status:'in-progress', runtimeAcceptance:false, catalogueCredit:false, releaseCredit:false, observations:{} };
  const persist = () => fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});
  persist();
  try {
    const actor = ccdCredentials(state,'observer',{request});
    for (const [useCase, name] of [['SEARCH','search'],['WORKBASKET','workbasket']]) {
      const response = request(state,4452,`/internal/searchCases?ctid=${caseType}&use_case=${useCase}`,{method:'POST',headers:actor.headers,body});
      receipt.observations[useCase] = {status:response.status,body:response.body}; persist();
      assert.equal(response.status,200,'RESULT_CCD_SEARCH_POST_FAILED');
      receipt.observations[useCase].validated = validateResultCcdSearch(response.body, imported.observations[name].body, imported.observations.definition.body, rows, useCase); persist();
    }
    receipt.status='both-use-cases-observed';persist();return receipt;
  } catch (error) {
    receipt.status='failed';receipt.failure='RESULT_CCD_SEARCH_FEASIBILITY_FAILED';persist();throw error;
  }
}
