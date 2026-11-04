const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { createEventTransitionFixture: fixture } = require("./fixtures/exui-event-transition-evidence.mock.cjs");
const hash = value => "sha256:" + createHash("sha256").update(value).digest("hex");
const digest = letter => "sha256:" + letter.repeat(64);
const load = () => import("./lib/exui-ccd-event-transition.mjs");


test("offline transition replay requires the parent-bound baseline/removal/import/fault chain and returns only safe identity", async t => {
  const { validateEventTransitionEvidence } = await load();
  assert.equal(typeof validateEventTransitionEvidence, "function");
  const f = await fixture(t), expectedBefore = JSON.stringify(f.expected);
  const result = validateEventTransitionEvidence(f.directory, f.expected, await f.loaded());
  assert.deepEqual(result, { transition: f.expected.eventTransition, identity: f.faultIdentity });
  assert.equal(JSON.stringify(f.expected), expectedBefore);
  assert(!JSON.stringify(result).includes("PRIVATE-CANARY"));
  assert(!JSON.stringify(result).includes(f.root));
});

test("parent capture cannot be replaced by an unpinned, stale, aliased or cross-directory record", async t => {
  const { validateEventTransitionEvidence: validate } = await load();
  assert.equal(typeof validate, "function");
  for (const [change, code] of [
    [f => { delete f.expected.eventTransition; }, "EVENT_TRANSITION_REFERENCE_REQUIRED"],
    [f => { f.expected.eventTransition.digest = digest("0"); }, "EVENT_TRANSITION_REFERENCE_DIGEST"],
    [f => { f.expected.eventTransition.path = "../other.json"; }, "EVENT_TRANSITION_REFERENCE_PATH"],
    [f => { fs.renameSync(path.join(f.directory, "independent-transition.json"), path.join(f.directory, "other.json")); fs.symlinkSync("other.json", path.join(f.directory, "independent-transition.json")); }, "EVENT_TRANSITION_ARTIFACT_ALIAS"],
    [f => { f.parent.capturedBeforeFault = false; f.expected.eventTransition = f.put("independent-transition.json", f.parent); }, "EVENT_TRANSITION_CAPTURE_ORDER"],
    [f => { f.parent.harnessSourceDigest = digest("0"); f.expected.eventTransition = f.put("independent-transition.json", f.parent); }, "EVENT_TRANSITION_CAPTURE_IDENTITY"],
  ]) { const f = await fixture(t), loaded = await f.loaded(); change(f); assert.throws(() => validate(f.directory, f.expected, loaded), new RegExp(code)); }

});

test("rehashed removal claims cannot omit a CCD service, substitute native CID or change the original request", async t => {
  const { validateEventTransitionEvidence: validate } = await load();
  assert.equal(typeof validate, "function");
  for (const [change, code] of [
    [f => { f.removal.ccd.checkedNames.pop(); }, "EVENT_TRANSITION_REMOVAL_NAMES"],
    [f => { f.removal.ccd.checkedContainerIds.pop(); }, "EVENT_TRANSITION_REMOVAL_CIDS"],
    [f => { f.removal.ccd.cleanupComplete = false; }, "EVENT_TRANSITION_REMOVAL_INCOMPLETE"],
    [f => { f.removal.native.removed[0].id = "f".repeat(64); }, "EVENT_TRANSITION_NATIVE_REMOVAL"],
    [f => { f.registry[0].namespace = f.runtimeRecord.ccd.namespace; }, "EVENT_TRANSITION_NATIVE_NAMESPACE"],
    [f => { f.lifecycle.after.Id = "f".repeat(64); }, "EVENT_TRANSITION_NATIVE_LIFECYCLE_CID"],
    [f => { f.request.baselineNamespace = "f".repeat(64); }, "EVENT_TRANSITION_REQUEST_MISMATCH"],
  ]) { const f = await fixture(t), loaded = await f.loaded(); change(f); f.write(); assert.throws(() => validate(f.directory, f.expected, loaded), new RegExp(code)); }

});

