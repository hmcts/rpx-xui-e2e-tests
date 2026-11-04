import assert from 'node:assert/strict';
import { buildEventCapabilityFixtures } from './exui-ccd-event-capability.mjs';

// These are event overrides, not claims about all attributes of the underlying type.
// Pinned definition-store c37c9b84 parses LiveFrom into LocalDate but omits it
// from CaseEventFieldComplex. Blank labels are trimmed; the candidate retains
// the underlying field label when its override is empty.
export const SOURCE_SHAPE_ROWS = Object.freeze([
  Object.freeze({ id: 'required-delivery-radio', obligationId: 'configuration-shape:69bcacf62a9db6f81914356612c4c4d770865dd287bc48704f88be54013bbe49', reference: 'serveByPostOrEmail',
    label: 'Served by', order: 1, context: 'MANDATORY', condition: null,
    faultColumn: 'DisplayContext', faultValue: 'OPTIONAL' }),
  Object.freeze({ id: 'conditional-email-complex', obligationId: 'configuration-shape:02958e8aee4cc1376f6b6607883e90293d8d2c765b4e9796884a61e24123919e', reference: 'emailInformation',
    label: '', order: 2, context: 'COMPLEX',
    condition: 'sodAdditionalRecipientsList.serveByPostOrEmail="email"',
    faultColumn: 'FieldShowCondition', faultValue: 'sodAdditionalRecipientsList.serveByPostOrEmail="post"' }),
  // Toolkit 7.4.22 and 7.4.25 map nonempty event labels onto this nested leaf.
  // Their AddressUK validator only requires AddressLine1/TextMax150; changing
  // Line2 to MANDATORY is not a proven UI fault. Blank + filled CCD writes remain required.
  Object.freeze({ id: 'optional-postal-line-two', obligationId: 'configuration-shape:9ece0d15adfefeabf964c0905981f1343b26487ad4e68f47a9d7bcbf73aaa757', reference: 'postalInformation.postalAddress.AddressLine2',
    label: '', order: 9, context: 'OPTIONAL',
    condition: 'sodAdditionalRecipientsList.serveByPostOrEmail="post"',
    faultColumn: 'EventElementLabel', faultValue: 'Harness changed postal line two' }),
]);
export const SOURCE_SHAPE_MUTATIONS = Object.freeze(SOURCE_SHAPE_ROWS.map(row => `ccd-shape-${row.id}`));
export const sourceShapeIdForMutation = mutation => {
  assert(SOURCE_SHAPE_MUTATIONS.includes(mutation), 'SHAPE_MUTATION_UNKNOWN');
  return mutation.slice('ccd-shape-'.length);
};
const selected = (fixture, contract) => {
  const rows = fixture.sheets.EventToComplexTypes.filter(row =>
    row.CaseEventID === 'serviceOfDocuments' && row.CaseFieldID === 'sodAdditionalRecipientsList' &&
    row.ID === 'ServeOrgDetails' && row.ListElementCode === contract.reference);
  assert.equal(rows.length, 1, 'SHAPE_EXACT_SOURCE_CONTEXT_REQUIRED');
  return rows[0];
};
export function sourceShapeContract(id) {
  const value = SOURCE_SHAPE_ROWS.find(row => row.id === id);
  assert(value, 'SHAPE_SELECTION_UNKNOWN');
  return value;
}
export function assertSourceShapeRows(fixture) {
  for (const contract of SOURCE_SHAPE_ROWS) {
    const row = selected(fixture, contract);
    assert.deepEqual(row, {
      LiveFrom: '01/09/2024', CaseTypeID: 'HarnessNestedPRL', ID: 'ServeOrgDetails',
      CaseEventID: 'serviceOfDocuments', CaseFieldID: 'sodAdditionalRecipientsList',
      ListElementCode: contract.reference,
      ...(contract.condition ? { FieldShowCondition: contract.condition } : {}),
      EventElementLabel: contract.label || ' ', FieldDisplayOrder: String(contract.order),
      DisplayContext: contract.context,
    }, 'SHAPE_SOURCE_FACET_DRIFT');
  }
}
export function deriveSourceShapeFault(id, baseline, source) {
  const canonical = buildEventCapabilityFixtures(source).baseline;
  assert.deepEqual(baseline, canonical, 'SHAPE_CANONICAL_BASELINE_REQUIRED');
  assertSourceShapeRows(baseline);
  const contract = sourceShapeContract(id), mutant = structuredClone(baseline);
  selected(mutant, contract)[contract.faultColumn] = contract.faultValue;
  return mutant;
}
export function validateSourceShapeFault(id, baseline, mutant, source) {
  assert.deepEqual(mutant, deriveSourceShapeFault(id, baseline, source), 'SHAPE_SINGLE_FACET_FAULT_REQUIRED');
  const contract = sourceShapeContract(id);
  return {schemaVersion:1, shape:id, reference:contract.reference, column:contract.faultColumn, before:selected(baseline,contract)[contract.faultColumn], after:contract.faultValue};
}
export function assertObservedSourceShape(observed, id, fault = false) {
  const contract = sourceShapeContract(id);
  assert.equal(observed.id, 'HarnessNestedPRL', 'SHAPE_CASE_TYPE_MISMATCH');
  const events = observed.events.filter(row => row.id === 'serviceOfDocuments');
  assert.equal(events.length, 1, 'SHAPE_EVENT_CONTEXT_REQUIRED');
  const fields = events[0].case_fields.filter(row => row.case_field_id === 'sodAdditionalRecipientsList');
  assert.equal(fields.length, 1, 'SHAPE_COLLECTION_CONTEXT_REQUIRED');
  const rows = fields[0].case_fields_complex.filter(row => row.reference === contract.reference);
  assert.equal(rows.length, 1, 'SHAPE_RUNTIME_ROW_REQUIRED');
  const row = rows[0];
  assert.equal(row.label, fault && contract.faultColumn === 'EventElementLabel' ? contract.faultValue : contract.label, 'SHAPE_LABEL_MISMATCH');
  assert.equal(row.order, contract.order, 'SHAPE_ORDER_MISMATCH');
  assert.equal(row.displayContext, fault && contract.faultColumn === 'DisplayContext' ? contract.faultValue : contract.context,
    'SHAPE_CONTEXT_MISMATCH');
  assert.equal(row.showCondition ?? null, fault && contract.faultColumn === 'FieldShowCondition' ? contract.faultValue : contract.condition,
    'SHAPE_CONDITION_MISMATCH');
}
