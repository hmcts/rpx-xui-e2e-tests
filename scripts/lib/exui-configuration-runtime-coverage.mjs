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
  assert(
    fs.lstatSync(file).isFile() && fs.realpathSync(file) === file,
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
      ["harnessRoot", "phaseDirectory"].includes(key),
    ),
    "UNSUPPORTED_COVERAGE_INPUT",
  );
  const { harnessRoot = ROOT, phaseDirectory } = args;
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
    report: {
      ...report,
      executedProofs,
      evidenceReferences: references,
      unacceptedExecutionFacts,
      provenance,
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
  const projected = projectConfigurationCoverage({
    harnessRoot,
    phaseDirectory,
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
