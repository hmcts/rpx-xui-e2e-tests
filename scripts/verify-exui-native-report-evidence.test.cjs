const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const digest = (value) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const hash = (letter) => "sha256:" + letter.repeat(64);
const canary = "PRIVATE_cookie_account_case_payload_123456789";
const modulePath = path.join(__dirname, "lib/exui-native-report-evidence.mjs");
const load = async () => {
  assert(
    fs.existsSync(modulePath),
    "native report reader must validate completed evidence",
  );
  return import(modulePath);
};
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function snapshot(root) {
  return fs
    .readdirSync(root)
    .sort()
    .flatMap((name) => {
      const file = path.join(root, name);
      return fs.statSync(file).isDirectory()
        ? snapshot(file)
        : [[file, digest(fs.readFileSync(file))]];
    });
}
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = JSON.stringify(value);
  fs.writeFileSync(file, bytes);
  return digest(bytes);
}

const {fixture}=require('./fixtures/exui-native-report-packet.mock.cjs');

// Keep every transport hash and recomputed receipt consistent, so these faults
// exercise semantic witness validation rather than stale-file detection.
async function rewriteCcd(f, mutate) {
  const dir = path.join(f.directory, "private/ccd");
  const run = read(path.join(dir, "run.json"));
  const executions = run.executionArtifacts.map((ref) =>
    read(path.join(dir, ref.path)),
  );
  const reports = executions.map((execution) =>
    read(path.join(dir, execution.resultArtifact.path)),
  );
  const derivations = run.mutations.map((witness) =>
    read(path.join(dir, witness.derivationArtifact.path)),
  );
  mutate({ run, executions, reports, derivations });
  for (let i = 0; i < executions.length; i++) {
    executions[i].resultArtifact.digest = write(
      path.join(dir, executions[i].resultArtifact.path),
      reports[i],
    );
    run.executionArtifacts[i].digest = write(
      path.join(dir, run.executionArtifacts[i].path),
      executions[i],
    );
  }
  for (let i = 0; i < derivations.length; i++)
    run.mutations[i].derivationArtifact.digest = write(
      path.join(dir, run.mutations[i].derivationArtifact.path),
      derivations[i],
    );
  write(path.join(dir, "run.json"), run);
  const selected = f.descriptor.expected.phases[2];
  const { loadRunEvidence } = await import("./lib/exui-evidence-io.mjs");
  const loaded = loadRunEvidence(path.join(dir, "run.json"), selected.policy);
  const receiptDigest = write(path.join(dir, "gate.json"), loaded.receipt);
  selected.expected.receiptArtifactDigest = receiptDigest;
  selected.expected.evidenceManifestDigest = loaded.evidenceManifestDigest;
  selected.terminal.code = loaded.receipt.verdict.exitCode;
  write(path.join(dir, "controller-terminal.json"), {
    status: "completed",
    cleanupComplete: true,
    exitCode: loaded.receipt.verdict.exitCode,
  });
  const resultFile = path.join(f.directory, "private/ci-result.json");
  const result = read(resultFile);
  const changedStatus = loaded.receipt.verdict.status;
  const changedExit = loaded.receipt.verdict.exitCode;
  result.phaseResults[2] = {
    phase: "ccd",
    status: changedStatus,
    exitCode: changedExit,
    receiptArtifactDigest: receiptDigest,
  };
  result.exitCode = Math.max(
    ...result.phaseResults.map((item) => item.exitCode),
  );
  result.status = ["PASS", "FAIL", "BLOCKED"][result.exitCode];
  f.descriptor.expected.ciResultDigest = write(resultFile, result);
  f.save();
  return loaded;
}

test("native projection validates all current-policy proofs without turning faults into passed product tests", async (t) => {
  const f = await fixture(t);
  const { readNativeReportEvidence } = await load();
  const before = fs.readFileSync(f.descriptorPath);
  const inputBytes = snapshot(f.root);
  const result = await readNativeReportEvidence(f.descriptorPath);
  assert.equal(result.status, "PASS");
  assert.equal(result.releaseApproval, false);
  assert.equal(result.descriptorDigest, digest(before));
  assert.equal(result.phases.flatMap((p) => p.baselineProofs).length, 23);
  assert.equal(result.phases.flatMap((p) => p.faults).length, 23);
  assert.deepEqual(result.phases.map(p => p.invocations.length), [2, 3, 7, 12, 3, 2, 2]);
  assert.equal(result.phases.flatMap(p => p.invocations).length, 31);
  assert(result.phases.flatMap(p => p.invocations).every(p => p.configuredWorkers === null));
  assert(
    result.phases
      .flatMap((p) => p.faults)
      .every((p) => p.outcome === "expected-failure-observed"),
  );
  assert.deepEqual(fs.readFileSync(f.descriptorPath), before);
  assert.deepEqual(
    snapshot(f.root),
    inputBytes,
    "all input evidence remains byte-identical",
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(canary + "|/private/|/output/|resultArtifact|runtimeMetadata"),
  );
});

