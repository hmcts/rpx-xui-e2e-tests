import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateWorkbasketInputDefinition } from './exui-workbasket-input-definition.mjs';
import { buildWorkbasketInputDefinition } from './exui-workbasket-input-definition.mjs';
import { ccdCredentials, ccdRequest, verifyCcdContainerIdentity } from './exui-ccd-runtime.mjs';
import { prepareWorkbasketInputDefinition } from '../prepare-harness-workbasket-input.mjs';

const trim = value => value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '');

export function validateWorkbasketInputDescriptor(observed, definition) {
  validateWorkbasketInputDefinition(definition);
  const inputs = observed?.workbasketInputs;
  const expected = definition.sheets.WorkBasketInputFields;
  assert(Array.isArray(inputs) && inputs.length === expected.length, 'WORKBASKET_INPUT_DESCRIPTOR_COUNT');
  for (let index = 0; index < expected.length; index++) {
    const row = expected[index], input = inputs[index];
    const field = definition.sheets.CaseField.find(item => item.ID === row.CaseFieldID);
    const metadata = row.CaseFieldID === '[CASE_REFERENCE]';
    assert(field || metadata, 'WORKBASKET_INPUT_DESCRIPTOR_DEPENDENCY');
    assert.equal(input?.label, trim(row.Label), 'WORKBASKET_INPUT_DESCRIPTOR_LABEL');
    assert.equal(input.order, row.DisplayOrder, 'WORKBASKET_INPUT_DESCRIPTOR_ORDER');
    assert.equal(input.field?.id, row.CaseFieldID, 'WORKBASKET_INPUT_DESCRIPTOR_FIELD');
    assert.equal(input.field.metadata, metadata, 'WORKBASKET_INPUT_DESCRIPTOR_METADATA');
    assert.equal(input.field.elementPath, null, 'WORKBASKET_INPUT_DESCRIPTOR_ELEMENT');
    assert.equal(input.field.show_condition, row.FieldShowCondition?.replace(/\s*=\s*/g, '=') ?? null,
      'WORKBASKET_INPUT_DESCRIPTOR_CONDITION');
    const type = metadata ? 'Text' : field.FieldType;
    assert.equal(input.field.field_type?.type, type, 'WORKBASKET_INPUT_DESCRIPTOR_TYPE');
    assert.equal(input.field.field_type.id, field?.FieldTypeParameter ? `${type}-${field.FieldTypeParameter}` : type,
      'WORKBASKET_INPUT_DESCRIPTOR_TYPE_ID');
    const options = field?.FieldTypeParameter
      ? definition.sheets.FixedLists.filter(item => item.ID === field.FieldTypeParameter)
        .map(item => ({ code: item.ListElementCode, label: item.ListElement, order: String(item.DisplayOrder) }))
      : [];
    assert.deepEqual(input.field.field_type.fixed_list_items, options, 'WORKBASKET_INPUT_DESCRIPTOR_OPTIONS');
  }
  return inputs;
}

// Import/readback is feasibility evidence; candidate rendering and effective faults are still required for credit.
export async function importWorkbasketInputs(state, { request = ccdRequest, inspectContainer } = {}) {
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'workbasket-input-seal-'));
  let workbook, binding;
  try {
    const fixture = path.join(temporary, 'fixture');
    binding = await prepareWorkbasketInputDefinition(fixture);
    workbook = fs.readFileSync(path.join(fixture, 'definition.xlsx'));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  const definition = buildWorkbasketInputDefinition();
  verifyCcdContainerIdentity(state, inspectContainer);
  const output = path.join(state.output, 'workbasket-input-import');
  fs.mkdirSync(output, { mode: 0o700 });
  const receipt = { schemaVersion: 1, kind: 'workbasket-input-import-feasibility',
    owner: state.owner, namespace: state.namespace, images: state.images, binding,
    bindings: definition.workbasketInputBindings, status: 'in-progress',
    runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false, observations: {} };
  const persist = () => fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  persist();
  try {
    const actor = ccdCredentials(state, 'observer', { request });
    for (const role of ['caseworker', 'caseworker-harness', 'ccd-import']) {
      const response = request(state, 4451, '/api/user-role', { method: 'PUT', headers: actor.headers,
        body: { role, security_classification: 'PUBLIC' } });
      assert([200, 201, 205].includes(response.status), 'WORKBASKET_INPUT_ROLE_FAILED');
    }
    const imported = request(state, 4451, '/import', { method: 'POST', headers: actor.headers, file: workbook.toString('base64') });
    receipt.observations.import = { status: imported.status }; persist();
    assert([200, 201].includes(imported.status), 'WORKBASKET_INPUT_IMPORT_FAILED');
    const observedCaseType = request(state, 4451, '/api/data/case-type/HarnessResultsPRL', { headers: actor.headers });
    receipt.observations.caseType = { status: observedCaseType.status, id: observedCaseType.body?.id }; persist();
    assert.equal(observedCaseType.status, 200, 'WORKBASKET_INPUT_CASE_TYPE_READ_FAILED');
    assert.equal(observedCaseType.body?.id, 'HarnessResultsPRL', 'WORKBASKET_INPUT_CASE_TYPE_MISMATCH');
    const response = request(state, 4452, '/internal/case-types/HarnessResultsPRL/work-basket-inputs',
      { headers: { ...actor.headers, experimental: 'true',
        accept: 'application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-workbasket-input-details.v2+json;charset=UTF-8' } });
    receipt.observations.inputs = { status: response.status, body: response.body }; persist();
    assert.equal(response.status, 200, 'WORKBASKET_INPUT_READ_FAILED');
    validateWorkbasketInputDescriptor(response.body, definition);
    receipt.status = 'import-and-inputs-observed'; persist();
    return receipt;
  } catch (error) {
    receipt.status = 'failed'; receipt.failure = 'WORKBASKET_INPUT_FEASIBILITY_FAILED'; persist();
    throw error;
  }
}
