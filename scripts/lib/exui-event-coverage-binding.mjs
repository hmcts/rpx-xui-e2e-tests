import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { digestBytes, readEvidenceArtifact } from "./exui-evidence-io.mjs";
import {
  EVENT_CAPABILITY_CELL,
  COURTADMIN_READ_CELLS,
  READONLY_READ_CELLS,
  READONLY_READ_MUTATION,
  validateReadonlyReadPair,
  eventCapabilityFaultContract,
  COURTADMIN_READ_MUTATION,
  EVENT_CAPABILITY_MUTATION,
  EVENT_CAPABILITY_SCOPE,
  validateEventCapabilitySource,
  validateEventCapabilityPair,
  validateCourtadminReadPair,
} from "./exui-ccd-event-capability.mjs";
import {
  prepareCcdImport,
  assertObservedEventCapabilityDefinition,
} from "./exui-ccd-runtime.mjs";
import { seedAppCcdSessions } from "./exui-native-contract.mjs";
import {
  selectEventCapabilityRuntime,
  validateEventCapabilityTransitionRequest,
} from "./exui-ccd-event-transition.mjs";

const bytes = (root, name) => {
  const file = path.join(fs.realpathSync(root), name);
  const relative = path.relative(fs.realpathSync(root), file);
  assert(
    !path.isAbsolute(name) &&
      relative &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep),
    "COVERAGE_EVENT_FILE_ESCAPE",
  );
  assert(
    fs.lstatSync(file).isFile() && fs.realpathSync(file) === file,
    "COVERAGE_EVENT_FILE_ALIAS",
  );
  return fs.readFileSync(file);
};
const read = (root, name) => JSON.parse(bytes(root, name));
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const sourcePaths = [
  "CaseField/ServiceOfDocuments/CaseField.json",
  "ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json",
  "CaseEventToFields/ServiceOfDocuments/Page2/CaseEventToFields.json",
  "CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json",
  "AuthorisationCaseEvent/ServiceOfDocuments/AuthorisationCaseEvent.json",
  "CaseEvent/ServiceOfDocuments/CaseEvent-nonprod.json",
  "SearchResultFields.json",
  "WorkBasketInputFields.json",
  "WorkBasketResultFields.json",
].map((name) => "definitions/private-law/json/" + name);

