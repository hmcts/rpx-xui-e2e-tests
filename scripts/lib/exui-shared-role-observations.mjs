import assert from 'node:assert/strict';
import fs from 'node:fs';
import { digestBytes } from './exui-evidence-io.mjs';
import { validateRunManifest } from './exui-release-evidence.mjs';
export { writeJsonAtomic as saveSharedRoleObservation } from './exui-evidence-io.mjs';

// Only these synthetic canaries may survive the response boundary. Never retain
// response text, headers, cookies, error messages or arbitrary JSON properties.
const markers = Object.freeze({
  'protected-original': 'synthetic-protected-original',
  'denied-write': 'must-never-persist',
  'transition-written': 'synthetic-transition-written',
  'revoked-write': 'revoked-write-must-not-persist',
});
const digest = value => /^sha256:[a-f0-9]{64}$/.test(value ?? '');
const exact = (value, keys, code) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...keys].sort(), code);
export function projectSharedRoleResponse(status, body) {
  assert(Number.isInteger(status) && status >= 100 && status <= 599, 'SHARED_ROLE_RESPONSE_STATUS');
  assert(typeof body === 'string' && Buffer.byteLength(body) <= 4 * 1024 * 1024, 'SHARED_ROLE_RESPONSE_SIZE');
  return { status, bodyBytes: Buffer.byteLength(body), bodyDigest: digestBytes(body), presentMarkers: Object.entries(markers).filter(([, value]) => body.includes(value)).map(([key]) => key).sort() };
}
export function validateSharedRoleResponse(value) {
  exact(value, ['status', 'bodyBytes', 'bodyDigest', 'presentMarkers'], 'SHARED_ROLE_RESPONSE_SCHEMA');
  assert(Number.isInteger(value.status) && value.status >= 100 && value.status <= 599, 'SHARED_ROLE_RESPONSE_STATUS');
  assert(Number.isInteger(value.bodyBytes) && value.bodyBytes >= 0 && value.bodyBytes <= 4 * 1024 * 1024 && digest(value.bodyDigest), 'SHARED_ROLE_RESPONSE_SIZE');
  assert(Array.isArray(value.presentMarkers) && value.presentMarkers.every(key => Object.hasOwn(markers, key)), 'SHARED_ROLE_RESPONSE_MARKERS');
  assert.deepEqual(value.presentMarkers, [...new Set(value.presentMarkers)].sort(), 'SHARED_ROLE_RESPONSE_MARKERS');
  return value;
}
export function sharedRoleObservationBinding(manifest, context) {
  validateRunManifest(manifest);
  const common = ['runId', 'harnessCommit', 'releaseScopeId', 'policyDigest', 'identity'];
  assert.equal(manifest.releaseScopeId, 'exui-ccd-pilot', 'SHARED_ROLE_OBSERVATION_SCOPE');
  assert(['baseline', 'ccd-broaden-access', 'ccd-write-then-deny', 'ccd-stale-revoked-bearer'].includes(context?.invocationId), 'SHARED_ROLE_OBSERVATION_INVOCATION');
  assert.deepEqual(context, {
    ...Object.fromEntries(common.map(key => [key, manifest[key]])),
    invocationId: context.invocationId,
    harnessSourceState: manifest.runtimeMetadata.harnessSourceState,
    harnessSourceDigest: manifest.runtimeMetadata.harnessSourceDigest,
  }, 'SHARED_ROLE_OBSERVATION_CONTEXT');
  const metadata = ['harnessSourceDigest', 'definitionImportDigest', 'observedDefinitionDigest', 'definitionVersion', 'ccdNamespace'];
  for (const key of metadata.slice(0, 3)) assert(digest(manifest.runtimeMetadata[key]), 'SHARED_ROLE_OBSERVATION_PROVENANCE');
  assert(/^[1-9][0-9]*$/.test(manifest.runtimeMetadata.definitionVersion ?? '') && /^[a-zA-Z0-9-]{1,100}$/.test(manifest.runtimeMetadata.ccdNamespace ?? ''), 'SHARED_ROLE_OBSERVATION_IMPORT');
  return structuredClone({ ...Object.fromEntries(common.map(key => [key, manifest[key]])), invocationId: context.invocationId, ...Object.fromEntries(metadata.map(key => [key, manifest.runtimeMetadata[key]])) });
}
export function currentSharedRoleObservationBinding() {
  return sharedRoleObservationBinding(
    JSON.parse(fs.readFileSync(process.env.EXUI_CANDIDATE_RUN_MANIFEST, 'utf8')),
    JSON.parse(fs.readFileSync(process.env.EXUI_EVIDENCE_CONTEXT, 'utf8')),
  );
}
function response(value, status, present = []) {
  validateSharedRoleResponse(value);
  assert.equal(value.status, status, 'SHARED_ROLE_RESPONSE_STATUS_MISMATCH');
  assert.deepEqual(value.presentMarkers, present, 'SHARED_ROLE_RESPONSE_DISCLOSURE');
}
function observation(value, binding, actorId, protectedValue) {
  assert.equal(value?.schemaVersion, 1, 'SHARED_ROLE_OBSERVATION_SCHEMA');
  assert.deepEqual(value.binding, binding, 'SHARED_ROLE_OBSERVATION_BINDING');
  assert(/^[0-9]{16}$/.test(value.caseId ?? ''), 'SHARED_ROLE_OBSERVATION_CASE');
  assert.equal(value.actor?.id, actorId, 'SHARED_ROLE_OBSERVATION_ACTOR');
  assert(value.before?.state && Array.isArray(value.before.history), 'SHARED_ROLE_OBSERVATION_BEFORE');
  for (const observed of [value.before, ...(value.after ? [value.after] : [])]) {
    assert.equal(String(observed.state.id), value.caseId, 'SHARED_ROLE_OBSERVATION_STATE_CASE');
    assert.equal(observed.state.case_type_id, 'HarnessNestedPRL', 'SHARED_ROLE_OBSERVATION_STATE_TYPE');
    assert.equal(observed.state.jurisdiction, 'HARNESS', 'SHARED_ROLE_OBSERVATION_STATE_JURISDICTION');
    assert.equal(observed.state.state, 'Created', 'SHARED_ROLE_OBSERVATION_STATE');
    assert(Number.isInteger(observed.state.version) && observed.state.version >= 0, 'SHARED_ROLE_OBSERVATION_VERSION');
  }
  assert.deepEqual(value.before.state.case_data, { protectedValue, sodAdditionalRecipientsList: [] }, 'SHARED_ROLE_OBSERVATION_CONTROL');
  assert.deepEqual(value.before.history.map(event => event.id).sort(), protectedValue === markers['protected-original'] ? ['create'] : ['create', 'update'], 'SHARED_ROLE_OBSERVATION_HISTORY_CONTROL');
}
export function replaySharedRoleDenial(value, { binding, actorId, mutation }) {
  assert([null, 'ccd-broaden-access', 'ccd-write-then-deny'].includes(mutation), 'SHARED_ROLE_DENIAL_MUTATION');
  observation(value, binding, actorId, markers['protected-original']);
  if (mutation === 'ccd-broaden-access') {
    assert.equal(value.complete, false, 'SHARED_ROLE_FAULT_STAGE');
    response(value.deniedReadResponse, 200, ['protected-original']);
    assert.equal(value.deniedRead, 200, 'SHARED_ROLE_RESPONSE_STATUS_MISMATCH');
    return;
  }
  assert.equal(value.complete, true, 'SHARED_ROLE_OBSERVATION_INCOMPLETE');
  assert([403, 404].includes(value.deniedRead) && [403, 404].includes(value.deniedWrite), 'SHARED_ROLE_DENIAL_REQUIRED');
  response(value.deniedReadResponse, value.deniedRead);
  response(value.deniedWriteResponse, value.deniedWrite);
  assert.deepEqual(value.auditOnlyExceptions, [], 'SHARED_ROLE_UNREVIEWED_EXCEPTION');
  if (mutation === 'ccd-write-then-deny') {
    assert.deepEqual(value.after?.state?.case_data, { ...value.before.state.case_data, protectedValue: markers['denied-write'] }, 'SHARED_ROLE_FAULT_WRITE_VALUE');
    assert.equal(value.after.state.state, value.before.state.state, 'SHARED_ROLE_FAULT_WRITE_STATE');
    assert.equal(value.after.state.version, value.before.state.version + 1, 'SHARED_ROLE_FAULT_WRITE_VERSION');
    assert.equal(value.after.history.length, value.before.history.length + 1, 'SHARED_ROLE_FAULT_WRITE_HISTORY');
    assert.deepEqual(value.after.history.map(event => event.id).sort(), ['create', 'update'], 'SHARED_ROLE_FAULT_WRITE_EVENT');
  } else assert.deepEqual(value.after, value.before, 'SHARED_ROLE_DENIED_WRITE_PERSISTED');
}
export function replaySharedRoleRevocation(value, { binding, actorId, mutation }) {
  assert([null, 'ccd-stale-revoked-bearer'].includes(mutation), 'SHARED_ROLE_REVOCATION_MUTATION');
  observation(value, binding, actorId, markers['transition-written']);
  assert.equal(value.identity.before.id, actorId, 'SHARED_ROLE_TRANSITION_ACTOR');
  assert.equal(value.identity.afterAccount.id, actorId, 'SHARED_ROLE_TRANSITION_ACTOR');
  assert(value.identity.before.roles.includes('caseworker-harness-allowed'), 'SHARED_ROLE_INITIAL_ROLE');
  assert.deepEqual(value.identity.afterAccount.roles, ['caseworker', 'caseworker-harness'], 'SHARED_ROLE_REVOKED_ROLES');
  assert.deepEqual(value.identity.afterAuthentication, value.identity.afterAccount, 'SHARED_ROLE_FRESH_IDENTITY');
  assert.equal(value.identity.tokensDistinct, true, 'SHARED_ROLE_DISTINCT_BEARER');
  assert.deepEqual(value.renewedSessionUser, value.identity.afterAccount, 'SHARED_ROLE_RENEWED_SESSION');
  assert.equal(value.grantedRead, 200, 'SHARED_ROLE_INITIAL_ACCESS');
  assert.equal(value.legitimateWrite, 201, 'SHARED_ROLE_INITIAL_WRITE');
  assert.equal(value.before.state.case_data.protectedValue, markers['transition-written'], 'SHARED_ROLE_INITIAL_PERSISTENCE');
  response(value.warmedResponse, 200, ['transition-written']);
  assert.equal(value.warmedRead, 200, 'SHARED_ROLE_WARMED_STATUS');
  assert([403, 404].includes(value.freshBearerRead), 'SHARED_ROLE_FRESH_DENIAL');
  response(value.freshBearerResponse, value.freshBearerRead);
  response(value.originalBearerResponse, 200, ['transition-written']);
  assert.equal(value.originalBearerRead, 200, 'SHARED_ROLE_OLD_BEARER_CACHE_APPLICABILITY');
  if (mutation === 'ccd-stale-revoked-bearer') {
    assert.equal(value.complete, false, 'SHARED_ROLE_FAULT_STAGE');
    response(value.renewedCandidateResponse, 200, ['transition-written']);
    assert.equal(value.renewedCandidateRead, 200, 'SHARED_ROLE_RESPONSE_STATUS_MISMATCH');
    return;
  }
  assert.equal(value.complete, true, 'SHARED_ROLE_OBSERVATION_INCOMPLETE');
  assert([403, 404].includes(value.renewedCandidateRead) && [403, 404].includes(value.renewedCandidateWrite), 'SHARED_ROLE_RENEWED_DENIAL');
  response(value.renewedCandidateResponse, value.renewedCandidateRead);
  response(value.renewedWriteResponse, value.renewedCandidateWrite);
  assert.deepEqual(value.after, value.before, 'SHARED_ROLE_REVOKED_WRITE_PERSISTED');
  assert.deepEqual(value.auditOnlyExceptions, [], 'SHARED_ROLE_UNREVIEWED_EXCEPTION');
}
