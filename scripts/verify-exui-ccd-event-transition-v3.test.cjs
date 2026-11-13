const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { eventV3Fixture } = require('./fixtures/exui-event-v3.mock.cjs');
const load = () => import(process.env.EVENT_V3_TEST_MODULE || './lib/exui-ccd-event-transition-v3.mjs');

test('v3 finite parent chain binds all eleven faults and never claims semantic replay or promotion', async t => {
  const m = await load(), f = await eventV3Fixture(t), before = JSON.stringify(f.expected);
  const result = m.readEventSerialV3Chain(f.directory, f.expected);
  assert.equal(result.status, 'experimental-chain-bound');
  assert.equal(result.faults, 11);
  assert.equal(result.experimental, true);
  for (const key of ['semanticReplay','nativeAuthority','sourceComplete','nativeRuntimeAcceptance','runtimeAcceptance','catalogueCredit','releaseCredit','releaseApproval','promotionAllowed']) assert.equal(result[key], false);
  assert.equal(JSON.stringify(f.expected), before);
  assert(!JSON.stringify(result).includes('Bearer'));
});

test('v3 rejects changed selection, order, pins and a schema2 envelope', async t => {
  const m = await load(), f = await eventV3Fixture(t);
  for (const change of [e => e.schemaVersion = 2, e => e.faults.pop(), e => e.faults.reverse(), e => e.faults[1] = e.faults[0], e => e.baselineExpected.harnessSourceDigest = 'sha256:' + '0'.repeat(64)]) {
    const expected = structuredClone(f.expected); change(expected);
    assert.throws(() => m.readEventSerialV3Chain(f.directory, expected));
  }
});

test('retirement pins exact current completion even when a child reseals its final record', async t => {
  const m = await load(), f = await eventV3Fixture(t), entry = f.expected.faults.at(-1);
  const retirement = f.read(entry.retirement.path);
  retirement.completion = { ...entry.completion, digest: 'sha256:' + '0'.repeat(64) };
  entry.retirement = f.put(entry.retirement.path, retirement);
  assert.throws(() => m.readEventSerialV3Chain(f.directory, f.expected), /RETIREMENT_COMPLETION/);
});

test('ACK publication waits for prior retirement and capture, is exclusive, and refuses cancellation', async t => {
  const m = await load(), f = await eventV3Fixture(t), entry = f.expected.faults[1];
  fs.unlinkSync(path.join(f.directory, entry.ack.path));
  const retired = path.join(f.directory, f.expected.faults[0].retirement.path);
  const bytes = fs.readFileSync(retired); fs.unlinkSync(retired);
  assert.throws(() => m.publishEventSerialV3Ack(f.directory, f.expected, 2));
  assert(!fs.existsSync(path.join(f.directory, entry.ack.path)));
  fs.writeFileSync(retired, bytes);
  const signal = AbortSignal.abort();
  assert.throws(() => m.publishEventSerialV3Ack(f.directory, f.expected, 2, { signal }), /CANCELLED/);
  // Simulate the real pre-proof boundary; future proof/completion files do not yet exist.
  for (const stage of ['proof','completion','retirement']) fs.unlinkSync(path.join(f.directory, entry[stage].path));
  const published = m.publishEventSerialV3Ack(f.directory, f.expected, 2);
  assert.deepEqual(published, entry.ack);
  assert.throws(() => m.publishEventSerialV3Ack(f.directory, f.expected, 2), /EEXIST/);
});

test('late or foreign ACK, early proof and cancelled/forced/unknown terminals cannot complete', async t => {
  const m = await load();
  for (const [stage, mutate] of [
    ['ack', x => x.token = 'foreign'], ['ack', x => x.sequence++], ['proof', x => x.sequence = 0],
    ['completion', x => x.ack.digest = 'sha256:' + '0'.repeat(64)],
  ]) {
    const f = await eventV3Fixture(t), entry = f.expected.faults.at(-1), value = f.read(entry[stage].path);
    mutate(value); entry[stage] = f.put(entry[stage].path, value);
    assert.throws(() => m.readEventSerialV3Chain(f.directory, f.expected));
  }
  for (const mutate of [x => x.cancelled = true, x => x.forced = true, x => x.observed = false, x => x.code = null]) {
    const f = await eventV3Fixture(t);
    f.rewriteRaw(10, 'host', mutate);
    assert.throws(() => m.readEventSerialV3Chain(f.directory, f.expected), /HOST_TERMINAL/);
  }
});

