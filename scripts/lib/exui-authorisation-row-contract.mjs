import assert from 'node:assert/strict';
import fs from 'node:fs';
import { definitionDigest } from './exui-definition-references.mjs';
import { validateEventCapabilitySource } from './exui-ccd-event-capability.mjs';

export const AUTHORISATION_ROW_ID = 'configuration-shape:66ff76e7342bbf62e584059136d4c1f97a25a7078e74549a5c4665d9e0e57142';
export const AUTHORISATION_ROW_REVISION = '694b9951e94369f1394380506960c4f04f25755d';
export const AUTHORISATION_ROW_PATH = 'definitions/private-law/json/AuthorisationCaseEvent/ServiceOfDocuments/AuthorisationCaseEvent.json';
export const AUTHORISATION_ROW_DIGEST = 'sha256:ec3359e9ef002ac8a692039f4d07d264f67e1ee1aa298b6c8c771fc204d452a0';
export const AUTHORISATION_ROW_ATTRIBUTES = Object.freeze(['AccessControl', 'CaseEventID', 'CaseTypeID', 'LiveFrom']);
export const AUTHORISATION_ROW_ACTORS = Object.freeze(['courtadmin', 'systemupdate', 'judge', 'la', 'readonly'].map(role => `caseworker-privatelaw-${role}`));
export const AUTHORISATION_ROW_VARIANTS = Object.freeze(['baseline', 'remove-create', 'remove-read', 'remove-update', 'date-past', 'date-future']);
export const AUTHORISATION_ROW_NO_CREDIT = Object.freeze({ runtimeAcceptance: false, sourceComplete: false, catalogueCredit: false, releaseCredit: false });
const prefix = 'definitions/private-law/json/';
const backingDigest = 'sha256:ec9476685cdd9dba22d090c3fe1aace7b8c069b98549193a422021b602dde7c5';
const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));

