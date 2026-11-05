import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { digestBytes } from './exui-evidence-io.mjs';
import { deriveSelectorEventRowFixture, SELECTOR_EVENT_MUTATION } from './exui-selector-event-row-contract.mjs';

// Independent oracle: never construct expected persisted data from an observed
// payload or producer-supplied intended object.
export const selectorEmptySeed = () => ({ protectedValue: 'selector-empty-control', sodAdditionalRecipients: [], sodAdditionalRecipientsList: [] });
export const selectorSeed = () => ({ protectedValue: 'selector-persistence-control', sodAdditionalRecipients: [], sodAdditionalRecipientsList: [{ id: '11111111-1111-4111-8111-111111111111', value: { serveByPostOrEmail: 'email', emailInformation: { emailName: 'Selector recipient', emailAddress: 'selector@harness.example.com' }, postalInformation: { postalName: null, postalAddress: { AddressLine1: null, AddressLine2: null, AddressLine3: null, PostTown: null, County: null, PostCode: null, Country: null } } } }] });
export const selectorPersisted = () => ({ ...selectorSeed(), sodAdditionalRecipients: ['additionalRecipients'] });
export const selectorTransport = () => {
  const value = selectorPersisted();
  // Pinned toolkit FormValueService.removeUnnecessaryFields retains readonly
  // protectedValue and removes the inactive postal branch for an email item.
  delete value.sodAdditionalRecipientsList[0].value.postalInformation;
  return value;
};
const stateBefore = (value, caseId, data) => {
  assert(/^\d{16}$/.test(caseId), 'SELECTOR_OBSERVATION_CASE_ID');
  assert.equal(String(value.state.id), caseId, 'SELECTOR_OBSERVATION_CASE_ID');
  assert.equal(value.state.case_type_id, 'HarnessNestedPRL', 'SELECTOR_OBSERVATION_CASE_TYPE');
  assert.equal(value.state.jurisdiction, 'HARNESS', 'SELECTOR_OBSERVATION_JURISDICTION');
  assert.equal(value.state.state, 'JUDICIAL_REVIEW', 'SELECTOR_OBSERVATION_STATE');
  assert(Number.isSafeInteger(value.state.version) && value.state.version >= 0, 'SELECTOR_OBSERVATION_VERSION');
  assert(Array.isArray(value.history), 'SELECTOR_OBSERVATION_HISTORY');
  assert.deepEqual(value.state.case_data, data, 'SELECTOR_OBSERVATION_SEED');
};
export function validateSelectorInvocationObservation(observation, journal, selected, invocationId) {
  assert(['baseline', SELECTOR_EVENT_MUTATION].includes(invocationId), 'SELECTOR_OBSERVATION_INVOCATION');
  const baseline = invocationId === 'baseline', variant = baseline ? 'baseline' : 'summary-hidden';
  assert.equal(observation.schemaVersion, 1, 'SELECTOR_OBSERVATION_SCHEMA');
  assert.equal(observation.kind, 'native-selector-event-row-observation', 'SELECTOR_OBSERVATION_NATIVE_REQUIRED');
  assert.equal(observation.invocationId, invocationId, 'SELECTOR_OBSERVATION_INVOCATION');
  assert.equal(observation.variant, variant, 'SELECTOR_OBSERVATION_VARIANT');
  assert.deepEqual(observation.sourceBinding, deriveSelectorEventRowFixture(variant).binding, 'SELECTOR_OBSERVATION_SOURCE');
  assert.deepEqual(selected.credentials.courtadmin.roles?.slice().sort(), ['caseworker', 'caseworker-harness', 'caseworker-privatelaw-courtadmin'], 'SELECTOR_OBSERVATION_SOURCE_ROLE');
  const empty = observation.optionalEmptyState;
  stateBefore(empty.before, empty.caseId, selectorEmptySeed());
  assert.deepEqual(empty.after, empty.before, 'SELECTOR_EMPTY_VALIDATION_PERSISTED');
  assert.equal(empty.cyaHeading?.trim(), 'Check your answers', 'SELECTOR_EMPTY_CYA_REQUIRED');
  assert(typeof empty.cyaPath === 'string' && empty.cyaPath.startsWith(`/cases/case-details/HARNESS/HarnessNestedPRL/${empty.caseId}/trigger/serviceOfDocuments/`) && !['serviceOfDocuments2', 'serviceOfDocumentsharnessBefore'].some(id => empty.cyaPath.endsWith('/' + id)), 'SELECTOR_EMPTY_CYA_PATH');
  assert.deepEqual(observation.optionalEmpty, { status: 200, pageId: 'serviceOfDocuments2' }, 'SELECTOR_EMPTY_VALIDATION_REQUIRED');
  stateBefore(observation.before, observation.caseId, selectorSeed());
  assert.notEqual(empty.caseId, observation.caseId, 'SELECTOR_DISTINCT_CASES_REQUIRED');
  const ui = observation.ui;
  const eventPath = `/cases/case-details/HARNESS/HarnessNestedPRL/${observation.caseId}/trigger/serviceOfDocuments/`;
  assert.deepEqual(ui.navigation, ['serviceOfDocumentsharnessBefore', 'serviceOfDocuments2', 'serviceOfDocumentsharnessBefore', 'serviceOfDocuments2'].map(page => eventPath + page), 'SELECTOR_OBSERVATION_PAGE_SEQUENCE');
  assert.equal(ui.predecessorLabel?.trim(), 'Protected value', 'SELECTOR_OBSERVATION_PREDECESSOR');
  assert.equal(ui.predecessorEditableControls, 0, 'SELECTOR_OBSERVATION_PREDECESSOR');
  assert.equal(ui.selectorInitiallyChecked, false, 'SELECTOR_OBSERVATION_NEW_SELECTION');
  assert.equal(ui.selectorAfterCheck, true, 'SELECTOR_OBSERVATION_NEW_SELECTION');
  assert.equal(ui.siblingLabel?.trim(), 'Recipient', 'SELECTOR_OBSERVATION_SIBLING');
  assert.equal(ui.siblingValue?.trim(), 'Selector recipient', 'SELECTOR_OBSERVATION_SIBLING');
  assert.deepEqual(observation.selectedCya, { validation: { status: 200, pageId: 'serviceOfDocuments2' }, selectorChecked: true, selectorPrecedesRecipient: true, predecessorRoundTrip: true, healthySiblingCount: 1, selectorSummaryCount: baseline ? 1 : 0 }, 'SELECTOR_OBSERVATION_HEALTHY_CYA');
  assert.equal(ui.cyaHeading?.trim(), 'Check your answers', 'SELECTOR_OBSERVATION_CYA_HEADING');
  assert(typeof ui.cyaPath === 'string' && ui.cyaPath.startsWith(eventPath) && !ui.navigation.includes(ui.cyaPath), 'SELECTOR_OBSERVATION_CYA_PATH');
  assert(Array.isArray(journal), 'SELECTOR_OBSERVATION_JOURNAL');
  const validations = journal.filter(entry => entry.method === 'POST' && entry.path === '/data/case-types/HarnessNestedPRL/validate');
  for (const [controlValue, selectedValues] of [['selector-empty-control', []], ['selector-persistence-control', ['additionalRecipients']]]) {
    const matches = validations.filter(entry => entry.selectorValidation?.pageId === 'serviceOfDocuments2' && entry.selectorValidation.controlValue === controlValue);
    assert(matches.length > 0, 'SELECTOR_VALIDATION_TRANSPORT_REQUIRED');
    for (const entry of matches) {
      assert.equal(entry.status, 200, 'SELECTOR_VALIDATION_TRANSPORT_STATUS');
      assert.equal(entry.actorId, selected.credentials.courtadmin.userId, 'SELECTOR_VALIDATION_TRANSPORT_ACTOR');
      assert.equal(entry.selectorValidation.eventId, 'serviceOfDocuments', 'SELECTOR_VALIDATION_TRANSPORT_EVENT');
      assert.deepEqual(entry.selectorValidation.selected, selectedValues, 'SELECTOR_VALIDATION_TRANSPORT_VALUES');
    }
  }
  assert(!journal.some(entry => entry.method === 'POST' && entry.path === `/data/cases/${empty.caseId}/events`), 'SELECTOR_EMPTY_SUBMITTED');
  const submissions = journal.filter(entry => entry.method === 'POST' && entry.path === `/data/cases/${observation.caseId}/events`);
  if (!baseline) {
    assert.equal(observation.completed, false, 'SELECTOR_FAULT_COMPLETED');
    assert.equal(observation.faultEffective, true, 'SELECTOR_FAULT_NOT_EFFECTIVE');
    assert.equal(observation.witness, 'healthy-cya-without-selector-row', 'SELECTOR_FAULT_WITNESS');
    assert.deepEqual(observation.afterFault, observation.before, 'SELECTOR_FAULT_PERSISTED');
    assert.deepEqual(submissions, [], 'SELECTOR_FAULT_SUBMITTED');
    return;
  }
  assert.equal(ui.selectorSummaryLabel?.trim(), 'Select additional recipients who needs to be served', 'SELECTOR_OBSERVATION_SUMMARY_LABEL');
  assert.equal(ui.selectorSummaryValue?.trim(), 'Additional recipients (optional)', 'SELECTOR_OBSERVATION_SUMMARY_VALUE');
  assert.equal(ui.changeAccessibleName, 'Change Select additional recipients who needs to be served', 'SELECTOR_OBSERVATION_CHANGE_LINK');
  assert.equal(ui.changeTarget, eventPath + 'serviceOfDocuments2', 'SELECTOR_OBSERVATION_CHANGE_TARGET');
  assert.equal(ui.selectedAfterChange, true, 'SELECTOR_OBSERVATION_CHANGE_VALUE');
  assert.deepEqual(observation.beforeSubmit, observation.before, 'SELECTOR_PREMATURE_PERSISTENCE');
  assert.deepEqual(observation.intended, selectorPersisted(), 'SELECTOR_PRODUCER_EXPECTATION_MISMATCH');
  assert.deepEqual(observation.after.state.case_data, selectorPersisted(), 'SELECTOR_PERSISTED_VALUE');
  assert.equal(observation.after.state.version, observation.before.state.version + 1, 'SELECTOR_PERSISTED_VERSION');
  const stable = state => Object.fromEntries(Object.entries(state).filter(([key]) => !['version', 'case_data', 'last_modified'].includes(key)));
  assert.deepEqual(stable(observation.after.state), stable(observation.before.state), 'SELECTOR_UNRELATED_STATE_CHANGED');
  assert(Number.isFinite(Date.parse(observation.after.state.last_modified)) && Date.parse(observation.after.state.last_modified) >= Date.parse(observation.before.state.last_modified), 'SELECTOR_PERSISTED_DATE');
  const old = entry => observation.before.history.some(prior => prior.id === entry.id && prior.created_date === entry.created_date);
  assert.equal(observation.after.history.length, observation.before.history.length + 1, 'SELECTOR_HISTORY_COUNT');
  assert.deepEqual(observation.after.history.filter(old), observation.before.history, 'SELECTOR_PRIOR_HISTORY_CHANGED');
  const added = observation.after.history.filter(entry => !old(entry));
  assert.equal(added.length, 1, 'SELECTOR_NEW_EVENT_REQUIRED');
  for (const [key, value] of Object.entries({ id: 'serviceOfDocuments', case_type_id: 'HarnessNestedPRL', state_id: 'JUDICIAL_REVIEW', user_id: selected.credentials.courtadmin.userId })) assert.equal(added[0][key], value, 'SELECTOR_HISTORY_ACTOR_EVENT');
  assert.equal(submissions.length, 1, 'SELECTOR_TRANSPORT_SUBMISSION_COUNT');
  assert.equal(submissions[0].status, 201, 'SELECTOR_TRANSPORT_SUBMISSION_STATUS');
  assert.equal(submissions[0].actorId, selected.credentials.courtadmin.userId, 'SELECTOR_TRANSPORT_SUBMISSION_ACTOR');
  assert.deepEqual(observation.submission, { method: 'POST', path: `/data/cases/${observation.caseId}/events`, status: 201, eventId: 'serviceOfDocuments', data: selectorTransport() }, 'SELECTOR_SUBMISSION_PAYLOAD');
}