test('raw readback/seal tampering, alias paths and absent retirement never become a chain', async t => {
  const m = await load();
  for (const fault of ['readback','seal','alias','retirement']) {
    const f = await eventV3Fixture(t), entry = f.expected.faults.at(-1), completion = f.read(entry.completion.path);
    if (fault === 'readback') f.put(entry.invocationId + '/v3-observation.json', { done: true });
    if (fault === 'seal') f.put(completion.seal.path, { done: true });
    if (fault === 'retirement') fs.unlinkSync(path.join(f.directory, entry.retirement.path));
    if (fault === 'alias') { const target = path.join(f.directory, entry.capture.path); fs.renameSync(target, target + '.other'); fs.symlinkSync(target + '.other', target); }
    assert.throws(() => m.readEventSerialV3Chain(f.directory, f.expected));
  }
});

test('v3 rejects reused CCD owners, provider CIDs, within-provider actors, bearers and pending creation', async t => {
  const m = await load();
  for (const fault of ['owner','cid','idam','actor','bearer','pending']) {
    const f = await eventV3Fixture(t);
    if (fault === 'pending') {
      f.rewriteRetirementRaw(10, 'creators', creators => { creators[0].state = 'pending'; });
    } else {
      const previous = f.read(f.read(f.expected.faults[0].capture.path).runtimeRecord.path);
      f.rewriteRuntime(10, runtime => {
        if (fault === 'owner') runtime.ccd.owner = previous.ccd.owner;
        if (fault === 'cid') runtime.ccd.containers.data = previous.ccd.containers.data;
        if (fault === 'idam') runtime.ccd.containers.idam = previous.ccd.containers.idam;
        if (fault === 'actor') runtime.credentials.judge.userId = runtime.credentials.readonly.userId;
        if (fault === 'bearer') runtime.credentials.judge.headers.Authorization = previous.credentials.judge.headers.Authorization;
      });
    }
    assert.throws(() => m.readEventSerialV3Chain(f.directory, f.expected), new RegExp({ owner: 'OWNER_REUSE', cid: 'CID_REUSE', idam: 'CID_REUSE', actor: 'RUNTIME_BINDING', bearer: 'BEARER_REUSE', pending: 'CREATORS_SETTLED' }[fault]));
  }
});


test('ACK cannot be backfilled after a proof-start record exists', async t => {
  const m = await load(), f = await eventV3Fixture(t), entry = f.expected.faults[0];
  fs.unlinkSync(path.join(f.directory, entry.ack.path));
  assert.throws(() => m.publishEventSerialV3Ack(f.directory, f.expected, 1), /LATE_ACK/);
  assert(!fs.existsSync(path.join(f.directory, entry.ack.path)));
});


test('parent candidate/browser/dependency pins cannot be replaced by coherently resealed input', async t => {
  const m = await load();
  for (const key of ['candidate','browser','dependencies']) {
    const f = await eventV3Fixture(t), input = f.read('input.json');
    if (key === 'candidate') input.artifact.identity.artifactDigest = 'sha256:' + '0'.repeat(64);
    if (key === 'browser') input.browserDigest = 'sha256:' + '0'.repeat(64);
    if (key === 'dependencies') input.harnessDependencies.digest = 'sha256:' + '0'.repeat(64);
    f.expected.input = f.put('input.json', input);
    assert.throws(() => m.readEventSerialV3Chain(f.directory, f.expected), /ARTIFACT_IDENTITY|BROWSER_PIN|DEPENDENCY_PIN/);
  }
});