test("postal baseline failure remains BLOCKED and its wrong-assertion fault is not credited", async (t) => {
  const f = await fixture(t, { postalFailure: true });
  const result = await (
    await load()
  ).readNativeReportEvidence(f.descriptorPath);
  assert.equal(result.status, "BLOCKED");
  const ccd = result.phases[2];
  assert.equal(
    ccd.baselineProofs.find((p) => p.proofId === "ccd-postal-two-roundtrip")
      .failureId,
    "postal-required-fields",
  );
  const postal = ccd.faults.find(
    (p) => p.mutationId === "ccd-drop-postal-optional-child",
  );
  assert.equal(postal.outcome, "invalid-witness");
  assert.equal(postal.baselineStatus, "failed");
  assert.equal(postal.expectedFailureId, "postal-persistence");
  assert.equal(postal.observedFailureId, "postal-required-fields");
  assert.equal(
    ccd.faults.filter((p) => p.outcome === "expected-failure-observed").length,
    5,
  );
});

test("unknown private failure identifiers never enter the safe projection", async (t) => {
  const f = await fixture(t, { unknownFailure: true });
  const result = await (
    await load()
  ).readNativeReportEvidence(f.descriptorPath);
  assert.equal(result.status, "BLOCKED");
  assert.equal(
    result.phases[3].baselineProofs.find(
      (p) => p.proofId === "ccd-courtadmin-update-recipient-shapes",
    ).failureId,
    null,
  );
  assert.doesNotMatch(JSON.stringify(result), new RegExp(canary));
});

test("independent descriptor rejects changed source, artifact, receipt, phase selection and policy", async (t) => {
  const f = await fixture(t);
  const api = await load();
  for (const mutate of [
    (d) => (d.expected.harnessCommit = "c".repeat(40)),
    (d) => (d.expected.candidateArtifactDigest = hash("0")),
    (d) => (d.expected.ciResultDigest = hash("0")),
    (d) => (d.expected.phases[0].expected.receiptArtifactDigest = hash("0")),
    (d) => (d.expected.phases[0].expected.harnessSourceDigest = hash("0")),
    (d) => d.expected.phases.pop(),
    (d) => d.expected.phases.reverse(),
    (d) => (d.expected.phases[0].policy.obligations[0].requiredProofIds = []),
    (d) => (d.expected.phases[0].terminal.signal = "SIGTERM"),
  ]) {
    const changed = structuredClone(f.descriptor);
    mutate(changed);
    write(f.descriptorPath, changed);
    await assert.rejects(
      api.readNativeReportEvidence(f.descriptorPath),
      /NATIVE_REPORT_/,
    );
  }
  f.save();
  assert.equal(
    (await api.readNativeReportEvidence(f.descriptorPath)).status,
    "PASS",
  );
});

test("changed raw report, incomplete controller and writable evidence authority are rejected causally", async (t) => {
  const f = await fixture(t);
  const api = await load();
  for (const [relative, mutate] of [
    ["family/baseline/report.json", (d) => (d.tests[0].status = "failed")],
    ["family/controller-terminal.json", (d) => (d.cleanupComplete = false)],
    [
      "family/baseline/candidate-write-denial.json",
      (d) => (d.attempts[0].denied = false),
    ],
    [
      "family/baseline/candidate-lifecycle.json",
      (d) => (d.after.State.Running = true),
    ],
  ]) {
    const file = path.join(f.directory, "private", relative),
      before = fs.readFileSync(file);
    const changed = JSON.parse(before);
    mutate(changed);
    write(file, changed);
    await assert.rejects(
      api.readNativeReportEvidence(f.descriptorPath),
      /NATIVE_REPORT_/,
    );
    fs.writeFileSync(file, before);
  }
  assert.equal(
    (await api.readNativeReportEvidence(f.descriptorPath)).status,
    "PASS",
  );
});

