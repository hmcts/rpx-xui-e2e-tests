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
    assert.equal(result.gaps.filter(x => x.startsWith("deployment-runtime-unproved:")).length, 45);
    const coverage = JSON.parse(fs.readFileSync(path.join(output, "coverage.json")));
    assert.deepEqual(coverage.provenance.deploymentSourceManifest, loaded.catalogue.deploymentSourceManifest);
    assert.equal(coverage.provenance.deploymentSourceManifest.length, 4);
    assert.equal(coverage.provenance.definitionDiscovery.evidenceMode, "pinned-summary");
    assert.equal(coverage.provenance.definitionDiscovery.graphAvailable, false);
    assert(coverage.gaps.includes("definition-discovery-graph-unavailable:prl-ccd-definitions"));
    assert.equal(coverage.gaps.filter(item => item.startsWith("unreviewed-deployment-family:")).length, 9);
    const selection = JSON.parse(fs.readFileSync(path.join(output, "selection.json")));
    assert.equal(selection.mode, "broad");
    assert.equal(selection.obligationIds.length, 112);
    assert(coverage.gaps.includes("unreviewed-deployment-family:preview:JURISDICTIONS:PT"));
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

async function completeCcdBundle(root) {
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
      configurationDigest: "sha256:" + String(i + 5).repeat(64),
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
  assert.equal(loaded.receipt.verdict.status, "PASS");
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
    assert(result.coverage.missingCandidateOrCcd.includes("configuration-decentralisation:80ee7509e89da374b6497596777429115598168ceedf29d4243805349a82e861"));
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
  execFileSync(process.execPath, ["--input-type=module", "-e", program], { cwd: path.resolve("."), stdio: "pipe" });
});
