import assert from 'node:assert/strict';
import { validateRunManifest } from './exui-release-evidence.mjs';

const scope = 'exui-ccd-event-capability-pilot';
const eventId = 'serviceOfDocuments', eventName = 'Service of documents';
const names = ['courtadmin-read', 'readonly-read', 'courtadmin-cell', 'readonly-update'];
const faults = ['ccd-remove-courtadmin-recipient-read', 'ccd-remove-readonly-recipient-read', 'ccd-remove-courtadmin-event-create', 'ccd-enable-readonly-recipient-update'];
const scenarios = ['email-1', 'email-2', 'post-1', 'post-2'];
const exact = (value, keys, code) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...keys].sort(), code);
const roles = name => ['caseworker', 'caseworker-harness', `caseworker-privatelaw-${name}`];
const sha = value => /^sha256:[a-f0-9]{64}$/.test(value ?? '');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

export function sharedRoleEventActor(actor) {
  return { id: actor.id ?? actor.uid, roles: [...actor.roles].sort() };
}
export function sharedRoleEventBinding(manifest, context) {
  validateRunManifest(manifest);
  assert.equal(manifest.releaseScopeId, scope, 'SHARED_ROLE_EVENT_SCOPE');
  assert(['baseline', ...faults].includes(context?.invocationId), 'SHARED_ROLE_EVENT_INVOCATION');
  const common = Object.fromEntries(['runId', 'harnessCommit', 'releaseScopeId', 'policyDigest', 'identity'].map(key => [key, manifest[key]]));
  assert.deepEqual(context, { ...common, invocationId: context.invocationId, harnessSourceState: manifest.runtimeMetadata.harnessSourceState, harnessSourceDigest: manifest.runtimeMetadata.harnessSourceDigest }, 'SHARED_ROLE_EVENT_CONTEXT');
  assert.equal(manifest.runtimeMetadata.harnessSourceState, 'clean', 'SHARED_ROLE_EVENT_PRODUCER');
  const metadata = Object.fromEntries(['harnessSourceDigest', 'definitionImportDigest', 'observedDefinitionDigest', 'definitionVersion', 'ccdNamespace'].map(key => [key, manifest.runtimeMetadata[key]]));
  for (const key of ['harnessSourceDigest', 'definitionImportDigest', 'observedDefinitionDigest']) assert(sha(metadata[key]), 'SHARED_ROLE_EVENT_PROVENANCE');
  assert(/^[1-9][0-9]*$/.test(metadata.definitionVersion) && /^[a-zA-Z0-9-]{1,100}$/.test(metadata.ccdNamespace), 'SHARED_ROLE_EVENT_IMPORT');
  return structuredClone({ ...common, invocationId: context.invocationId, ...metadata });
}
function noCredentials(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    assert(!/^(?:token|access[-_]?token|refresh[-_]?token|id[-_]?token|authorization|cookie|set-cookie|headers|password|secret)$/i.test(key), 'SHARED_ROLE_EVENT_CREDENTIAL_FIELD');
    noCredentials(item);
  }
}
function actor(value, expectedId, persona) {
  exact(value, ['id', 'roles'], 'SHARED_ROLE_EVENT_ACTOR_SCHEMA');
  assert.equal(value.id, expectedId, 'SHARED_ROLE_EVENT_ACTOR');
  assert.deepEqual([...value.roles].sort(), roles(persona), 'SHARED_ROLE_EVENT_ROLES');
}
export function sharedRoleEventEnvelope(name, observations, manifest, context, personas) {
  assert(names.includes(name), 'SHARED_ROLE_EVENT_NAME');
  const result = { schemaVersion: 1, name, binding: sharedRoleEventBinding(manifest, context), observerId: personas.credentials.observer.userId, observations };
  noCredentials(result);
  for (const item of observations) exact(item.actor, ['id', 'roles'], 'SHARED_ROLE_EVENT_ACTOR_SCHEMA');
  return result;
}
// Independent fixture oracle: these synthetic inputs are fixed by harnessCcdEvent.ts
// in the sealed producer. Never derive expected values from an observation or response.
function recipients(scenario, change) {
  const [channel, count] = scenario.split('-');
  return Array.from({ length: Number(count) }, (_, index) => ({
    id: `46e2ff95-4689-42ea-b38c-d3b9204572b${index}`,
    value: channel === 'email' ? { serveByPostOrEmail: 'email', emailInformation: {
      emailName: `Synthetic read recipient ${index + 1}`,
      emailAddress: change === 'courtadmin' ? `courtadmin-edited-${index + 1}@harness.example.com` : change === 'readonly' ? `readonly-change-${index + 1}@harness.example.com` : `read-recipient-${index + 1}@harness.example.com`,
    } } : { serveByPostOrEmail: 'post', postalInformation: {
      postalName: `Synthetic postal read ${index + 1}`, postalAddress: {
        AddressLine1: change === 'courtadmin' ? `Synthetic courtadmin edited street ${index + 1}` : change === 'readonly' ? `Synthetic readonly changed street ${index + 1}` : `Synthetic read street ${index + 1}`,
        AddressLine2: null, AddressLine3: null, PostTown: null, County: null, PostCode: ['SW1A 1AA', 'M1 1AA'][index], Country: null,
      },
    } },
  }));
}
function state(value, caseId) {
  assert(value?.state && Array.isArray(value.history), 'SHARED_ROLE_EVENT_STATE');
  assert.equal(String(value.state.id), caseId, 'SHARED_ROLE_EVENT_CASE');
  assert.equal(value.state.case_type_id, 'HarnessNestedPRL', 'SHARED_ROLE_EVENT_CASE_TYPE');
  assert.equal(value.state.jurisdiction, 'HARNESS', 'SHARED_ROLE_EVENT_JURISDICTION');
  assert.equal(value.state.state, 'JUDICIAL_REVIEW', 'SHARED_ROLE_EVENT_STATE_NAME');
  assert(Number.isInteger(value.state.version) && value.state.version >= 0, 'SHARED_ROLE_EVENT_VERSION');
}
function emptyBranch(value) {
  return value === null || (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every(emptyBranch));
}
function meaningfulValues(rows, expected, idsRequired) {
  assert(Array.isArray(rows) && rows.length === expected.length, 'SHARED_ROLE_EVENT_RECIPIENT_COUNT');
  if (idsRequired) assert(rows.every(item => uuid(item.id)) && new Set(rows.map(item => item.id)).size === rows.length, 'SHARED_ROLE_EVENT_COLLECTION_IDS');
  for (const [index, item] of rows.entries()) {
    exact(item, ['id', 'value'], 'SHARED_ROLE_EVENT_COLLECTION_SCHEMA');
    const branch = expected[index].value.serveByPostOrEmail === 'email' ? 'emailInformation' : 'postalInformation';
    const other = branch === 'emailInformation' ? 'postalInformation' : 'emailInformation';
    assert(Object.keys(item.value).every(key => ['serveByPostOrEmail', branch, other].includes(key)), 'SHARED_ROLE_EVENT_EXTRA_VALUE');
    if (Object.hasOwn(item.value, other)) assert(emptyBranch(item.value[other]), 'SHARED_ROLE_EVENT_INACTIVE_VALUE');
    assert.deepEqual({ serveByPostOrEmail: item.value.serveByPostOrEmail, [branch]: item.value[branch] }, expected[index].value, 'SHARED_ROLE_EVENT_VALUES');
  }
}
function view(value, expected, control, hidden = false) {
  const markerVisibility = expected.map(({value: recipient}) => [recipient.emailInformation?.emailName, recipient.emailInformation?.emailAddress, recipient.postalInformation?.postalName, recipient.postalInformation?.postalAddress?.AddressLine1, recipient.postalInformation?.postalAddress?.PostCode].filter(marker => typeof marker === 'string').map(marker => ({marker, visible: !hidden})));
  assert.deepEqual(value.markerVisibility, markerVisibility, 'SHARED_ROLE_EVENT_MARKER_VISIBILITY');
  assert.equal(value.caseViewStatus, 200, 'SHARED_ROLE_EVENT_VIEW_STATUS');
  assert.equal(value.protectedValue, control, 'SHARED_ROLE_EVENT_CONTROL');
  assert.equal(value.controlVisible, true, 'SHARED_ROLE_EVENT_HEALTHY_CONTROL');
  assert.deepEqual(value.visible, expected.map(() => !hidden), 'SHARED_ROLE_EVENT_VISIBLE_VALUES');
  if (hidden) {
    assert.deepEqual(value.recipientFields, [], 'SHARED_ROLE_EVENT_HIDDEN_FIELD');
    assert.equal(value.projected, null, 'SHARED_ROLE_EVENT_HIDDEN_PROJECTION');
  } else {
    assert.equal(value.recipientFields?.length, 1, 'SHARED_ROLE_EVENT_VIEW_FIELD');
    assert.equal(value.recipientFields[0].id, 'sodAdditionalRecipientsList', 'SHARED_ROLE_EVENT_VIEW_FIELD');
    assert.deepEqual(value.recipientFields[0].value, value.projected, 'SHARED_ROLE_EVENT_VIEW_PROJECTION');
    assert.deepEqual(value.projected, expected, 'SHARED_ROLE_EVENT_VIEW_READBACK');
  }
}
function updated(before, after, data) {
  assert.deepEqual(after.state.case_data, data, 'SHARED_ROLE_EVENT_PERSISTED_DATA');
  assert.equal(after.state.version, before.state.version + 1, 'SHARED_ROLE_EVENT_WRITE_VERSION');
  assert.equal(after.history.length, before.history.length + 1, 'SHARED_ROLE_EVENT_WRITE_HISTORY');
  assert.equal(after.history.filter(item => item.id === eventId).length, 1, 'SHARED_ROLE_EVENT_WRITE_EVENT');
  assert.deepEqual(after.history.filter(item => item.id !== eventId), before.history, 'SHARED_ROLE_EVENT_PRIOR_HISTORY');
}
function triggerProjection(value, allowed) {
  assert.deepEqual(value.map(item => ({id:item.id,name:item.name})), allowed ? [{id:eventId,name:eventName}] : [], 'SHARED_ROLE_EVENT_TRIGGERS');
}
export function replaySharedRoleEventObservation(value, { name, manifest, context, personas, requests }) {
  exact(value, ['schemaVersion', 'name', 'binding', 'observerId', 'observations'], 'SHARED_ROLE_EVENT_ENVELOPE');
  noCredentials(value);
  assert.equal(value.schemaVersion, 1, 'SHARED_ROLE_EVENT_SCHEMA');
  assert.equal(value.name, name, 'SHARED_ROLE_EVENT_NAME');
  assert(names.includes(name), 'SHARED_ROLE_EVENT_NAME');
  assert.deepEqual(value.binding, sharedRoleEventBinding(manifest, context), 'SHARED_ROLE_EVENT_BINDING');
  const invocation = context.invocationId, fault = invocation !== 'baseline';
  assert(!fault || invocation === faults[names.indexOf(name)], 'SHARED_ROLE_EVENT_FAULT_SCOPE');
  const persona = name.startsWith('readonly') ? 'readonly' : 'courtadmin';
  const actorId = personas.credentials[persona].userId;
  assert(Array.isArray(requests) && requests.length > 0, 'SHARED_ROLE_EVENT_REQUESTS');
  assert.equal(value.observerId, personas.credentials.observer.userId, 'SHARED_ROLE_EVENT_OBSERVER');
  assert.deepEqual([...personas.credentials[persona].roles].sort(), roles(persona), 'SHARED_ROLE_EVENT_PERSONA');
  for (const other of ['allowed', 'observer', 'judge', persona === 'courtadmin' ? 'readonly' : 'courtadmin'])
    assert.notEqual(actorId, personas.credentials[other].userId, 'SHARED_ROLE_EVENT_SEPARATE_ACTOR');
  assert.deepEqual(value.observations.map(item => item.scenario), scenarios, 'SHARED_ROLE_EVENT_SHAPES');
  assert.equal(new Set(value.observations.map(item => item.caseId)).size, 4, 'SHARED_ROLE_EVENT_DISTINCT_CASES');
  for (const item of value.observations) {
    assert(/^[0-9]{16}$/.test(item.caseId), 'SHARED_ROLE_EVENT_CASE');
    actor(item.actor, actorId, persona);
    const required = [ ['GET', `/internal/cases/${item.caseId}`, 200],
      ...(!name.endsWith('-read') ? [['GET', `/internal/cases/${item.caseId}/event-triggers/${eventId}`, item.startStatus], ['POST', `/cases/${item.caseId}/events`, item.submitStatus]] : []),
    ];
    for (const [method, upstreamPath, status] of required) {
      const matching = requests.filter(request => request.method === method && request.upstreamPath === upstreamPath);
      assert(matching.length > 0 && matching.every(request => request.actorId === actorId && request.status === status && request.mutation === null), 'SHARED_ROLE_EVENT_AUTHENTICATED_REQUEST');
    }
    state(item.before, item.caseId); state(item.after, item.caseId);
    assert.deepEqual(item.before.history.map(event => event.id), ['create'], 'SHARED_ROLE_EVENT_INITIAL_HISTORY');
    const original = recipients(item.scenario), isRead = name.endsWith('-read'), court = name === 'courtadmin-cell';
    const control = isRead ? 'synthetic-courtadmin-read-control' : court ? 'synthetic-courtadmin-original' : 'synthetic-readonly-update-control';
    const initial = court ? { protectedValue: control, sodAdditionalRecipientsList: [] } : { protectedValue: control, sodAdditionalRecipients: ['additionalRecipients'], sodAdditionalRecipientsList: original };
    assert.deepEqual(item.before.state.case_data, initial, 'SHARED_ROLE_EVENT_INITIAL_DATA');
    if (isRead) {
      assert.deepEqual(item.expectedRecipients, original.map(row => row.value), 'SHARED_ROLE_EVENT_SELF_ORACLE');
      view(item, original, control, fault);
      assert.deepEqual(item.after, item.before, 'SHARED_ROLE_EVENT_READ_CHANGED_STATE');
      continue;
    }
    const changed = recipients(item.scenario, persona), allowed = court ? !fault : fault;
    assert.equal(item.caseViewStatus, 200, 'SHARED_ROLE_EVENT_VIEW_STATUS');
    assert.equal(item.protectedValue, control, 'SHARED_ROLE_EVENT_CONTROL');
    assert.equal(item.controlVisible, true, 'SHARED_ROLE_EVENT_HEALTHY_CONTROL');
    triggerProjection(item.eventTriggers, allowed);
    assert.equal(item.startStatus, allowed ? 200 : 404, 'SHARED_ROLE_EVENT_START_STATUS');
    assert.equal(item.submitStatus, allowed ? 201 : 404, 'SHARED_ROLE_EVENT_SUBMIT_STATUS');
    exact(item.submittedData, ['sodAdditionalRecipients', 'sodAdditionalRecipientsList'], 'SHARED_ROLE_EVENT_SUBMITTED_KEYS');
    assert.deepEqual(item.submittedData.sodAdditionalRecipients, ['additionalRecipients'], 'SHARED_ROLE_EVENT_SELECTOR');
    meaningfulValues(item.submittedData.sodAdditionalRecipientsList, changed, !court || fault);
    if (court) {
      assert.deepEqual(item.expectedValues, changed.map(row => row.value), 'SHARED_ROLE_EVENT_SELF_ORACLE');
      assert.equal(item.formCompleted, allowed, 'SHARED_ROLE_EVENT_FORM');
      assert.equal(item.csrfHeaderPresent, allowed, 'SHARED_ROLE_EVENT_CSRF');
      assert(allowed ? sha(item.csrfHeaderDigest) : item.csrfHeaderDigest === null, 'SHARED_ROLE_EVENT_CSRF');
    } else {
      actor(item.sessionUser, actorId, persona);
      assert.equal(item.eventId, eventId, 'SHARED_ROLE_EVENT_ID');
      assert.equal(item.legacyTokenStatus, 200, 'SHARED_ROLE_EVENT_TOKEN_STATUS');
      assert.equal(item.eventTokenPresent, true, 'SHARED_ROLE_EVENT_TOKEN_PRESENT');
      assert.deepEqual(item.eventTriggers, item.caseTriggers.filter(event => event.id === eventId), 'SHARED_ROLE_EVENT_TRIGGER_PROJECTION');
      assert.deepEqual(item.eventOptions, item.menuOptions.map(option => option.trim()).filter(option => option === eventName), 'SHARED_ROLE_EVENT_MENU_PROJECTION');
      assert.deepEqual(item.eventOptions, allowed ? [eventName] : [], 'SHARED_ROLE_EVENT_MENU');
      assert.deepEqual(item.submittedData.sodAdditionalRecipientsList, changed, 'SHARED_ROLE_EVENT_READONLY_PAYLOAD');
      assert.deepEqual(item.intendedData, { ...initial, ...item.submittedData }, 'SHARED_ROLE_EVENT_INTENDED_DATA');
      view(item, original, control);
    }
    if (!allowed) {
      assert.deepEqual(item.after, item.before, 'SHARED_ROLE_EVENT_DENIED_WRITE');
      if (court) assert.equal(item.readback, null, 'SHARED_ROLE_EVENT_FAULT_STAGE');
      continue;
    }
    const persisted = item.after.state.case_data.sodAdditionalRecipientsList;
    meaningfulValues(persisted, changed, true);
    assert.deepEqual(persisted.map(row => row.value), item.submittedData.sodAdditionalRecipientsList.map(row => row.value), 'SHARED_ROLE_EVENT_PAYLOAD_READBACK');
    if (!court) assert.deepEqual(persisted, changed, 'SHARED_ROLE_EVENT_EXISTING_IDS');
    updated(item.before, item.after, { ...initial, ...item.submittedData, sodAdditionalRecipientsList: persisted });
    if (court) view(item.readback, persisted, control);
  }
  return { name, invocationId: invocation, checkedShapes: 4, catalogueCredit: false };
}
