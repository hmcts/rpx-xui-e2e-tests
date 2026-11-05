const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const hash = (value) =>
  "sha256:" + createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = (c) => "sha256:" + c.repeat(64);
const load = () => import("./lib/exui-ccd-event-transition.mjs");
const fixture = () => {
  const binding = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/ccd/event-capability/binding.json")));
  const credentials = Object.fromEntries(["allowed", "courtadmin", "judge", "observer", "readonly"].map((name, index) => [name, {
    userId: `${index + 1}1111111-1111-4111-8111-111111111111`,
    headers: { Authorization: `Bearer synthetic-${name}` },
    roles: ["caseworker", "caseworker-harness", `caseworker-privatelaw-${name}`],
  }]));
  const state = (id, variant) => ({
    ready: true, definitionImported: true, namespace: id.repeat(64),
    owner: "harness-" + id.repeat(16), fixtureSelection: "event-capability-" + variant,
    images: { data: { id: digest("d") }, definition: { id: digest("e") } },
  });
  const definition = (variant, id) => ({
    fixtureDigest: binding[variant].workbookDigest,
    observedDefinitionDigest: digest(id), definitionVersion: 1,
  });
  const input = {
    runId: "ccd-11111111-1111-4111-8111-111111111111",
    releaseScopeId: "exui-ccd-event-capability-pilot",
    ccd: state("1", "baseline"), definition: definition("baseline", "a"),
    definitionImportDigest: digest("b"), credentials,
    apiContracts: { data: digest("c"), definition: digest("d") },
    artifact: { sentinel: "immutable candidate" }, gatewayDigest: digest("e"),
  };
  return { input, state, definition, credentials };
};

test("support only: event fault runtime is a fresh namespace bound to the exact baseline and one definition variant", async () => {
  const { eventCapabilityTransitionRequest, selectEventCapabilityRuntime } = await load();
  const { input, state, definition, credentials } = fixture();
  const request = eventCapabilityTransitionRequest(input);
  const record = {
    schemaVersion: 1, runId: input.runId, invocationId: "ccd-enable-judge-event",
    requestDigest: hash(request), ccd: state("2", "mutant"),
    definition: definition("mutant", "f"), definitionImportDigest: digest("f"),
    credentials, apiContracts: input.apiContracts,
  };
  const actual = selectEventCapabilityRuntime(input, record.invocationId, record);
  assert.deepEqual(actual, { ...input, ccd: record.ccd, definition: record.definition,
    definitionImportDigest: record.definitionImportDigest, credentials });
  assert.deepEqual(input.ccd, state("1", "baseline"), "baseline input stays immutable");
  for (const mutate of [
    (r) => { r.runId = "ccd-22222222-2222-4222-8222-222222222222"; },
    (r) => { r.requestDigest = digest("0"); },
    (r) => { r.ccd.namespace = input.ccd.namespace; },
    (r) => { r.ccd.owner = input.ccd.owner; },
    (r) => { r.ccd.fixtureSelection = "event-capability-baseline"; },
    (r) => { r.definition.fixtureDigest = input.definition.fixtureDigest; },
    (r) => { r.definition.observedDefinitionDigest = input.definition.observedDefinitionDigest; },
    (r) => { r.apiContracts = { ...r.apiContracts, data: digest("0") }; },
    (r) => { r.ccd.images.data.id = digest("0"); },
    (r) => { r.ccd.ready = false; },
    (r) => { r.ccd.definitionImported = false; },
    (r) => { r.artifact = { sentinel: "swapped" }; },
    (r) => { delete r.credentials.judge; },
    (r) => { r.credentials.judge.userId = r.credentials.allowed.userId; },
    (r) => { r.credentials.judge.headers.Authorization = r.credentials.allowed.headers.Authorization; },
    (r) => { r.credentials.judge.roles.push("caseworker-harness-allowed"); },
  ]) {
    const altered = structuredClone(record); mutate(altered);
    assert.throws(() => selectEventCapabilityRuntime(input, record.invocationId, altered));
  }
  assert.throws(() => selectEventCapabilityRuntime(input, "baseline", record));
  assert.throws(() => eventCapabilityTransitionRequest({ ...input, releaseScopeId: "exui-ccd-pilot" }));
});

