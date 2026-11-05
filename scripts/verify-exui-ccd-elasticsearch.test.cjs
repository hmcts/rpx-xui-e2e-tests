const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runtime = import('./lib/exui-ccd-runtime.mjs');

test('optional Elasticsearch pins preserve seven-service defaults and reject foreign image identity', async () => {
  const api = await runtime;
  for (const platform of ['linux/arm64', 'linux/amd64']) {
    assert.equal(Object.keys(api.ccdImagePins(platform)).length, 7);
    const pins = api.ccdImagePins(platform, { elasticsearch: true });
    assert.equal(Object.keys(pins).length, 8);
    const pin = pins.elasticsearch;
    const info = { Id: pin.configDigest, Os: 'linux', Architecture: platform.split('/')[1], RepoDigests: [pin.reference] };
    api.assertCcdImageIdentity(info, pin, platform);
    for (const patch of [{ Id: 'sha256:' + 'f'.repeat(64) }, { Architecture: 's390x' }, { Os: 'windows' }, { RepoDigests: [] }])
      assert.throws(() => api.assertCcdImageIdentity({ ...info, ...patch }, pin, platform), /CCD_IMAGE_IDENTITY_MISMATCH/);
  }
  assert.throws(() => api.ccdImagePins('linux/arm64', { elasticsearch: 'true' }), /CCD_ELASTICSEARCH_SELECTION_REQUIRED/);
});

async function fixture(t, platform = 'linux/arm64') {
  const api = await runtime;
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ccd-es-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'runtime');
  const calls = [], pins = api.ccdImagePins(platform, { elasticsearch: true });
  const infos = new Map();
  let created = 0;
  const runDocker = (args) => {
    calls.push(args);
    if (args[0] === 'image') {
      const pin = Object.values(pins).find((p) => p.reference === args[2]);
      assert(pin, 'unexpected image');
      return JSON.stringify([{ Id: pin.configDigest ?? pin.manifestDigest, Os: 'linux', Architecture: platform.split('/')[1], RepoDigests: [pin.reference.includes('@') ? pin.reference : 'fixture@' + pin.manifestDigest] }]);
    }
    if (args[0] === 'create') {
      const id = String(++created).repeat(64);
      const service = args.find((a) => a.startsWith('exui.harness.service=')).split('=')[1];
      const owner = args.find((a) => a.startsWith('exui.harness.owner=')).split('=')[1];
      const pin = pins[service];
      const info = { Id: id, Name: `/${owner}-${service}`, Image: pin.configDigest ?? pin.manifestDigest, Config: { User: args.includes('--user') ? args[args.indexOf('--user') + 1] : '', Labels: { 'exui.harness.owner': owner, 'exui.harness.service': service } }, HostConfig: { NetworkMode: args[args.indexOf('--network') + 1], Binds: [], PortBindings: {} }, Mounts: [], State: { Running: true } };
      infos.set(id, info);
      return id;
    }
    if (args[0] === 'inspect') return JSON.stringify([infos.get(args[1])]);
    if (args[0] === 'rm') {
      if (infos.get(args.at(-1)).Config.Labels['exui.harness.service'] === 'database')
        assert.equal(infos.size, 1, 'network namespace removed before its sidecars');
      infos.delete(args.at(-1)); return '';
    }
    if (args[0] === 'exec' && args.includes('node')) return '[]';
    if (args[0] === 'start' || args[0] === 'exec') return '';
    assert.fail('unexpected Docker action ' + args[0]);
  };
  const requests = [];
  const request = (state, port, route) => {
    requests.push({ port, route });
    return { status: 200, body: port === 9200 ? { cluster_name: state.owner, status: 'yellow', timed_out: false, number_of_nodes: 1 } : {} };
  };
  return { api, output, calls, infos, runDocker, request, requests, platform };
}

