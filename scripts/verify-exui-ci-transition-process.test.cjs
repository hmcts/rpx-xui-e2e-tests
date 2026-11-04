const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const load = () => import("./lib/exui-candidate-ci-process.mjs");
const scope = "exui-ccd-event-capability-pilot";

function controlledChild(t, mode = "valid", releaseScopeId = scope) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ci-transition-"));
  const output = path.join(directory, "phase");
  const binding = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/ccd/event-capability/binding.json")));
  const input = {
    runId: "ccd-11111111-1111-4111-8111-111111111111",
    releaseScopeId,
    ccd: { fixtureSelection: "event-capability-baseline", namespace: "a".repeat(64), ready: true, definitionImported: true },
    definition: { fixtureDigest: binding.baseline.workbookDigest },
    definitionImportDigest: "sha256:" + "b".repeat(64),
  };
  const request = {
    schemaVersion: 2, runId: input.runId, releaseScopeId: scope,
    invocationIds: ["ccd-enable-judge-event", "ccd-remove-courtadmin-recipient-read", "ccd-remove-readonly-recipient-read", "ccd-enable-readonly-recipient-update", "ccd-remove-courtadmin-event-create"], baselineNamespace: input.ccd.namespace,
    baselineDefinitionImportDigest: input.definitionImportDigest,
  };
  const handoff = { mode: "native-separate-api", owner: input.runId };
  const expected = { runId: input.runId, independentlyCaptured: true };
  const script = path.join(directory, "child.cjs");
  fs.writeFileSync(path.join(directory, "fixture.json"), JSON.stringify({ input, handoff, request, mode }));
  fs.writeFileSync(script, `
const fs = require('node:fs'), path = require('node:path');
const output = process.argv[2], fixture = JSON.parse(fs.readFileSync(process.argv[3]));
const file = name => path.join(output, name);
const write = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value));
fs.mkdirSync(output);
setTimeout(() => process.exit(93), 1500);
if (fixture.mode === 'early') write('event-transition-request.json', fixture.request);
write('input.json', fixture.input); write('container-launch.json', fixture.handoff);
let sent = fixture.mode === 'early', rewritten = false, ackPolls = 0;
setInterval(() => {
  if (!fs.existsSync(file('independent-preexecution.json'))) return;
  if (fixture.mode === 'legacy') process.exit(23);
  if (!sent) {
    if (fixture.mode === 'foreign-request') fixture.request.runId = 'ccd-22222222-2222-4222-8222-222222222222';
    if (fixture.mode === 'alias') fs.symlinkSync(path.join(path.dirname(output), 'fixture.json'), file('event-transition-request.json'));
    else write('event-transition-request.json', fixture.request);
    sent = true;
  }
  if (fs.existsSync(file('callback-started'))) {
    if (fixture.mode === 'exit-during-callback') process.exit(0);
    if (!rewritten && ['rewrite', 'replace-identical', 'touch-identical', 'remove'].includes(fixture.mode)) {
      const target = file('event-transition-request.json');
      if (fixture.mode === 'rewrite') write('event-transition-request.json', { ...fixture.request, runId: 'changed' });
      else if (fixture.mode === 'replace-identical') {
        const before = fs.statSync(target); write('replacement.json', fixture.request);
        fs.utimesSync(file('replacement.json'), before.atime, before.mtime);
        fs.renameSync(file('replacement.json'), target);
      } else if (fixture.mode === 'touch-identical') {
        const before = fs.statSync(target); fs.utimesSync(target, before.atime, new Date(before.mtimeMs + 10000));
      } else fs.unlinkSync(target);
      rewritten = true; write('changed', true);
    }
  }
  if (fs.existsSync(file('ack.json')) && ++ackPolls === 5) process.exit(0);
}, 5);
`);
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    output, input, handoff, expected, request,
    child: () => child,
    options: {
      script, args: [output, path.join(directory, "fixture.json")], output,
      onChild: value => { child = value; },
      onPrepared: (actualInput, actualHandoff) => {
        assert.deepEqual(actualInput, input);
        assert.deepEqual(actualHandoff, handoff);
        return expected;
      },
    },
  };
}

test("support only: watcher handles a delayed fixed request once and preserves child terminal and initial expectations", async t => {
  const fixture = controlledChild(t);
  let prepared = 0, transitioned = 0;
  const result = await (await load()).executeCiProcess({
    ...fixture.options,
    onPrepared: (...args) => { prepared++; return fixture.options.onPrepared(...args); },
    onEventTransition: async (request, context) => {
      transitioned++;
      assert.deepEqual(request, fixture.request);
      assert.deepEqual(context.input, fixture.input);
      assert.deepEqual(context.handoff, fixture.handoff);
      assert.deepEqual(context.expected, fixture.expected);
      assert.equal(context.isTerminated(), false);
      fs.writeFileSync(path.join(fixture.output, "ack.json"), "{}");
    },
  });
  assert.equal(transitioned, 1);
  assert.equal(prepared, 1);
  assert.deepEqual(result, { terminal: { code: 0, signal: null }, expected: fixture.expected });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.output, "input.json"))), fixture.input);
});