for (const [mutation, variant] of [["ccd-remove-courtadmin-recipient-read", "read-mutant"], ["ccd-remove-readonly-recipient-read", "readonly-read-mutant"], ["ccd-enable-readonly-recipient-update", "readonly-update-mutant"], ["ccd-remove-courtadmin-event-create", "courtadmin-update-mutant"]])
test("support only: source read fault binds its own workbook and cannot consume the judge fault: " + mutation, async (t) => {
  const { eventCapabilityTransitionRequest, selectEventCapabilityRuntime, publishEventCapabilityRuntime, waitForEventCapabilityRuntime } = await load();
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "event-read-ack-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { input, state, definition, credentials } = fixture();
  const record = {
    schemaVersion: 1, runId: input.runId, invocationId: mutation,
    requestDigest: hash(eventCapabilityTransitionRequest(input)), ccd: state("3", variant),
    definition: definition(variant, "f"), definitionImportDigest: digest("f"),
    credentials, apiContracts: input.apiContracts,
  };
  const actual = selectEventCapabilityRuntime(input, mutation, record);
  assert.equal(actual.definition.fixtureDigest, definition(variant, "f").fixtureDigest);
  for (const mutate of [
    (r) => { r.invocationId = "ccd-enable-judge-event"; },
    (r) => { r.ccd.fixtureSelection = "event-capability-mutant"; },
    (r) => { r.definition.fixtureDigest = definition("mutant", "f").fixtureDigest; },
    (r) => { r.ccd.fixtureSelection = "event-capability-mutant"; r.definition = definition("mutant", "f"); },
    (r) => { r.ccd.namespace = input.ccd.namespace; },
    (r) => { r.ccd.owner = input.ccd.owner; },
    (r) => { r.definitionImportDigest = input.definitionImportDigest; },
    (r) => { r.requestDigest = digest("0"); },
    (r) => { r.ccd.ready = false; },
    (r) => { r.credentials.courtadmin.roles.push("caseworker-harness-allowed"); },
    (r) => { r.credentials.readonly.roles.push("caseworker-harness-allowed"); },
  ]) {
    const changed = structuredClone(record); mutate(changed);
    assert.throws(() => selectEventCapabilityRuntime(input, mutation, changed));
  }
  assert.throws(() => selectEventCapabilityRuntime(input, "ccd-enable-judge-event", record));
  const published = publishEventCapabilityRuntime(root, record);
  assert.equal(published.path, `${mutation}/runtime-input.json`);
  assert.deepEqual(await waitForEventCapabilityRuntime(input, root, { invocationId: mutation }), actual);
  await assert.rejects(waitForEventCapabilityRuntime(input, root, { timeoutMs: 0 }), /EVENT_TRANSITION_ACK_TIMEOUT/);
  await assert.rejects(waitForEventCapabilityRuntime(input, root, { invocationId: mutation, isCancelled: () => true }), /EVENT_TRANSITION_CANCELLED/);
  assert.throws(() => publishEventCapabilityRuntime(root, record), /EEXIST/);
  for (const invocationId of ["../escape", "baseline", "unknown", "toString", "__proto__"]) {
    assert.throws(() => publishEventCapabilityRuntime(root, { ...record, invocationId }), /EVENT_TRANSITION_INVOCATION/);
    await assert.rejects(waitForEventCapabilityRuntime(input, root, { invocationId, timeoutMs: 0 }), /EVENT_TRANSITION_INVOCATION/);
    assert.throws(() => selectEventCapabilityRuntime(input, invocationId, { ...record, invocationId }), /EVENT_TRANSITION_INVOCATION/);
  }
  assert.deepEqual(fs.readdirSync(root), [mutation]);
});

test("support only: fault transition rejects changed, stale or partial handoffs", async () => {
  const { eventCapabilityTransitionRequest, validateEventCapabilityTransitionRequest } = await load();
  const { input } = fixture();
  const request = eventCapabilityTransitionRequest(input);
  assert.doesNotThrow(() => validateEventCapabilityTransitionRequest(input, request));
  for (const altered of [
    { ...request, runId: "stale" },
    { ...request, baselineNamespace: "2".repeat(64) },
    { ...request, baselineDefinitionImportDigest: digest("0") },
    { ...request, invocationId: "arbitrary" },
    { ...request, statePath: "/untrusted/runtime.json" },
    { schemaVersion: 1 },
  ]) assert.throws(() => validateEventCapabilityTransitionRequest(input, altered));
});