test('opt-in lifecycle waits for owned ES, configures CCD and removes its container before the namespace', async (t) => {
  for (const platform of ['linux/arm64', 'linux/amd64']) {
    const f = await fixture(t, platform);
    const state = await f.api.startCcdRuntime(f.output, { platform, elasticsearch: true, runDocker: f.runDocker, request: f.request });
    assert.equal(state.ready, true);
    assert.equal(state.elasticsearch, true);
    assert.equal(Object.keys(state.containers).length, 8);
    const creates = f.calls.filter((a) => a[0] === 'create');
    const service = (name) => creates.find((a) => a.includes('exui.harness.service=' + name));
    const es = service('elasticsearch');
    assert(es.includes('container:' + state.namespace));
    assert(es.includes('--cap-drop') && es.includes('ALL'));
    assert(es.includes('--tmpfs') && es.includes('/usr/share/elasticsearch/data:rw,nosuid,size=512m,uid=1000,gid=0,mode=0700'));
    assert(!es.includes('-p') && !es.includes('--volume'));
    for (const value of ['network.host=127.0.0.1', 'discovery.type=single-node', 'xpack.security.enabled=false']) assert(es.includes(value));
    for (const value of ['ELASTIC_SEARCH_ENABLED=true', 'ELASTIC_SEARCH_HOST=127.0.0.1', 'ELASTIC_SEARCH_FAIL_ON_IMPORT=true']) assert(service('definition').includes(value));
    for (const value of ['ELASTIC_SEARCH_ENABLED=true', 'ELASTIC_SEARCH_HOSTS=127.0.0.1:9200', 'ELASTIC_SEARCH_DATA_NODES_HOSTS=http://127.0.0.1:9200']) assert(service('data').includes(value));
    assert.equal(f.requests[0].port, 9200);
    f.api.verifyCcdContainerIdentity(state, (id) => f.infos.get(id));
    const recovery = JSON.parse(fs.readFileSync(path.join(f.output, 'recovery.json')));
    assert.equal(recovery.elasticsearch, true);
    assert.equal(recovery.resources.elasticsearch.image, state.images.elasticsearch.id);
    f.api.stopCcdRuntime(state, { runDocker: f.runDocker });
    assert.equal(state.ready, false);
    const removed = f.calls.filter((a) => a[0] === 'rm').map((a) => a.at(-1));
    assert(removed.indexOf(state.containers.elasticsearch) < removed.indexOf(state.namespace));
    assert.equal(f.infos.size, 0);
  }
});

test('default lifecycle never starts or probes ES and retains disabled CCD search settings', async (t) => {
  const f = await fixture(t);
  const state = await f.api.startCcdRuntime(f.output, { runDocker: f.runDocker, request: f.request });
  assert.equal(Object.keys(state.containers).length, 7);
  assert.equal(state.elasticsearch, undefined);
  assert.equal(f.requests.some((r) => r.port === 9200), false);
  for (const name of ['data', 'definition'])
    assert(f.calls.find((a) => a[0] === 'create' && a.includes('exui.harness.service=' + name)).includes('ELASTIC_SEARCH_ENABLED=false'));
});

test('unhealthy or foreign ES must become ready before CCD startup', async (t) => {
  for (const bad of [{ status: 'red' }, { timed_out: true }, { cluster_name: 'foreign' }, { number_of_nodes: 2 }]) {
    const f = await fixture(t);
    let esChecks = 0;
    const request = (state, port, route) => {
      const response = f.request(state, port, route);
      if (port === 9200 && ++esChecks === 1) return { ...response, body: { ...response.body, ...bad } };
      return response;
    };
    const runDocker = (args) => {
      if (args[0] === 'create' && args.includes('exui.harness.service=definition')) assert.equal(esChecks, 2);
      return f.runDocker(args);
    };
    const state = await f.api.startCcdRuntime(f.output, { elasticsearch: true, runDocker, request });
    assert.equal(state.ready, true);
    assert.equal(esChecks, 2);
  }
});

test('cancellation during ES readiness leaves a recoverable partial runtime', async (t) => {
  const f = await fixture(t);
  let cancelled = false;
  await assert.rejects(f.api.startCcdRuntime(f.output, {
    elasticsearch: true, runDocker: f.runDocker, isCancelled: () => cancelled,
    request: () => { cancelled = true; return { status: 503, body: {} }; },
  }), /CCD_START_CANCELLED/);
  const state = JSON.parse(fs.readFileSync(path.join(f.output, 'runtime.json')));
  assert.equal(state.ready, false);
  assert(state.containers.elasticsearch);
  assert.equal(state.containers.definition, undefined);
  assert.equal(state.containers.data, undefined);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.output, 'recovery.json'))).elasticsearch, true);
});

test('reuse rejects omitted, relabelled or network-exposed ES before service traffic', async (t) => {
  const f = await fixture(t);
  const state = await f.api.startCcdRuntime(f.output, { elasticsearch: true, runDocker: f.runDocker, request: f.request });
  assert.throws(() => f.api.loadCcdRuntimeForReuse(f.output, () => assert.fail('incompatible mode inspected'), { elasticsearch: false }), /CCD_RUNTIME_ELASTICSEARCH_MISMATCH/);
  assert.throws(() => f.api.verifyCcdContainerIdentity({ ...state, elasticsearch: false }, (id) => f.infos.get(id)), /SERVICE_INVENTORY/);
  for (const mutate of [
    (info) => { info.Image = 'sha256:' + 'f'.repeat(64); },
    (info) => { info.Config.Labels['exui.harness.owner'] = 'foreign'; },
    (info) => { info.HostConfig.NetworkMode = 'host'; },
    (info) => { info.HostConfig.PortBindings = { '9200/tcp': [{ HostPort: '9200' }] }; },
  ]) {
    assert.throws(() => f.api.loadCcdRuntimeForReuse(f.output, (id) => {
      const info = structuredClone(f.infos.get(id));
      if (id === state.containers.elasticsearch) mutate(info);
      return info;
    }), /CCD_RUNTIME_/);
  }
});