export function readAuthorisationRowSources() {
  return { source: read('../fixtures/ccd/event-capability.source.json'), backing: read('../fixtures/ccd/authorisation-row-backing.source.json') };
}
export function authorisationSourceRows(source, relativePath) {
  const files = source.sources.filter(file => file.path === prefix + relativePath);
  assert.equal(files.length, 1, 'AUTH_ROW_EXACT_SOURCE_FILE');
  return files[0].rows.map(item => structuredClone(item.row));
}
export function authorisationRowSource() {
  return { LiveFrom: '01/09/2024', CaseTypeID: 'PRLAPPS', CaseEventID: 'serviceOfDocuments', AccessControl: [
    { UserRoles: ['caseworker-privatelaw-courtadmin', 'caseworker-privatelaw-systemupdate'], CRUD: 'CRU' },
    { UserRoles: ['caseworker-privatelaw-judge', 'caseworker-privatelaw-la', 'caseworker-privatelaw-readonly'], CRUD: 'R' },
  ] };
}
export function authorisationBackingVectors() {
  return [
    ['courtadmin', 'CRU', 'CRUD', 'CRU', 'CRUD'], ['systemupdate', 'CRUD', 'CRUD', 'CRU', 'CRUD'],
    ['judge', 'RU', 'CRUD', 'CRU', 'CRUD'], ['la', 'RU', 'CRUD', 'CRU', 'CRUD'], ['readonly', 'R', 'R', 'R', 'R'],
  ].map(([actor, caseType, state, controllerField, recipientField]) => ({ role: `caseworker-privatelaw-${actor}`, caseType, state, controllerField, recipientField }));
}
const permission = (row, role) => {
  const groups = row.AccessControl.filter(group => group.UserRoles.includes(role));
  assert.equal(groups.length, 1, 'AUTH_ROW_UNIQUE_MEMBERSHIP');
  return groups[0].CRUD;
};
export function validateAuthorisationRowSources({ source, backing }) {
  validateEventCapabilitySource(source);
  assert.equal(definitionDigest(backing), backingDigest, 'AUTH_ROW_BACKING_SOURCE_SEAL');
  assert.equal(backing.revision, AUTHORISATION_ROW_REVISION, 'AUTH_ROW_BACKING_REVISION');
  for (const file of backing.sources) {
    assert.equal(file.fileDigest, source.sources.find(item => item.path === file.path)?.fileDigest, 'AUTH_ROW_BACKING_FILE');
    for (const item of file.rows) assert.equal(definitionDigest(item.row), item.rowDigest, 'AUTH_ROW_BACKING_ROW');
  }
  const selected = source.sources.find(file => file.path === AUTHORISATION_ROW_PATH);
  assert.equal(selected.fileDigest, 'sha256:4e1c87b9fe4c0757b89e93ee0b8d55566126c3dc6eacb2224056b99ff695efef', 'AUTH_ROW_FILE');
  assert.deepEqual(selected.rows, [{ index: 0, rowDigest: AUTHORISATION_ROW_DIGEST, row: authorisationRowSource() }], 'AUTH_ROW_GROUPS');
  assert.deepEqual(Object.keys(selected.rows[0].row).sort(), AUTHORISATION_ROW_ATTRIBUTES, 'AUTH_ROW_ATTRIBUTES');
  const catalogue = read('../fixtures/exui-configuration-source.json').sources.filter(file => file.path === AUTHORISATION_ROW_PATH);
  assert.equal(catalogue.length, 1, 'AUTH_ROW_CATALOGUE_FILE');
  assert.equal(catalogue[0].revision, AUTHORISATION_ROW_REVISION, 'AUTH_ROW_CATALOGUE_REVISION');
  assert.equal('sha256:' + catalogue[0].fileDigest, selected.fileDigest, 'AUTH_ROW_CATALOGUE_DIGEST');
  assert.deepEqual(catalogue[0].document, [authorisationRowSource()], 'AUTH_ROW_CATALOGUE_ROW');
  const state = authorisationSourceRows(source, 'AuthorisationCaseState.json')[0];
  assert.equal(state.CaseStateID, 'JUDICIAL_REVIEW', 'AUTH_ROW_STATE');
  const fields = authorisationSourceRows(source, 'AuthorisationCaseField/ServiceOfDocuments/AuthorisationCaseField.json');
  for (const vector of authorisationBackingVectors()) {
    for (const environment of ['prod', 'nonprod']) {
      const file = `AuthorisationCaseType/AuthorisationCaseType-${environment}.json`;
      const rows = [...authorisationSourceRows(source, file), ...authorisationSourceRows(backing, file)].filter(row => row.UserRole === vector.role);
      assert.equal(rows.length, 1, 'AUTH_ROW_TYPE_MEMBERSHIP');
      assert.equal(rows[0].CRUD, vector.caseType, 'AUTH_ROW_TYPE_RIGHTS');
    }
    assert.equal(permission(state, vector.role), vector.state, 'AUTH_ROW_STATE_RIGHTS');
    for (const [id, expected] of [['sodAdditionalRecipients', vector.controllerField], ['sodAdditionalRecipientsList', vector.recipientField]]) {
      const matches = fields.filter(row => row.CaseFieldID === id);
      assert.equal(matches.length, 1, 'AUTH_ROW_FIELD_REQUIRED');
      assert.equal(permission(matches[0], vector.role), expected, 'AUTH_ROW_FIELD_RIGHTS');
    }
  }
  const type = authorisationSourceRows(source, 'CaseType.json')[0];
  assert.equal(type.ID, 'PRLAPPS', 'AUTH_ROW_TYPE');
  assert.equal(type.JurisdictionID, 'PRIVATELAW', 'AUTH_ROW_JURISDICTION');
  for (const environment of ['prod', 'nonprod']) {
    const event = authorisationSourceRows(source, `CaseEvent/ServiceOfDocuments/CaseEvent-${environment}.json`)[0];
    assert.equal(event.ID, 'serviceOfDocuments', 'AUTH_ROW_EVENT');
    assert.equal(event.CaseTypeID, type.ID, 'AUTH_ROW_EVENT_TYPE');
    assert(event['PreConditionState(s)'].split(';').includes(state.CaseStateID), 'AUTH_ROW_EVENT_STATE');
    assert.equal(event.PostConditionState, '*', 'AUTH_ROW_EVENT_POST_STATE');
  }
}

