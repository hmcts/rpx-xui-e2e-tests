import {CALLBACK_SCOPE,CALLBACK_OBLIGATION,CALLBACK_PROOF,callbackCanonicalImport} from './exui-recipient-callback-contract.mjs';
import {validateCallbackTransitionEvidence} from './exui-recipient-callback-transition.mjs';
import { SOURCE_SHAPE_ROWS } from './exui-source-shape-contract.mjs';
import { buildWorkbasketInputDefinition } from './exui-workbasket-input-definition.mjs';
import { validateWorkbasketInputDescriptor } from './exui-workbasket-input-import.mjs';
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
  COURTADMIN_UPDATE_CELLS,
  COURTADMIN_UPDATE_OBLIGATION,
  COURTADMIN_READ_CELLS,
  COURTADMIN_READ_OBLIGATION,
  READONLY_READ_CELLS,
  READONLY_UPDATE_CELLS,
  READONLY_UPDATE_OBLIGATION,
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
      ["harnessRoot", "phaseDirectory", "eventPhaseDirectory", "routingPhaseDirectory", "callbackPhaseDirectory"].includes(key),
    ),
    "UNSUPPORTED_COVERAGE_INPUT",
  );
  const { harnessRoot = ROOT, phaseDirectory, eventPhaseDirectory, routingPhaseDirectory, callbackPhaseDirectory } = args;
  assert(
    new Set([phaseDirectory, eventPhaseDirectory, routingPhaseDirectory, callbackPhaseDirectory].filter(Boolean).map((directory) => fs.realpathSync(directory))).size ===
      [phaseDirectory, eventPhaseDirectory, routingPhaseDirectory, callbackPhaseDirectory].filter(Boolean).length,
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
    if (postalManifest.runtimeMetadata.workbasketImportDigest) {
      const definition = buildWorkbasketInputDefinition();
      const imported = readEvidenceArtifact(fs.realpathSync(path.dirname(phaseDirectory)), {
        path: "ccd-runtime/workbasket-input-import/receipt.json",
        digest: postalManifest.runtimeMetadata.workbasketImportDigest,
      }).value;
      assert.equal(imported.status, "import-and-inputs-observed", "COVERAGE_WORKBASKET_IMPORT_REQUIRED");
      assert.deepEqual(imported.bindings, definition.workbasketInputBindings, "COVERAGE_WORKBASKET_BINDINGS_DRIFT");
      assert.deepEqual(imported.binding.source, definition.workbasketInputSource, "COVERAGE_WORKBASKET_SOURCE_DRIFT");
      assert.equal(imported.binding.workbookDigest, postalManifest.identity.definitionDigests.HarnessResultsPRL, "COVERAGE_WORKBASKET_DEFINITION_DRIFT");
      for (const [service, dependency] of [["data", "ccd"], ["definition", "ccd-definition"]])
        assert.equal(imported.images[service].id, postalManifest.identity.dependencyIdentities[dependency].artifactDigest,
          "COVERAGE_WORKBASKET_IMAGE_DRIFT");
      assert.equal(imported.observations.inputs.status, 200, "COVERAGE_WORKBASKET_READ_REQUIRED");
      validateWorkbasketInputDescriptor(imported.observations.inputs.body, definition);
      const proof = loaded.input.results.filter(item => item.proofId === "ccd-prl-workbasket-inputs" &&
        item.obligationId === "ccd-prl-workbasket-source-inputs");
      assert.equal(proof.length, 1, "COVERAGE_WORKBASKET_PROOF_REQUIRED");
      for (const binding of definition.workbasketInputBindings) {
        assert.equal(input.catalogue.obligations.find(item => item.id === binding.obligationId)?.requiredBoundary,
          "candidate", "COVERAGE_WORKBASKET_SOURCE_BOUNDARY_MISMATCH");
        if (verdict.status === "PASS" && proof[0].outcome === "passed")
          executedProofs.push({ obligationId: binding.obligationId, boundary: "candidate", status: "passed" });
        else unacceptedExecutionFacts.push({ obligationId: binding.obligationId, gateStatus: verdict.status,
          proofId: proof[0].proofId, outcome: proof[0].outcome, failureId: proof[0].failureId });
      }
      references.push({ path: "ccd-runtime/workbasket-input-import/receipt.json",
        digest: postalManifest.runtimeMetadata.workbasketImportDigest });
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
    for (const [cell, proofId, obligationId, boundary = "ccd"] of [
      ...SOURCE_SHAPE_ROWS.map(row => [row.obligationId, `ccd-source-shape-${row.id}`, `ccd-source-shape-${row.id}`, "candidate"]),
      ...COURTADMIN_UPDATE_CELLS.map(cell => [cell.id, EVENT_CAPABILITY_PROOFS.courtadmin, COURTADMIN_UPDATE_OBLIGATION]),
      ...COURTADMIN_READ_CELLS.map(cell => [cell.id, EVENT_CAPABILITY_PROOFS.courtadminRead, COURTADMIN_READ_OBLIGATION]),
      ...READONLY_UPDATE_CELLS.map(cell => [cell.id, EVENT_CAPABILITY_PROOFS.readonlyUpdate, READONLY_UPDATE_OBLIGATION]),
      ...READONLY_READ_CELLS.map(cell => [cell.id, EVENT_CAPABILITY_PROOFS.readonlyRead, READONLY_READ_OBLIGATION]),
    ]) {
      assert.equal(input.catalogue.obligations.find(item => item.id === cell)?.requiredBoundary, boundary, "COVERAGE_EVENT_SOURCE_BOUNDARY_MISMATCH");
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
          boundary,
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
  if (callbackPhaseDirectory) {
    assert.equal(path.basename(callbackPhaseDirectory),"recipientCallback","COVERAGE_CALLBACK_DIRECTORY");
    const policy=getReleasePolicy(CALLBACK_SCOPE),loaded=loadRunEvidence(path.join(callbackPhaseDirectory,"run.json"),policy);
    const receiptBytes=regularBytes(callbackPhaseDirectory,"gate.json");
    assert.deepEqual(JSON.parse(receiptBytes),loaded.receipt,"COVERAGE_RECEIPT_RECOMPUTATION_MISMATCH");
    validateCompleteNativeProofs(loaded.input,policy);validateNativeOutcome(loaded.input,loaded.receipt.verdict);
    validateNativePhaseFinalization(callbackPhaseDirectory,loaded.input.executions,{code:loaded.receipt.verdict.exitCode,signal:null});
    const manifest=loaded.input.manifest;
    const expected={nativeAuthority:true,...Object.fromEntries(["runId","releaseScopeId","harnessCommit","policyDigest","identity"].map(key=>[key,manifest[key]])),...Object.fromEntries(["harnessSourceDigest","harnessDependencyDigest","browserDigest"].map(key=>[key,manifest.runtimeMetadata[key]])),callbackTransition:{path:"independent-callback-transition.json",digest:digestBytes(regularBytes(callbackPhaseDirectory,"independent-callback-transition.json"))}};
    validateCallbackTransitionEvidence(callbackPhaseDirectory,expected,loaded.input);
    const canonical=callbackCanonicalImport(),binding=canonical.binding,sourceKey="prl-ccd-definitions:"+binding.sourcePath;
    const source=input.snapshot.sources.filter(item=>item.repository==="prl-ccd-definitions"&&item.path===binding.sourcePath);
    assert.equal(source.length,1,"COVERAGE_CALLBACK_SOURCE_REQUIRED");assert.equal(source[0].revision,binding.sourceRevision,"COVERAGE_CALLBACK_SOURCE_REVISION");assert.equal("sha256:"+source[0].fileDigest,binding.sourceFileDigest,"COVERAGE_CALLBACK_SOURCE_FILE");
    const canonicalRow=value=>value&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalRow(value[key])])):Array.isArray(value)?value.map(canonicalRow):value;
    const rows=source[0].document.filter(row=>digestBytes(JSON.stringify(canonicalRow(row)))===binding.sourceRowDigest);assert.equal(rows.length,1,"COVERAGE_CALLBACK_SOURCE_ROW");
    const normalized={...rows[0],CaseTypeID:"HarnessNestedPRL",CallBackURLMidEvent:binding.normalizedUrl};
    assert.deepEqual(canonical.fixture.sheets.CaseEventToFields.filter(row=>row.CaseEventID===binding.eventId&&row.CaseFieldID===binding.fieldId),[normalized],"COVERAGE_CALLBACK_FULL_ROW");
    assert.deepEqual(input.catalogue.obligations.filter(item=>item.id===CALLBACK_OBLIGATION),[{id:CALLBACK_OBLIGATION,family:"PRIVATELAW",kind:"definition-shape",requiredBoundary:"candidate",sourceKeys:[sourceKey]}],"COVERAGE_CALLBACK_OBLIGATION");
    const feature=input.catalogue.features.filter(item=>item.id===CALLBACK_OBLIGATION);assert.equal(feature.length,1,"COVERAGE_CALLBACK_FEATURE");assert.equal(feature[0].sourceKey,sourceKey,"COVERAGE_CALLBACK_SOURCE_KEY");assert.equal("sha256:"+feature[0].rowDigest,binding.sourceRowDigest,"COVERAGE_CALLBACK_FEATURE_ROW");
    if(postalManifest){
      const comparable=value=>{const identity=structuredClone(value.identity);delete identity.configurationDigest;delete identity.definitionDigests;return {identity,harnessCommit:value.harnessCommit,runtime:Object.fromEntries(["harnessSourceState","harnessSourceDigest","harnessDependencyDigest","browserDigest"].map(key=>[key,value.runtimeMetadata[key]]))};};
      assert.deepEqual(comparable(manifest),comparable(postalManifest),"COVERAGE_CROSS_PHASE_IDENTITY_MISMATCH");
    }
    const proof=loaded.input.results.find(item=>item.proofId===CALLBACK_PROOF);assert.equal(proof.obligationId,CALLBACK_OBLIGATION,"COVERAGE_CALLBACK_PROOF");
    if(loaded.receipt.verdict.status==="PASS"){assert.equal(proof.outcome,"passed","COVERAGE_PASSED_PROOF_REQUIRED");executedProofs.push({obligationId:CALLBACK_OBLIGATION,boundary:"candidate",status:"passed"});}
    else unacceptedExecutionFacts.push({obligationId:CALLBACK_OBLIGATION,gateStatus:loaded.receipt.verdict.status,proofId:proof.proofId,outcome:proof.outcome,failureId:proof.failureId});
    const imports=["baseline","binding-omitted"].flatMap(variant=>["recipient-callback-native-import.json","recipient-callback-import/receipt.json","recipient-callback-import/stored-row-date.json"].map(name=>{const directory=path.join(path.dirname(callbackPhaseDirectory),`callback-${variant}-runtime`);return {path:`callback-${variant}-runtime/${name}`,digest:digestBytes(regularBytes(directory,name))};}));
    harnessCommit??=manifest.harnessCommit;
    phaseReferences.recipientCallback={releaseScopeId:CALLBACK_SCOPE,runId:manifest.runId,receiptArtifactDigest:digestBytes(receiptBytes),evidenceManifestDigest:loaded.evidenceManifestDigest,status:loaded.receipt.verdict.status,imports};
    references.push({path:"recipientCallback/run.json",digest:digestBytes(regularBytes(callbackPhaseDirectory,"run.json"))},{path:"recipientCallback/gate.json",digest:digestBytes(receiptBytes)},...imports);
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
        "callbackPhase",
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
    callbackPhase,
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
  if(callbackPhase){
    assert.deepEqual(Object.keys(callbackPhase).sort(),["directory","expected","terminal"],"COVERAGE_CALLBACK_PHASE_FIELDS");
    const {directory,expected:callbackExpected,terminal:callbackTerminal}=callbackPhase;
    assert(callbackExpected&&callbackTerminal&&callbackExpected.nativeAuthority===true,"COVERAGE_OBSERVED_NATIVE_PHASE_REQUIRED");assert.equal(callbackExpected.releaseScopeId,CALLBACK_SCOPE,"COVERAGE_CALLBACK_SCOPE_MISMATCH");assert.equal(digestBytes(regularBytes(directory,"gate.json")),callbackExpected.receiptArtifactDigest,"COVERAGE_RECEIPT_TRANSPORT_MISMATCH");validateCiPhase(directory,callbackExpected,callbackTerminal);
  }
  const projected = projectConfigurationCoverage({
    harnessRoot,
    phaseDirectory,
    eventPhaseDirectory: eventPhase?.directory,
    routingPhaseDirectory: routingPhase?.directory,
    callbackPhaseDirectory: callbackPhase?.directory,
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