// This is one reviewed mapping, not caller-supplied cell selection or a second fixture generator.
export function bindEventCoverage({
  harnessRoot,
  snapshot,
  catalogue,
  directory,
  loaded,
}) {
  assert.equal(
    fs.realpathSync(directory),
    directory,
    "COVERAGE_EVENT_DIRECTORY_ALIAS",
  );
  assert.equal(
    path.basename(directory),
    "eventCapability",
    "COVERAGE_EVENT_DIRECTORY_REQUIRED",
  );
  for (const { id: cell, action, channel, recipientCount, role } of [
    { id: EVENT_CAPABILITY_CELL, action: "update", channel: "email", recipientCount: 1, role: "caseworker-privatelaw-courtadmin" },
    ...COURTADMIN_READ_CELLS.map(cell => ({ ...cell, action: "read", role: "caseworker-privatelaw-courtadmin" })),
    ...READONLY_READ_CELLS.map(cell => ({ ...cell, action: "read", role: "caseworker-privatelaw-readonly" })),
  ]) {
    assert.deepEqual(
      catalogue.pilotCells.filter((item) => item.id === cell),
      [
        {
          caseType: "PRLAPPS",
          role,
          action,
          channel,
          recipientCount,
          expectedAccess: "allowed",
          id: cell,
        },
      ],
      "COVERAGE_EVENT_CELL_MISMATCH",
    );
    assert.deepEqual(
      catalogue.obligations.filter((item) => item.id === cell),
      [
        {
          id: cell,
          family: "PRIVATELAW",
          kind: "pilot-cell",
          requiredBoundary: "ccd",
          sequence: action === "read" ? ["read", "assert-visible-projection"] : ["form", "cya", "change", "submit", "readback"],
          sourceKeys: sourcePaths.map((name) => "prl-ccd-definitions:" + name),
        },
      ],
      "COVERAGE_EVENT_OBLIGATION_MISMATCH",
    );
  }
  const source = read(
    harnessRoot,
    "scripts/fixtures/ccd/event-capability.source.json",
  );
  validateEventCapabilitySource(source);
  let overlapRows = 0;
  for (const name of sourcePaths.slice(0, 6)) {
    const selected = source.sources.find((item) => item.path === name);
    const original = snapshot.sources.find(
      (item) => item.repository === "prl-ccd-definitions" && item.path === name,
    );
    assert(original && selected, "COVERAGE_EVENT_SOURCE_MISSING");
    assert.equal(
      original.revision,
      source.revision,
      "COVERAGE_EVENT_REVISION_MISMATCH",
    );
    assert.equal(
      "sha256:" + original.fileDigest,
      selected.fileDigest,
      "COVERAGE_EVENT_SOURCE_MISMATCH",
    );
    for (const row of selected.rows) {
      const matches = original.document.filter(
        (item) =>
          digestBytes(JSON.stringify(canonical(item))) === row.rowDigest,
      );
      assert.equal(matches.length, 1, "COVERAGE_EVENT_SOURCE_ROW_MISMATCH");
      assert.deepEqual(
        matches[0],
        row.row,
        "COVERAGE_EVENT_SOURCE_ROW_MISMATCH",
      );
      assert(
        catalogue.features.some(
          (item) =>
            item.sourceKey === "prl-ccd-definitions:" + name &&
            "sha256:" + item.rowDigest === row.rowDigest,
        ),
        "COVERAGE_EVENT_FEATURE_MISSING",
      );
      overlapRows++;
    }
  }
  assert.equal(overlapRows, 38, "COVERAGE_EVENT_SOURCE_OVERLAP_MISMATCH");
  const pair = Object.fromEntries(
    ["baseline", "mutant", "read-mutant", "readonly-read-mutant"].map((variant) => [
      variant,
      read(
        harnessRoot,
        `scripts/fixtures/ccd/event-capability/${variant}.json`,
      ),
    ]),
  );
  const binding = read(
    harnessRoot,
    "scripts/fixtures/ccd/event-capability/binding.json",
  );
  const transformation = validateEventCapabilityPair(
    pair.baseline,
    pair.mutant,
    source,
  );
  const readTransformation = validateCourtadminReadPair(pair.baseline, pair["read-mutant"], source);
  const readonlyReadTransformation = validateReadonlyReadPair(pair.baseline, pair["readonly-read-mutant"], source);
  // prepareCcdImport independently validates the canonical pair and workbook seals.
  const prepared = Object.fromEntries(
    ["baseline", "mutant", "read-mutant", "readonly-read-mutant"].map((variant) => {
      const value = prepareCcdImport(undefined, "event-capability-" + variant);
      assert.deepEqual(
        value.source,
        pair[variant],
        "COVERAGE_EVENT_CANONICAL_SOURCE_MISMATCH",
      );
      assert.deepEqual(
        value.binding,
        {
          schemaVersion: binding.schemaVersion,
          ...binding[variant],
          sourceProjectionDigest: binding.sourceProjectionDigest,
        },
        "COVERAGE_EVENT_CANONICAL_BINDING_MISMATCH",
      );
      assert.equal(
        digestBytes(
          bytes(
            harnessRoot,
            `scripts/fixtures/ccd/event-capability/${variant}.json`,
          ),
        ),
        value.binding.sourceDigest,
        "COVERAGE_EVENT_SOURCE_SEAL_MISMATCH",
      );
      assert.equal(
        digestBytes(
          bytes(
            harnessRoot,
            `scripts/fixtures/ccd/event-capability/${variant}.xlsx`,
          ),
        ),
        value.binding.workbookDigest,
        "COVERAGE_EVENT_WORKBOOK_SEAL_MISMATCH",
      );
      return [variant, value];
    }),
  );
  const baseline = read(directory, "input.json");
  assert.equal(
    baseline.runId,
    loaded.input.manifest.runId,
    "COVERAGE_EVENT_RUN_MISMATCH",
  );
  assert.equal(
    baseline.releaseScopeId,
    EVENT_CAPABILITY_SCOPE,
    "COVERAGE_EVENT_SCOPE_MISMATCH",
  );
  validateEventCapabilityTransitionRequest(
    baseline,
    read(directory, "event-transition-request.json"),
  );
  const mutant = selectEventCapabilityRuntime(
    baseline,
    EVENT_CAPABILITY_MUTATION,
    read(directory, EVENT_CAPABILITY_MUTATION + "/runtime-input.json"),
  );
  const readMutant = selectEventCapabilityRuntime(baseline, COURTADMIN_READ_MUTATION,
    read(directory, COURTADMIN_READ_MUTATION + "/runtime-input.json"));
  const readonlyReadMutant = selectEventCapabilityRuntime(baseline, READONLY_READ_MUTATION,
    read(directory, READONLY_READ_MUTATION + "/runtime-input.json"));
  for (const [index, variant] of ["mutant", "read-mutant", "readonly-read-mutant"].entries()) {
    assert.deepEqual(
      loaded.input.mutations[index].mutantIdentity,
      {
        ...loaded.input.manifest.identity,
        definitionDigests: {
          HarnessNestedPRL: prepared[variant].binding.workbookDigest,
        },
      },
      "COVERAGE_EVENT_MUTANT_IDENTITY_MISMATCH",
    );
  }
  const root = path.dirname(directory),
    imports = [];
  for (const [variant, runtime] of [
    ["baseline", baseline],
    ["mutant", mutant],
    ["read-mutant", readMutant],
    ["readonly-read-mutant", readonlyReadMutant],
  ]) {
    seedAppCcdSessions(
      runtime.credentials,
      (name) => name,
      EVENT_CAPABILITY_SCOPE,
    );
    const invocation =
      variant === "baseline" ? "baseline" : { mutant: EVENT_CAPABILITY_MUTATION, "read-mutant": COURTADMIN_READ_MUTATION, "readonly-read-mutant": READONLY_READ_MUTATION }[variant];
    const manifest = read(directory, invocation + "/manifest.json");
    if (variant === "baseline")
      assert.deepEqual(
        manifest,
        loaded.input.manifest,
        "COVERAGE_EVENT_BASELINE_MANIFEST_MISMATCH",
      );
    const execution = loaded.input.executions.find(
      (item) => item.invocationId === invocation,
    );
    for (const key of [
      "runId",
      "harnessCommit",
      "releaseScopeId",
      "policyDigest",
      "requiredObligationIds",
    ])
      assert.deepEqual(
        manifest[key],
        loaded.input.manifest[key],
        "COVERAGE_EVENT_MANIFEST_MISMATCH",
      );
    assert.deepEqual(
      manifest.identity,
      execution.identity,
      "COVERAGE_EVENT_IDENTITY_MISMATCH",
    );
    for (const key of [
      "harnessSourceState",
      "harnessSourceDigest",
      "harnessDependencyDigest",
      "browserDigest",
    ])
      assert.equal(
        manifest.runtimeMetadata[key],
        loaded.input.manifest.runtimeMetadata[key],
        "COVERAGE_EVENT_SOURCE_IDENTITY_MISMATCH",
      );
    const name = `event-${variant}-runtime/definition-import.json`;
    const importBytes = bytes(root, name),
      imported = JSON.parse(importBytes);
    assert.equal(
      digestBytes(importBytes),
      runtime.definitionImportDigest,
      "COVERAGE_EVENT_IMPORT_DIGEST_MISMATCH",
    );
    assert.equal(
      manifest.runtimeMetadata.definitionImportDigest,
      runtime.definitionImportDigest,
      "COVERAGE_EVENT_IMPORT_DIGEST_MISMATCH",
    );
    assert.equal(
      manifest.runtimeMetadata.ccdNamespace,
      runtime.ccd.namespace,
      "COVERAGE_EVENT_NAMESPACE_MISMATCH",
    );
    assert(
      [200, 201].includes(imported.status),
      "COVERAGE_EVENT_IMPORT_FAILED",
    );
    assert.equal(
      imported.fixtureSelection,
      "event-capability-" + variant,
      "COVERAGE_EVENT_VARIANT_MISMATCH",
    );
    assert.equal(
      imported.sourceRevision,
      source.revision,
      "COVERAGE_EVENT_REVISION_MISMATCH",
    );
    assert.equal(
      imported.sourceProjectionDigest,
      prepared[variant].binding.sourceProjectionDigest,
      "COVERAGE_EVENT_SOURCE_MISMATCH",
    );
    assert.deepEqual(
      imported.binding,
      prepared[variant].binding,
      "COVERAGE_EVENT_BINDING_MISMATCH",
    );
    assert.equal(
      imported.fixtureDigest,
      prepared[variant].binding.workbookDigest,
      "COVERAGE_EVENT_WORKBOOK_MISMATCH",
    );
    assert.equal(
      manifest.identity.definitionDigests.HarnessNestedPRL,
      imported.fixtureDigest,
      "COVERAGE_EVENT_DEFINITION_MISMATCH",
    );
    assert.equal(
      runtime.definition.fixtureDigest,
      imported.fixtureDigest,
      "COVERAGE_EVENT_DEFINITION_MISMATCH",
    );
    const observed = read(
      root,
      `event-${variant}-runtime/observed-definition.json`,
    );
    assert.equal(
      digestBytes(JSON.stringify(observed)),
      imported.observedDefinitionDigest,
      "COVERAGE_EVENT_OBSERVED_MISMATCH",
    );
    assert.equal(
      runtime.definition.observedDefinitionDigest,
      imported.observedDefinitionDigest,
      "COVERAGE_EVENT_OBSERVED_MISMATCH",
    );
    assert.equal(
      manifest.runtimeMetadata.observedDefinitionDigest,
      imported.observedDefinitionDigest,
      "COVERAGE_EVENT_OBSERVED_MISMATCH",
    );
    assert.equal(
      observed.version.number,
      imported.definitionVersion,
      "COVERAGE_EVENT_VERSION_MISMATCH",
    );
    assert.equal(
      runtime.definition.definitionVersion,
      imported.definitionVersion,
      "COVERAGE_EVENT_VERSION_MISMATCH",
    );
    assert.equal(
      manifest.runtimeMetadata.definitionVersion,
      String(imported.definitionVersion),
      "COVERAGE_EVENT_VERSION_MISMATCH",
    );
    assertObservedEventCapabilityDefinition(observed, prepared[variant].source);
    for (const [service, dependency] of [
      ["data", "ccd"],
      ["definition", "ccd-definition"],
    ]) {
      assert.equal(
        imported.images[service].id,
        manifest.identity.dependencyIdentities[dependency].artifactDigest,
        "COVERAGE_EVENT_IMAGE_MISMATCH",
      );
      assert.equal(
        runtime.ccd.images[service].id,
        imported.images[service].id,
        "COVERAGE_EVENT_IMAGE_MISMATCH",
      );
      assert.equal(
        runtime.apiContracts[service],
        manifest.identity.dependencyIdentities[dependency].apiContractDigest,
        "COVERAGE_EVENT_API_MISMATCH",
      );
    }
    imports.push({
      variant,
      path: name,
      digest: digestBytes(importBytes),
      observedDefinitionDigest: imported.observedDefinitionDigest,
    });
  }
  const run = read(directory, "run.json");
  for (const [index, [variant, mutationId, runtime]] of [
    ["mutant", EVENT_CAPABILITY_MUTATION, mutant],
    ["read-mutant", COURTADMIN_READ_MUTATION, readMutant],
    ["readonly-read-mutant", READONLY_READ_MUTATION, readonlyReadMutant],
  ].entries()) {
    const ref = run.mutations[index].derivationArtifact;
    bytes(directory, ref.path);
    const derivation = readEvidenceArtifact(directory, ref).value;
    const runtimeMetadata = (runtime) => ({
      definitionImportDigest: runtime.definitionImportDigest,
      observedDefinitionDigest: runtime.definition.observedDefinitionDigest,
      definitionVersion: String(runtime.definition.definitionVersion),
      ccdNamespace: runtime.ccd.namespace,
    });
    const runtimePath = mutationId + "/runtime-input.json";
    assert.deepEqual(
      derivation,
      {
        mutationDefinitionDigest:
          loaded.input.policy.mutationDefinitions[index].definitionDigest,
        baselineIdentity: loaded.input.manifest.identity,
        mutantIdentity: loaded.input.mutations[index].mutantIdentity,
        transformation: mutationId,
        target: eventCapabilityFaultContract(mutationId).target,
        transformationRecord: { transformation, readTransformation, readonlyReadTransformation }[eventCapabilityFaultContract(mutationId).transformationKey],
        beforeDigest: prepared.baseline.binding.workbookDigest,
        afterDigest: prepared[variant].binding.workbookDigest,
        baselineRuntimeMetadata: runtimeMetadata(baseline),
        mutantRuntimeMetadata: runtimeMetadata(runtime),
        runtimeRecord: {
          path: runtimePath,
          digest: digestBytes(bytes(directory, runtimePath)),
        },
      },
      "COVERAGE_EVENT_DERIVATION_MISMATCH",
    );
  }
  return imports;
}
