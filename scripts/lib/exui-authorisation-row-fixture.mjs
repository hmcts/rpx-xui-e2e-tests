import assert from 'node:assert/strict';
import { definitionDigest } from './exui-definition-references.mjs';
import { buildEventCapabilityFixtures } from './exui-ccd-event-capability.mjs';
import {
  AUTHORISATION_ROW_ACTORS, AUTHORISATION_ROW_VARIANTS, AUTHORISATION_ROW_NO_CREDIT,
  authorisationRowSource, authorisationRowContract, authorisationSourceRows,
  readAuthorisationRowSources, validateAuthorisationRowSources,
} from './exui-authorisation-row-contract.mjs';

const changes = Object.freeze({ 'remove-create': 'RU', 'remove-read': 'CU', 'remove-update': 'CR' });
const dates = Object.freeze({ 'date-past': '01/01/2000', 'date-future': '01/01/2099' });
function variantChange(variant) {
  assert(AUTHORISATION_ROW_VARIANTS.includes(variant), 'AUTH_ROW_VARIANT');
  if (Object.hasOwn(changes, variant)) return { kind: 'effective-fault-requirement', sourcePointer: '/AccessControl/0/CRUD', before: 'CRU', after: changes[variant], affectedRoles: AUTHORISATION_ROW_ACTORS.slice(0, 2), sourceCells: 1, derivedImportCells: 2, effectiveObserved: false };
  if (Object.hasOwn(dates, variant)) return { kind: 'date-no-op-control-requirement', sourcePointer: '/LiveFrom', before: '01/09/2024', after: dates[variant], affectedRoles: [...AUTHORISATION_ROW_ACTORS], sourceCells: 1, derivedImportCells: 5, effectiveFault: false, observed: false };
  return null;
}
const normalize = row => ({ ...structuredClone(row), CaseTypeID: 'HarnessNestedPRL' });
const flatten = row => {
  const { AccessControl, ...fields } = normalize(row);
  return AUTHORISATION_ROW_ACTORS.map(role => {
    const groups = AccessControl.filter(group => group.UserRoles.includes(role));
    assert.equal(groups.length, 1, 'AUTH_ROW_UNIQUE_NORMALIZED_ROLE');
    return { ...fields, UserRole: role, CRUD: groups[0].CRUD };
  });
};

// A source-derived ACL fragment, deliberately not a runnable definition or actor provisioner.
export function deriveAuthorisationRowFixture(variant = 'baseline', inputs = readAuthorisationRowSources()) {
  validateAuthorisationRowSources(inputs);
  const change = variantChange(variant), rawRow = authorisationRowSource();
  if (Object.hasOwn(changes, variant)) rawRow.AccessControl[0].CRUD = changes[variant];
  if (Object.hasOwn(dates, variant)) rawRow.LiveFrom = dates[variant];
  const { source, backing } = inputs;
  const typeRows = environment => {
    const file = `AuthorisationCaseType/AuthorisationCaseType-${environment}.json`;
    const rows = [...authorisationSourceRows(source, file), ...authorisationSourceRows(backing, file)];
    return AUTHORISATION_ROW_ACTORS.map(role => normalize(rows.find(row => row.UserRole === role)));
  };
  assert.deepEqual(typeRows('prod'), typeRows('nonprod'), 'AUTH_ROW_ENVIRONMENT_BACKING_DRIFT');
  const state = authorisationSourceRows(source, 'AuthorisationCaseState.json')[0];
  const fields = authorisationSourceRows(source, 'AuthorisationCaseField/ServiceOfDocuments/AuthorisationCaseField.json');
  return { schemaVersion: 1, kind: 'authorisation-event-row-ACL-fragment', variant, runnable: false,
    contract: authorisationRowContract(), originalSourceRow: authorisationRowSource(), rawRow, rawRowDigest: definitionDigest(rawRow), change,
    sheets: {
      AuthorisationCaseType: typeRows('prod'),
      AuthorisationCaseState: flatten(state),
      AuthorisationCaseField: ['sodAdditionalRecipients', 'sodAdditionalRecipientsList'].flatMap(id => flatten(fields.find(row => row.CaseFieldID === id))),
      AuthorisationCaseEvent: flatten(rawRow),
    },
    ...AUTHORISATION_ROW_NO_CREDIT };
}
export function validateAuthorisationRowFixture(value, variant = 'baseline') {
  assert.deepEqual(value, deriveAuthorisationRowFixture(variant), 'AUTH_ROW_CANONICAL_FRAGMENT_REQUIRED');
  return { variant, sourceCellsChanged: value.change?.sourceCells ?? 0, ...AUTHORISATION_ROW_NO_CREDIT };
}
export function validateAuthorisationRowFault(baseline, mutant, variant) {
  assert(Object.hasOwn(changes, variant), 'AUTH_ROW_EFFECTIVE_FAULT_REQUIRED');
  validateAuthorisationRowFixture(baseline);
  validateAuthorisationRowFixture(mutant, variant);
  const expected = structuredClone(baseline.rawRow);
  expected.AccessControl[0].CRUD = changes[variant];
  assert.deepEqual(mutant.rawRow, expected, 'AUTH_ROW_ONE_SOURCE_CELL_REQUIRED');
  for (const sheet of ['AuthorisationCaseType', 'AuthorisationCaseState', 'AuthorisationCaseField']) assert.deepEqual(mutant.sheets[sheet], baseline.sheets[sheet], 'AUTH_ROW_BACKING_CHANGED');
  return { ...variantChange(variant), ...AUTHORISATION_ROW_NO_CREDIT };
}


