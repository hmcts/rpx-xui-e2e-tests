import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { digestBytes } from './exui-evidence-io.mjs';
import { readEventBaselineCheckpoint } from './exui-native-proof-validation.mjs';
import { validateNativeInvocationFinalization } from './exui-native-ci-ownership.mjs';
import { selectEventCapabilityRuntime } from './exui-ccd-event-transition.mjs';
import { CCD_IMAGES, ccdRuntimeImageIds } from './exui-ccd-runtime.mjs';
import { EVENT_CAPABILITY_SCOPE, EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION,
  READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION,
  SOURCE_SHAPE_MUTATIONS } from './exui-ccd-event-capability.mjs';

export const EVENT_SERIAL_V3_FAULTS = Object.freeze([EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION,
  READONLY_READ_MUTATION, READONLY_UPDATE_MUTATION, COURTADMIN_UPDATE_MUTATION, ...SOURCE_SHAPE_MUTATIONS]);
const fail = code => { throw new Error('EVENT_SERIAL_V3_' + code); };
const same = (actual, expected, code) => { if (!isDeepStrictEqual(actual, expected)) fail(code); };
const fields = (value, keys, code) => same(value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : null, [...keys].sort(), code);
const digest = value => /^sha256:[a-f0-9]{64}$/.test(value ?? '');
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value ?? '');
const baselineFields = ['nativeAuthority','runId','releaseScopeId','harnessCommit','policyDigest','identity','harnessSourceDigest','harnessDependencyDigest','browserDigest'];
const commonFields = ['schemaVersion','kind','runId','invocationId','ordinal','sequence'];
const rawFields = ['readbacks','framework','host','fixture','registry','denial','lifecycle'];
const terminal = code => ({ started: true, observed: true, forced: false, cancelled: false, code, signal: null });

