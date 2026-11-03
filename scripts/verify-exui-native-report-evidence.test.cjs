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
  const identity = {
    webappCommit: "a".repeat(40),
    artifactDigest: hash("a"),
    dependencyLockDigest: hash("b"),
    toolkitVersion: "7.4.21",
    toolkitDigest: hash("c"),
    configurationDigest: hash("d"),
    definitionDigests: { Example: hash("e") },
    dependencyIdentities: {
      ccd: { artifactDigest: hash("f"), apiContractDigest: hash("1") },
    },
  };
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
  identity.dependencyIdentities["ccd-definition"] = {
    artifactDigest: hash("5"),
    apiContractDigest: hash("6"),
  };
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
        harnessSourceDigest: hash("2"),
        harnessDependencyDigest: hash("3"),
        browserDigest: hash("4"),
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
        const status =
          definition ||
          postal ||
          (unknownFailure && proofId === "ccd-role-policy")
            ? "failed"
            : "passed";
        const failureId = postal
          ? "postal-required-fields"
          : unknownFailure && proofId === "ccd-role-policy"
            ? canary
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
          harnessSourceDigest: hash("2"),
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
        harnessSourceDigest: hash("2"),
        harnessDependencyDigest: hash("3"),
        browserDigest: hash("4"),
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
  const last = phaseResults.at(-1);
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
  result.status = loaded.receipt.verdict.status;
  result.exitCode = loaded.receipt.verdict.exitCode;
  result.phaseResults[2] = {
    phase: "ccd",
    status: result.status,
    exitCode: result.exitCode,
    receiptArtifactDigest: receiptDigest,
  };
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
  assert.equal(result.phases.flatMap((p) => p.baselineProofs).length, 7);
  assert.equal(result.phases.flatMap((p) => p.faults).length, 7);
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
    4,
  );
});

test("unknown private failure identifiers never enter the safe projection", async (t) => {
  const f = await fixture(t, { unknownFailure: true });
  const result = await (
    await load()
  ).readNativeReportEvidence(f.descriptorPath);
  assert.equal(result.status, "BLOCKED");
  assert.equal(
    result.phases[2].baselineProofs.find((p) => p.proofId === "ccd-role-policy")
      .failureId,
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
    assert.equal(proof.boundary, "ccd");
    assert(policy.obligations.some((item) => item.id === proof.obligationId));
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
    assert.equal(coverage.candidate, 0);
    assert.equal(coverage.ccd, postalFailure ? 0 : 1);
    assert.deepEqual(
      coverage.creditedObligationIds,
      postalFailure
        ? []
        : [
            "configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed",
          ],
    );
    assert.equal(coverage.missing, postalFailure ? 112 : 111);
    assert.equal(coverage.releaseCredit, false);
    assert.equal(
      coverage.creditedObligationIds.some(
        (id) => id.startsWith("wa-") || id.startsWith("ccd-"),
      ),
      false,
    );
    assert.deepEqual(snapshot(f.root), before, "accounting is read-only");
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
