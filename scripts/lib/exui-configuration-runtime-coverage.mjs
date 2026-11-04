import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildConfigurationCatalogue,
  validateConfigurationCatalogue,
  selectConfigurationObligations,
} from "./exui-configuration-catalogue.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import { validateCiPhase } from "./exui-candidate-ci-evidence.mjs";
import {
  validateCompleteNativeProofs,
  validateNativeOutcome,
} from "./exui-native-proof-validation.mjs";
import { validateNativePhaseFinalization } from "./exui-native-ci-ownership.mjs";
import { bindEventCoverage } from "./exui-event-coverage-binding.mjs";
import {
  assertRoutingInterpreter,
  ROUTING_SCOPE,
} from "./exui-routing-contract.mjs";
import {
  EVENT_CAPABILITY_CELL,
  COURTADMIN_READ_CELLS,
  COURTADMIN_READ_OBLIGATION,
  READONLY_READ_CELLS,
  READONLY_READ_OBLIGATION,
  EVENT_CAPABILITY_SCOPE,
  EVENT_CAPABILITY_PROOFS,
} from "./exui-ccd-event-capability.mjs";
import {
  digestBytes,
  loadRunEvidence,
  readEvidenceArtifact,
  writeJsonAtomic,
} from "./exui-evidence-io.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const regularBytes = (root, name) => {
  const file = path.join(fs.realpathSync(root), name);
  const relative = path.relative(fs.realpathSync(root), file);
  assert(
    !path.isAbsolute(name) &&
      relative &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      fs.lstatSync(file).isFile() &&
      fs.realpathSync(file) === file,
    "CATALOGUE_INPUT_PATH_ESCAPE",
  );
  return fs.readFileSync(file);
};
const json = (root, name) => JSON.parse(regularBytes(root, name));

export function loadCommittedConfigurationCatalogue(harnessRoot = ROOT) {
  const sourcePath = "scripts/fixtures/exui-configuration-source.json",
    reviewPath = "scripts/fixtures/exui-configuration-review.json";
  const snapshot = json(harnessRoot, sourcePath),
    review = json(harnessRoot, reviewPath);
  const catalogue = buildConfigurationCatalogue(snapshot, review);
  const validation = validateConfigurationCatalogue({
    snapshot,
    review,
    catalogue,
  });
  assert.deepEqual(validation.errors, [], "COMMITTED_CATALOGUE_SOURCE_INVALID");
  const sequences = getReleasePolicy("exui-ccd-pilot").obligations.filter(
    (item) => item.id.startsWith("configuration-sequence:"),
  );
  assert.equal(sequences.length, 1, "REVIEWED_SEQUENCE_POLICY_REQUIRED");
  assert(
    catalogue.obligations.some((item) => item.id === sequences[0].id),
    "REVIEWED_SEQUENCE_MISSING",
  );
  const binding = json(
    harnessRoot,
    "scripts/fixtures/ccd/nested-prl.binding.json",
  );
  for (const item of catalogue.sequences) {
    assert.equal(
      item.signature.fixtureSourceDigest,
      binding.sourceDigest,
      "SEQUENCE_FIXTURE_SOURCE_DRIFT",
    );
    assert.equal(
      item.signature.fixtureWorkbookDigest,
      binding.workbookDigest,
      "SEQUENCE_WORKBOOK_DRIFT",
    );
    assert.equal(
      digestBytes(
        regularBytes(harnessRoot, "scripts/fixtures/ccd/nested-prl.json"),
      ),
      binding.sourceDigest,
      "SEQUENCE_FIXTURE_SOURCE_DRIFT",
    );
    assert.equal(
      digestBytes(
        regularBytes(harnessRoot, "scripts/fixtures/ccd/nested-prl.xlsx"),
      ),
      binding.workbookDigest,
      "SEQUENCE_WORKBOOK_DRIFT",
    );
  }
  return {
    snapshot,
    review,
    catalogue,
    validation,
    sourceArtifactDigests: {
      projection: digestBytes(regularBytes(harnessRoot, sourcePath)),
      review: digestBytes(regularBytes(harnessRoot, reviewPath)),
    },
  };
}

