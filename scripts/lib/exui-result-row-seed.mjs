import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ccdCredentials, ccdRequest, docker, verifyCcdContainerIdentity } from './exui-ccd-runtime.mjs';

const caseType = 'HarnessResultsPRL';
const alias = 'harnessresultsprl_cases';
const fields = ['id', 'created_date', 'last_modified', 'jurisdiction', 'case_type_id', 'state', 'last_state_modified_date', 'data', 'data_classification', 'reference', 'security_classification', 'supplementary_data'];
export const resultSeedCases = [2, 1, 3].map(n => ({
  applicantCaseName: `Synthetic result family ${n}`, applicantName: `Synthetic applicant ${n}`,
  respondentName: `Synthetic respondent ${n}`, childName: `Synthetic child ${n}`,
  familymanCaseNumber: `HARNESS-RESULT-${n}`, selectedCaseTypeID: 'C100',
  dateSubmitted: `2026-01-0${n}`, caseSubmittedTimeStamp: `2026-01-0${n}T10:00:00.000`,
}));

export function validateResultSeedRows(rows, references) {
  assert.equal(references.length, 3, 'RESULT_SEED_REFERENCE_COUNT');
  assert(references.every(ref => typeof ref === 'string' && /^\d{16}$/.test(ref)), 'RESULT_SEED_REFERENCE_FORMAT');
  assert.equal(new Set(references).size, 3, 'RESULT_SEED_DUPLICATE_REFERENCE');
  assert(Array.isArray(rows) && rows.length === 3, 'RESULT_SEED_ROW_COUNT');
  assert.deepEqual(rows.map(row => row.reference).sort(), [...references].sort(), 'RESULT_SEED_FOREIGN_REFERENCE');
  assert.equal(new Set(rows.map(row => row.id)).size, 3, 'RESULT_SEED_DUPLICATE_ID');
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [...fields].sort(), 'RESULT_SEED_PROJECTION');
    assert(typeof row.id === 'string' && /^[1-9]\d*$/.test(row.id), 'RESULT_SEED_SQL_ID');
    assert.equal(row.case_type_id, caseType, 'RESULT_SEED_FOREIGN_CASE_TYPE');
    assert.equal(row.jurisdiction, 'HARNESS', 'RESULT_SEED_FOREIGN_JURISDICTION');
    assert(row.data && row.data_classification && typeof row.data === 'object' && typeof row.data_classification === 'object', 'RESULT_SEED_DATA');
    assert(!Object.hasOwn(row.data, 'SearchCriteria'), 'RESULT_SEED_GLOBAL_SEARCH_UNSUPPORTED');
    for (const name of ['created_date', 'last_modified', 'last_state_modified_date', 'state', 'security_classification'])
      assert(typeof row[name] === 'string' && row[name].length > 0, 'RESULT_SEED_METADATA');
  }
  return rows;
}

export function resultSeedIndex(aliases, mappings) {
  const indices = Object.keys(aliases);
  assert.equal(indices.length, 1, 'RESULT_SEED_AMBIGUOUS_INDEX');
  const index = indices[0];
  assert(/^harnessresultsprl_cases-\d{6}$/.test(index), 'RESULT_SEED_FOREIGN_INDEX');
  assert.deepEqual(Object.keys(aliases[index].aliases), [alias], 'RESULT_SEED_FOREIGN_ALIAS');
  assert.equal(aliases[index].aliases[alias].is_write_index, true, 'RESULT_SEED_WRITE_INDEX');
  assert.deepEqual(Object.keys(mappings), [index], 'RESULT_SEED_MAPPING_INDEX');
  const properties = mappings[index]?.mappings?.properties;
  assert.equal(properties?.id?.type, 'long', 'RESULT_SEED_MAPPING_ID');
  assert.equal(properties?.reference?.type, 'text', 'RESULT_SEED_MAPPING_REFERENCE');
  for (const field of ['caseSubmittedTimeStamp', 'dateSubmitted'])
    assert.equal(properties?.data?.properties?.[field]?.type, 'date', 'RESULT_SEED_MAPPING_DATE');
  return index;
}

// Projection from ccd-docker 197a835ca972ddb7c63f424d369f649d8259966d
// logstash/pipeline/{01_input,02_filter,03_output}.conf. Read-only SQL; no sync claim.
export function readResultSeedRows(state, references, runDocker = docker) {
  validateResultSeedRowsReferences(references);
  const projection = fields.map(field => ['id', 'reference'].includes(field) ? `${field}::text AS ${field}` : field).join(', ');
  const sql = `BEGIN READ ONLY; SELECT COALESCE(json_agg(r),'[]'::json) FROM (SELECT ${projection} FROM case_data WHERE reference IN (${references.join(',')}) ORDER BY id) r; COMMIT;`;
  return JSON.parse(runDocker(['exec', '-i', state.namespace, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'ccd_data'], sql));
}
function validateResultSeedRowsReferences(references) {
  assert(Array.isArray(references) && references.length === 3 && new Set(references).size === 3 && references.every(ref => typeof ref === 'string' && /^\d{16}$/.test(ref)), 'RESULT_SEED_INVALID_REFERENCES');
}