test("descriptor and evidence aliases or cross-run symlinks cannot supply report data", async (t) => {
  const f = await fixture(t),
    api = await load();
  const alias = path.join(f.root, "alias.json");
  fs.symlinkSync(f.descriptorPath, alias);
  await assert.rejects(api.readNativeReportEvidence(alias), /NATIVE_REPORT_/);
  const file = path.join(f.directory, "private/family/baseline/report.json");
  const outside = path.join(f.root, "outside.json");
  fs.renameSync(file, outside);
  fs.symlinkSync(outside, file);
  await assert.rejects(
    api.readNativeReportEvidence(f.descriptorPath),
    /NATIVE_REPORT_/,
  );
  fs.unlinkSync(file);
  fs.renameSync(outside, file);
  assert.equal(
    (await api.readNativeReportEvidence(f.descriptorPath)).status,
    "PASS",
  );
});

test("parent-owned independent descriptor may be stored privately alongside the completed run", async (t) => {
  const f = await fixture(t),
    api = await load();
  const privateDescriptor = path.join(
    f.directory,
    "private/native-report-descriptor.json",
  );
  write(privateDescriptor, f.descriptor);
  const result = await api.readNativeReportEvidence(privateDescriptor);
  assert.equal(result.status, "PASS");
  assert.equal(
    result.descriptorDigest,
    digest(fs.readFileSync(privateDescriptor)),
  );
});