function bindImportedDefinition(phaseDirectory, manifest, signature) {
  const root = fs.realpathSync(path.dirname(phaseDirectory));
  const imported = readEvidenceArtifact(root, {
    path: "ccd-runtime/definition-import.json",
    digest: manifest.runtimeMetadata.definitionImportDigest,
  }).value;
  assert(
    [200, 201].includes(imported.status),
    "COVERAGE_DEFINITION_IMPORT_FAILED",
  );
  assert.equal(
    imported.sourceRevision,
    signature.sourceRevision,
    "COVERAGE_DEFINITION_SOURCE_MISMATCH",
  );
  assert.equal(
    imported.binding.sourceDigest,
    signature.fixtureSourceDigest,
    "COVERAGE_FIXTURE_SOURCE_MISMATCH",
  );
  assert.equal(
    imported.binding.workbookDigest,
    signature.fixtureWorkbookDigest,
    "COVERAGE_WORKBOOK_MISMATCH",
  );
  assert.equal(
    imported.fixtureDigest,
    signature.fixtureWorkbookDigest,
    "COVERAGE_WORKBOOK_MISMATCH",
  );
  assert.equal(
    manifest.identity.definitionDigests.HarnessNestedPRL,
    imported.fixtureDigest,
    "COVERAGE_IMPORTED_DEFINITION_MISMATCH",
  );
  const observed = json(root, "ccd-runtime/observed-definition.json");
  assert.equal(
    observed.id,
    signature.runtimeCaseType,
    "COVERAGE_CASE_TYPE_MISMATCH",
  );
  assert.equal(
    digestBytes(JSON.stringify(observed)),
    imported.observedDefinitionDigest,
    "COVERAGE_OBSERVED_DEFINITION_MISMATCH",
  );
  assert.equal(
    manifest.runtimeMetadata.observedDefinitionDigest,
    imported.observedDefinitionDigest,
    "COVERAGE_OBSERVED_DEFINITION_MISMATCH",
  );
  assert.equal(
    String(observed.version.number),
    String(imported.definitionVersion),
    "COVERAGE_DEFINITION_VERSION_MISMATCH",
  );
  assert.equal(
    String(imported.definitionVersion),
    manifest.runtimeMetadata.definitionVersion,
    "COVERAGE_DEFINITION_VERSION_MISMATCH",
  );
  for (const [service, dependency] of [
    ["data", "ccd"],
    ["definition", "ccd-definition"],
  ])
    assert.equal(
      imported.images[service].id,
      manifest.identity.dependencyIdentities[dependency].artifactDigest,
      "COVERAGE_CCD_IMAGE_MISMATCH",
    );
}

