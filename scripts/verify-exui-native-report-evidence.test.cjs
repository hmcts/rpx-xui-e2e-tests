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

async function fixture(
  t,
  { postalFailure = false, unknownFailure = false } = {},
) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "native-report-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "run");
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const { nativeInvocations } = await import("./lib/exui-native-contract.mjs");
  const { loadRunEvidence } = await import("./lib/exui-evidence-io.mjs");
  const event =
    await require("./fixtures/exui-event-transition-evidence.mock.cjs").createEventTransitionFixture(
      t,
      { root: path.join(directory, "private") },
    );
  const identity = structuredClone(event.expected.identity);
  if (unknownFailure) {
    event.baseline.report.status = "failed";
    event.baseline.report.tests[0].status = "failed";
    event.baseline.report.tests[0].failureId = canary;
    event.baseline.execution.runnerExitCode = 1;
    event.write();
  }
  const expected = {
    jobRunId: "ci-" + randomUUID(),
    harnessCommit: "b".repeat(40),
    candidateArtifactDigest: identity.artifactDigest,
    phases: [],
  };
  const binding = read(
    path.join(__dirname, "fixtures/ccd/nested-prl.binding.json"),
  );
  identity.definitionDigests.HarnessNestedPRL = binding.workbookDigest;
  const observed = { id: "HarnessNestedPRL", version: { number: 1 } };
  const imported = {
    status: 201,
    sourceRevision: "694b9951e94369f1394380506960c4f04f25755d",
    binding,
    fixtureDigest: binding.workbookDigest,
    observedDefinitionDigest: digest(JSON.stringify(observed)),
    definitionVersion: 1,
    images: {
      data: { id: identity.dependencyIdentities.ccd.artifactDigest },
      definition: {
        id: identity.dependencyIdentities["ccd-definition"].artifactDigest,
      },
    },
  };
  const importDigest = write(
    path.join(directory, "private/ccd-runtime/definition-import.json"),
    imported,
  );
  write(
    path.join(directory, "private/ccd-runtime/observed-definition.json"),
    observed,
  );
  const phaseResults = [];
  for (const [phase, releaseScopeId] of Object.entries({
    family: "exui-wa-family-pilot",
    scope: "exui-wa-scope-pilot",
    ccd: "exui-ccd-pilot",
  })) {
    const policy = getReleasePolicy(releaseScopeId);
    const dir = path.join(directory, "private", phase);
    const manifest = {
      schemaVersion: 1,
      runId: (phase === "ccd" ? "ccd-" : "candidate-") + randomUUID(),
      harnessCommit: expected.harnessCommit,
      releaseScopeId,
      policyDigest: policy.policyDigest,
      identity,
      requiredObligationIds: policy.requiredObligationIds,
      runtimeMetadata: {
        harnessSourceState: "clean",
        harnessSourceDigest: event.expected.harnessSourceDigest,
        harnessDependencyDigest: event.expected.harnessDependencyDigest,
        browserDigest: event.expected.browserDigest,
        isolation: "native-separate-api-owned-network-none",
        privateCanary: canary,
        ...(phase === "ccd"
          ? {
              definitionImportDigest: importDigest,
              observedDefinitionDigest: imported.observedDefinitionDigest,
              definitionVersion: "1",
            }
          : {}),
      },
    };
    const run = {
      schemaVersion: 1,
      manifest,
      executionArtifacts: [],
      mutations: [],
    };
    const put = (relative, value) => ({
      path: relative,
      digest: write(path.join(dir, relative), value),
    });
    for (const invocation of nativeInvocations(releaseScopeId)) {
      const definition = policy.mutationDefinitions.find(
        (d) => d.mutationId === invocation.mutation,
      );
      const changedIdentity = definition
        ? { ...identity, configurationDigest: digest(definition.mutationId) }
        : identity;
      const proofIds = definition
        ? [definition.mutantProofId]
        : policy.obligations
            .flatMap((o) => o.requiredProofIds)
            .filter((p) => phase !== "scope" || p.endsWith(invocation.persona));
      const tests = proofIds.map((proofId) => {
        const postal =
          postalFailure &&
          ["ccd-postal-two-roundtrip", "ccd-postal-child-loss"].includes(
            proofId,
          );
        const status = definition || postal || false ? "failed" : "passed";
        const failureId = postal
          ? "postal-required-fields"
          : (definition?.expectedFailureId ?? null);
        return {
          proofId,
          expectedStatus: "passed",
          status,
          retry: 0,
          failureId,
          unattributedErrors: 0,
        };
      });
      const status = tests.some((p) => p.status === "failed")
        ? "failed"
        : "passed";
      const execution = {
        invocationId: invocation.invocationId,
        runId: manifest.runId,
        identity: changedIdentity,
        kind: invocation.kind,
        terminalState: "completed",
        runnerExitCode: status === "passed" ? 0 : 1,
        unexpectedGlobalErrors: [],
      };
      execution.resultArtifact = put(invocation.invocationId + "/report.json", {
        schemaVersion: 1,
        context: {
          runId: manifest.runId,
          invocationId: invocation.invocationId,
          identity: changedIdentity,
          harnessCommit: manifest.harnessCommit,
          releaseScopeId,
          policyDigest: policy.policyDigest,
          harnessSourceState: "clean",
          harnessSourceDigest: event.expected.harnessSourceDigest,
        },
        complete: true,
        status,
        tests,
        globalErrors: [],
        privateCanary: canary,
      });
      run.executionArtifacts.push(
        put(invocation.invocationId + "/execution.json", execution),
      );
      put(invocation.invocationId + "/candidate-write-denial.json", {
        attempts: [
          { path: "/output/report.json", denied: true },
          { path: "/harness/controller.mjs", denied: true },
        ],
        controllerSourceVisible: false,
      });
      put(invocation.invocationId + "/candidate-lifecycle.json", {
        requestedStop: true,
        before: { State: { Running: true } },
        after: { State: { Running: false, ExitCode: 143 } },
        privateCanary: canary,
      });
      if (definition)
        run.mutations.push({
          mutationId: definition.mutationId,
          baselineInvocationId: phase === "scope" ? "scope-ia" : "baseline",
          mutantInvocationId: invocation.invocationId,
          derivationArtifact: put(
            invocation.invocationId + "/derivation.json",
            {
              baselineIdentity: identity,
              mutantIdentity: changedIdentity,
              mutationDefinitionDigest: definition.definitionDigest,
            },
          ),
        });
    }
    put("run.json", run);
    const loaded = loadRunEvidence(path.join(dir, "run.json"), policy);
    const receiptArtifactDigest = put("gate.json", loaded.receipt).digest;
    put("controller-terminal.json", {
      status: "completed",
      exitCode: loaded.receipt.verdict.exitCode,
      cleanupComplete: true,
    });
    expected.phases.push({
      phase,
      policy,
      terminal: { code: loaded.receipt.verdict.exitCode, signal: null },
      expected: {
        runId: manifest.runId,
        harnessCommit: manifest.harnessCommit,
        releaseScopeId,
        policyDigest: policy.policyDigest,
        identity,
        harnessSourceDigest: event.expected.harnessSourceDigest,
        harnessDependencyDigest: event.expected.harnessDependencyDigest,
        browserDigest: event.expected.browserDigest,
        nativeAuthority: true,
        evidenceManifestDigest: loaded.evidenceManifestDigest,
        receiptArtifactDigest,
      },
    });
    phaseResults.push({
      phase,
      ...loaded.receipt.verdict,
      receiptArtifactDigest,
    });
    delete phaseResults.at(-1).reasons;
  }
  expected.phases.push({
    phase: "eventCapability",
    policy: event.policy,
    terminal: { code: unknownFailure ? 2 : 0, signal: null },
    expected: event.expected,
  });
  phaseResults.push({
    phase: "eventCapability",
    status: unknownFailure ? "BLOCKED" : "PASS",
    exitCode: unknownFailure ? 2 : 0,
    receiptArtifactDigest: event.expected.receiptArtifactDigest,
    eventTransition: event.expected.eventTransition,
  });
  const { createRoutingPhaseFixture } = require(
    "./fixtures/exui-routing-phase-evidence.mock.cjs",
  );
  const routing = await createRoutingPhaseFixture({
    root: path.join(directory, "private"),
    harnessCommit: expected.harnessCommit,
    sourceDigest: event.expected.harnessSourceDigest,
    dependencyDigest: event.expected.harnessDependencyDigest,
    browserDigest: event.expected.browserDigest,
  });
  expected.phases.push({
    phase: "routing",
    policy: routing.policy,
    terminal: routing.terminal,
    expected: routing.expected,
  });
  phaseResults.push(routing.result);
  const {createCallbackPhaseFixture}=require('./fixtures/exui-recipient-callback-phase-evidence.mock.cjs');
  const callback=await createCallbackPhaseFixture({
    root:path.join(directory,'private'),harnessCommit:expected.harnessCommit,
    sourceDigest:event.expected.harnessSourceDigest,dependencyDigest:event.expected.harnessDependencyDigest,
    browserDigest:event.expected.browserDigest,
  });
  expected.phases.push({phase:'recipientCallback',policy:callback.policy,terminal:callback.terminal,expected:callback.expected});
  phaseResults.push(callback.result);

  const last = phaseResults.reduce((worst, item) =>
    item.exitCode > worst.exitCode ? item : worst,
  );
  expected.ciResultDigest = write(
    path.join(directory, "private/ci-result.json"),
    {
      classification: "fixed-pilot-suite-no-full-release-approval",
      jobRunId: expected.jobRunId,
      status: last.status,
      exitCode: last.exitCode,
      cleanupComplete: true,
      phaseResults,
    },
  );
  const descriptor = { schemaVersion: 1, directory, expected };
  const descriptorPath = path.join(root, "descriptor.json");
  write(descriptorPath, descriptor);
  return {
    root,
    directory,
    event,
    routing,
    callback,
    descriptor,
    descriptorPath,
    save: () => write(descriptorPath, descriptor),
  };
}

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
  assert.equal(result.phases.flatMap((p) => p.baselineProofs).length, 21);
  assert.equal(result.phases.flatMap((p) => p.faults).length, 21);
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
    assert.equal(coverage.candidate, 7);
    assert.equal(coverage.ccd, postalFailure ? 16 : 17);
    assert.deepEqual(coverage.creditedObligationIds, [
      ...(postalFailure
        ? []
        : [
            "configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed",
          ]),
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
      "configuration-decentralisation:52f63ce0d43f0422438b698894746ce1dc0e7062288fc8a09fcfd93b84cf2f1c",
    ]);
    assert.equal(coverage.missing, postalFailure ? 89 : 88);
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
    assert.equal(result.catalogueCoverage.candidate, 2);
    assert.equal(result.catalogueCoverage.missing, postalFailure ? 110 : 109);
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

test("historical four-phase evidence cannot become a completed five-phase report", async (t) => {
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
  descriptor=>{descriptor.expected.phases.at(-1).expected.callbackTransition={status:'passed',accepted:true};},
  descriptor=>{descriptor.expected.phases.at(-1).expected.releaseScopeId='recipient-callback-ui-feasibility';},
 ]) {
  const f=await fixture(t);change(f.descriptor);f.save();
  await assert.rejects(()=>readNativeReportEvidence(f.descriptorPath));
 }
});