test('recovery refuses mismatched ES selection and undeclared services before inspecting containers', async (t) => {
  const { cleanupCiCcd } = await import('./lib/exui-candidate-ci-process.mjs');
  const f = await fixture(t);
  const state = await f.api.startCcdRuntime(f.output, { elasticsearch: true, runDocker: f.runDocker, request: f.request });
  const statePath = path.join(f.output, 'runtime.json'), recoveryPath = path.join(f.output, 'recovery.json');
  const recovery = JSON.parse(fs.readFileSync(recoveryPath));
  const noInspect = { inspect: () => assert.fail('invalid recovery inspected'), stop: () => assert.fail('invalid recovery removed') };
  fs.writeFileSync(statePath, JSON.stringify({ ...state, elasticsearch: false }));
  assert.throws(() => cleanupCiCcd(f.output, noInspect), /CI_CCD_RECOVERY_ELASTICSEARCH_MISMATCH/);
  fs.writeFileSync(statePath, JSON.stringify({ ...state, containers: { ...state.containers, undeclared: 'f'.repeat(64) } }));
  assert.throws(() => cleanupCiCcd(f.output, noInspect), /CI_CCD_RECORDED_SERVICE_MISMATCH/);
  fs.writeFileSync(statePath, JSON.stringify(state));
  fs.writeFileSync(recoveryPath, JSON.stringify({ ...recovery, resources: { ...recovery.resources, undeclared: {} } }));
  assert.throws(() => cleanupCiCcd(f.output, noInspect), /CI_CCD_RECOVERY_SERVICE_INVENTORY/);
});

test('recovery finds ES created before its CID was recorded and refuses foreign ownership', async (t) => {
  const { cleanupCiCcd } = await import('./lib/exui-candidate-ci-process.mjs');
  const f = await fixture(t);
  const state = await f.api.startCcdRuntime(f.output, { elasticsearch: true, runDocker: f.runDocker, request: f.request });
  const esId = state.containers.elasticsearch;
  delete state.containers.elasticsearch;
  fs.writeFileSync(path.join(f.output, 'runtime.json'), JSON.stringify(state));
  const inspect = (id) => f.infos.get(id) ?? [...f.infos.values()].find((info) => info.Name === '/' + id) ?? null;
  const es = f.infos.get(esId), owner = es.Config.Labels['exui.harness.owner'];
  es.Config.Labels['exui.harness.owner'] = 'foreign';
  assert.throws(() => cleanupCiCcd(f.output, { inspect, stop: () => assert.fail('foreign cleanup') }), /CI_CCD_CLEANUP_OWNER_MISMATCH/);
  es.Config.Labels['exui.harness.owner'] = owner;
  const result = cleanupCiCcd(f.output, { inspect, stop: (recovered) => f.api.stopCcdRuntime(recovered, { runDocker: f.runDocker }) });
  assert.equal(result.cleanupComplete, true);
  assert(result.checkedContainerIds.includes(esId));
  assert.equal(f.infos.size, 0);
});

test('ES removal failure is reported and preserves the namespace for cleanup retry', async (t) => {
  const f = await fixture(t);
  const state = await f.api.startCcdRuntime(f.output, { elasticsearch: true, runDocker: f.runDocker, request: f.request });
  assert.throws(() => f.api.stopCcdRuntime(state, { runDocker: (args) => {
    if (args[0] === 'rm' && args.at(-1) === state.containers.elasticsearch) throw Error('SIMULATED_ES_REMOVAL_FAILURE');
    return f.runDocker(args);
  } }), /SIMULATED_ES_REMOVAL_FAILURE/);
  assert(f.infos.has(state.namespace));
  assert(f.infos.has(state.containers.elasticsearch));
  assert.equal(state.stoppedAt, undefined);
});

test('ES HTTP access cannot be used by a default runtime', async () => {
  const { ccdRequest } = await runtime;
  for (const state of [{}, { elasticsearch: false }, { elasticsearch: 'true' }])
    assert.throws(() => ccdRequest(state, 9200, '/'), /INVALID_CCD_REQUEST_DESTINATION/);
});

test('default seven-service cleanup also keeps the namespace last when recovery reorders services', async (t) => {
  const f = await fixture(t);
  const state = await f.api.startCcdRuntime(f.output, { runDocker: f.runDocker, request: f.request });
  state.containers = Object.fromEntries(['data', 'definition', 'profile', 's2s', 'idam', 'database', 'client'].map((service) => [service, state.containers[service]]));
  f.api.stopCcdRuntime(state, { runDocker: f.runDocker });
  assert.equal(f.calls.filter((args) => args[0] === 'rm').at(-1).at(-1), state.namespace);
  assert.equal(f.infos.size, 0);
});

test('CLI cannot reuse a default runtime when Elasticsearch was explicitly requested', async (t) => {
  const f = await fixture(t);
  await f.api.startCcdRuntime(f.output, { runDocker: f.runDocker, request: f.request });
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'start-harness-ccd.mjs'), '--reuse', '--elasticsearch', '--output', f.output], { encoding: 'utf8', env: { PATH: '' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CCD_RUNTIME_ELASTICSEARCH_MISMATCH/);
});