test("an observed incomplete job or contradictory BLOCKED-to-PASS result cannot be projected", async (t) => {
  const f = await fixture(t, { postalFailure: true }),
    api = await load();
  const file = path.join(f.directory, "private/ci-result.json");
  const original = read(file);
  for (const mutate of [
    (d) => (d.cleanupComplete = false),
    (d) => {
      d.status = "PASS";
      d.exitCode = 0;
    },
    (d) => d.phaseResults.pop(),
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    f.descriptor.expected.ciResultDigest = write(file, changed);
    f.save();
    await assert.rejects(
      api.readNativeReportEvidence(f.descriptorPath),
      /NATIVE_REPORT_(CI_CLEANUP_INCOMPLETE|CI_OUTCOME_MISMATCH|CI_PHASE_SELECTION_REQUIRED)/,
    );
  }
});

test("self-consistent changed policy cannot replace the current reviewed policy", async (t) => {
  const f = await fixture(t),
    api = await load();
  const selected = f.descriptor.expected.phases[2];
  selected.policy.requiredObligationIds.pop();
  const { policyDigest: _oldDigest, ...content } = selected.policy;
  selected.policy.policyDigest = digest(JSON.stringify(content));
  selected.expected.policyDigest = selected.policy.policyDigest;
  f.save();
  await assert.rejects(
    api.readNativeReportEvidence(f.descriptorPath),
    /NATIVE_REPORT_CURRENT_POLICY_REQUIRED/,
  );
});

for (const [field, value, reason] of [
  ["toolkitVersion", "", "INVALID_IDENTITY:TOOLKIT_VERSION"],
  ["webappCommit", "not-a-commit", "INVALID_IDENTITY:SOURCE"],
])
  test(`consistent raw mutant ${field} rejection cannot become credited fault evidence`, async (t) => {
    const f = await fixture(t),
      api = await load();
    const loaded = await rewriteCcd(
      f,
      ({ run, executions, reports, derivations }) => {
        const index = executions.findIndex(
          (item) => item.invocationId === "ccd-drop-child",
        );
        executions[index].identity[field] = value;
        reports[index].context.identity[field] = value;
        const mutation = run.mutations.findIndex(
          (item) => item.mutationId === "ccd-drop-child",
        );
        derivations[mutation].mutantIdentity[field] = value;
      },
    );
    assert.equal(loaded.receipt.verdict.status, "BLOCKED");
    assert(
      loaded.receipt.verdict.reasons.includes(reason),
      "the real evaluator must reject the mutant identity",
    );
    await assert.rejects(
      api.readNativeReportEvidence(f.descriptorPath),
      /NATIVE_REPORT_INVALID_EVIDENCE/,
    );
  });

test("self-consistent narrowed manifest cannot credit a full-policy witness set", async (t) => {
  const f = await fixture(t),
    api = await load();
  const loaded = await rewriteCcd(f, ({ run }) =>
    run.manifest.requiredObligationIds.pop(),
  );
  assert.equal(loaded.receipt.verdict.status, "BLOCKED");
  assert(loaded.receipt.verdict.reasons.includes("POLICY_SELECTION_MISMATCH"));
  await assert.rejects(
    api.readNativeReportEvidence(f.descriptorPath),
    /NATIVE_REPORT_POLICY_SELECTION_MISMATCH/,
  );
});

test("raw proof boundary claims cannot relabel the source-owned obligation mapping", async (t) => {
  const f = await fixture(t),
    api = await load();
  const loaded = await rewriteCcd(f, ({ reports }) => {
    for (const report of reports)
      for (const proof of report.tests) {
        proof.boundary = "model";
        proof.obligationId = "unreviewed-public-claim";
      }
  });
  assert.equal(loaded.receipt.verdict.status, "PASS");
  const policy = f.descriptor.expected.phases[2].policy;
  for (const proof of [
    ...loaded.input.results,
    ...loaded.input.mutations.map((item) => item.mutantResult),
  ]) {
    assert.equal(proof.boundary, policy.obligations.find((item) => item.id === proof.obligationId)?.boundary);
  }
  const result = await api.readNativeReportEvidence(f.descriptorPath);
  assert.equal(result.status, "PASS");
  assert.doesNotMatch(JSON.stringify(result), /unreviewed-public-claim/);
});

for (const postalFailure of [false, true])
  test(`native catalogue accounting uses exact postal bridge: blocked=${postalFailure}`, async (t) => {
    const f = await fixture(t, { postalFailure });
    const before = snapshot(f.root);
    const result = await (
      await load()
    ).readNativeReportEvidence(f.descriptorPath);
    const coverage = result.catalogueCoverage;
    assert.match(coverage.catalogueDigest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(coverage.selected, 112);
    assert.equal(coverage.candidate, 9);
    assert.equal(coverage.ccd, postalFailure ? 16 : 17);
    assert.deepEqual(coverage.creditedObligationIds, [
      ...(postalFailure
        ? []
        : [
            "configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed",
          ]),
      "configuration-shape:9d78188410918b9fb4c767e43a5bde771ebd5e8ca5e14ba70e948f7779cc34dc",
      "configuration-shape:2ec5abfbce91a706d031d903e3381ea76eabe174cd71ee48f7eecbb02d57da6f",
      "configuration-shape:69bcacf62a9db6f81914356612c4c4d770865dd287bc48704f88be54013bbe49",
      "configuration-shape:02958e8aee4cc1376f6b6607883e90293d8d2c765b4e9796884a61e24123919e",
      "configuration-shape:0d8d6aca578c8ab32c6e2b5e794db038a1f232a15489d40fc6a58e7790b03894",
      "configuration-shape:9ece0d15adfefeabf964c0905981f1343b26487ad4e68f47a9d7bcbf73aaa757",
      "configuration-cell:a6d5e8421152eca670bc39912f6781824bfc3190d2b78ed9ea7757b5f168e313",
      "configuration-cell:1413f10a8d3caf763c82b901d8cc627bb73e555ee4c57aaea5a53ef5e378bc66",
      "configuration-cell:6e8617ff5fd98ab11df8d26d96f3d420e0f4eadfe5a36b23e10095a0e2ec6bf3",
      "configuration-cell:2b80551e385239c5c2e13878ae7645cbeb938e68dda2bcabe52d1ad68046dc65",

      "configuration-cell:8c1a3f11d156a5557c5400305414da596d644a4d2378aa539753a7e9fc88d76a",
      "configuration-cell:a4563399414365b47e8e8358355038fa5a3398127584c2b821674be2525462ba",
      "configuration-cell:5e6b7152607a4c223cb1cb1c8912d4837a71fca9e27e5fd5ef3cd8f60d7096a6",
      "configuration-cell:d418df10fcef3e7a349c270d06a975ac9d1381ea428cf1fc4e955ea968680397",
      "configuration-cell:2a2bf38052f112d7dbe5982d38785085948e100327169e49300047def7a224ea",
      "configuration-cell:8c9effa57e804623271da0fc5d054a2fa69389cb8b2bb4fa179f35e75fa38a59",
      "configuration-cell:32b597279bd96db1646aaf4bfb440504a79d327907018d89d30253f6b02315de",
      "configuration-cell:f7f66f942a035e26181e64394e37d1a02fb113bff32db52c94906c1842222bbb",
      "configuration-cell:8b58b9887954abf5777c3e444bd4876fcdae07c4955880fedf50582aefb3e58a",
      "configuration-cell:fbf6c3058a52de86c9a6323bbb4428c0fe9b9faf0d72c33080b945397418f8ec",
      "configuration-cell:b0d9eefe2d358d1516cb7d564c171fd623357dcb32a90a4d8989ecf7a61e14cf",
      "configuration-cell:8d000fcc1cafb9115e2702da1907d9e6e843d9add4c9c03f8fb49d52d769f337",
      "configuration-shape:4872034ffec23e993a49315123c3a22472baf5411d8010f31d3d01644f23cd94",
      "configuration-shape:bbfb8dfe6d409d6df3291b434a305a3ac5237d63d21ba8c0695b787af62913fe",
      "configuration-decentralisation:52f63ce0d43f0422438b698894746ce1dc0e7062288fc8a09fcfd93b84cf2f1c",
    ]);
    assert.equal(coverage.missing, postalFailure ? 87 : 86);
    assert.equal(coverage.releaseCredit, false);
    assert.equal(
      coverage.creditedObligationIds.some(
        (id) => id.startsWith("wa-") || id.startsWith("ccd-"),
      ),
      false,
    );
    assert.deepEqual(snapshot(f.root), before, "accounting is read-only");
  });

test('shared role catalogue admission rejects a caller-supplied receipt without source inputs', async t => {
  const f = await fixture(t);
  f.descriptor.sharedRoleAdmission = { proof: { acceptedObligationIds: ['configuration-shared:role-policy'] } };
  f.save();
  await assert.rejects((await load()).readNativeReportEvidence(f.descriptorPath), /NATIVE_REPORT_SHARED_ROLE_INPUT_SCHEMA/);
});

test("native accounting cannot bypass imported source binding on a complete BLOCKED phase", async (t) => {
  const f = await fixture(t, { postalFailure: true });
  const importedPath = path.join(
    f.directory,
    "private/ccd-runtime/definition-import.json",
  );
  const imported = read(importedPath);
  imported.binding.sourceDigest = hash("9");
  write(importedPath, imported);
  await assert.rejects(
    (await load()).readNativeReportEvidence(f.descriptorPath),
    /NATIVE_REPORT_INVALID_EVIDENCE/,
  );
});

test("a later accepted phase cannot hide the postal blocker, and a failed new cell earns no credit", async (t) => {
  const api = await load();
  for (const postalFailure of [false, true]) {
    const f = await fixture(t, { postalFailure, unknownFailure: true });
    const result = await api.readNativeReportEvidence(f.descriptorPath);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.exitCode, 2);
    assert.equal(result.phases[3].status, "BLOCKED");
    assert.equal(result.catalogueCoverage.ccd, postalFailure ? 0 : 1);
    assert.equal(result.catalogueCoverage.candidate, 3);
    assert.equal(result.catalogueCoverage.missing, postalFailure ? 109 : 108);
    assert(
      !result.catalogueCoverage.creditedObligationIds.some((id) =>
        id.startsWith("configuration-cell:"),
      ),
    );
  }
});

test("unrelated CCD failures cannot be treated as the known postal continuation", async (t) => {
  const f = await fixture(t);
  await rewriteCcd(f, ({ executions, reports }) => {
    reports[0].status = "failed";
    const proof = reports[0].tests.find(
      (item) => item.proofId === "ccd-role-policy",
    );
    proof.status = "failed";
    proof.failureId = "role-policy-denial";
    executions[0].runnerExitCode = 1;
  });
  await assert.rejects(
    (await load()).readNativeReportEvidence(f.descriptorPath),
    /CCD_POSTAL_ONLY_BLOCK_REQUIRED/,
  );
});

test("rehashed transition claims still require the independent before-fault capture", async (t) => {
  const f = await fixture(t);
  f.event.parent.capturedBeforeFault = false;
  f.event.write();
  const ciPath = path.join(f.directory, "private/ci-result.json");
  const ci = read(ciPath);
  ci.phaseResults[3].eventTransition = f.event.expected.eventTransition;
  ci.phaseResults[3].receiptArtifactDigest =
    f.event.expected.receiptArtifactDigest;
  f.descriptor.expected.ciResultDigest = write(ciPath, ci);
  f.save();
  await assert.rejects(
    (await load()).readNativeReportEvidence(f.descriptorPath),
    /NATIVE_REPORT_INVALID_EVIDENCE/,
  );
});

test("historical six-phase evidence cannot become a completed seven-phase report", async (t) => {
  const f = await fixture(t);
  f.descriptor.expected.phases.pop();
  f.save();
  await assert.rejects(
    (await load()).readNativeReportEvidence(f.descriptorPath),
    /PHASE_SELECTION_REQUIRED/,
  );
});

test('callback publication rejects historical feasibility and forged phase claims',async t=>{
 const {readNativeReportEvidence}=await load();
 for(const change of [
  descriptor=>descriptor.expected.phases.pop(),
  descriptor=>descriptor.expected.phases.reverse(),
  descriptor=>descriptor.expected.phases.push(descriptor.expected.phases.at(-1)),
  descriptor=>{descriptor.expected.phases.find(phase=>phase.phase==='recipientCallback').expected.callbackTransition={status:'passed',accepted:true};},
  descriptor=>{descriptor.expected.phases.find(phase=>phase.phase==='recipientCallback').expected.releaseScopeId='recipient-callback-ui-feasibility';},
 ]) {
  const f=await fixture(t);change(f.descriptor);f.save();
  await assert.rejects(()=>readNativeReportEvidence(f.descriptorPath));
 }
});

test('supplementary DIVORCE report input rejects caller acceptance flags and unpinned packets',async t=>{
 const f=await fixture(t),api=await load(),descriptor=read(f.descriptorPath),primary=await api.readNativeReportEvidence(f.descriptorPath);
 for(const value of [{accepted:1,wholeProfileSatisfied:true},'/missing/divorce-admission-request.json']){write(f.descriptorPath,{...descriptor,divorceProfileAdmission:value});await assert.rejects(api.readNativeReportEvidence(f.descriptorPath),/NATIVE_REPORT_INVALID_EVIDENCE/);}
 write(f.descriptorPath,descriptor);assert.deepEqual((await api.readNativeReportEvidence(f.descriptorPath)).catalogueCoverage,primary.catalogueCoverage);
});

test('selector phase rejects coherently rehashed unhealthy UI, actor, history and validation evidence',async t=>{
 const {readNativeReportEvidence}=await load();
 for(const mutate of [
  f=>{f.selector.observations.baseline.observation.selectedCya.selectorSummaryCount=0;},
  f=>{f.selector.observations.baseline.observation.after.history[0].user_id='changed';},
  f=>{f.selector.observations.baseline.journal.find(row=>row.selectorValidation?.pageId==='serviceOfDocuments2').status=500;},
  f=>{f.selector.observations['ccd-hide-selector-summary'].observation.selectedCya.healthySiblingCount=0;},
  f=>{f.selector.capture.completedAfterController=false;},
 ]) {
  const f=await fixture(t);mutate(f);f.selector.write();
  const ciPath=path.join(f.directory,'private/ci-result.json'),ci=read(ciPath);
  ci.phaseResults.find(phase=>phase.phase==='selectorEventRow').receiptArtifactDigest=f.selector.expected.receiptArtifactDigest;
  f.descriptor.expected.ciResultDigest=write(ciPath,ci);f.save();
  await assert.rejects(()=>readNativeReportEvidence(f.descriptorPath),/NATIVE_REPORT_/);
 }
});


test('native projection reads configured slots from hashed reports without changing coverage', async t => {
  const f=await fixture(t), {readNativeReportEvidence}=await load();
  const before=await readNativeReportEvidence(f.descriptorPath);
  await rewriteCcd(f,({reports})=>reports.forEach((report,index)=>{report.configuredWorkers=index===0?2:1;}));
  const after=await readNativeReportEvidence(f.descriptorPath);
  assert.deepEqual(after.phases.find(p=>p.phase==='ccd').invocations.map(p=>p.configuredWorkers),[2,1,1,1,1,1,1]);
  assert.deepEqual(after.catalogueCoverage.creditedObligationIds,before.catalogueCoverage.creditedObligationIds);
  assert(after.phases.filter(p=>p.phase!=='ccd').flatMap(p=>p.invocations).every(item=>item.configuredWorkers===null));
});

test('native projection rejects invalid worker scalars and duplicate missing or foreign physical invocations', async t => {
  const {readNativeReportEvidence}=await load();
  for(const workers of [0,-1,1.5,canary,{workers:1}]){
    const f=await fixture(t);await rewriteCcd(f,({reports})=>{reports[0].configuredWorkers=workers;});
    await assert.rejects(readNativeReportEvidence(f.descriptorPath),/NATIVE_REPORT_WORKER_CONFIGURATION_INVALID/);
  }
  for(const action of ['duplicate','missing','foreign']){
    const f=await fixture(t), dir=path.join(f.directory,'private/family'),run=read(path.join(dir,'run.json'));
    if(action==='duplicate')run.executionArtifacts.push(run.executionArtifacts[0]);
    if(action==='missing')run.executionArtifacts.pop();
    if(action==='foreign'){
      const ref=run.executionArtifacts[0],execution=read(path.join(dir,ref.path));execution.invocationId='foreign';ref.digest=write(path.join(dir,ref.path),execution);
    }
    write(path.join(dir,'run.json'),run);
    await assert.rejects(readNativeReportEvidence(f.descriptorPath),/NATIVE_REPORT_INVOCATION_INVENTORY_MISMATCH/);
  }
});

for (const postalFailure of [false, true]) {
  test(`native row details distinguish source methods from recorded outcomes and unavailable traces (${postalFailure ? 'postal blocked' : 'passed'})`, async t => {
    const f = await fixture(t, { postalFailure });
    const { readNativeReportEvidence } = await load();
    const evidence = await readNativeReportEvidence(f.descriptorPath);
    const { renderNativeEvidence } = require('./harness-native-report.cjs');
    const { escape } = require('./harness-report-coverage.cjs');
    const html = renderNativeEvidence(evidence);
    const rows = [...html.matchAll(/<tr data-native-row\b[^>]*>[\s\S]*?<\/tr>/g)].map(match => match[0]);
    assert.equal(rows.length, 46);
    const disclosure = 'Per-step execution trace and per-test duration: Not recorded in this evidence.';
    for (const row of rows) {
      const details = /<details>[\s\S]*?<\/details>/.exec(row)?.[0];
      assert(details);
      const method = /<th scope="row">[\s\S]*?<p>([\s\S]*?)<\/p>/.exec(row)?.[1];
      assert(method);
      assert(details.includes(`<strong>Source-defined method</strong> ${method}`));
      assert.equal(details.split(disclosure).length - 1, 1);
      assert(details.includes('<strong>Recorded outcome</strong>'));
    }
    for (const phase of evidence.phases) {
      for (const proof of phase.baselineProofs) {
        const row = rows.find(item => item.includes(`<dd>${escape(proof.proofId)}</dd>`));
        assert(row.includes(`<strong>Recorded outcome</strong> ${escape(proof.status)}`));
      }
      for (const fault of phase.faults) {
        const row = rows.find(item => item.includes(`<dd>${escape(fault.proofId)}</dd>`));
        assert(row.includes('<strong>Recorded outcome</strong> ' + (fault.outcome === 'expected-failure-observed' ? 'Expected failure observed' : 'BLOCKED — invalid witness')));
        assert(row.includes(`<dt>Required failure</dt><dd>${escape(fault.expectedFailureId)}</dd>`));
        assert(row.includes(`<dt>Observed failure</dt><dd>${escape(fault.observedFailureId || 'not established')}</dd>`));
      }
    }
    assert(!html.includes(canary));
  });
}

test('digest-bound native stage telemetry preserves repeated baseline and expected-fault execution detail without changing acceptance',async t=>{
 const f=await fixture(t,{recordedStages:true});const evidence=await (await load()).readNativeReportEvidence(f.descriptorPath);
 assert.equal(evidence.status,'PASS');assert.equal(evidence.releaseApproval,false);
 const phase=evidence.phases.find(p=>p.phase==='family'),baseline=phase.baselineProofs[0],fault=phase.faults[0];
 assert.equal(baseline.recordedExecution.stages.length,8);assert.equal(baseline.recordedExecution.testDurationMs,90);
 assert.equal(fault.recordedExecution.stages.length,1);assert.equal(fault.recordedExecution.stages[0].outcome,'reported-error');assert.equal(fault.outcome,'expected-failure-observed');
 const {renderNativeEvidence}=require('./harness-native-report.cjs'),untouched=JSON.stringify(evidence);const html=renderNativeEvidence(evidence);
 assert.match(html,/Source-defined expected contract/);assert.match(html,/Recorded group outcome/);assert.match(html,/seven declared service families/);assert.match(html,/not separately recorded requests/);assert.match(html,/Trace not captured/);assert.equal(JSON.stringify(evidence),untouched);
 assert.match(html,/Recorded named assertion stages/);assert.match(html,/Observed test duration: 90 ms/);assert.match(html,/not additive/);assert.match(html,/reported error/);assert.doesNotMatch(html,/PRIVATE_cookie_canary/);
 const tampered=structuredClone(evidence);tampered.phases[0].baselineProofs[0].recordedExecution.stages[0].stageId='PRIVATE_cookie_canary';assert.throws(()=>renderNativeEvidence(tampered),/PUBLIC_NATIVE_STAGE/);
});
test('malformed raw native telemetry becomes explicitly unavailable with no raw label publication or new verdict',async t=>{
 const f=await fixture(t,{recordedStages:'invalid'});const evidence=await (await load()).readNativeReportEvidence(f.descriptorPath);
 assert.equal(evidence.status,'PASS');assert.equal(evidence.phases[0].baselineProofs[0].recordedExecution.availability,'unavailable');
 const html=require('./harness-native-report.cjs').renderNativeEvidence(evidence);assert.match(html,/unavailable \(INVALID_STAGE_TELEMETRY\)/);assert(!html.includes('PRIVATE_cookie_canary'));
});

test('empty recorded stages and parent-inconsistent duration are unavailable in independently replayed raw evidence',async t=>{
 for(const recordedStages of ['empty','oversized']){
 const f=await fixture(t,{recordedStages});const evidence=await(await load()).readNativeReportEvidence(f.descriptorPath);
 assert.equal(evidence.status,'PASS');const telemetry=evidence.phases[0].baselineProofs[0].recordedExecution;assert.equal(telemetry.availability,'unavailable');assert.equal(telemetry.reason,'INVALID_STAGE_TELEMETRY');
 const html=require('./harness-native-report.cjs').renderNativeEvidence(evidence);assert.match(html,/unavailable \(INVALID_STAGE_TELEMETRY\)/);
 }
});

test('native expected-stage explanations cover exactly the unchanged finite recorded-stage vocabulary',()=>{
 const telemetry=fs.readFileSync(path.join(__dirname,'lib/exui-native-stage-telemetry.cjs'),'utf8'),renderer=fs.readFileSync(path.join(__dirname,'harness-native-report.cjs'),'utf8');
 const allowed=JSON.parse(telemetry.match(/const allowed = (\{[\s\S]*?\n\});/)[1].replace(/,\s*([}\]])/g,'$1')),expected=JSON.parse(renderer.match(/const nativeStageExpectations=(\{[\s\S]*?\n\});/)[1]);
 const ids=[...new Set(Object.values(allowed).flat().concat(['recipient-collection','case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two'].map(id=>'source-shape-'+id)))].sort();assert.deepEqual(Object.keys(expected).sort(),ids);assert(Object.values(expected).every(value=>typeof value==='string'&&value.length>30&&!value.includes(canary)));
});

test('native named-stage explanations do not assign later journey assertions to the recorded group',()=>{
 const file=process.env.HARNESS_STAGE_LABEL_CONTROL??path.join(__dirname,'harness-native-report.cjs'),source=fs.readFileSync(file,'utf8'),labels=JSON.parse(source.match(/const nativeStageExpectations=(\{[\s\S]*?\n\});/)[1]);
 assert.match(labels['noc-session-routing'],/first primary-session verification POST/);assert.match(labels['noc-session-routing'],/Later fresh-session and cache checks are outside/);assert.match(labels['source-shape-recipient-collection'],/exactly two recipient entries/);assert.match(labels['source-shape-recipient-collection'],/fault branch.*array/);assert.match(labels['postal-required-fields'],/postcode-lookup controls/);assert.match(labels['postal-required-fields'],/Manual-address PostCode requiredness is outside/);
 for(const id of ['case-field-recipient-selector','required-delivery-radio','conditional-email-complex','postal-recipient-name','optional-postal-line-two']){assert.match(labels['source-shape-'+id],/flag must be true/);assert.match(labels['source-shape-'+id],/Earlier .* checks are outside this named stage/);}
});
