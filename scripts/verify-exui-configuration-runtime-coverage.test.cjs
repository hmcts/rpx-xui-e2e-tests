const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const id =
  "configuration-sequence:5e3fa818f42a05cf53c18623577ef91e26ceaff4ee829692ad7cf5e305ce22ed";

test("support only: committed source projections load112 obligations without an external checkout or caller execution status", async () => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const loaded = api.loadCommittedConfigurationCatalogue(path.resolve("."));
  assert.equal(loaded.catalogue.obligations.length, 112);
  assert.equal(loaded.validation.errors.length, 0);
  assert.equal(
    loaded.catalogue.sourceManifest.find(
      (x) => x.repository === "prl-ccd-definitions",
    ).revision,
    "694b9951e94369f1394380506960c4f04f25755d",
  );
  assert(loaded.catalogue.obligations.some((x) => x.id === id));
  const output = fs.mkdtempSync(
    path.join(os.tmpdir(), "configuration-coverage-"),
  );
  try {
    const result = api.writeConfigurationCoverage({
      harnessRoot: path.resolve("."),
      output,
    });
    assert.equal(result.coverage.selected, 112);
    assert.equal(result.coverage.ccd, 0);
    assert.equal(result.coverage.missingCandidateOrCcd.length, 112);
    assert.equal(result.releaseCredit, false);
    assert.equal(
      result.gaps.filter((x) => x.startsWith("deployment-runtime-unproved:"))
        .length,
      45,
    );
    const coverage = JSON.parse(
      fs.readFileSync(path.join(output, "coverage.json")),
    );
    assert.deepEqual(
      coverage.provenance.deploymentSourceManifest,
      loaded.catalogue.deploymentSourceManifest,
    );
    assert.equal(coverage.provenance.deploymentSourceManifest.length, 4);
    assert.equal(
      coverage.provenance.definitionDiscovery.evidenceMode,
      "pinned-summary",
    );
    assert.equal(coverage.provenance.definitionDiscovery.graphAvailable, false);
    assert(
      coverage.gaps.includes(
        "definition-discovery-graph-unavailable:prl-ccd-definitions",
      ),
    );
    assert.equal(
      coverage.gaps.filter((item) =>
        item.startsWith("unreviewed-deployment-family:"),
      ).length,
      9,
    );
    const selection = JSON.parse(
      fs.readFileSync(path.join(output, "selection.json")),
    );
    assert.equal(selection.mode, "broad");
    assert.equal(selection.obligationIds.length, 112);
    assert(
      coverage.gaps.includes(
        "unreviewed-deployment-family:preview:JURISDICTIONS:PT",
      ),
    );
    assert.throws(
      () =>
        api.writeConfigurationCoverage({
          harnessRoot: path.resolve("."),
          output,
          executedProofs: [
            { obligationId: id, boundary: "ccd", status: "passed" },
          ],
        }),
      /UNSUPPORTED_COVERAGE_INPUT/,
    );
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

async function completeCcdBundle(
  root,
  referenceManifest,
  alterManifest = () => {},
) {
  const { completeRun } = require("./fixtures/exui-release-evidence.mock.cjs");
  const { reportContext } = require("./fixtures/exui-evidence-bundle.mock.cjs");
  const { digestBytes, loadRunEvidence } =
    await import("./lib/exui-evidence-io.mjs");
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const policy = getReleasePolicy("exui-ccd-pilot"),
    directory = path.join(root, "ccd");
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.join(root, "ccd-runtime"), { recursive: true });
  const source = completeRun(),
    manifest = structuredClone(source.manifest);
  const binding = JSON.parse(
    fs.readFileSync("scripts/fixtures/ccd/nested-prl.binding.json"),
  );
  Object.assign(manifest.runtimeMetadata, {
    harnessDependencyDigest: "sha256:" + "a".repeat(64),
    browserDigest: "sha256:" + "b".repeat(64),
  });
  manifest.releaseScopeId = policy.releaseScopeId;
  manifest.policyDigest = policy.policyDigest;
  manifest.requiredObligationIds = policy.requiredObligationIds;
  manifest.identity.definitionDigests = {
    HarnessNestedPRL: binding.workbookDigest,
  };
  manifest.identity.dependencyIdentities = {
    ccd: {
      artifactDigest: "sha256:" + "1".repeat(64),
      apiContractDigest: "sha256:" + "2".repeat(64),
    },
    "ccd-definition": {
      artifactDigest: "sha256:" + "3".repeat(64),
      apiContractDigest: "sha256:" + "4".repeat(64),
    },
  };
  if (referenceManifest) {
    manifest.harnessCommit = referenceManifest.harnessCommit;
    manifest.identity = {
      ...structuredClone(referenceManifest.identity),
      configurationDigest: manifest.identity.configurationDigest,
      definitionDigests: manifest.identity.definitionDigests,
    };
    for (const key of [
      "harnessSourceState",
      "harnessSourceDigest",
      "harnessDependencyDigest",
      "browserDigest",
    ])
      manifest.runtimeMetadata[key] = referenceManifest.runtimeMetadata[key];
  }
  alterManifest(manifest);
  if (manifest.runtimeMetadata.workbasketImportDigest === "fixture") {
    const { buildWorkbasketInputDefinition } = await import("./lib/exui-workbasket-input-definition.mjs");
    const definition = buildWorkbasketInputDefinition();
    const receipt = {
      status: "import-and-inputs-observed",
      binding: { source: definition.workbasketInputSource, workbookDigest: "sha256:" + "9".repeat(64) },
      bindings: definition.workbasketInputBindings,
      images: {
        data: { id: manifest.identity.dependencyIdentities.ccd.artifactDigest },
        definition: { id: manifest.identity.dependencyIdentities["ccd-definition"].artifactDigest },
      },
      observations: { inputs: { status: 200, body: JSON.parse(fs.readFileSync("scripts/fixtures/ccd/workbasket-input.observed.json")) } },
    };
    const bytes = JSON.stringify(receipt);
    fs.mkdirSync(path.join(root, "ccd-runtime/workbasket-input-import"), { recursive: true });
    fs.writeFileSync(path.join(root, "ccd-runtime/workbasket-input-import/receipt.json"), bytes);
    manifest.runtimeMetadata.workbasketImportDigest = digestBytes(bytes);
    manifest.identity.definitionDigests.HarnessResultsPRL = receipt.binding.workbookDigest;
  }
  const observed = { id: "HarnessNestedPRL", version: { number: 1 } };
  const imported = {
    binding,
    status: 201,
    fixtureDigest: binding.workbookDigest,
    sourceRevision: "694b9951e94369f1394380506960c4f04f25755d",
    observedDefinitionDigest: digestBytes(JSON.stringify(observed)),
    definitionVersion: 1,
    images: {
      data: { id: manifest.identity.dependencyIdentities.ccd.artifactDigest },
      definition: {
        id: manifest.identity.dependencyIdentities["ccd-definition"]
          .artifactDigest,
      },
    },
  };
  const importBytes = JSON.stringify(imported);
  fs.writeFileSync(
    path.join(root, "ccd-runtime/definition-import.json"),
    importBytes,
  );
  fs.writeFileSync(
    path.join(root, "ccd-runtime/observed-definition.json"),
    JSON.stringify(observed),
  );
  Object.assign(manifest.runtimeMetadata, {
    definitionImportDigest: digestBytes(importBytes),
    observedDefinitionDigest: imported.observedDefinitionDigest,
    definitionVersion: "1",
  });
  const write = (file, value) => {
    const bytes = JSON.stringify(value);
    fs.writeFileSync(path.join(directory, file), bytes);
    return { path: file, digest: digestBytes(bytes) };
  };
  const executions = [],
    mutations = [];
  function invocation(invocationId, identity, tests, kind, code) {
    fs.mkdirSync(path.join(directory, invocationId));
    write(invocationId + "/candidate-write-denial.json", {
      attempts: [
        { path: "/output/report.json", denied: true },
        { path: "/harness/controller.mjs", denied: true },
      ],
      controllerSourceVisible: false,
    });
    write(invocationId + "/candidate-lifecycle.json", {
      requestedStop: true,
      before: { State: { Running: true } },
      after: { State: { Running: false, ExitCode: 143 } },
    });
    const execution = {
      invocationId,
      runId: manifest.runId,
      identity,
      kind,
      terminalState: "completed",
      runnerExitCode: code,
      unexpectedGlobalErrors: [],
    };
    const report = {
      schemaVersion: 1,
      complete: true,
      status: code === 0 ? "passed" : "failed",
      globalErrors: [],
      context: reportContext(manifest, execution),
      tests: tests.map((test) => ({
        expectedStatus: "passed",
        retry: 0,
        unattributedErrors: 0,
        failureId: null,
        ...test,
      })),
    };
    execution.resultArtifact = write(invocationId + "/report.json", report);
    executions.push(write(invocationId + "/execution.json", execution));
  }
  invocation(
    "baseline",
    manifest.identity,
    policy.obligations
      .flatMap((o) => o.requiredProofIds)
      .map((proofId) => ({ proofId, status: "passed" })),
    "baseline",
    0,
  );
  for (const [i, mutation] of policy.mutationDefinitions.entries()) {
    const identity = {
      ...structuredClone(manifest.identity),
      configurationDigest: "sha256:" + ((i + 5) % 16).toString(16).repeat(64),
    };
    invocation(
      mutation.mutationId,
      identity,
      [
        {
          proofId: mutation.mutantProofId,
          status: "failed",
          failureId: mutation.expectedFailureId,
        },
      ],
      "mutation",
      1,
    );
    mutations.push({
      mutationId: mutation.mutationId,
      baselineInvocationId: "baseline",
      mutantInvocationId: mutation.mutationId,
      derivationArtifact: write(mutation.mutationId + "/derivation.json", {
        mutationDefinitionDigest: mutation.definitionDigest,
        baselineIdentity: manifest.identity,
        mutantIdentity: identity,
      }),
    });
  }
  const run = {
    schemaVersion: 1,
    manifest,
    executionArtifacts: executions,
    mutations,
  };
  write("run.json", run);
  write("controller-terminal.json", {
    status: "completed",
    exitCode: 0,
    cleanupComplete: true,
  });
  const loaded = loadRunEvidence(path.join(directory, "run.json"), policy);
  assert.equal(loaded.receipt.verdict.status, "PASS", JSON.stringify(loaded.receipt.verdict.reasons));
  write("gate.json", loaded.receipt);
  return {
    directory,
    manifest,
    expected: {
      runId: manifest.runId,
      harnessCommit: manifest.harnessCommit,
      releaseScopeId: policy.releaseScopeId,
      policyDigest: policy.policyDigest,
      identity: manifest.identity,
      harnessSourceDigest: manifest.runtimeMetadata.harnessSourceDigest,
      nativeAuthority: true,
      receiptArtifactDigest: digestBytes(
        fs.readFileSync(path.join(directory, "gate.json")),
      ),
    },
    terminal: { code: 0, signal: null },
  };
}

test("support only: finalized exact CCD sequence credits only one of112 and preserves original profile/PRL gaps", async () => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-receipt-"));
  try {
    const bundle = await completeCcdBundle(root),
      output = path.join(root, "configuration");
    const result = api.writeConfigurationCoverage({
      harnessRoot: path.resolve("."),
      output,
      phaseDirectory: bundle.directory,
      expected: bundle.expected,
      terminal: bundle.terminal,
    });
    assert.equal(result.coverage.selected, 112);
    assert.equal(result.coverage.ccd, 1);
    assert.equal(result.coverage.candidate, 0);
    assert.equal(result.coverage.model, 0);
    assert.equal(result.coverage.external, 0);
    assert.equal(result.coverage.missingCandidateOrCcd.length, 111);
    assert(
      result.coverage.missingCandidateOrCcd.includes(
        "configuration-decentralisation:52f63ce0d43f0422438b698894746ce1dc0e7062288fc8a09fcfd93b84cf2f1c",
      ),
    );
    assert(!result.coverage.missingCandidateOrCcd.includes(id));
    const saved = JSON.parse(
      fs.readFileSync(path.join(output, "coverage.json")),
    );
    assert.deepEqual(saved.executedProofs, [
      { obligationId: id, boundary: "ccd", status: "passed" },
    ]);
    assert(
      saved.provenance.sourceManifest.some(
        (item) =>
          item.repository === "prl-ccd-definitions" &&
          item.revision === "694b9951e94369f1394380506960c4f04f25755d",
      ),
    );
    assert.equal(saved.evidenceReferences.length, 2);
    assert.equal(saved.releaseCredit, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("accepted Work Basket proof credits ten pinned PRL shape rows and rejects receipt drift", async () => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-workbasket-"));
  try {
    const bundle = await completeCcdBundle(root, undefined, manifest => {
      manifest.runtimeMetadata.workbasketImportDigest = "fixture";
    });
    const result = api.projectConfigurationCoverage({ phaseDirectory: bundle.directory });
    assert.equal(result.report.coverage.candidate, 10);
    assert.equal(result.report.coverage.ccd, 1);
    assert.equal(result.report.executedProofs.filter(item => item.boundary === "candidate").length, 10);
    const receipt = path.join(root, "ccd-runtime/workbasket-input-import/receipt.json");
    const changed = JSON.parse(fs.readFileSync(receipt));
    changed.observations.inputs.body.workbasketInputs[0].label = "wrong";
    fs.writeFileSync(receipt, JSON.stringify(changed));
    assert.throws(() => api.projectConfigurationCoverage({ phaseDirectory: bundle.directory }), /DIGEST|DRIFT|MISMATCH/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("support only: actual CI accounting block bridges an independently captured expectation without a receipt digest to the existing validator and catalogue", async () => {
  const { validateCiPhase } =
    await import("./lib/exui-candidate-ci-evidence.mjs");
  const { writeConfigurationCoverage } =
    await import("./lib/exui-configuration-runtime-coverage.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-ci-bridge-"));
  try {
    const bundle = await completeCcdBundle(root),
      result = { expected: { ...bundle.expected }, terminal: bundle.terminal };
    delete result.expected.receiptArtifactDigest;
    const source = fs.readFileSync(
      path.resolve("scripts/run-harness-ci.mjs"),
      "utf8",
    );
    const block = source.match(
      /const validated = validateCiPhase\([\s\S]*?return validated;/,
    )?.[0];
    assert(block);
    const finalize = new Function(
      "validateCiPhase",
      "writeConfigurationCoverage",
      "ROOT",
      "path",
      "privateRoot",
      "directory",
      "result",
      "name",
      "phaseResults",
      "context",
      block,
    );
    const phases = [];
    assert.equal(
      finalize(
        validateCiPhase,
        writeConfigurationCoverage,
        path.resolve("."),
        path,
        root,
        bundle.directory,
        result,
        "ccd",
        phases,
        {},
      ).status,
      "PASS",
    );
    const report = JSON.parse(
      fs.readFileSync(path.join(root, "configuration/coverage.json")),
    );
    assert.equal(report.coverage.ccd, 1);
    assert.equal(report.coverage.missingCandidateOrCcd.length, 111);
    assert.equal(
      result.expected.receiptArtifactDigest,
      undefined,
      "pre-execution identity remains independent",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const fault of [
  "wrong-candidate",
  "wrong-run",
  "wrong-transport",
  "wrong-harness",
  "wrong-policy",
  "wrong-definition",
  "wrong-import",
  "wrong-observed-definition",
  "missing-report",
  "corrupt-report",
  "duplicate-proof",
  "skipped-proof",
  "interrupted",
  "wrong-receipt",
  "wrong-terminal",
  "model-status-claim",
])
  test("support only: coverage cannot credit " + fault, async () => {
    const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-negative-"));
    try {
      const b = await completeCcdBundle(root),
        output = path.join(root, "configuration");
      const args = {
        harnessRoot: path.resolve("."),
        output,
        phaseDirectory: b.directory,
        expected: structuredClone(b.expected),
        terminal: { ...b.terminal },
      };
      api.writeConfigurationCoverage({
        harnessRoot: path.resolve("."),
        output,
      });
      if (fault === "wrong-run") args.expected.runId = "foreign-run";
      if (fault === "wrong-transport")
        args.expected.receiptArtifactDigest = "sha256:" + "0".repeat(64);
      if (fault === "wrong-candidate")
        args.expected.identity.artifactDigest = "sha256:" + "0".repeat(64);
      if (fault === "wrong-harness")
        args.expected.harnessCommit = "0".repeat(40);
      if (fault === "wrong-policy")
        args.expected.policyDigest = "sha256:" + "0".repeat(64);
      if (fault === "wrong-definition")
        args.expected.identity.definitionDigests.HarnessNestedPRL =
          "sha256:" + "0".repeat(64);
      if (fault === "wrong-import")
        fs.writeFileSync(
          path.join(root, "ccd-runtime/definition-import.json"),
          "{}",
        );
      if (fault === "wrong-observed-definition")
        fs.writeFileSync(
          path.join(root, "ccd-runtime/observed-definition.json"),
          "{}",
        );
      if (fault === "missing-report")
        fs.unlinkSync(path.join(b.directory, "baseline/report.json"));
      if (
        ["corrupt-report", "duplicate-proof", "skipped-proof"].includes(fault)
      ) {
        const file = path.join(b.directory, "baseline/report.json"),
          r = JSON.parse(fs.readFileSync(file));
        if (fault === "corrupt-report") r.context.runId = "foreign-run";
        if (fault === "duplicate-proof") r.tests.push(r.tests[0]);
        if (fault === "skipped-proof")
          r.tests.find((x) => x.proofId === "ccd-postal-two-roundtrip").status =
            "skipped";
        fs.writeFileSync(file, JSON.stringify(r));
      }
      if (fault === "interrupted")
        fs.writeFileSync(
          path.join(b.directory, "controller-terminal.json"),
          JSON.stringify({ status: "interrupted", cleanupComplete: true }),
        );
      if (fault === "wrong-receipt")
        fs.writeFileSync(path.join(b.directory, "gate.json"), "{}");
      if (fault === "wrong-terminal")
        args.terminal = { code: null, signal: "SIGTERM" };
      if (fault === "model-status-claim")
        args.executedProofs = [
          { obligationId: id, boundary: "ccd", status: "passed" },
        ];
      assert.throws(() => api.writeConfigurationCoverage(args));
      const saved = JSON.parse(
        fs.readFileSync(path.join(output, "coverage.json")),
      );
      assert.equal(saved.coverage.ccd, 0);
      assert.equal(saved.coverage.missingCandidateOrCcd.length, 112);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

async function refinalizeBlockedBundle(bundle, change) {
  const { digestBytes, loadRunEvidence } =
    await import("./lib/exui-evidence-io.mjs");
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const runPath = path.join(bundle.directory, "run.json"),
    run = JSON.parse(fs.readFileSync(runPath));
  for (const ref of run.executionArtifacts) {
    const file = path.join(bundle.directory, ref.path),
      execution = JSON.parse(fs.readFileSync(file));
    const reportPath = path.join(
        bundle.directory,
        execution.resultArtifact.path,
      ),
      report = JSON.parse(fs.readFileSync(reportPath));
    change(report, execution);
    execution.unexpectedGlobalErrors = report.globalErrors;
    fs.writeFileSync(reportPath, JSON.stringify(report));
    execution.resultArtifact.digest = digestBytes(fs.readFileSync(reportPath));
    fs.writeFileSync(file, JSON.stringify(execution));
    ref.digest = digestBytes(fs.readFileSync(file));
  }
  fs.writeFileSync(runPath, JSON.stringify(run));
  const { receipt } = loadRunEvidence(
    runPath,
    getReleasePolicy("exui-ccd-pilot"),
  );
  assert.equal(receipt.verdict.status, "BLOCKED");
  fs.writeFileSync(
    path.join(bundle.directory, "gate.json"),
    JSON.stringify(receipt),
  );
  bundle.expected.receiptArtifactDigest = digestBytes(
    fs.readFileSync(path.join(bundle.directory, "gate.json")),
  );
  fs.writeFileSync(
    path.join(bundle.directory, "controller-terminal.json"),
    JSON.stringify({ status: "completed", exitCode: 2, cleanupComplete: true }),
  );
  return { code: 2, signal: null };
}

for (const fault of [
  "skipped",
  "retry",
  "startup-not-witness",
  "unrelated-teardown",
  "baseline-product-failure",
])
  test(
    "support only: coherently finalized " +
      fault +
      " remains uncredited after the actual evaluator",
    async () => {
      const api = await import("./lib/exui-configuration-runtime-coverage.mjs"),
        root = fs.mkdtempSync(
          path.join(os.tmpdir(), "coverage-finalized-block-"),
        );
      try {
        const b = await completeCcdBundle(root),
          output = path.join(root, "configuration");
        const terminal = await refinalizeBlockedBundle(
          b,
          (report, execution) => {
            const postal = report.tests.find(
              (t) => t.proofId === "ccd-postal-two-roundtrip",
            );
            const mutant = report.tests.find(
              (t) => t.proofId === "ccd-postal-child-loss",
            );
            if (fault === "skipped" && postal) postal.status = "skipped";
            if (fault === "retry" && postal) postal.retry = 1;
            if (fault === "startup-not-witness" && mutant) {
              mutant.failureId = null;
              mutant.unattributedErrors = 1;
            }
            if (fault === "unrelated-teardown" && mutant)
              report.globalErrors = ["unexpected-global-teardown"];
            if (fault === "baseline-product-failure" && postal) {
              postal.status = "failed";
              postal.failureId = "postal-required-fields";
              report.status = "failed";
              execution.runnerExitCode = 1;
            }
          },
        );
        const result = api.writeConfigurationCoverage({
          harnessRoot: path.resolve("."),
          output,
          phaseDirectory: b.directory,
          expected: b.expected,
          terminal,
        });
        assert.equal(result.coverage.ccd, 0);
        assert.equal(result.coverage.missingCandidateOrCcd.length, 112);
        const saved = JSON.parse(
          fs.readFileSync(path.join(output, "coverage.json")),
        );
        assert.deepEqual(saved.executedProofs, []);
        assert.equal(saved.unacceptedExecutionFacts.length, 1);
        if (fault === "baseline-product-failure") {
          assert.equal(saved.unacceptedExecutionFacts[0].outcome, "failed");
          assert.equal(
            saved.unacceptedExecutionFacts[0].failureId,
            "postal-required-fields",
          );
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

for (const fault of [
  "projection-revision",
  "projection-content",
  "sequence-removed",
  "sequence-and-example-removed",
  "fixture-source",
  "workbook",
])
  test(
    "support only: portable catalogue rejects " +
      fault +
      " without self-approving its source inputs",
    async () => {
      const api = await import("./lib/exui-configuration-runtime-coverage.mjs"),
        root = fs.mkdtempSync(
          path.join(os.tmpdir(), "coverage-source-invalid-"),
        );
      try {
        for (const file of [
          "scripts/fixtures/exui-configuration-source.json",
          "scripts/fixtures/exui-configuration-review.json",
          "scripts/fixtures/ccd/nested-prl.json",
          "scripts/fixtures/ccd/nested-prl.binding.json",
          "scripts/fixtures/ccd/nested-prl.xlsx",
        ]) {
          fs.mkdirSync(path.dirname(path.join(root, file)), {
            recursive: true,
          });
          fs.copyFileSync(file, path.join(root, file));
        }
        if (fault.startsWith("projection")) {
          const file = path.join(
              root,
              "scripts/fixtures/exui-configuration-source.json",
            ),
            s = JSON.parse(fs.readFileSync(file));
          const prl = s.sources.find(
            (item) => item.repository === "prl-ccd-definitions",
          );
          if (fault === "projection-revision") prl.revision = "0".repeat(40);
          else prl.document[0].FieldType = "Unsupported";
          fs.writeFileSync(file, JSON.stringify(s));
        }
        if (fault.startsWith("sequence")) {
          const file = path.join(
              root,
              "scripts/fixtures/exui-configuration-review.json",
            ),
            r = JSON.parse(fs.readFileSync(file));
          r.sourceSequences = [];
          if (fault === "sequence-and-example-removed")
            r.knownValidSequences = [];
          fs.writeFileSync(file, JSON.stringify(r));
        }
        if (fault === "fixture-source")
          fs.appendFileSync(
            path.join(root, "scripts/fixtures/ccd/nested-prl.json"),
            " ",
          );
        if (fault === "workbook")
          fs.appendFileSync(
            path.join(root, "scripts/fixtures/ccd/nested-prl.xlsx"),
            "corrupt",
          );
        assert.throws(() => api.loadCommittedConfigurationCatalogue(root));
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

test("support only: native committed-summary loading needs no source checkout or parsing dependencies", () => {
  const { execFileSync } = require("node:child_process");
  const program = `
    import Module from 'node:module';
    import fs from 'node:fs';
    const original = Module._load;
    Module._load = function(name, ...args) {
      if (['typescript', 'js-yaml'].includes(name)) throw Error('SOURCE_PARSER_LOADED');
      return original.call(this, name, ...args);
    };
    const originalRead = fs.readFileSync;
    fs.readFileSync = function(file, ...args) {
      if (String(file).includes('/definitions/private-law/json/')) throw Error('OWNER_SOURCE_READ');
      return originalRead.call(this, file, ...args);
    };
    const { loadCommittedConfigurationCatalogue } = await import('./scripts/lib/exui-configuration-runtime-coverage.mjs');
    const loaded = loadCommittedConfigurationCatalogue();
    if (loaded.catalogue.obligations.length !== 112 || loaded.validation.errors.length || loaded.catalogue.definitionDiscovery.graphAvailable !== false) process.exit(2);
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", program], {
    cwd: path.resolve("."),
    stdio: "pipe",
  });
});

const eventCell =
  "configuration-cell:a6d5e8421152eca670bc39912f6781824bfc3190d2b78ed9ea7757b5f168e313";
const routingCell =
  "configuration-decentralisation:52f63ce0d43f0422438b698894746ce1dc0e7062288fc8a09fcfd93b84cf2f1c";
async function completeRoutingBundle(root, values = {}) {
  const { createRoutingPhaseFixture } = require(
    "./fixtures/exui-routing-phase-evidence.mock.cjs",
  );
  return createRoutingPhaseFixture({ root, ...values });
}

test("support only: complete routing phase credits its single reviewed PCS source obligation", async (t) => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "coverage-routing-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const routing = await completeRoutingBundle(root);
  const projected = api.projectConfigurationCoverage({
    routingPhaseDirectory: routing.directory,
  });
  assert.equal(projected.report.coverage.selected, 112);
  assert.equal(projected.report.coverage.candidate, 1);
  assert.equal(projected.report.coverage.ccd, 0);
  assert.equal(projected.report.coverage.missingCandidateOrCcd.length, 111);
  assert.deepEqual(projected.report.executedProofs, [


    { obligationId: routingCell, boundary: "candidate", status: "passed" },
  ]);
  assert.equal(projected.phaseReferences.routing.status, "PASS");
  assert.equal(projected.phaseReferences.routing.runId, routing.expected.runId);
  assert.equal(projected.report.releaseCredit, false);
  assert(
    !projected.report.gaps.some((gap) =>
      /candidate-event-redirect-not-demonstrated|noc-session-routing-not-demonstrated|decentralised-interpretation-context-not-candidate-verified/.test(gap),
    ),
  );
});

test("support only: unsuccessful PCS routing evidence earns no candidate coverage", async (t) => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "coverage-routing-failed-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const routing = await completeRoutingBundle(root, {
    failedProofId: "routing-noc-session-cache",
  });
  const projected = api.projectConfigurationCoverage({
    routingPhaseDirectory: routing.directory,
  });
  assert.equal(projected.phaseReferences.routing.status, "BLOCKED");
  assert.equal(projected.report.coverage.candidate, 0);
  assert.equal(projected.report.coverage.missingCandidateOrCcd.length, 112);
  assert.deepEqual(projected.report.executedProofs, []);
});

test("support only: routing coverage rejects an altered sealed interpreter pin", async (t) => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "coverage-routing-pin-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const routing = await completeRoutingBundle(root);
  const inputPath = path.join(routing.directory, "input.json");
  const input = JSON.parse(fs.readFileSync(inputPath));
  input.routingInterpreter.implementation.apiBundle.digest = "sha256:" + "0".repeat(64);
  fs.writeFileSync(inputPath, JSON.stringify(input));
  assert.throws(
    () =>
      api.projectConfigurationCoverage({
        routingPhaseDirectory: routing.directory,
      }),
    /COVERAGE_ROUTING_INTERPRETER_MISMATCH/,
  );
});

async function completeEventBundle(root) {
  const {
    createEventTransitionFixture,
  } = require("./fixtures/exui-event-transition-evidence.mock.cjs");
  return createEventTransitionFixture(undefined, { root });
}

test("support only: complete event phase credits the exact courtadmin edit and read cells without changing112 obligations", async (t) => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "coverage-event-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const event = await completeEventBundle(root);
  const before =
    api.loadCommittedConfigurationCatalogue().catalogue.obligations;
  assert.equal(
    digestBytes(JSON.stringify(before.map(item => item.kind === "shared-policy" ? {...item, sourceKeys: []} : item))),
    "sha256:66ab9952a57c8e9ae728e075d132302a0a80b66c0d798f7d03f6f79599b945bb",
  );
  const projected = api.projectConfigurationCoverage({
    eventPhaseDirectory: event.directory,
  });
  assert.deepEqual(projected.catalogue.obligations, before);
  assert.deepEqual(projected.report.executedProofs, [
    {obligationId:"configuration-shape:69bcacf62a9db6f81914356612c4c4d770865dd287bc48704f88be54013bbe49",boundary:"candidate",status:"passed"},
    {obligationId:"configuration-shape:02958e8aee4cc1376f6b6607883e90293d8d2c765b4e9796884a61e24123919e",boundary:"candidate",status:"passed"},
    {obligationId:"configuration-shape:9ece0d15adfefeabf964c0905981f1343b26487ad4e68f47a9d7bcbf73aaa757",boundary:"candidate",status:"passed"},
    { obligationId: eventCell, boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:1413f10a8d3caf763c82b901d8cc627bb73e555ee4c57aaea5a53ef5e378bc66", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:6e8617ff5fd98ab11df8d26d96f3d420e0f4eadfe5a36b23e10095a0e2ec6bf3", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:2b80551e385239c5c2e13878ae7645cbeb938e68dda2bcabe52d1ad68046dc65", boundary: "ccd", status: "passed" },

    { obligationId: "configuration-cell:8c1a3f11d156a5557c5400305414da596d644a4d2378aa539753a7e9fc88d76a", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:a4563399414365b47e8e8358355038fa5a3398127584c2b821674be2525462ba", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:5e6b7152607a4c223cb1cb1c8912d4837a71fca9e27e5fd5ef3cd8f60d7096a6", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:d418df10fcef3e7a349c270d06a975ac9d1381ea428cf1fc4e955ea968680397", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:2a2bf38052f112d7dbe5982d38785085948e100327169e49300047def7a224ea", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:8c9effa57e804623271da0fc5d054a2fa69389cb8b2bb4fa179f35e75fa38a59", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:32b597279bd96db1646aaf4bfb440504a79d327907018d89d30253f6b02315de", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:f7f66f942a035e26181e64394e37d1a02fb113bff32db52c94906c1842222bbb", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:8b58b9887954abf5777c3e444bd4876fcdae07c4955880fedf50582aefb3e58a", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:fbf6c3058a52de86c9a6323bbb4428c0fe9b9faf0d72c33080b945397418f8ec", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:b0d9eefe2d358d1516cb7d564c171fd623357dcb32a90a4d8989ecf7a61e14cf", boundary: "ccd", status: "passed" },
    { obligationId: "configuration-cell:8d000fcc1cafb9115e2702da1907d9e6e843d9add4c9c03f8fb49d52d769f337", boundary: "ccd", status: "passed" },
  ]);
  assert.equal(projected.report.coverage.candidate, 3);
  assert.equal(projected.report.coverage.ccd, 16);
  assert.equal(projected.report.coverage.missingCandidateOrCcd.length, 93);
  assert.equal(projected.report.releaseCredit, false);
  assert.equal(
    projected.phaseReferences.eventCapability.receiptArtifactDigest,
    event.expected.receiptArtifactDigest,
  );
  const result = api.writeConfigurationCoverage({
    output: path.join(root, "coverage"),
    eventPhase: {
      directory: event.directory,
      expected: event.expected,
      terminal: event.terminal,
    },
  });
  assert.equal(result.coverage.ccd, 16);
});

async function refreshEventBundle(bundle, edit) {
  const { digestBytes, loadRunEvidence } =
    await import("./lib/exui-evidence-io.mjs");
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const file = path.join(bundle.directory, "run.json"),
    run = JSON.parse(fs.readFileSync(file));
  for (const ref of run.executionArtifacts) {
    const executionPath = path.join(bundle.directory, ref.path),
      execution = JSON.parse(fs.readFileSync(executionPath));
    const reportPath = path.join(
        bundle.directory,
        execution.resultArtifact.path,
      ),
      report = JSON.parse(fs.readFileSync(reportPath));
    edit(report, execution, run);
    execution.unexpectedGlobalErrors = report.globalErrors;
    fs.writeFileSync(reportPath, JSON.stringify(report));
    execution.resultArtifact.digest = digestBytes(fs.readFileSync(reportPath));
    fs.writeFileSync(executionPath, JSON.stringify(execution));
    ref.digest = digestBytes(fs.readFileSync(executionPath));
  }
  fs.writeFileSync(file, JSON.stringify(run));
  const loaded = loadRunEvidence(
    file,
    getReleasePolicy(run.manifest.releaseScopeId),
  );
  fs.writeFileSync(
    path.join(bundle.directory, "gate.json"),
    JSON.stringify(loaded.receipt),
  );
  bundle.expected.receiptArtifactDigest = digestBytes(
    fs.readFileSync(path.join(bundle.directory, "gate.json")),
  );
  bundle.terminal.code = loaded.receipt.verdict.exitCode;
  fs.writeFileSync(
    path.join(bundle.directory, "controller-terminal.json"),
    JSON.stringify({
      status: "completed",
      exitCode: bundle.terminal.code,
      cleanupComplete: true,
    }),
  );
  return loaded.receipt;
}

for (const oldBlocked of [false, true])
  test(
    "support only: event union preserves postal " +
      (oldBlocked
        ? "BLOCKED without overall approval"
        : "PASS as a separate accepted sequence"),
    async (t) => {
      const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
      const root = fs.mkdtempSync(
        path.join(fs.realpathSync(os.tmpdir()), "coverage-union-"),
      );
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const event = await completeEventBundle(root),
        postal = await completeCcdBundle(root, event.manifest);
      if (oldBlocked)
        postal.terminal = await refinalizeBlockedBundle(
          postal,
          (report, execution) => {
            const test = report.tests.find(
              (x) => x.proofId === "ccd-postal-two-roundtrip",
            );
            if (test) {
              test.status = "failed";
              test.failureId = "postal-required-fields";
              report.status = "failed";
              execution.runnerExitCode = 1;
            }
          },
        );
      const before = fs.readFileSync(path.join(postal.directory, "gate.json"));
      const projected = api.projectConfigurationCoverage({
        phaseDirectory: postal.directory,
        eventPhaseDirectory: event.directory,
      });
      assert.equal(projected.report.coverage.ccd, oldBlocked ? 16 : 17);
      assert.equal(
        projected.report.coverage.missingCandidateOrCcd.length,
        oldBlocked ? 93 : 92,
      );
      assert.equal(
        projected.phaseReferences.ccd.status,
        oldBlocked ? "BLOCKED" : "PASS",
      );
      assert.equal(projected.phaseReferences.eventCapability.status, "PASS");
      assert.equal(projected.report.releaseCredit, false);
      assert.deepEqual(
        fs.readFileSync(path.join(postal.directory, "gate.json")),
        before,
      );
      const result = api.writeConfigurationCoverage({
        output: path.join(root, "coverage"),
        phaseDirectory: postal.directory,
        expected: postal.expected,
        terminal: postal.terminal,
        eventPhase: {
          directory: event.directory,
          expected: event.expected,
          terminal: event.terminal,
        },
      });
      assert.equal(result.coverage.ccd, oldBlocked ? 16 : 17);
    },
  );

for (const fault of [
  "judge-failed",
  "courtadmin-failed",
  "wrong-courtadmin-update-mutation-failure",
  "read-failed",
  "readonly-failed",
  "readonly-update-failed",
  "wrong-readonly-update-mutation-failure",
  "wrong-readonly-mutation-failure",
  "wrong-read-mutation-failure",
  "wrong-mutation-failure",
])
  test(
    "support only: passed courtadmin cannot credit a coherently unsuccessful event phase " +
      fault,
    async (t) => {
      const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
      const root = fs.mkdtempSync(
        path.join(fs.realpathSync(os.tmpdir()), "coverage-event-outcome-"),
      );
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const b = await completeEventBundle(root);
      const receipt = await refreshEventBundle(b, (report, execution) => {
        const target = fault === "wrong-courtadmin-update-mutation-failure" ? "ccd-courtadmin-update-recipient-shapes-denied"
          : fault === "readonly-update-failed" ? "ccd-readonly-update-recipient-shapes-denied"
          : fault === "wrong-readonly-update-mutation-failure" ? "ccd-readonly-update-recipient-shapes-enabled"
          : fault === "readonly-failed" ? "ccd-readonly-read-recipient-shapes"
          : fault === "wrong-readonly-mutation-failure" ? "ccd-readonly-read-shapes-hidden"
          : fault === "judge-failed"
            ? "ccd-event-create-denied"
            : fault === "courtadmin-failed"
              ? "ccd-courtadmin-update-recipient-shapes"
              : fault === "read-failed"
                ? "ccd-courtadmin-read-recipient-shapes"
                : fault === "wrong-read-mutation-failure"
                  ? "ccd-courtadmin-read-shapes-hidden"
                  : "ccd-event-create-enabled";
        const test = report.tests.find((x) => x.proofId === target);
        if (test) {
          test.status = "failed";
          test.failureId = "different-assertion";
          report.status = "failed";
          execution.runnerExitCode = 1;
        }
      });
      assert.notEqual(receipt.verdict.status, "PASS");
      const p = api.projectConfigurationCoverage({
        eventPhaseDirectory: b.directory,
      });
      assert.equal(p.report.coverage.ccd, 0);
      assert.equal(p.report.coverage.missingCandidateOrCcd.length, 112);
      assert.deepEqual(p.report.executedProofs, []);
      assert.equal(
        p.report.unacceptedExecutionFacts[0].gateStatus,
        receipt.verdict.status,
      );
    },
  );

for (const fault of [
  "retry",
  "skipped",
  "missing-proof",
  "wrong-proof",
  "interrupted",
  "incomplete-cleanup",
  "wrong-import",
  "swapped-import",
  "observed-acl",
  "missing-import",
  "aliased-import",
  "namespace-reuse",
  "role-alias",
  "extra-derivation-change",
  "wrong-receipt",
  "wrong-expected",
  "wrong-terminal",
])
  test("support only: exact event coverage rejects " + fault, async (t) => {
    const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "coverage-event-negative-"),
    );
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const b = await completeEventBundle(root);
    const change = (relative, edit) => {
      const file = path.join(root, relative),
        value = JSON.parse(fs.readFileSync(file));
      edit(value);
      fs.writeFileSync(file, JSON.stringify(value));
    };
    if (["retry", "skipped", "missing-proof", "wrong-proof"].includes(fault)) {
      try {
        await refreshEventBundle(b, (r, e) => {
          if (e.kind !== "baseline") return;
          if (fault === "retry") r.tests[0].retry = 1;
          if (fault === "skipped") r.tests[0].status = "skipped";
          if (fault === "missing-proof") r.tests.pop();
          if (fault === "wrong-proof")
            r.tests[0].proofId = "ccd-postal-two-roundtrip";
        });
      } catch (error) {
        assert.match(
          error.message,
          /MISSING_OR_RETRIED_MUTATION_PROOF|UNKNOWN_OR_EXPECTED_FAILURE_PROOF/,
        );
      }
    }
    if (fault === "interrupted")
      change("eventCapability/controller-terminal.json", (v) => {
        v.status = "interrupted";
      });
    if (fault === "incomplete-cleanup")
      change("eventCapability/controller-terminal.json", (v) => {
        v.cleanupComplete = false;
      });
    if (fault === "wrong-import")
      change("event-baseline-runtime/definition-import.json", (v) => {
        v.binding.sourceDigest = "sha256:" + "0".repeat(64);
      });
    if (fault === "swapped-import")
      fs.copyFileSync(
        path.join(root, "event-mutant-runtime/definition-import.json"),
        path.join(root, "event-baseline-runtime/definition-import.json"),
      );
    if (fault === "observed-acl")
      change("event-mutant-runtime/observed-definition.json", (v) => {
        v.events.find((x) => x.id === "serviceOfDocuments").acls[0].create =
          false;
      });
    if (fault === "missing-import")
      fs.unlinkSync(
        path.join(root, "event-mutant-runtime/definition-import.json"),
      );
    if (fault === "aliased-import") {
      const file = path.join(
        root,
        "event-mutant-runtime/definition-import.json",
      );
      fs.renameSync(file, file + ".original");
      fs.symlinkSync(file + ".original", file);
    }
    if (fault === "namespace-reuse")
      change(
        "eventCapability/ccd-enable-judge-event/runtime-input.json",
        (v) => {
          v.ccd.namespace = b.input.ccd.namespace;
        },
      );
    if (fault === "role-alias")
      change("eventCapability/input.json", (v) => {
        v.credentials.courtadmin.roles.push("caseworker-harness-allowed");
      });
    if (fault === "extra-derivation-change")
      change("eventCapability/ccd-enable-judge-event/derivation.json", (v) => {
        v.transformationRecord.after = "CRUD";
      });
    if (fault === "wrong-receipt")
      change("eventCapability/gate.json", (v) => {
        v.verdict.status = "BLOCKED";
      });
    if (fault === "wrong-expected")
      b.expected.identity = {
        ...b.expected.identity,
        artifactDigest: "sha256:" + "0".repeat(64),
      };
    if (fault === "wrong-terminal") b.terminal.code = 2;
    assert.throws(() =>
      api.writeConfigurationCoverage({
        output: path.join(root, "coverage"),
        eventPhase: {
          directory: b.directory,
          expected: b.expected,
          terminal: b.terminal,
        },
      }),
    );
    assert.equal(
      fs.existsSync(path.join(root, "coverage/coverage.json")),
      false,
    );
  });

for (const field of [
  "candidate",
  "webapp",
  "harness",
  "source",
  "dependencies",
  "browser",
  "ccd-image",
  "ccd-api",
])
  test(
    "support only: independently evaluated phases cannot aggregate a different " +
      field,
    async (t) => {
      const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
      const root = fs.mkdtempSync(
        path.join(fs.realpathSync(os.tmpdir()), "coverage-mixed-identity-"),
      );
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const event = await completeEventBundle(root);
      const postal = await completeCcdBundle(
        root,
        event.manifest,
        (manifest) => {
          const d = "sha256:" + "0".repeat(64);
          if (field === "candidate") manifest.identity.artifactDigest = d;
          if (field === "webapp")
            manifest.identity.webappCommit = "0".repeat(40);
          if (field === "harness") manifest.harnessCommit = "0".repeat(40);
          if (field === "source")
            manifest.runtimeMetadata.harnessSourceDigest = d;
          if (field === "dependencies")
            manifest.runtimeMetadata.harnessDependencyDigest = d;
          if (field === "browser") manifest.runtimeMetadata.browserDigest = d;
          if (field === "ccd-image")
            manifest.identity.dependencyIdentities.ccd.artifactDigest = d;
          if (field === "ccd-api")
            manifest.identity.dependencyIdentities.ccd.apiContractDigest = d;
        },
      );
      assert.throws(
        () =>
          api.projectConfigurationCoverage({
            phaseDirectory: postal.directory,
            eventPhaseDirectory: event.directory,
          }),
        /COVERAGE_CROSS_PHASE_IDENTITY_MISMATCH/,
      );
    },
  );

test("support only: fixed event source overlap, exact cell and sequence reject substituted attributes", async (t) => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const { bindEventCoverage } =
    await import("./lib/exui-event-coverage-binding.mjs");
  const { loadRunEvidence } = await import("./lib/exui-evidence-io.mjs");
  const { getReleasePolicy } = await import("./lib/exui-release-policy.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "coverage-cell-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const b = await completeEventBundle(root),
    committed = api.loadCommittedConfigurationCatalogue();
  const loaded = loadRunEvidence(
    path.join(b.directory, "run.json"),
    getReleasePolicy(b.manifest.releaseScopeId),
  );
  for (const change of [
    ...["1413f10a8d3caf763c82b901d8cc627bb73e555ee4c57aaea5a53ef5e378bc66", "6e8617ff5fd98ab11df8d26d96f3d420e0f4eadfe5a36b23e10095a0e2ec6bf3", "2b80551e385239c5c2e13878ae7645cbeb938e68dda2bcabe52d1ad68046dc65"].flatMap(id => [
      c => { c.catalogue.pilotCells.find(x => x.id === "configuration-cell:" + id).expectedAccess = "denied"; },
      c => { c.catalogue.pilotCells.find(x => x.id === "configuration-cell:" + id).action = "read"; },
      c => { c.catalogue.obligations.find(x => x.id === "configuration-cell:" + id).sequence = ["readback"]; },
    ]),
    ...["2a2bf38052f112d7dbe5982d38785085948e100327169e49300047def7a224ea", "8c9effa57e804623271da0fc5d054a2fa69389cb8b2bb4fa179f35e75fa38a59", "32b597279bd96db1646aaf4bfb440504a79d327907018d89d30253f6b02315de", "f7f66f942a035e26181e64394e37d1a02fb113bff32db52c94906c1842222bbb"].flatMap(id => [
      c => { c.catalogue.pilotCells.find(x => x.id === "configuration-cell:" + id).expectedAccess = "allowed"; },
      c => { c.catalogue.pilotCells.find(x => x.id === "configuration-cell:" + id).action = "read"; },
      c => { c.catalogue.obligations.find(x => x.id === "configuration-cell:" + id).sequence = ["read", "assert-visible-projection"]; },
    ]),
    ...["8b58b9887954abf5777c3e444bd4876fcdae07c4955880fedf50582aefb3e58a", "fbf6c3058a52de86c9a6323bbb4428c0fe9b9faf0d72c33080b945397418f8ec", "b0d9eefe2d358d1516cb7d564c171fd623357dcb32a90a4d8989ecf7a61e14cf", "8d000fcc1cafb9115e2702da1907d9e6e843d9add4c9c03f8fb49d52d769f337"].map(id => c => {
      c.catalogue.pilotCells.find(x => x.id === "configuration-cell:" + id).role = "caseworker-privatelaw-courtadmin";
    }),
    ...["a4563399414365b47e8e8358355038fa5a3398127584c2b821674be2525462ba", "5e6b7152607a4c223cb1cb1c8912d4837a71fca9e27e5fd5ef3cd8f60d7096a6", "d418df10fcef3e7a349c270d06a975ac9d1381ea428cf1fc4e955ea968680397"].map(id => c => {
      c.catalogue.pilotCells.find(x => x.id === "configuration-cell:" + id).recipientCount = 3;
    }),
    (c) => { c.catalogue.pilotCells.find(x => x.id === "configuration-cell:8c1a3f11d156a5557c5400305414da596d644a4d2378aa539753a7e9fc88d76a").action = "update"; },
    (c) => { c.catalogue.obligations.find(x => x.id === "configuration-cell:8c1a3f11d156a5557c5400305414da596d644a4d2378aa539753a7e9fc88d76a").sequence = ["readback"]; },
    (c) => {
      c.catalogue.pilotCells.find((x) => x.id === eventCell).role =
        "caseworker-privatelaw-judge";
    },
    (c) => {
      c.catalogue.pilotCells.find((x) => x.id === eventCell).channel = "post";
    },
    (c) => {
      c.catalogue.pilotCells.find((x) => x.id === eventCell).recipientCount = 2;
    },
    (c) => {
      c.catalogue.pilotCells.find((x) => x.id === eventCell).action = "read";
    },
    (c) => {
      c.catalogue.obligations
        .find((x) => x.id === eventCell)
        .sequence.splice(2, 1);
    },
    (c) => {
      c.snapshot.sources.find((x) =>
        x.path.endsWith("CaseEvent/ServiceOfDocuments/CaseEvent-nonprod.json"),
      ).fileDigest = "0".repeat(64);
    },
    (c) => {
      c.snapshot.sources.find((x) =>
        x.path.endsWith("CaseEvent/ServiceOfDocuments/CaseEvent-nonprod.json"),
      ).document[0].PostConditionState = "OTHER";
    },
  ]) {
    const changed = structuredClone(committed);
    change(changed);
    assert.throws(
      () =>
        bindEventCoverage({
          harnessRoot: path.resolve("."),
          ...changed,
          directory: b.directory,
          loaded,
        }),
      /COVERAGE_EVENT_(CELL|OBLIGATION|SOURCE)/,
    );
  }
});

test("support only: both coherently blocked phases earn zero and duplicate phase input rejects", async (t) => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "coverage-no-credit-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const event = await completeEventBundle(root),
    postal = await completeCcdBundle(root, event.manifest);
  postal.terminal = await refinalizeBlockedBundle(postal, (r, e) => {
    const p = r.tests.find((x) => x.proofId === "ccd-postal-two-roundtrip");
    if (p) {
      p.status = "failed";
      p.failureId = "postal-required-fields";
      r.status = "failed";
      e.runnerExitCode = 1;
    }
  });
  await refreshEventBundle(event, (r, e) => {
    const p = r.tests.find((x) => x.proofId === "ccd-event-create-denied");
    if (p) {
      p.status = "failed";
      p.failureId = "event-metadata";
      r.status = "failed";
      e.runnerExitCode = 1;
    }
  });
  const p = api.projectConfigurationCoverage({
    phaseDirectory: postal.directory,
    eventPhaseDirectory: event.directory,
  });
  assert.equal(p.report.coverage.ccd, 0);
  assert.equal(p.report.coverage.missingCandidateOrCcd.length, 112);
  assert.equal(p.phaseReferences.ccd.status, "BLOCKED");
  assert.equal(p.phaseReferences.eventCapability.status, "BLOCKED");
  assert.throws(
    () =>
      api.projectConfigurationCoverage({
        phaseDirectory: event.directory,
        eventPhaseDirectory: event.directory,
      }),
    /COVERAGE_DUPLICATE_PHASE/,
  );
});

for (const fault of ["namespace", "import-observation", "runtime-record"])
  test(
    "support only: coherent fault side-file rewrite cannot escape the sealed derivation " +
      fault,
    async (t) => {
      const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
      const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
      const root = fs.mkdtempSync(
        path.join(fs.realpathSync(os.tmpdir()), "coverage-sealed-transition-"),
      );
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const b = await completeEventBundle(root),
        rtPath = path.join(
          b.directory,
          "ccd-enable-judge-event/runtime-input.json",
        ),
        manifestPath = path.join(
          b.directory,
          "ccd-enable-judge-event/manifest.json",
        );
      const rt = JSON.parse(fs.readFileSync(rtPath)),
        manifest = JSON.parse(fs.readFileSync(manifestPath));
      if (fault === "namespace") {
        rt.ccd.namespace = "3".repeat(64);
        manifest.runtimeMetadata.ccdNamespace = rt.ccd.namespace;
        const importPath=path.join(root,"event-mutant-runtime/definition-import.json");
        const imported=JSON.parse(fs.readFileSync(importPath));
        imported.storedSourceShapeDates.namespace=rt.ccd.namespace;
        fs.writeFileSync(importPath,JSON.stringify(imported));
        rt.definitionImportDigest=digestBytes(fs.readFileSync(importPath));
        manifest.runtimeMetadata.definitionImportDigest=rt.definitionImportDigest;
      }
      if (fault === "runtime-record")
        rt.credentials.judge.headers.Authorization =
          "Bearer different-synthetic-token";
      if (fault === "import-observation") {
        const observedPath = path.join(
            root,
            "event-mutant-runtime/observed-definition.json",
          ),
          importPath = path.join(
            root,
            "event-mutant-runtime/definition-import.json",
          );
        const observed = JSON.parse(fs.readFileSync(observedPath)),
          imported = JSON.parse(fs.readFileSync(importPath));
        observed.version.number = 18;
        imported.definitionVersion = 18;
        imported.storedSourceShapeDates.definitionVersion=18;
        imported.storedSourceShapeDates.rows.forEach(row=>{row.version=18;});
        imported.observedDefinitionDigest = digestBytes(
          JSON.stringify(observed),
        );
        fs.writeFileSync(observedPath, JSON.stringify(observed));
        fs.writeFileSync(importPath, JSON.stringify(imported));
        rt.definition.definitionVersion = 18;
        rt.definition.observedDefinitionDigest =
          imported.observedDefinitionDigest;
        rt.definitionImportDigest = digestBytes(fs.readFileSync(importPath));
        Object.assign(manifest.runtimeMetadata, {
          definitionVersion: "18",
          observedDefinitionDigest: imported.observedDefinitionDigest,
          definitionImportDigest: rt.definitionImportDigest,
        });
      }
      fs.writeFileSync(rtPath, JSON.stringify(rt));
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      assert.throws(
        () =>
          api.projectConfigurationCoverage({
            eventPhaseDirectory: b.directory,
          }),
        /COVERAGE_EVENT_DERIVATION_MISMATCH/,
      );
    },
  );

test("support only: writer requires independent tool/source pins and projection cannot mutate evidence", async (t) => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "coverage-independent-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const b = await completeEventBundle(root);
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(f);
      else files.push(f);
    }
  }
  walk(root);
  const before = Object.fromEntries(
    files.map((f) => [f, digestBytes(fs.readFileSync(f))]),
  );
  const projected = api.projectConfigurationCoverage({
    eventPhaseDirectory: b.directory,
  });
  assert.equal(projected.report.coverage.candidate, 3);
  assert.equal(projected.report.coverage.ccd, 16);
  assert.deepEqual(
    Object.fromEntries(files.map((f) => [f, digestBytes(fs.readFileSync(f))])),
    before,
  );
  assert.equal(
    fs.existsSync(path.join(b.directory, "promotion-expected.json")),
    false,
  );
  for (const key of [
    "harnessSourceDigest",
    "harnessDependencyDigest",
    "browserDigest",
  ]) {
    const expected = { ...b.expected };
    delete expected[key];
    assert.throws(
      () =>
        api.writeConfigurationCoverage({
          output: path.join(root, "coverage"),
          eventPhase: {
            directory: b.directory,
            expected,
            terminal: b.terminal,
          },
        }),
      /COVERAGE_EVENT_EXPECTED_IDENTITY_REQUIRED/,
    );
  }
  const safe = JSON.stringify(projected.report);
  for (const privateText of [
    "Bearer",
    "synthetic-judge",
    "headers",
    "credentials",
    root,
  ])
    assert(!safe.includes(privateText));
});

test("support only: event raw report aliases are rejected even when in-root bytes and gate digest still match", async (t) => {
  const api = await import("./lib/exui-configuration-runtime-coverage.mjs");
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "coverage-raw-alias-"),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const b = await completeEventBundle(root),
    file = path.join(b.directory, "baseline/report.json");
  fs.renameSync(file, file + ".original");
  fs.symlinkSync(file + ".original", file);
  assert.throws(
    () =>
      api.projectConfigurationCoverage({ eventPhaseDirectory: b.directory }),
    /CATALOGUE_INPUT_PATH_ESCAPE/,
  );
});
test('support only: exact callback native packet attributes one candidate row, never CCD count or full release',async t=>{
 const {createCallbackPhaseFixture}=require('./fixtures/exui-recipient-callback-phase-evidence.mock.cjs');
 const {projectConfigurationCoverage,writeConfigurationCoverage}=await import('./lib/exui-configuration-runtime-coverage.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-coverage-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const f=await createCallbackPhaseFixture({root});
 const projected=projectConfigurationCoverage({harnessRoot:path.resolve('.'),callbackPhaseDirectory:f.directory});
 assert.equal(projected.report.coverage.candidate,1);assert.equal(projected.report.coverage.ccd,0);assert.equal(projected.report.coverage.missingCandidateOrCcd.length,111);assert.equal(projected.report.releaseCredit,false);assert.equal(projected.catalogue.obligations.length,112);
 assert.deepEqual(projected.report.executedProofs,[{obligationId:'configuration-shape:4872034ffec23e993a49315123c3a22472baf5411d8010f31d3d01644f23cd94',boundary:'candidate',status:'passed'}]);
 assert.equal(writeConfigurationCoverage({harnessRoot:path.resolve('.'),output:path.join(root,'coverage'),callbackPhase:{directory:f.directory,expected:f.expected,terminal:f.terminal}}).coverage.candidate,1);
 f.observations.baseline.ui.cya.changeAccessibleName='Change Another';f.write();assert.throws(()=>projectConfigurationCoverage({harnessRoot:path.resolve('.'),callbackPhaseDirectory:f.directory}),/CALLBACK_OBSERVATION_CYA_CHANGE/);
});