// This protocol binds parent-held records; it cannot promote them or replay fault-domain semantics.
function readPrefix(directory, expected, captureIndex = EVENT_SERIAL_V3_FAULTS.length, retiredOrdinal) {
  assert(path.isAbsolute(directory) && path.normalize(directory) === directory && fs.realpathSync(directory) === directory, 'EVENT_SERIAL_V3_ROOT_ALIAS');
  fields(expected, ['schemaVersion','baselineExpected','artifactIdentity','input','baseline','faults'], 'EXPECTED_FIELDS');
  same(expected.schemaVersion, 3, 'SCHEMA');
  fields(expected.baselineExpected, baselineFields, 'BASELINE_EXPECTED_FIELDS');
  const pins = expected.baselineExpected, runId = pins.runId;
  same(pins.releaseScopeId, EVENT_CAPABILITY_SCOPE, 'SCOPE');
  fields(expected.baseline, ['completion','retirement'], 'BASELINE_FIELDS');
  same(expected.faults?.map(row => row.invocationId), EVENT_SERIAL_V3_FAULTS, 'FIXED_ORDER');
  for (const row of expected.faults) fields(row, ['invocationId','capture','ack','proof','completion','retirement'], 'FAULT_FIELDS');
  const read = (reference, relative, json = true) => {
    fields(reference, ['path','digest'], 'REFERENCE');
    same(reference.path, relative, 'REFERENCE_PATH');
    assert(digest(reference.digest) && typeof relative === 'string' && relative.split('/').every(part => /^[a-z0-9][a-z0-9.-]*$/i.test(part) && part !== '..'), 'EVENT_SERIAL_V3_REFERENCE');
    const file = path.join(directory, relative);
    assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, 'EVENT_SERIAL_V3_FILE_ALIAS');
    const bytes = fs.readFileSync(file);
    same(digestBytes(bytes), reference.digest, 'RAW_DIGEST');
    if (!json) return bytes;
    try { return JSON.parse(bytes); } catch { fail('JSON'); }
  };
  const input = read(expected.input, 'input.json');
  for (const key of ['runId','releaseScopeId','harnessCommit','harnessSourceDigest']) same(input[key], pins[key], 'INPUT_PINS');
  same(input.artifact?.identity, expected.artifactIdentity, 'ARTIFACT_IDENTITY');
  for (const key of ['webappCommit','artifactDigest','dependencyLockDigest','toolkitDigest','toolkitVersion'])
    same(expected.artifactIdentity?.[key], pins.identity?.[key], 'CANDIDATE_PINS');
  same(input.browserDigest, pins.browserDigest, 'BROWSER_PIN');
  same(input.harnessDependencies?.digest, pins.harnessDependencyDigest, 'DEPENDENCY_PIN');
  const checkpoint = readEventBaselineCheckpoint(directory, pins);
  assert(checkpoint.input.results.length === 11 && checkpoint.input.results.every(row => row.outcome === 'passed'), 'EVENT_SERIAL_V3_BASELINE_PROOFS');
  const record = (reference, id, kind, ordinal, sequence, extra) => {
    const value = read(reference, 'v3/' + id + '/' + (kind === 'proof-start' ? 'proof-start' : kind) + '.json');
    fields(value, [...commonFields, ...extra], 'RECORD_FIELDS');
    for (const [key, wanted] of Object.entries({ schemaVersion: 3, kind, runId, invocationId: id, ordinal, sequence })) same(value[key], wanted, 'RECORD_ORDER');
    return value;
  };
  const owners = new Set(), cids = new Set(), actors = new Set(), bearers = new Set(), tokens = new Set();
  const state = selected => {
    const ccd = selected.ccd, services = Object.keys(CCD_IMAGES).sort();
    same(Object.keys(ccd.containers).sort(), services, 'CCD_SERVICES');
    same(Object.keys(ccd.images).sort(), services, 'CCD_IMAGES');
    ccdRuntimeImageIds(ccd);
    assert(/^harness-[a-f0-9]{16}$/.test(ccd.owner) && !owners.has(ccd.owner), 'EVENT_SERIAL_V3_OWNER_REUSE'); owners.add(ccd.owner);
    same(ccd.namespace, ccd.containers.database, 'NAMESPACE');
    for (const id of Object.values(ccd.containers)) {
      assert(/^[a-f0-9]{64}$/.test(id) && !cids.has(id), 'EVENT_SERIAL_V3_CID_REUSE'); cids.add(id);
    }
    same(Object.keys(selected.credentials).sort(), ['allowed','courtadmin','judge','observer','readonly'], 'ACTORS');
    for (const actor of Object.values(selected.credentials)) {
      // Simulator subject IDs are local to the independently owned IDAM container.
      // Fresh provider CIDs are enforced above; bearer bytes remain globally distinct.
      const actorIdentity = ccd.containers.idam + ':' + actor.userId;
      assert(uuid(actor.userId) && !actors.has(actorIdentity), 'EVENT_SERIAL_V3_ACTOR_REUSE'); actors.add(actorIdentity);
      assert(/^Bearer \S+$/.test(actor.headers?.Authorization ?? '') && !bearers.has(actor.headers.Authorization), 'EVENT_SERIAL_V3_BEARER_REUSE'); bearers.add(actor.headers.Authorization);
    }
  };
  const complete = (reference, id, ordinal, sequence, selected, ack, proof) => {
    const value = record(reference, id, 'completion', ordinal, sequence, ['ack','proof','checkpointDigest',...rawFields,'seal']);
    same(value.ack, ack, 'COMPLETION_ACK'); same(value.proof, proof, 'COMPLETION_PROOF');
    same(value.checkpointDigest, ordinal ? null : checkpoint.checkpointDigest, 'BASELINE_CHECKPOINT');
    const raw = Object.fromEntries(rawFields.map(key => [key, read(value[key], id + '/' + ({ readbacks: 'v3-readbacks.json', framework: 'framework-terminal.json', host: 'v3-host-terminal.json', fixture: 'v3-fixture-terminal.json', registry: 'v3-owned-native.json', denial: 'candidate-write-denial.json', lifecycle: 'candidate-lifecycle.json' })[key])]));
    const seal = read(value.seal, id + '/v3-raw-seal.json');
    same(seal, { schemaVersion: 3, invocationId: id, files: rawFields.map(key => value[key]) }, 'RAW_SEAL');
    fields(raw.readbacks, ['schemaVersion','invocationId','files'], 'READBACK_FIELDS');
    same(raw.readbacks.schemaVersion, 3, 'READBACK_SCHEMA'); same(raw.readbacks.invocationId, id, 'READBACK_INVOCATION');
    assert(Array.isArray(raw.readbacks.files) && raw.readbacks.files.length > 0, 'EVENT_SERIAL_V3_READBACKS_REQUIRED');
    const paths = new Set();
    for (const item of raw.readbacks.files) {
      assert(item.path.startsWith(id + '/') && !paths.has(item.path), 'EVENT_SERIAL_V3_READBACK_PATH'); paths.add(item.path);
      read(item, item.path, false);
    }
    same(raw.framework, { code: ordinal ? 1 : 0, signal: null }, 'FRAMEWORK_TERMINAL');
    same(raw.host, terminal(ordinal ? 1 : 0), 'HOST_TERMINAL'); same(raw.fixture, terminal(0), 'FIXTURE_TERMINAL');
    assert(Array.isArray(raw.registry) && raw.registry.length === 2, 'EVENT_SERIAL_V3_NATIVE_INVENTORY');
    const resources = ['candidate','browser-provider'].map((service, index) => {
      const row = raw.registry.find(item => item.service === service);
      assert(row && /^[a-f0-9]{64}$/.test(row.id) && !cids.has(row.id), 'EVENT_SERIAL_V3_NATIVE_CID_REUSE'); cids.add(row.id);
      same(row.name, runId + '-' + id + (index ? '-tools' : '-candidate'), 'NATIVE_NAME');
      same(row.owner, runId, 'NATIVE_OWNER'); same(row.namespace, selected.ccd.namespace, 'NATIVE_NAMESPACE');
      same(row.image, index ? input.browserRuntimeImage : input.nativeRuntime.imageId, 'NATIVE_IMAGE');
      same(row.removed, true, 'NATIVE_REMOVAL');
      return { name: row.name, id: row.id };
    });
    // Keep the shared write-denial/requested-shutdown checks; do not invent a weaker done flag.
    let finalized;
    try { finalized = validateNativeInvocationFinalization(directory, { invocationId: id }); }
    catch { fail('NATIVE_FINALIZATION'); }
    same(finalized.denial.candidateId, resources[0].id, 'DENIAL_CID');
    for (const observed of [finalized.lifecycle.before, finalized.lifecycle.after]) {
      same(observed.Id, resources[0].id, 'LIFECYCLE_CID'); same(observed.Name, '/' + resources[0].name, 'LIFECYCLE_NAME');
    }
    return resources;
  };
  const retire = (reference, id, ordinal, sequence, selected, completion, native) => {
    const value = record(reference, id, 'retirement', ordinal, sequence, ['completion','creators','absence']);
    same(value.completion, completion, 'RETIREMENT_COMPLETION');
    const resources = [...Object.entries(selected.ccd.containers).map(([service, cid]) => ({ name: selected.ccd.owner + '-' + service, id: cid })), ...native];
    const created = read(value.creators, id + '/v3-creators.json');
    same(created, resources.map(item => ({ ...item, state: 'settled', terminal: terminal(0) })), 'CREATORS_SETTLED');
    const missing = { code: 1, signal: null, classification: 'no-such-container' };
    same(read(value.absence, id + '/v3-absence.json'), resources.map(item => ({ ...item, byId: missing, byName: missing })), 'PARENT_ABSENCE');
  };
  state(input);
  const baselineNative = complete(expected.baseline.completion, 'baseline', 0, 0, input, null, null);
  retire(expected.baseline.retirement, 'baseline', 0, 1, input, expected.baseline.completion, baselineNative);
  if (retiredOrdinal === 0) return retiredPrefixResult(0);
  let previousRetirement = expected.baseline.retirement;
  for (const [index, refs] of expected.faults.entries()) {
    const id = refs.invocationId, ordinal = index + 1;
    const capture = record(refs.capture, id, 'capture', ordinal, 2 + index * 5, ['pins','previousRetirement','runtimeRecord','token']);
    same(capture.pins, pins, 'CAPTURE_PINS'); same(capture.previousRetirement, previousRetirement, 'CAPTURE_PRIOR_RETIREMENT');
    assert(uuid(capture.token) && !tokens.has(capture.token), 'EVENT_SERIAL_V3_TOKEN'); tokens.add(capture.token);
    let selected;
    try { selected = selectEventCapabilityRuntime(input, id, read(capture.runtimeRecord, id + '/runtime-input.json')); }
    catch { fail('RUNTIME_BINDING'); }
    state(selected);
    const ack = { schemaVersion: 3, kind: 'ack', runId, invocationId: id, ordinal, sequence: 3 + index * 5, capture: refs.capture, token: capture.token };
    same(digestBytes(JSON.stringify(ack)), refs.ack.digest, 'HELD_ACK_DIGEST');
    same(refs.ack.path, 'v3/' + id + '/ack.json', 'ACK_PATH');
    if (index === captureIndex) return { ack, reference: refs.ack };
    same(record(refs.ack, id, 'ack', ordinal, 3 + index * 5, ['capture','token']), ack, 'ACK_BINDING');
    const proof = record(refs.proof, id, 'proof-start', ordinal, 4 + index * 5, ['ack']); same(proof.ack, refs.ack, 'PROOF_ACK');
    const native = complete(refs.completion, id, ordinal, 5 + index * 5, selected, refs.ack, refs.proof);
    retire(refs.retirement, id, ordinal, 6 + index * 5, selected, refs.completion, native);
    previousRetirement = refs.retirement;
    if (retiredOrdinal === ordinal) return retiredPrefixResult(ordinal);
  }
  return { schemaVersion: 3, status: 'experimental-chain-bound', faults: EVENT_SERIAL_V3_FAULTS.length,
    experimental: true, nativeAuthority: false, sourceComplete: false, semanticReplay: false, nativeRuntimeAcceptance: false, runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false, releaseApproval: false, promotionAllowed: false };
}

