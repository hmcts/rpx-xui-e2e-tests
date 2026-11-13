const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createEventTransitionFixture } = require('./exui-event-transition-evidence.mock.cjs');
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

exports.eventV3Fixture = async t => {
  const legacy = await createEventTransitionFixture(t);
  const { EVENT_SERIAL_V3_FAULTS } = await import('../lib/exui-ccd-event-transition-v3.mjs');
  const { eventCapabilityFaultVariant } = await import('../lib/exui-ccd-event-capability.mjs');
  const { eventCapabilityTransitionRequest } = await import('../lib/exui-ccd-event-transition.mjs');
  const { readEventBaselineCheckpoint } = await import('../lib/exui-native-proof-validation.mjs');
  const directory = legacy.directory, runId = legacy.input.runId;
  const put = (name, value) => {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
    return { path: name, digest: hash(fs.readFileSync(file)) };
  };
  const baselineExpected = Object.fromEntries(['nativeAuthority','runId','releaseScopeId','harnessCommit','policyDigest','identity','harnessSourceDigest','harnessDependencyDigest','browserDigest'].map(k => [k, legacy.expected[k]]));
  legacy.input.browserDigest = baselineExpected.browserDigest;
  legacy.input.harnessDependencies = { digest: baselineExpected.harnessDependencyDigest };
  const expected = { schemaVersion: 3, baselineExpected, artifactIdentity: structuredClone(legacy.input.artifact.identity), input: put('input.json', legacy.input), baseline: {}, faults: [] };
  const checkpoint = readEventBaselineCheckpoint(directory, baselineExpected);
  const base = (kind, id, ordinal, sequence) => ({ schemaVersion: 3, kind, runId, invocationId: id, ordinal, sequence });
  const terminal = code => ({ started: true, observed: true, forced: false, cancelled: false, code, signal: null });
  const cid = n => n.toString(16).padStart(64, '0');
  const completions = [];
  const complete = (id, ordinal, sequence, state, ack, proof) => {
    const candidate = { name: runId + '-' + id + '-candidate', id: cid(1000 + ordinal * 2), owner: runId, namespace: state.namespace, service: 'candidate', image: legacy.input.nativeRuntime.imageId, removed: true };
    const tools = { ...candidate, name: runId + '-' + id + '-tools', id: cid(1001 + ordinal * 2), service: 'browser-provider', image: legacy.input.browserRuntimeImage };
    const lifecycle = structuredClone(legacy.lifecycle);
    for (const x of [lifecycle.before, lifecycle.after]) { x.Id = candidate.id; x.Name = '/' + candidate.name; }
    const records = {
      readbacks: put(id + '/v3-readbacks.json', { schemaVersion: 3, invocationId: id, files: [put(id + '/v3-observation.json', { synthetic: true, stateDigest: hash(id + ':state'), historyDigest: hash(id + ':history') })] }),
      framework: put(id + '/framework-terminal.json', { code: ordinal ? 1 : 0, signal: null }),
      host: put(id + '/v3-host-terminal.json', terminal(ordinal ? 1 : 0)),
      fixture: put(id + '/v3-fixture-terminal.json', terminal(0)),
      registry: put(id + '/v3-owned-native.json', [candidate, tools]),
      denial: put(id + '/candidate-write-denial.json', { ...legacy.denial, candidateId: candidate.id }),
      lifecycle: put(id + '/candidate-lifecycle.json', lifecycle),
    };
    const seal = put(id + '/v3-raw-seal.json', { schemaVersion: 3, invocationId: id, files: Object.values(records) });
    const value = { ...base('completion', id, ordinal, sequence), ack, proof, checkpointDigest: ordinal ? null : checkpoint.checkpointDigest, ...records, seal };
    const reference = put('v3/' + id + '/completion.json', value);
    completions.push(value);
    return { reference, native: [candidate, tools] };
  };
  const retire = (id, ordinal, sequence, state, completion, native) => {
    const resources = [...Object.entries(state.containers).map(([service, id]) => ({ name: state.owner + '-' + service, id })), ...native.map(({ name, id }) => ({ name, id }))];
    const creators = put(id + '/v3-creators.json', resources.map(x => ({ ...x, state: 'settled', terminal: terminal(0) })));
    const missing = { code: 1, signal: null, classification: 'no-such-container' };
    const absence = put(id + '/v3-absence.json', resources.map(x => ({ ...x, byId: missing, byName: missing })));
    return put('v3/' + id + '/retirement.json', { ...base('retirement', id, ordinal, sequence), completion, creators, absence });
  };
  const baseline = complete('baseline', 0, 0, legacy.input.ccd, null, null);
  expected.baseline.completion = baseline.reference;
  expected.baseline.retirement = retire('baseline', 0, 1, legacy.input.ccd, baseline.reference, baseline.native);
  for (const [index, id] of EVENT_SERIAL_V3_FAULTS.entries()) {
    const ordinal = index + 1, variant = legacy.variants[eventCapabilityFaultVariant(id)];
    const credentials = structuredClone(legacy.input.credentials);
    for (const [n, actor] of Object.values(credentials).entries()) {
      actor.userId = (ordinal * 10 + n + 100).toString(16).padStart(8, '0') + '-1111-4111-8111-111111111111';
      actor.headers.Authorization = 'Bearer synthetic-v3-' + ordinal + '-' + n;
    }
    const runtimeRecord = put(id + '/runtime-input.json', { schemaVersion: 1, runId, invocationId: id, requestDigest: hash(JSON.stringify(eventCapabilityTransitionRequest(legacy.input))), ccd: variant.state, definition: variant.imported, definitionImportDigest: variant.importedRef.digest, credentials, apiContracts: legacy.input.apiContracts });
    const previousRetirement = index ? expected.faults[index - 1].retirement : expected.baseline.retirement;
    const token = ordinal.toString(16).padStart(8, '0') + '-1111-4111-8111-111111111111';
    const capture = put('v3/' + id + '/capture.json', { ...base('capture', id, ordinal, 2 + index * 5), pins: baselineExpected, previousRetirement, runtimeRecord, token });
    const ack = put('v3/' + id + '/ack.json', { ...base('ack', id, ordinal, 3 + index * 5), capture, token });
    const proof = put('v3/' + id + '/proof-start.json', { ...base('proof-start', id, ordinal, 4 + index * 5), ack });
    const completion = complete(id, ordinal, 5 + index * 5, variant.state, ack, proof);
    const retirement = retire(id, ordinal, 6 + index * 5, variant.state, completion.reference, completion.native);
    expected.faults.push({ invocationId: id, capture, ack, proof, completion: completion.reference, retirement });
  }
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name)));
  const rechain = from => {
    for (let index = from; index < expected.faults.length; index++) {
      const entry = expected.faults[index], capture = read(entry.capture.path);
      if (index > from) capture.previousRetirement = expected.faults[index - 1].retirement;
      entry.capture = put(entry.capture.path, capture);
      const ack = read(entry.ack.path); ack.capture = entry.capture; entry.ack = put(entry.ack.path, ack);
      const proof = read(entry.proof.path); proof.ack = entry.ack; entry.proof = put(entry.proof.path, proof);
      const completion = read(entry.completion.path); completion.ack = entry.ack; completion.proof = entry.proof;
      entry.completion = put(entry.completion.path, completion);
      const retirement = read(entry.retirement.path); retirement.completion = entry.completion;
      entry.retirement = put(entry.retirement.path, retirement);
    }
  };
  const rewriteRuntime = (index, change) => {
    const entry = expected.faults[index], capture = read(entry.capture.path), runtime = read(capture.runtimeRecord.path);
    change(runtime); capture.runtimeRecord = put(capture.runtimeRecord.path, runtime);
    entry.capture = put(entry.capture.path, capture); rechain(index);
  };
  const rewriteRaw = (index, key, change) => {
    const entry = expected.faults[index], completion = read(entry.completion.path), value = read(completion[key].path);
    change(value); completion[key] = put(completion[key].path, value);
    completion.seal = put(completion.seal.path, { schemaVersion: 3, invocationId: entry.invocationId,
      files: ['readbacks','framework','host','fixture','registry','denial','lifecycle'].map(k => completion[k]) });
    entry.completion = put(entry.completion.path, completion); rechain(index);
  };
  const rewriteRetirementRaw = (index, key, change) => {
    const entry = expected.faults[index], retirement = read(entry.retirement.path), value = read(retirement[key].path);
    change(value); retirement[key] = put(retirement[key].path, value);
    entry.retirement = put(entry.retirement.path, retirement);
    if (index + 1 < expected.faults.length) {
      const next = expected.faults[index + 1], capture = read(next.capture.path);
      capture.previousRetirement = entry.retirement; next.capture = put(next.capture.path, capture); rechain(index + 1);
    }
  };
  return { directory, expected, put, read, completions, rewriteRuntime, rewriteRaw, rewriteRetirementRaw };
};