for (const [mode, selectedScope, error] of [
  ["early", scope, /CI_EVENT_TRANSITION_BEFORE_PREPARATION/],
  ["valid", "exui-ccd-pilot", /CI_EVENT_TRANSITION_SCOPE/],
  ["foreign-request", scope, /EVENT_TRANSITION_REQUEST_MISMATCH/],
  ["alias", scope, /CI_EVENT_TRANSITION_REGULAR_FILE_REQUIRED/],
]) test(`support only: watcher rejects ${mode} request in ${selectedScope} before callback authority`, async t => {
  const fixture = controlledChild(t, mode, selectedScope);
  let called = false;
  await assert.rejects((await load()).executeCiProcess({
    ...fixture.options, onEventTransition: async () => { called = true; },
  }), error);
  assert.equal(called, false);
});

for (const mode of ["rewrite", "replace-identical", "touch-identical", "remove"])
  test(`support only: retained transition request cannot ${mode} while callback is awaited`, async t => {
    const fixture = controlledChild(t, mode);
    let called = 0;
    await assert.rejects((await load()).executeCiProcess({
      ...fixture.options,
      onEventTransition: async () => {
        called++;
        fs.writeFileSync(path.join(fixture.output, "callback-started"), "");
        while (!fs.existsSync(path.join(fixture.output, "changed")))
          await new Promise(resolve => setTimeout(resolve, 5));
      },
    }), /CI_EVENT_TRANSITION_REQUEST_CHANGED/);
    assert.equal(called, 1);
  });

test("support only: child termination during transition is observable and cannot produce an ACK", async t => {
  const fixture = controlledChild(t, "exit-during-callback");
  let called = false;
  await assert.rejects((await load()).executeCiProcess({
    ...fixture.options,
    onEventTransition: async (_request, { isTerminated }) => {
      called = true;
      const exited = once(fixture.child(), "exit");
      fs.writeFileSync(path.join(fixture.output, "callback-started"), "");
      await exited;
      assert.equal(isTerminated(), true);
      if (!isTerminated()) fs.writeFileSync(path.join(fixture.output, "ack.json"), "{}");
    },
  }), /CI_EVENT_TRANSITION_CHILD_TERMINATED/);
  assert.equal(called, true);
  assert.equal(fs.existsSync(path.join(fixture.output, "ack.json")), false);
});

test("support only: ordinary scopes retain preparation and observed exit without a transition callback", async t => {
  const fixture = controlledChild(t, "legacy", "exui-ccd-pilot");
  const result = await (await load()).executeCiProcess(fixture.options);
  assert.deepEqual(result, { terminal: { code: 23, signal: null }, expected: fixture.expected });
});

test("support only: CCD cleanup confirms every planned name and captured CID absent after stop", async t => {
  const { cleanupCiCcd } = await load();
  const { CCD_IMAGES } = await import("./lib/exui-ccd-runtime.mjs");
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ci-ccd-absence-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const owner = "harness-0123456789abcdef", id = "a".repeat(64), oldId = "b".repeat(64);
  const resources = Object.fromEntries(Object.entries(CCD_IMAGES).map(([service, image]) => [service, { name: `${owner}-${service}`, image }]));
  fs.writeFileSync(path.join(directory, "recovery.json"), JSON.stringify({ owner, output: directory, resources }));
  fs.writeFileSync(path.join(directory, "runtime.json"), JSON.stringify({ owner, output: directory, namespace: id, containers: { data: oldId } }));
  const info = { Id: id, Name: `/${owner}-database`, Image: CCD_IMAGES.database,
    Config: { Labels: { "exui.harness.owner": owner, "exui.harness.service": "database" } }, HostConfig: { NetworkMode: "none" } };
  for (const survivor of ["name", "cid", "recorded-cid", "none"]) {
    let stopped = false;
    const inspectedAfter = [];
    const options = {
      inspect: key => {
        if (!stopped) return key === resources.database.name || key === id ? info : null;
        inspectedAfter.push(key);
        return (survivor === "name" && key === resources.database.name) || (survivor === "cid" && key === id) || (survivor === "recorded-cid" && key === oldId) ? info : null;
      },
      stop: state => { assert.deepEqual(state.containers, { database: id }); stopped = true; },
    };
    if (survivor === "none") {
      const result = cleanupCiCcd(directory, options);
      assert.equal(result.cleanupComplete, true);
      assert.equal(result.owner, owner);
      assert.deepEqual(result.checkedNames, Object.values(resources).map(row => row.name));
      assert.deepEqual(result.checkedContainerIds, [id, oldId].sort());
      for (const key of [...result.checkedNames, id, oldId]) assert(inspectedAfter.includes(key));
    } else assert.throws(() => cleanupCiCcd(directory, options), /CI_CCD_REMOVAL_INCOMPLETE/);
  }
});