// Read-only measurement after independent phase validation; never a promotion decision.
// Outcomes are reloaded from the owned evaluator, not accepted from caller flags.
export function projectConfigurationCoverage(args) {
  assert(
    Object.keys(args).every((key) =>
      ["harnessRoot", "phaseDirectory", "eventPhaseDirectory", "routingPhaseDirectory"].includes(key),
    ),
    "UNSUPPORTED_COVERAGE_INPUT",
  );
  const { harnessRoot = ROOT, phaseDirectory, eventPhaseDirectory, routingPhaseDirectory } = args;
  assert(
    new Set([phaseDirectory, eventPhaseDirectory, routingPhaseDirectory].filter(Boolean).map((directory) => fs.realpathSync(directory))).size ===
      [phaseDirectory, eventPhaseDirectory, routingPhaseDirectory].filter(Boolean).length,
    "COVERAGE_DUPLICATE_PHASE",
  );
  let harnessCommit = null,
    receiptArtifactDigest = null,
    evidenceManifestDigest = null;
  const input = loadCommittedConfigurationCatalogue(harnessRoot);
  const selection = selectConfigurationObligations(input.catalogue, [], {
    snapshot: input.snapshot,
    review: input.review,
  });
  const executedProofs = [],
    references = [],
    unacceptedExecutionFacts = [];
  const phaseReferences = {};
  let postalManifest;
  if (phaseDirectory) {
    const policy = getReleasePolicy("exui-ccd-pilot");
    const loaded = loadRunEvidence(
      path.join(phaseDirectory, "run.json"),
      policy,
    );
    const receiptBytes = fs.readFileSync(
      path.join(phaseDirectory, "gate.json"),
    );
    assert.deepEqual(
      JSON.parse(receiptBytes),
      loaded.receipt,
      "COVERAGE_RECEIPT_RECOMPUTATION_MISMATCH",
    );
    receiptArtifactDigest = digestBytes(receiptBytes);
    evidenceManifestDigest = loaded.evidenceManifestDigest;
    harnessCommit = loaded.input.manifest.harnessCommit;
    postalManifest = loaded.input.manifest;
    phaseReferences.ccd = {
      releaseScopeId: policy.releaseScopeId,
      runId: postalManifest.runId,
      receiptArtifactDigest,
      evidenceManifestDigest,
      status: loaded.receipt.verdict.status,
    };
    const verdict = { ...loaded.receipt.verdict, receiptArtifactDigest };
    for (const sequence of input.catalogue.sequences) {
      const obligation = policy.obligations.find(
        (item) => item.id === sequence.id,
      );
      assert(
        obligation && obligation.boundary === sequence.requiredBoundary,
        "COVERAGE_SEQUENCE_POLICY_MISMATCH",
      );
      bindImportedDefinition(
        phaseDirectory,
        loaded.input.manifest,
        sequence.signature,
      );
      const proof = loaded.input.results.filter(
        (item) =>
          item.obligationId === sequence.id &&
          item.proofId === obligation.requiredProofIds[0],
      );
      assert.equal(proof.length, 1, "COVERAGE_EXACT_PROOF_REQUIRED");
      assert.equal(proof[0].boundary, "ccd", "COVERAGE_BOUNDARY_MISMATCH");
      if (verdict.status === "PASS") {
        assert.equal(
          proof[0].outcome,
          "passed",
          "COVERAGE_PASSED_PROOF_REQUIRED",
        );
        executedProofs.push({
          obligationId: sequence.id,
          boundary: "ccd",
          status: "passed",
        });
      } else {
        unacceptedExecutionFacts.push({
          obligationId: sequence.id,
          gateStatus: verdict.status,
          proofId: proof[0].proofId,
          outcome: proof[0].outcome,
          failureId: proof[0].failureId,
        });
        if (verdict.status === "FAIL" && proof[0].outcome === "failed")
          executedProofs.push({
            obligationId: sequence.id,
            boundary: "ccd",
            status: "failed",
          });
      }
    }
    references.push(
      {
        path: path.join(path.basename(phaseDirectory), "run.json"),
        digest: digestBytes(
          fs.readFileSync(path.join(phaseDirectory, "run.json")),
        ),
      },
      {
        path: path.join(path.basename(phaseDirectory), "gate.json"),
        digest: verdict.receiptArtifactDigest,
      },
    );
  }
  if (eventPhaseDirectory) {
    const policy = getReleasePolicy(EVENT_CAPABILITY_SCOPE);
    const envelope = json(eventPhaseDirectory, "run.json");
    for (const reference of envelope.executionArtifacts) {
      const execution = json(eventPhaseDirectory, reference.path);
      regularBytes(eventPhaseDirectory, execution.resultArtifact.path);
    }
    for (const witness of envelope.mutations)
      regularBytes(eventPhaseDirectory, witness.derivationArtifact.path);
    const loaded = loadRunEvidence(
      path.join(eventPhaseDirectory, "run.json"),
      policy,
    );
    const receiptBytes = regularBytes(eventPhaseDirectory, "gate.json");
    assert.deepEqual(
      JSON.parse(receiptBytes),
      loaded.receipt,
      "COVERAGE_RECEIPT_RECOMPUTATION_MISMATCH",
    );
    validateCompleteNativeProofs(loaded.input, policy);
    validateNativeOutcome(loaded.input, loaded.receipt.verdict);
    regularBytes(eventPhaseDirectory, "controller-terminal.json");
    for (const execution of loaded.input.executions)
      for (const name of [
        "candidate-write-denial.json",
        "candidate-lifecycle.json",
      ])
        regularBytes(eventPhaseDirectory, execution.invocationId + "/" + name);
    validateNativePhaseFinalization(
      eventPhaseDirectory,
      loaded.input.executions,
      { code: loaded.receipt.verdict.exitCode, signal: null },
    );
    const manifest = loaded.input.manifest;
    for (const key of [
      "harnessSourceDigest",
      "harnessDependencyDigest",
      "browserDigest",
    ])
      assert(
        /^sha256:[a-f0-9]{64}$/.test(manifest.runtimeMetadata[key] ?? ""),
        "COVERAGE_EVENT_SOURCE_IDENTITY_REQUIRED",
      );
    if (postalManifest) {
      const comparable = (value) => {
        const identity = structuredClone(value.identity);
        delete identity.configurationDigest;
        delete identity.definitionDigests;
        return {
          identity,
          harnessCommit: value.harnessCommit,
          runtime: Object.fromEntries(
            [
              "harnessSourceState",
              "harnessSourceDigest",
              "harnessDependencyDigest",
              "browserDigest",
            ].map((key) => [key, value.runtimeMetadata[key]]),
          ),
        };
      };
      assert.deepEqual(
        comparable(manifest),
        comparable(postalManifest),
        "COVERAGE_CROSS_PHASE_IDENTITY_MISMATCH",
      );
    }
    const imports = bindEventCoverage({
      harnessRoot,
      ...input,
      directory: eventPhaseDirectory,
      loaded,
    });
    for (const [cell, proofId, obligationId] of [
      [EVENT_CAPABILITY_CELL, EVENT_CAPABILITY_PROOFS.courtadmin, EVENT_CAPABILITY_CELL],
      ...COURTADMIN_READ_CELLS.map(cell => [cell.id, EVENT_CAPABILITY_PROOFS.courtadminRead, COURTADMIN_READ_OBLIGATION]),
      ...READONLY_READ_CELLS.map(cell => [cell.id, EVENT_CAPABILITY_PROOFS.readonlyRead, READONLY_READ_OBLIGATION]),
    ]) {
      const proof = loaded.input.results.find(
        (item) => item.proofId === proofId,
      );
      assert.equal(
        proof.obligationId,
        obligationId,
        "COVERAGE_EVENT_PROOF_MISMATCH",
      );
      if (loaded.receipt.verdict.status === "PASS") {
        assert.equal(proof.outcome, "passed", "COVERAGE_PASSED_PROOF_REQUIRED");
        executedProofs.push({
          obligationId: cell,
          boundary: "ccd",
          status: "passed",
        });
      } else
        unacceptedExecutionFacts.push({
          obligationId: cell,
          gateStatus: loaded.receipt.verdict.status,
          proofId: proof.proofId,
          outcome: proof.outcome,
          failureId: proof.failureId,
        });
    }
    harnessCommit ??= manifest.harnessCommit;
    phaseReferences.eventCapability = {
      releaseScopeId: policy.releaseScopeId,
      runId: manifest.runId,
      receiptArtifactDigest: digestBytes(receiptBytes),
      evidenceManifestDigest: loaded.evidenceManifestDigest,
      status: loaded.receipt.verdict.status,
      imports,
    };
    references.push(
      {
        path: path.join("eventCapability", "run.json"),
        digest: digestBytes(regularBytes(eventPhaseDirectory, "run.json")),
      },
      {
        path: path.join("eventCapability", "gate.json"),
        digest: digestBytes(receiptBytes),
      },
      ...imports.map(({ path, digest }) => ({ path, digest })),
    );
  }
  if (routingPhaseDirectory) {
    const policy = getReleasePolicy(ROUTING_SCOPE);
    const loaded = loadRunEvidence(
      path.join(routingPhaseDirectory, "run.json"),
      policy,
    );
    const receiptBytes = regularBytes(routingPhaseDirectory, "gate.json");
    assert.deepEqual(
      JSON.parse(receiptBytes),
      loaded.receipt,
      "COVERAGE_RECEIPT_RECOMPUTATION_MISMATCH",
    );
    validateCompleteNativeProofs(loaded.input, policy);
    validateNativeOutcome(loaded.input, loaded.receipt.verdict);
    const manifest = loaded.input.manifest;
    const routingInput = json(routingPhaseDirectory, "input.json");
    assert.equal(routingInput.releaseScopeId, ROUTING_SCOPE, "COVERAGE_ROUTING_SCOPE_REQUIRED");
    assert.equal(routingInput.artifact.identity.artifactDigest, manifest.identity.artifactDigest, "COVERAGE_ROUTING_CANDIDATE_MISMATCH");
    for (const field of ["webappCommit", "dependencyLockDigest", "toolkitVersion", "toolkitDigest"])
      assert.equal(routingInput.artifact.identity[field], manifest.identity[field], "COVERAGE_ROUTING_CANDIDATE_MISMATCH");
    const interpreter = assertRoutingInterpreter(
      routingInput.artifact,
      input.review,
      routingInput.artifact.identity,
    );
    assert.deepEqual(routingInput.routingInterpreter, interpreter, "COVERAGE_ROUTING_INTERPRETER_MISMATCH");
    assert.equal(manifest.runtimeMetadata.routingInterpreter, JSON.stringify(interpreter), "COVERAGE_ROUTING_RUNTIME_IDENTITY_MISMATCH");
    assert.equal(manifest.runtimeMetadata.harnessSourceState, "clean", "COVERAGE_ROUTING_SOURCE_NOT_CLEAN");
    for (const key of ["harnessSourceDigest", "harnessDependencyDigest", "browserDigest"])
      assert(/^sha256:[a-f0-9]{64}$/.test(manifest.runtimeMetadata[key] ?? ""), "COVERAGE_ROUTING_SOURCE_IDENTITY_REQUIRED");
    regularBytes(routingPhaseDirectory, "controller-terminal.json");
    for (const execution of loaded.input.executions)
      for (const name of ["candidate-write-denial.json", "candidate-lifecycle.json"])
        regularBytes(routingPhaseDirectory, execution.invocationId + "/" + name);
    validateNativePhaseFinalization(
      routingPhaseDirectory,
      loaded.input.executions,
      { code: loaded.receipt.verdict.exitCode, signal: null },
    );
    const sourceRouting = input.catalogue.obligations.filter(
      (item) => item.kind === "configuration-decentralisation",
    );
    const reviewedRouting = input.review.decentralisedRouting.knownValid;
    assert.equal(sourceRouting.length, reviewedRouting.length, "COVERAGE_ROUTING_SOURCE_SELECTION_MISMATCH");
    for (const expected of reviewedRouting) {
      const obligation = sourceRouting.find((item) => item.id === expected.id);
      assert(obligation && obligation.requiredBoundary === "candidate", "COVERAGE_ROUTING_SOURCE_MISMATCH");
      assert.deepEqual(obligation.signature, expected.signature, "COVERAGE_ROUTING_SIGNATURE_MISMATCH");
    }
    const reference = {
      releaseScopeId: policy.releaseScopeId,
      runId: manifest.runId,
      receiptArtifactDigest: digestBytes(receiptBytes),
      evidenceManifestDigest: loaded.evidenceManifestDigest,
      status: loaded.receipt.verdict.status,
      routingInterpreter: interpreter,
    };
    phaseReferences.routing = reference;
    const routeId = reviewedRouting[0].id;
    if (reference.status === "PASS")
      executedProofs.push({ obligationId: routeId, boundary: "candidate", status: "passed" });
    else
      unacceptedExecutionFacts.push({
        obligationId: routeId,
        gateStatus: reference.status,
        proofs: loaded.input.results.map(({ proofId, outcome }) => ({ proofId, outcome })),
      });
    harnessCommit ??= manifest.harnessCommit;
    references.push(
      { path: path.join("routing", "run.json"), digest: digestBytes(regularBytes(routingPhaseDirectory, "run.json")) },
      { path: path.join("routing", "gate.json"), digest: reference.receiptArtifactDigest },
      { path: path.join("routing", "input.json"), digest: digestBytes(regularBytes(routingPhaseDirectory, "input.json")) },
    );
  }
  assert.equal(
    new Set(executedProofs.map((item) => item.obligationId)).size,
    executedProofs.length,
    "COVERAGE_DUPLICATE_ATTRIBUTION",
  );
  const report = validateConfigurationCatalogue({
    ...input,
    selectedIds: selection.obligationIds,
    executedProofs,
  });
  const provenance = {
    harnessCommit,
    sourceArtifactDigests: input.sourceArtifactDigests,
    sourceManifest: input.catalogue.sourceManifest,
    deploymentSourceManifest: input.catalogue.deploymentSourceManifest,
    definitionDiscovery: input.catalogue.definitionDiscovery,
    sourceMetadataLimit:
      "Committed reviewed projection and discovery pins only; the full external inventory and reference graph are unavailable and cannot narrow selection.",
  };
  return {
    catalogue: input.catalogue,
    selection,
    sourceValidation: input.validation,
    validationReport: report,
    receiptArtifactDigest,
    evidenceManifestDigest,
    phaseReferences,
    report: {
      ...report,
      executedProofs,
      evidenceReferences: references,
      unacceptedExecutionFacts,
      provenance,
      phaseReferences,
    },
  };
}