test('malformed parent-pinned JSON fails with a fixed code, without retaining raw private text', async t => {
  const m = await load(), f = await eventV3Fixture(t);
  const bytes = '{"private":"PRIVATE-V3-CANARY","unfinished":';
  fs.writeFileSync(path.join(f.directory, 'input.json'), bytes);
  f.expected.input.digest = 'sha256:' + require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  assert.throws(() => m.readEventSerialV3Chain(f.directory, f.expected), error => error.message === 'EVENT_SERIAL_V3_JSON' && !error.message.includes('PRIVATE-V3-CANARY'));
});

test('unknown prior creation blocks the next ACK even with a coherently resealed retirement', async t => {
  const m = await load(), f = await eventV3Fixture(t), entry = f.expected.faults[1];
  f.rewriteRetirementRaw(0, 'creators', rows => { rows[0].state = 'unknown'; rows[0].terminal.code = null; });
  fs.unlinkSync(path.join(f.directory, entry.ack.path));
  assert.throws(() => m.publishEventSerialV3Ack(f.directory, f.expected, 2), /CREATORS_SETTLED/);
  assert(!fs.existsSync(path.join(f.directory, entry.ack.path)));
});


test('retired prefix stops only after selected validated retirement and ignores unread future placeholders', async t => {
  const m = await load();
  for (const ordinal of Array.from({length:12},(_,index)=>index)) {
    const f = await eventV3Fixture(t), held = structuredClone(f.expected);
    for (const row of held.faults.slice(ordinal))
      for (const key of ['capture','ack','proof','completion','retirement']) {
        fs.unlinkSync(path.join(f.directory,row[key].path)); row[key] = null;
      }
    const result = m.readEventSerialV3RetiredPrefix(f.directory,held,ordinal);
    assert.equal(result.status,'experimental-retired-prefix-bound');
    assert.equal(result.retiredOrdinal,ordinal);
    assert.equal(result.faults,ordinal);
    for (const key of ['semanticReplay','nativeAuthority','sourceComplete','nativeRuntimeAcceptance','runtimeAcceptance','catalogueCredit','releaseCredit','releaseApproval','promotionAllowed']) assert.equal(result[key],false);
    if (ordinal < 11) assert.throws(()=>m.readEventSerialV3Chain(f.directory,held));
    const reference = ordinal ? held.faults[ordinal-1].retirement : held.baseline.retirement;
    fs.unlinkSync(path.join(f.directory,reference.path));
    assert.throws(()=>m.readEventSerialV3RetiredPrefix(f.directory,held,ordinal));
  }
});

test('retired prefix retains terminal, creator, identity and finite-order checks', async t => {
  const m=await load();
  for (const fault of ['terminal','creator','order','identity']) {
    const f=await eventV3Fixture(t);
    if(fault==='terminal') f.rewriteRaw(0,'host',x=>{x.forced=true;});
    if(fault==='creator') f.rewriteRetirementRaw(0,'creators',x=>{x[0].state='pending';});
    if(fault==='order') f.expected.faults.reverse();
    if(fault==='identity') f.expected.baselineExpected.harnessSourceDigest='sha256:'+'0'.repeat(64);
    assert.throws(()=>m.readEventSerialV3RetiredPrefix(f.directory,f.expected,1));
  }
  const f=await eventV3Fixture(t);
  for(const ordinal of [-1,12,0.5,null,undefined]) assert.throws(()=>m.readEventSerialV3RetiredPrefix(f.directory,f.expected,ordinal),/ORDINAL/);
});

test('fixed simulator actors may repeat only across independently owned fresh identity-provider namespaces', async t => {
  const m = await load(), f = await eventV3Fixture(t), input=f.read('input.json');
  for(let index=0;index<f.expected.faults.length;index++)f.rewriteRuntime(index,runtime=>{
    for(const persona of Object.keys(input.credentials))runtime.credentials[persona].userId=input.credentials[persona].userId;
  });
  const result=m.readEventSerialV3Chain(f.directory,f.expected);
  assert.equal(result.status,'experimental-chain-bound');assert.equal(result.runtimeAcceptance,false);
});