test("support only: runtime ACK is private, atomic, immutable and consumed only while the host remains active", async (t) => {
  const { eventCapabilityTransitionRequest, publishEventCapabilityRuntime, waitForEventCapabilityRuntime } = await load();
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "event-ack-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { input, state, definition, credentials } = fixture();
  const record = {
    schemaVersion: 1, runId: input.runId, invocationId: "ccd-enable-judge-event",
    requestDigest: hash(eventCapabilityTransitionRequest(input)), ccd: state("2", "mutant"),
    definition: definition("mutant", "f"), definitionImportDigest: digest("f"),
    credentials, apiContracts: input.apiContracts,
  };
  const pending = waitForEventCapabilityRuntime(input, root, { timeoutMs: 1000 });
  const ref = publishEventCapabilityRuntime(root, record);
  const actual = await pending;
  assert.equal(actual.ccd.namespace, record.ccd.namespace);
  assert.equal(ref.path, "ccd-enable-judge-event/runtime-input.json");
  const file = path.join(root, ref.path), bytes = fs.readFileSync(file);
  assert.equal(ref.digest, "sha256:" + createHash("sha256").update(bytes).digest("hex"));
  assert.equal(fs.statSync(file).mode & 0o077, 0);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o077, 0);
  assert.throws(() => publishEventCapabilityRuntime(root, { ...record, runId: "overwritten" }), /EEXIST/);
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["runtime-input.json"]);
  await assert.rejects(waitForEventCapabilityRuntime(input, root, { isCancelled: () => true }), /EVENT_TRANSITION_CANCELLED/);
  const empty = path.join(root, "empty"); fs.mkdirSync(empty);
  await assert.rejects(waitForEventCapabilityRuntime(input, empty, { timeoutMs: 0 }), /EVENT_TRANSITION_ACK_TIMEOUT/);
  await assert.rejects(waitForEventCapabilityRuntime(input, empty, { isCancelled: () => true }), /EVENT_TRANSITION_CANCELLED/);
  fs.symlinkSync(path.dirname(file), path.join(empty, "ccd-enable-judge-event"));
  await assert.rejects(waitForEventCapabilityRuntime(input, empty), /EVENT_TRANSITION_ACK_ALIAS/);
  assert.throws(() => publishEventCapabilityRuntime(empty, record), /EVENT_TRANSITION_ACK_ALIAS/);
  assert.deepEqual(fs.readFileSync(file), bytes);
});

test("support only: event scope has fixed eight-proof baseline and eight definition faults without granting source actors a Harness alias", async () => {
  const { nativeInvocations, seedAppCcdSessions } = await import("./lib/exui-native-contract.mjs");
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const scope = "exui-ccd-event-capability-pilot";
  assert.deepEqual(nativeInvocations(scope), [
    { invocationId: "baseline", kind: "baseline", mutation: null },
    { invocationId: "ccd-enable-judge-event", kind: "mutation", mutation: "ccd-enable-judge-event" },
    { invocationId: "ccd-remove-courtadmin-recipient-read", kind: "mutation", mutation: "ccd-remove-courtadmin-recipient-read" },
    { invocationId: "ccd-remove-readonly-recipient-read", kind: "mutation", mutation: "ccd-remove-readonly-recipient-read" },
    { invocationId: "ccd-enable-readonly-recipient-update", kind: "mutation", mutation: "ccd-enable-readonly-recipient-update" },
    { invocationId: "ccd-remove-courtadmin-event-create", kind: "mutation", mutation: "ccd-remove-courtadmin-event-create" },
    { invocationId:"ccd-shape-case-field-recipient-selector",kind:"mutation",mutation:"ccd-shape-case-field-recipient-selector" },
    { invocationId:"ccd-shape-required-delivery-radio",kind:"mutation",mutation:"ccd-shape-required-delivery-radio" },
    { invocationId:"ccd-shape-conditional-email-complex",kind:"mutation",mutation:"ccd-shape-conditional-email-complex" },
    { invocationId:"ccd-shape-optional-postal-line-two",kind:"mutation",mutation:"ccd-shape-optional-postal-line-two" },

  ]);
  const policy = getReleasePolicy(scope);
  assert.deepEqual(policy.obligations.flatMap((o) => o.requiredProofIds), ["ccd-courtadmin-update-recipient-shapes", "ccd-event-create-denied", "ccd-courtadmin-read-recipient-shapes", "ccd-readonly-read-recipient-shapes", "ccd-readonly-update-recipient-shapes-denied", "ccd-source-shape-case-field-recipient-selector", "ccd-source-shape-required-delivery-radio", "ccd-source-shape-conditional-email-complex", "ccd-source-shape-optional-postal-line-two"]);
  assert.equal(policy.mutationDefinitions[0].expectedFailureId, "event-capability-isolation");
  assert.equal(policy.mutationDefinitions[1].expectedFailureId, "courtadmin-recipient-read-projection");
  const credentials = { readonly: { roles: ["caseworker", "caseworker-harness", "caseworker-privatelaw-readonly"] }, allowed: {}, observer: {}, courtadmin: { roles: ["caseworker", "caseworker-harness", "caseworker-privatelaw-courtadmin"] }, judge: { roles: ["caseworker", "caseworker-harness", "caseworker-privatelaw-judge"] } };
  assert.deepEqual(Object.keys(seedAppCcdSessions(credentials, (name) => name, scope)), ["allowed", "courtadmin", "judge", "readonly"]);
  credentials.judge.roles.push("caseworker-harness-allowed");
  assert.throws(() => seedAppCcdSessions(credentials, (name) => name, scope), /CCD_SOURCE_ACTOR_ROLES_REQUIRED/);
});