// Independent phase validation remains mandatory before publishing measurement.
export function writeConfigurationCoverage(args) {
  assert(
    Object.keys(args).every((key) =>
      [
        "harnessRoot",
        "output",
        "phaseDirectory",
        "expected",
        "terminal",
        "eventPhase",
        "routingPhase",
      ].includes(key),
    ),
    "UNSUPPORTED_COVERAGE_INPUT",
  );
  const {
    harnessRoot = ROOT,
    output,
    phaseDirectory,
    expected,
    terminal,
    eventPhase,
    routingPhase,
  } = args;
  if (phaseDirectory) {
    assert(
      expected && terminal && expected.nativeAuthority === true,
      "COVERAGE_OBSERVED_NATIVE_PHASE_REQUIRED",
    );
    assert.equal(
      digestBytes(fs.readFileSync(path.join(phaseDirectory, "gate.json"))),
      expected.receiptArtifactDigest,
      "COVERAGE_RECEIPT_TRANSPORT_MISMATCH",
    );
    assert.equal(
      expected.releaseScopeId,
      "exui-ccd-pilot",
      "COVERAGE_CCD_SCOPE_REQUIRED",
    );
    validateCiPhase(phaseDirectory, expected, terminal);
  } else assert(!expected && !terminal, "COVERAGE_PHASE_REQUIRED");
  if (eventPhase) {
    assert.deepEqual(
      Object.keys(eventPhase).sort(),
      ["directory", "expected", "terminal"],
      "COVERAGE_EVENT_PHASE_FIELDS",
    );
    const {
      directory,
      expected: eventExpected,
      terminal: eventTerminal,
    } = eventPhase;
    assert(
      eventExpected && eventTerminal && eventExpected.nativeAuthority === true,
      "COVERAGE_OBSERVED_NATIVE_PHASE_REQUIRED",
    );
    for (const key of [
      "harnessSourceDigest",
      "harnessDependencyDigest",
      "browserDigest",
    ])
      assert(
        /^sha256:[a-f0-9]{64}$/.test(eventExpected[key] ?? ""),
        "COVERAGE_EVENT_EXPECTED_IDENTITY_REQUIRED",
      );
    assert.equal(
      eventExpected.releaseScopeId,
      EVENT_CAPABILITY_SCOPE,
      "COVERAGE_EVENT_SCOPE_MISMATCH",
    );
    assert.equal(
      digestBytes(regularBytes(directory, "gate.json")),
      eventExpected.receiptArtifactDigest,
      "COVERAGE_RECEIPT_TRANSPORT_MISMATCH",
    );
    validateCiPhase(directory, eventExpected, eventTerminal);
  }
  if (routingPhase) {
    assert.deepEqual(
      Object.keys(routingPhase).sort(),
      ["directory", "expected", "terminal"],
      "COVERAGE_ROUTING_PHASE_FIELDS",
    );
    const { directory, expected: routingExpected, terminal: routingTerminal } = routingPhase;
    assert(routingExpected && routingTerminal && routingExpected.nativeAuthority === true, "COVERAGE_OBSERVED_NATIVE_PHASE_REQUIRED");
    assert.equal(routingExpected.releaseScopeId, ROUTING_SCOPE, "COVERAGE_ROUTING_SCOPE_MISMATCH");
    assert.equal(digestBytes(regularBytes(directory, "gate.json")), routingExpected.receiptArtifactDigest, "COVERAGE_RECEIPT_TRANSPORT_MISMATCH");
    validateCiPhase(directory, routingExpected, routingTerminal);
  }
  const projected = projectConfigurationCoverage({
    harnessRoot,
    phaseDirectory,
    eventPhaseDirectory: eventPhase?.directory,
    routingPhaseDirectory: routingPhase?.directory,
  });
  writeJsonAtomic(path.join(output, "catalogue.json"), projected.catalogue);
  writeJsonAtomic(path.join(output, "selection.json"), projected.selection);
  writeJsonAtomic(
    path.join(output, "source-validation.json"),
    projected.sourceValidation,
  );
  writeJsonAtomic(path.join(output, "coverage.json"), projected.report);
  return projected.validationReport;
}