function retiredPrefixResult(ordinal) {
  return { schemaVersion: 3, status: 'experimental-retired-prefix-bound', retiredOrdinal: ordinal, faults: ordinal,
    experimental: true, nativeAuthority: false, sourceComplete: false, semanticReplay: false, nativeRuntimeAcceptance: false, runtimeAcceptance: false, catalogueCredit: false, releaseCredit: false, releaseApproval: false, promotionAllowed: false };
}

// Future rows retain fixed identities but their references are unread placeholders.
// Return only after the same completion/retirement checks used by full replay.
export function readEventSerialV3RetiredPrefix(directory, expected, ordinal) {
  assert(Number.isInteger(ordinal) && ordinal >= 0 && ordinal <= EVENT_SERIAL_V3_FAULTS.length, 'EVENT_SERIAL_V3_ORDINAL');
  return readPrefix(directory, expected, EVENT_SERIAL_V3_FAULTS.length, ordinal);
}

export function readEventSerialV3Chain(directory, expected) { return readPrefix(directory, expected); }

export function publishEventSerialV3Ack(directory, expected, ordinal, { signal } = {}) {
  assert(!signal?.aborted, 'EVENT_SERIAL_V3_CANCELLED');
  assert(Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= EVENT_SERIAL_V3_FAULTS.length, 'EVENT_SERIAL_V3_ORDINAL');
  const { ack, reference } = readPrefix(directory, expected, ordinal - 1);
  const id = EVENT_SERIAL_V3_FAULTS[ordinal - 1];
  for (const stage of ['proof-start','completion','retirement'])
    assert(!fs.existsSync(path.join(directory, 'v3', id, stage + '.json')), 'EVENT_SERIAL_V3_LATE_ACK');
  const file = path.join(directory, reference.path), temporary = path.join(path.dirname(file), '.' + randomUUID() + '.json');
  try {
    fs.writeFileSync(temporary, JSON.stringify(ack), { flag: 'wx', mode: 0o600 });
    fs.linkSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
  return structuredClone(reference);
}