const fixedRead = (directory, relative) => {
  const file = path.join(directory, relative);
  assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, 'SELECTOR_OBSERVATION_ALIAS');
  const bytes = fs.readFileSync(file);
  assert(bytes.length <= 1024 * 1024, 'SELECTOR_OBSERVATION_BYTES');
  return bytes;
};
export function selectorObservationReferences(directory) {
  return Object.fromEntries([['baseline', 'baseline/selector-event-row-observation.json'], ['baselineJournal', 'baseline/ccd-requests.jsonl'], ['mutant', `${SELECTOR_EVENT_MUTATION}/selector-event-row-observation.json`], ['mutantJournal', `${SELECTOR_EVENT_MUTATION}/ccd-requests.jsonl`]].map(([key, relative]) => [key, { path: relative, digest: digestBytes(fixedRead(directory, relative)) }]));
}
export function validateSelectorNativeObservations(directory, input, faultInput, references) {
  const actual = selectorObservationReferences(directory);
  assert.deepEqual(references, actual, 'SELECTOR_OBSERVATION_ARTIFACT_BINDING');
  for (const [invocation, selected, key, journalKey] of [['baseline', input, 'baseline', 'baselineJournal'], [SELECTOR_EVENT_MUTATION, faultInput, 'mutant', 'mutantJournal']]) {
    const observation = JSON.parse(fixedRead(directory, actual[key].path));
    const journal = fixedRead(directory, actual[journalKey].path).toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
    validateSelectorInvocationObservation(observation, journal, selected, invocation);
  }
  return actual;
}