// Requirements describe future evidence. None is discharged by constructing this object.
export function authorisationRowContract() {
  validateAuthorisationRowSources(readAuthorisationRowSources());
  return { schemaVersion: 1, kind: 'authorisation-event-row-foundation', obligationId: AUTHORISATION_ROW_ID,
    source: { repository: 'hmcts/prl-ccd-definitions', revision: AUTHORISATION_ROW_REVISION, path: AUTHORISATION_ROW_PATH, index: 0, rowDigest: AUTHORISATION_ROW_DIGEST, attributes: [...AUTHORISATION_ROW_ATTRIBUTES] },
    normalization: { sourceCaseType: 'PRLAPPS', caseType: 'HarnessNestedPRL', sourceJurisdiction: 'PRIVATELAW', jurisdiction: 'HARNESS', eventId: 'serviceOfDocuments', state: 'JUDICIAL_REVIEW', eventRenamed: false },
    actors: [...AUTHORISATION_ROW_ACTORS], backing: authorisationBackingVectors(),
    requiredEvidence: {
      sourceAndImport: ['exact-four-source-keys-and-two-groups', 'five-ACL-rows-exact-CRUD-including-D-false', 'actual-import-caseType-event-version', 'exact-source-backed-type-state-and-field-permissions'],
      create: ['both-CRU-actors-submit-and-persist-marker', 'independent-before-after-state-version-history', 'other-three-actors-denied-with-healthy-controls', 'remove-C-both-actors-denied-no-write'],
      read: ['all-five-actors-see-seeded-target-audit-event', 'remove-R-both-actors-lose-only-target-history', 'case-and-distinct-control-event-remain-readable'],
      update: ['actual-access-update-definition-route', 'both-CRU-actors-see-target-event', 'remove-U-both-actors-lose-target-definition-but-still-execute-C', 'judge-la-control-event-visible-target-absent', 'readonly-type-U-denial-not-isolated-event-U'],
      date: { original: '01/09/2024', controls: ['01/01/2000', '01/01/2099'], expectedIgnoredDate: null, requiredObservation: 'owned-event-ACL-SQL-live_from-NULL-for-all-five-rows-in-all-three-date-contexts-and-unchanged-permission-behaviour', observed: false, disposition: 'held-until-bound-consumer-import-controls-and-normative-sheet-contract-resolved', retentionClaim: false, activationClaim: false, effectiveFault: false },
      delete: { expected: false, disposition: 'stored-and-exported-false; no-supported-event-delete-operation-claimed', required: 'complete-bound-finite-C-R-U-caller-graph' },
      sourceImage: ['definition-store-parser-validation-entity-import-readback-path', 'DATA-C-R-U-route-and-reachable-ACL-consumers', 'actual-byte-reproduction-and-running-image-binding; six-role-classes-alone-insufficient'],
      authority: ['fresh-parent-held-source-candidate-image-input-pins', 'five-exact-actor-identities-without-observer-or-bootstrap-role', 'ordered-independent-raw-request-and-response-replay', 'observed-controller-and-framework-terminals', 'creator-quiescence-owned-resource-and-private-state-cleanup'],
      candidate: ['one-fresh-allowed-actor-usable-form-CYA-persistence-control; no-five-actor-UI-claim'],
    },
    exclusions: ['no-bootstrap-or-observer-grants-in-this-fragment', 'no-complete-workbook-or-runtime-readiness-claim', 'no-event-delete-endpoint', 'no-prerequisite-credit', 'no-readonly-event-only-denial-causality', 'no-date-activation'],
    ...AUTHORISATION_ROW_NO_CREDIT };
}