export function seedResultRows(state, { request = ccdRequest, readRows = readResultSeedRows, inspectContainer } = {}) {
  assert.equal(state.elasticsearch, true, 'RESULT_SEED_REAL_ES_REQUIRED');
  verifyCcdContainerIdentity(state, inspectContainer);
  const output = path.join(state.output, 'result-row-seed');
  fs.mkdirSync(output, { mode: 0o700 }); // No replay or overwriting prior ownership.
  const receipt = { schemaVersion: 1, kind: 'result-row-seed-feasibility', owner: state.owner, namespace: state.namespace, references: [], status: 'in-progress', runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false };
  const persist = () => fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  persist();
  const get = route => { const response = request(state, 9200, route); assert.equal(response.status, 200, 'RESULT_SEED_ES_READ_FAILED'); return response.body; };
  try {
    const index = resultSeedIndex(get(`/_alias/${alias}`), get(`/${alias}/_mapping`));
    const actor = ccdCredentials(state, 'observer', { request });
    const base = `/caseworkers/${actor.userId}/jurisdictions/HARNESS/case-types/${caseType}`;
    for (const data of resultSeedCases) {
      const trigger = request(state, 4452, `${base}/event-triggers/create/token`, { headers: actor.headers });
      assert.equal(trigger.status, 200, 'RESULT_SEED_CREATE_TOKEN_FAILED');
      assert(typeof trigger.body?.token === 'string' && trigger.body.token, 'RESULT_SEED_CREATE_TOKEN_MISSING');
      const created = request(state, 4452, `${base}/cases`, { method: 'POST', headers: actor.headers, body: { data, event: { id: 'create', summary: 'Synthetic Harness results feasibility' }, event_token: trigger.body.token, ignore_warning: false } });
      assert.equal(created.status, 201, 'RESULT_SEED_CREATE_FAILED');
      const reference = created.body?.id;
      assert((typeof reference === 'string' || Number.isSafeInteger(reference)) && /^\d{16}$/.test(String(reference)), 'RESULT_SEED_CREATE_REFERENCE');
      receipt.references.push(String(reference)); persist();
    }
    const rows = validateResultSeedRows(readRows(state, receipt.references), receipt.references);
    rows.forEach(row => assert.deepEqual(row.data, resultSeedCases[receipt.references.indexOf(row.reference)], 'RESULT_SEED_PERSISTED_DATA_MISMATCH'));
    assert.equal(resultSeedIndex(get(`/_alias/${alias}`), get(`/${alias}/_mapping`)), index, 'RESULT_SEED_INDEX_CHANGED');
    for (const row of rows) {
      const response = request(state, 9200, `/${alias}/_create/${row.id}?require_alias=true&refresh=wait_for`, { method: 'PUT', body: row });
      assert.equal(response.status, 201, 'RESULT_SEED_ES_CREATE_FAILED');
      assert.equal(response.body?._index, index, 'RESULT_SEED_ES_WRONG_INDEX');
      assert.equal(response.body?._id, row.id, 'RESULT_SEED_ES_WRONG_ID');
      const observed = get(`/${index}/_doc/${row.id}`);
      assert.equal(observed.found, true, 'RESULT_SEED_ES_MISSING');
      assert.deepEqual(observed._source, row, 'RESULT_SEED_ES_CHANGED_ROW');
    }
    const searched = request(state, 9200, `/${alias}/_search`, { method: 'POST', body: { size: 3, query: { ids: { values: rows.map(row => row.id) } } } });
    assert.equal(searched.status, 200, 'RESULT_SEED_ES_SEARCH_FAILED');
    assert.equal(searched.body?.timed_out, false, 'RESULT_SEED_ES_SEARCH_TIMEOUT');
    assert.equal(searched.body?._shards?.failed, 0, 'RESULT_SEED_ES_SEARCH_SHARDS');
    assert.deepEqual(searched.body?.hits?.total, { value: 3, relation: 'eq' }, 'RESULT_SEED_ES_SEARCH_COUNT');
    const hits = searched.body?.hits?.hits;
    assert(Array.isArray(hits) && hits.length === 3, 'RESULT_SEED_ES_SEARCH_HITS');
    assert.deepEqual(hits.map(hit => hit._id).sort(), rows.map(row => row.id).sort(), 'RESULT_SEED_ES_SEARCH_IDS');
    for (const hit of hits) {
      assert.equal(hit._index, index, 'RESULT_SEED_ES_SEARCH_INDEX');
      assert.deepEqual(hit._source, rows.find(row => row.id === hit._id), 'RESULT_SEED_ES_SEARCH_DATA');
    }
    receipt.index = index; receipt.status = 'persisted-rows-indexed'; persist(); return receipt;
  } catch {
    receipt.status = 'failed'; receipt.failure = 'RESULT_SEED_FEASIBILITY_FAILED'; persist();
    throw new Error('RESULT_SEED_FEASIBILITY_FAILED');
  }
}