export const AUTHORISATION_CONTROL_EVENT = 'harnessAuthorisationControl';
// Complete synthetic carrier for the two fixed non-credit observations only.
// Source actors keep their exact prerequisites; synthetic observer/bootstrap rows
// are separate, and the original foundation fragment remains non-runnable.
export function buildAuthorisationCreateDefinition(variant = 'baseline') {
  assert(['baseline', 'remove-create'].includes(variant), 'AUTH_CREATE_VARIANT');
  const fragment = deriveAuthorisationRowFixture(variant);
  const fixture = structuredClone(buildEventCapabilityFixtures().baseline);
  const actors = new Set(AUTHORISATION_ROW_ACTORS);
  for (const sheet of ['AuthorisationCaseType', 'AuthorisationCaseState', 'AuthorisationCaseField']) {
    fixture.sheets[sheet] = [
      ...fixture.sheets[sheet].filter(row => !actors.has(row.UserRole)),
      ...fragment.sheets[sheet],
    ];
  }
  fixture.sheets.AuthorisationCaseField.push(...AUTHORISATION_ROW_ACTORS.map(role => ({ LiveFrom: '01/01/2020', CaseTypeID: 'HarnessNestedPRL', CaseFieldID: 'protectedValue', UserRole: role, CRUD: 'R' })));
  const event = 'serviceOfDocuments';
  fixture.sheets.AuthorisationCaseEvent = [
    ...fixture.sheets.AuthorisationCaseEvent.filter(row => !(row.CaseEventID === event && actors.has(row.UserRole))),
    ...fragment.sheets.AuthorisationCaseEvent,
  ];
  const original = fixture.sheets.CaseEvent.find(row => row.ID === event);
  assert(original, 'AUTH_CREATE_SOURCE_EVENT');
  fixture.sheets.CaseEvent.push({ ...original, ID: AUTHORISATION_CONTROL_EVENT, Name: 'Synthetic authorisation health control' });
  for (const sheet of ['CaseEventToFields', 'EventToComplexTypes'])
    fixture.sheets[sheet].push(...fixture.sheets[sheet].filter(row => row.CaseEventID === event).map(row => ({ ...row, CaseEventID: AUTHORISATION_CONTROL_EVENT })));
  const common = { LiveFrom: '01/01/2020', CaseTypeID: 'HarnessNestedPRL', CaseEventID: AUTHORISATION_CONTROL_EVENT };
  fixture.sheets.AuthorisationCaseEvent.push(...[...AUTHORISATION_ROW_ACTORS, 'caseworker-harness-observer'].map(role => ({ ...common, UserRole: role, CRUD: role.endsWith('-readonly') ? 'R' : 'CRU' })));
  return { kind: 'non-credit-authorisation-create-definition', variant, originalSourceRow: fragment.originalSourceRow,
    rawRow: fragment.rawRow, sourceChange: fragment.change, sheets: fixture.sheets,
    adaptations: ['PRLAPPS-to-HarnessNestedPRL', 'PRIVATELAW-to-HARNESS', 'synthetic-bootstrap-observer-and-health-control', 'source-callbacks-omitted-as-in-existing-carrier'],
    ...AUTHORISATION_ROW_NO_CREDIT };
}