test("mutant execution, actual manifest and one-cell derivation stay bound to the independent imported identity", async t => {
  const { validateEventTransitionEvidence: validate } = await load();
  assert.equal(typeof validate, "function");
  for (const [change, code] of [
    [f => { f.fault.current.runtimeMetadata.ccdNamespace = f.input.ccd.namespace; }, "EVENT_TRANSITION_MUTANT_METADATA"],
    [f => { f.fault.current.runtimeMetadata.definitionVersion = "2"; }, "EVENT_TRANSITION_MUTANT_METADATA"],
    [f => { f.derivation.transformationRecord = { ...f.derivation.transformationRecord, after: "CRUD" }; }, "EVENT_TRANSITION_DERIVATION_CELL"],
    [f => { f.derivation.target = "gateway substitution"; }, "EVENT_TRANSITION_DERIVATION_TARGET"],
    [f => { f.runtimeRecord.credentials.judge.roles.push("caseworker-harness-allowed"); }, "EVENT_TRANSITION_SOURCE_ROLES"],
    [f => { f.runtimeRecord.apiContracts = { ...f.runtimeRecord.apiContracts, data: digest("0") }; }, "EVENT_TRANSITION_API_DRIFT"],
    [f => { f.derivation.baselineRuntimeMetadata.definitionVersion = "2"; }, "EVENT_TRANSITION_DERIVATION_RUNTIME"],
    [f => { f.derivation.runtimeRecord = { path: "other", digest: digest("0") }; }, "EVENT_TRANSITION_DERIVATION_RECORD"],
  ]) { const f = await fixture(t), loaded = await f.loaded(); change(f); f.write();
    if (code === "EVENT_TRANSITION_DERIVATION_RECORD") { const run = f.read("run.json"); f.derivation.runtimeRecord = { path: "other", digest: digest("0") }; run.mutations[0].derivationArtifact = f.put("ccd-enable-judge-event/derivation.json", f.derivation); f.put("run.json", run); }
    assert.throws(() => validate(f.directory, f.expected, loaded), new RegExp(code)); }

});

test("changed original input, missing baseline proof and rehashed imported permission drift cannot replay", async t => {
  const { validateEventTransitionEvidence: validate } = await load();
  assert.equal(typeof validate, "function");
  const f = await fixture(t), loaded = await f.loaded();
  fs.appendFileSync(path.join(f.directory, "input.json"), " ");
  assert.throws(() => validate(f.directory, f.expected, loaded), /EVENT_TRANSITION_INPUT_DIGEST/);
  f.write(); f.baseline.report.tests.pop();
  f.baseline.execution.resultArtifact = f.put("baseline/report.json", f.baseline.report);
  f.put("baseline/execution.json", f.baseline.execution);
  assert.throws(() => validate(f.directory, f.expected, loaded), /NATIVE_CHECKPOINT_EXACT_BASELINE_PROOFS_REQUIRED/);
  const g = await fixture(t), gLoaded = await g.loaded();
  g.variants.mutant.observed.events.find(row => row.id === "serviceOfDocuments").acls.find(row => row.role === "caseworker-privatelaw-courtadmin").create = false;
  g.variants.mutant.imported.observedDefinitionDigest = hash(JSON.stringify(g.variants.mutant.observed));
  g.put("observed-definition.json", g.variants.mutant.observed, g.variants.mutant.state.output);
  g.runtimeRecord.definitionImportDigest = g.put("definition-import.json", g.variants.mutant.imported, g.variants.mutant.state.output).digest;
  g.fault.current.runtimeMetadata.observedDefinitionDigest = g.variants.mutant.imported.observedDefinitionDigest;
  g.fault.current.runtimeMetadata.definitionImportDigest = g.runtimeRecord.definitionImportDigest;
  g.write();
  assert.throws(() => validate(g.directory, g.expected, gLoaded), /CCD_EVENT_ACL_MISMATCH/);
});

test("portable replay does not reopen the original candidate and uses the canonical parsed request digest", async t => {
  const { validateEventTransitionEvidence: validate } = await load();
  const f = await fixture(t), loaded = await f.loaded();
  fs.writeFileSync(path.join(f.directory, "event-transition-request.json"), JSON.stringify(f.request, null, 2) + "\n");
  fs.rmSync(f.input.artifact.candidateRoot, { recursive: true });
  assert.deepEqual(validate(f.directory, f.expected, loaded).identity, f.faultIdentity);
});

test("a coherently rehashed fault cannot rewrite the independently captured configuration or artifact", async t => {
  const { validateEventTransitionEvidence: validate } = await load();
  for (const field of ["configurationDigest", "artifactDigest"]) {
    const f = await fixture(t);
    f.faultIdentity[field] = digest("0");
    f.write();
    const loaded = await f.loaded();
    assert.throws(() => validate(f.directory, f.expected, loaded), /EVENT_TRANSITION_FAULT_IDENTITY/);
  }
});


test("an exported complete packet replays after relocation without original runtime or candidate paths", async t => {
  const { validateEventTransitionEvidence: validate } = await load();
  const f = await fixture(t), loaded = await f.loaded();
  const relocated = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "event-replay-relocated-"));
  t.after(() => fs.rmSync(relocated, { recursive: true, force: true }));
  fs.cpSync(f.root, relocated, { recursive: true });
  fs.rmSync(f.root, { recursive: true });
  assert.deepEqual(validate(path.join(relocated, "eventCapability"), f.expected, loaded).identity, f.faultIdentity);
});

test("relocation cannot combine import records from unrelated original runtime parents", async t => {
  const { validateEventTransitionEvidence: validate } = await load();
  const f = await fixture(t), loaded = await f.loaded();
  f.runtimeRecord.ccd.output = path.join(f.root, "unrelated", "event-mutant-runtime");
  f.write();
  assert.throws(() => validate(f.directory, f.expected, loaded), /EVENT_TRANSITION_IMPORT_ORIGINAL_PARENT/);
});
