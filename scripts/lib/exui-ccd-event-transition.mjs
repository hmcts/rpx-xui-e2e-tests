import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { digestBytes, writeJsonAtomic } from "./exui-evidence-io.mjs";
import { validateIdentity } from "./exui-release-evidence.mjs";
import { readEventBaselineCheckpoint } from "./exui-native-proof-validation.mjs";
import { validateNativeInvocationFinalization } from "./exui-native-ci-ownership.mjs";
import { CCD_IMAGES, ccdRuntimeImageIds, prepareCcdImport, assertObservedCcdDefinition, assertObservedEventCapabilityDefinition } from "./exui-ccd-runtime.mjs";
import {
  EVENT_CAPABILITY_SCOPE,
  EVENT_CAPABILITY_MUTATION,
  COURTADMIN_READ_MUTATION,
} from "./exui-ccd-event-capability.mjs";

const digest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? "");
const binding = () => JSON.parse(fs.readFileSync(
  new URL("../fixtures/ccd/event-capability/binding.json", import.meta.url),
  "utf8",
));

function eventFaultVariant(invocationId) {
  assert([EVENT_CAPABILITY_MUTATION, COURTADMIN_READ_MUTATION].includes(invocationId), "EVENT_TRANSITION_INVOCATION");
  return invocationId === COURTADMIN_READ_MUTATION ? "read-mutant" : "mutant";
}

// Replays parent-captured transition facts; it neither starts CCD nor decides proof outcomes.
export function validateEventTransitionEvidence(directory, expected, loadedInput) {
  assert.equal(expected?.releaseScopeId, EVENT_CAPABILITY_SCOPE, "EVENT_TRANSITION_SCOPE");
  assert(path.isAbsolute(directory) && path.normalize(directory) === directory && fs.realpathSync(directory) === directory, "EVENT_TRANSITION_DIRECTORY_ALIAS");
  const readFixed = (root, relative) => {
    const file = path.join(root, relative);
    assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, "EVENT_TRANSITION_ARTIFACT_ALIAS");
    const bytes = fs.readFileSync(file);
    return { value: JSON.parse(bytes), digest: digestBytes(bytes) };
  };
  const referenced = (reference, relative) => {
    assert.deepEqual(Object.keys(reference ?? {}).sort(), ["digest", "path"], "EVENT_TRANSITION_REFERENCE_REQUIRED");
    assert.equal(reference.path, relative, "EVENT_TRANSITION_REFERENCE_PATH");
    assert(digest(reference.digest), "EVENT_TRANSITION_REFERENCE_DIGEST");
    const actual = readFixed(directory, relative);
    assert.equal(actual.digest, reference.digest, "EVENT_TRANSITION_REFERENCE_DIGEST");
    return actual.value;
  };
  const record = referenced(expected.eventTransition, "independent-transition.json");
  assert.deepEqual(Object.keys(record).sort(), [
    "baselineCheckpointDigest", "baselineInputDigest", "baselineRemoval", "capturedAt", "capturedBeforeFault",
    "harnessCommit", "harnessSourceDigest", "identity", "releaseScopeId", "requestDigest", "runId", "runtimeRecord", "schemaVersion",
  ], "EVENT_TRANSITION_CAPTURE_FIELDS");
  assert.equal(record.schemaVersion, 1, "EVENT_TRANSITION_CAPTURE_SCHEMA");
  assert.equal(record.capturedBeforeFault, true, "EVENT_TRANSITION_CAPTURE_ORDER");
  assert(typeof record.capturedAt === "string" && Number.isFinite(Date.parse(record.capturedAt)) && new Date(record.capturedAt).toISOString() === record.capturedAt, "EVENT_TRANSITION_CAPTURE_TIME");
  for (const field of ["runId", "releaseScopeId", "harnessCommit", "harnessSourceDigest"])
    assert.deepEqual(record[field], expected[field], "EVENT_TRANSITION_CAPTURE_IDENTITY");
  const capturedInput = readFixed(directory, "input.json"), input = capturedInput.value;
  assert.equal(capturedInput.digest, record.baselineInputDigest, "EVENT_TRANSITION_INPUT_DIGEST");
  for (const field of ["runId", "releaseScopeId", "harnessCommit", "harnessSourceDigest"])
    assert.deepEqual(input[field], expected[field], "EVENT_TRANSITION_INPUT_IDENTITY");
  assert.equal(input.only, undefined, "EVENT_TRANSITION_FULL_SCOPE_REQUIRED");
  const request = readFixed(directory, "event-transition-request.json");
  assert.equal(digestBytes(JSON.stringify(request.value)), record.requestDigest, "EVENT_TRANSITION_REQUEST_DIGEST");
  validateEventCapabilityTransitionRequest(input, request.value);
  const checkpoint = readEventBaselineCheckpoint(directory, expected);
  assert.equal(checkpoint.checkpointDigest, record.baselineCheckpointDigest, "EVENT_TRANSITION_CHECKPOINT_DIGEST");
  const removal = referenced(record.baselineRemoval, "baseline-removal.json");
  assert.equal(removal.schemaVersion, 1, "EVENT_TRANSITION_REMOVAL_SCHEMA");
  assert.equal(removal.runId, input.runId, "EVENT_TRANSITION_REMOVAL_RUN");
  assert.equal(removal.baselineNamespace, input.ccd.namespace, "EVENT_TRANSITION_REMOVAL_NAMESPACE");
  assert.equal(removal.baselineOwner, input.ccd.owner, "EVENT_TRANSITION_REMOVAL_OWNER");
  const services = Object.keys(CCD_IMAGES).sort();
  const validateState = (state) => {
    assert.deepEqual(Object.keys(state.containers).sort(), services, "EVENT_TRANSITION_CCD_INVENTORY");
    assert.deepEqual(Object.keys(state.images).sort(), services, "EVENT_TRANSITION_IMAGE_INVENTORY");
    assert.equal(new Set(Object.values(state.containers)).size, services.length, "EVENT_TRANSITION_CCD_CID_COLLISION");
    assert(Object.values(state.containers).every(id => /^[a-f0-9]{64}$/.test(id)), "EVENT_TRANSITION_CCD_CID");
    assert.equal(state.namespace, state.containers.database, "EVENT_TRANSITION_CCD_NAMESPACE");
    assert.equal(state.platform ?? "linux/arm64", input.ccd.platform ?? "linux/arm64", "EVENT_TRANSITION_CCD_PLATFORM");
    ccdRuntimeImageIds(state);
  };
  validateState(input.ccd);
  assert.equal(removal.ccd.owner, input.ccd.owner, "EVENT_TRANSITION_REMOVAL_OWNER");
  assert.equal(removal.ccd.cleanupComplete, true, "EVENT_TRANSITION_REMOVAL_INCOMPLETE");
  assert.deepEqual(removal.ccd.checkedNames.slice().sort(), services.map(service => `${input.ccd.owner}-${service}`).sort(), "EVENT_TRANSITION_REMOVAL_NAMES");
  assert.deepEqual(removal.ccd.checkedContainerIds.slice().sort(), Object.values(input.ccd.containers).sort(), "EVENT_TRANSITION_REMOVAL_CIDS");
  const paths = ["baseline/candidate-write-denial.json", "baseline/candidate-lifecycle.json", "baseline-owned-resources.json"];
  assert.deepEqual(removal.native.bindings.map(item => item.path), paths, "EVENT_TRANSITION_NATIVE_BINDINGS");
  const [, , registry] = removal.native.bindings.map((reference, index) => referenced(reference, paths[index]));
  const names = [`${input.runId}-baseline-candidate`, `${input.runId}-baseline-tools`];
  assert.deepEqual(registry.map(item => item.name).sort(), names.slice().sort(), "EVENT_TRANSITION_NATIVE_NAMES");
  const captured = names.map((name, index) => {
    const item = registry.find(row => row.name === name);
    assert(/^[a-f0-9]{64}$/.test(item.id), "EVENT_TRANSITION_NATIVE_CID");
    assert.equal(item.owner, input.runId, "EVENT_TRANSITION_NATIVE_OWNER");
    assert.equal(item.namespace, input.ccd.namespace, "EVENT_TRANSITION_NATIVE_NAMESPACE");
    assert.equal(item.service, index ? "browser-provider" : "candidate", "EVENT_TRANSITION_NATIVE_SERVICE");
    assert.equal(item.image, index ? input.browserRuntimeImage : input.nativeRuntime.imageId, "EVENT_TRANSITION_NATIVE_IMAGE");
    assert.equal(item.removed, true, "EVENT_TRANSITION_NATIVE_REMOVAL");
    return { name, id: item.id };
  });
  assert.notEqual(captured[0].id, captured[1].id, "EVENT_TRANSITION_NATIVE_CID_COLLISION");
  assert.deepEqual(removal.native.removed, captured, "EVENT_TRANSITION_NATIVE_REMOVAL");
  const { denial, lifecycle } = validateNativeInvocationFinalization(directory, { invocationId: "baseline" });
  assert.equal(denial.candidateId, captured[0].id, "EVENT_TRANSITION_NATIVE_PROBE_CID");
  for (const observed of [lifecycle.before, lifecycle.after]) {
    assert.equal(observed.Id, captured[0].id, "EVENT_TRANSITION_NATIVE_LIFECYCLE_CID");
    assert.equal(observed.Name, `/${captured[0].name}`, "EVENT_TRANSITION_NATIVE_LIFECYCLE_NAME");
  }
  assert.equal(lifecycle.after.State.OOMKilled, false, "EVENT_TRANSITION_NATIVE_OOM");
  const runtimeRecord = referenced(record.runtimeRecord, `${EVENT_CAPABILITY_MUTATION}/runtime-input.json`);
  const faultInput = selectEventCapabilityRuntime(input, EVENT_CAPABILITY_MUTATION, runtimeRecord);
  validateState(faultInput.ccd);
  assert(Object.values(faultInput.ccd.containers).every(id => !Object.values(input.ccd.containers).includes(id)), "EVENT_TRANSITION_CCD_CID_REUSE");
  for (const [selected, variant] of [[input, "baseline"], [faultInput, "mutant"]]) {
    const originalOutput = selected.ccd.output;
    assert(typeof originalOutput === "string" && path.isAbsolute(originalOutput) && path.normalize(originalOutput) === originalOutput &&
      path.basename(originalOutput) === `event-${variant}-runtime`, "EVENT_TRANSITION_IMPORT_ORIGINAL_PATH");
  }
  assert.equal(path.dirname(input.ccd.output), path.dirname(faultInput.ccd.output), "EVENT_TRANSITION_IMPORT_ORIGINAL_PARENT");
  const imported = (selected, variant) => {
    const root = path.join(path.dirname(directory), `event-${variant}-runtime`);
    const receipt = readFixed(root, "definition-import.json"), observed = readFixed(root, "observed-definition.json");
    const prepared = prepareCcdImport(undefined, `event-capability-${variant}`);
    assert.equal(receipt.digest, selected.definitionImportDigest, "EVENT_TRANSITION_IMPORT_DIGEST");
    assert([200, 201].includes(receipt.value.status), "EVENT_TRANSITION_IMPORT_STATUS");
    assert.equal(receipt.value.fixtureSelection, prepared.fixtureSelection, "EVENT_TRANSITION_IMPORT_VARIANT");
    assert.deepEqual(receipt.value.binding, prepared.binding, "EVENT_TRANSITION_IMPORT_BINDING");
    assert.equal(receipt.value.sourceRevision, prepared.source.provenance.sourceRevision, "EVENT_TRANSITION_IMPORT_SOURCE");
    assert.equal(receipt.value.sourceProjectionDigest, prepared.binding.sourceProjectionDigest, "EVENT_TRANSITION_IMPORT_SOURCE");
    assert.deepEqual(receipt.value.images, selected.ccd.images, "EVENT_TRANSITION_IMPORT_IMAGES");
    assert.equal(receipt.value.fixtureDigest, digestBytes(prepared.file), "EVENT_TRANSITION_IMPORT_WORKBOOK");
    for (const field of ["fixtureDigest", "observedDefinitionDigest", "definitionVersion"])
      assert.deepEqual(receipt.value[field], selected.definition[field], "EVENT_TRANSITION_IMPORT_IDENTITY");
    assertObservedCcdDefinition(receipt.value, observed.value);
    assertObservedEventCapabilityDefinition(observed.value, prepared.source);
    return { definitionImportDigest: receipt.digest, observedDefinitionDigest: receipt.value.observedDefinitionDigest,
      definitionVersion: String(receipt.value.definitionVersion), ccdNamespace: selected.ccd.namespace };
  };
  const baselineMetadata = imported(input, "baseline"), mutantMetadata = imported(faultInput, "mutant");
  // Parent recomputed this identity before capture. Replay never reopens the original candidate.
  const baselineIdentity = structuredClone(expected.identity);
  validateIdentity(baselineIdentity);
  const dependencyIdentities = Object.fromEntries(["data", "definition"].map(service => [
    service === "data" ? "ccd" : "ccd-definition",
    { artifactDigest: input.ccd.images[service].id, apiContractDigest: input.apiContracts[service] },
  ]));
  assert.deepEqual(baselineIdentity, { ...input.artifact.identity,
    configurationDigest: baselineIdentity.configurationDigest,
    definitionDigests: { HarnessNestedPRL: binding().baseline.workbookDigest }, dependencyIdentities,
  }, "EVENT_TRANSITION_BASELINE_IDENTITY");
  const faultIdentity = { ...baselineIdentity, definitionDigests: { HarnessNestedPRL: binding().mutant.workbookDigest } };
  assert.deepEqual(faultIdentity, record.identity, "EVENT_TRANSITION_FAULT_IDENTITY");
  assert.deepEqual(loadedInput.manifest, checkpoint.input.manifest, "EVENT_TRANSITION_LOADED_BASELINE");
  const execution = loadedInput.executions.filter(item => item.invocationId === EVENT_CAPABILITY_MUTATION);
  assert.equal(execution.length, 1, "EVENT_TRANSITION_MUTANT_EXECUTION");
  assert.deepEqual(execution[0].identity, faultIdentity, "EVENT_TRANSITION_EXECUTION_IDENTITY");
  assert.equal(execution[0].kind, "mutation", "EVENT_TRANSITION_EXECUTION_KIND");
  for (const [field, value] of Object.entries({ ...baselineMetadata, gatewayDigest: input.gatewayDigest, idamSimulatorImage: input.ccd.images.idam.id }))
    assert.deepEqual(checkpoint.input.manifest.runtimeMetadata[field], value, "EVENT_TRANSITION_BASELINE_METADATA");
  const mutantManifest = readFixed(directory, `${EVENT_CAPABILITY_MUTATION}/manifest.json`).value;
  for (const field of ["schemaVersion", "runId", "harnessCommit", "releaseScopeId", "policyDigest", "requiredObligationIds"])
    assert.deepEqual(mutantManifest[field], checkpoint.input.manifest[field], "EVENT_TRANSITION_MUTANT_MANIFEST");
  assert.deepEqual(mutantManifest.identity, faultIdentity, "EVENT_TRANSITION_MUTANT_MANIFEST_IDENTITY");
  for (const field of ["harnessSourceDigest", "harnessDependencyDigest", "browserDigest"])
    assert.equal(mutantManifest.runtimeMetadata[field], expected[field], "EVENT_TRANSITION_MUTANT_METADATA");
  for (const [field, value] of Object.entries({ ...mutantMetadata, harnessSourceState: "clean", isolation: "native-separate-api-owned-network-none",
    gatewayDigest: input.gatewayDigest, idamSimulatorImage: faultInput.ccd.images.idam.id }))
    assert.deepEqual(mutantManifest.runtimeMetadata[field], value, "EVENT_TRANSITION_MUTANT_METADATA");
  const run = readFixed(directory, "run.json").value;
  assert.equal(run.mutations.length, 1, "EVENT_TRANSITION_MUTATION_SELECTION");
  const mutation = run.mutations[0];
  assert.equal(mutation.mutationId, EVENT_CAPABILITY_MUTATION, "EVENT_TRANSITION_MUTATION_SELECTION");
  assert.equal(mutation.baselineInvocationId, "baseline", "EVENT_TRANSITION_MUTATION_BASELINE");
  assert.equal(mutation.mutantInvocationId, EVENT_CAPABILITY_MUTATION, "EVENT_TRANSITION_MUTATION_INVOCATION");
  const derivation = referenced(mutation.derivationArtifact, `${EVENT_CAPABILITY_MUTATION}/derivation.json`);
  const contract = binding();
  assert.equal(derivation.mutationDefinitionDigest, checkpoint.input.policy.mutationDefinitions[0].definitionDigest, "EVENT_TRANSITION_DERIVATION_POLICY");
  assert.deepEqual(derivation.baselineIdentity, baselineIdentity, "EVENT_TRANSITION_DERIVATION_IDENTITY");
  assert.deepEqual(derivation.mutantIdentity, faultIdentity, "EVENT_TRANSITION_DERIVATION_IDENTITY");
  assert.equal(derivation.transformation, EVENT_CAPABILITY_MUTATION, "EVENT_TRANSITION_DERIVATION_MUTATION");
  assert.equal(derivation.target, "AuthorisationCaseEvent:caseworker-privatelaw-judge:serviceOfDocuments:CRUD", "EVENT_TRANSITION_DERIVATION_TARGET");
  assert.deepEqual(derivation.transformationRecord, contract.transformation, "EVENT_TRANSITION_DERIVATION_CELL");
  assert.equal(derivation.beforeDigest, contract.baseline.workbookDigest, "EVENT_TRANSITION_DERIVATION_WORKBOOK");
  assert.equal(derivation.afterDigest, contract.mutant.workbookDigest, "EVENT_TRANSITION_DERIVATION_WORKBOOK");
  assert.deepEqual(derivation.baselineRuntimeMetadata, baselineMetadata, "EVENT_TRANSITION_DERIVATION_RUNTIME");
  assert.deepEqual(derivation.mutantRuntimeMetadata, mutantMetadata, "EVENT_TRANSITION_DERIVATION_RUNTIME");
  assert.deepEqual(derivation.runtimeRecord, record.runtimeRecord, "EVENT_TRANSITION_DERIVATION_RECORD");
  return { transition: structuredClone(expected.eventTransition), identity: faultIdentity };
}

export function eventCapabilityTransitionRequest(input) {
  assert.equal(input.releaseScopeId, EVENT_CAPABILITY_SCOPE, "EVENT_TRANSITION_SCOPE");
  assert(/^ccd-[a-f0-9-]{36}$/.test(input.runId), "EVENT_TRANSITION_OWNER");
  assert.equal(input.ccd.fixtureSelection, "event-capability-baseline", "EVENT_TRANSITION_BASELINE");
  assert.equal(input.ccd.ready, true, "EVENT_TRANSITION_BASELINE_NOT_READY");
  assert.equal(input.ccd.definitionImported, true, "EVENT_TRANSITION_BASELINE_IMPORT_REQUIRED");
  assert.equal(input.definition.fixtureDigest, binding().baseline.workbookDigest, "EVENT_TRANSITION_BASELINE_DEFINITION");
  assert(/^[a-f0-9]{64}$/.test(input.ccd.namespace), "EVENT_TRANSITION_BASELINE_NAMESPACE");
  assert(digest(input.definitionImportDigest), "EVENT_TRANSITION_BASELINE_IMPORT");
  return {
    schemaVersion: 1,
    runId: input.runId,
    releaseScopeId: EVENT_CAPABILITY_SCOPE,
    invocationId: EVENT_CAPABILITY_MUTATION,
    baselineNamespace: input.ccd.namespace,
    baselineDefinitionImportDigest: input.definitionImportDigest,
  };
}

export async function waitForEventCapabilityRuntime(input, output, { invocationId = EVENT_CAPABILITY_MUTATION, isCancelled = () => false, timeoutMs = 180000 } = {}) {
  eventFaultVariant(invocationId);
  const file = path.join(output, invocationId, "runtime-input.json");
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    assert(!isCancelled(), "EVENT_TRANSITION_CANCELLED");
    assert(Date.now() < deadline, "EVENT_TRANSITION_ACK_TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert(!isCancelled(), "EVENT_TRANSITION_CANCELLED");
  assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, "EVENT_TRANSITION_ACK_ALIAS");
  return selectEventCapabilityRuntime(input, invocationId, JSON.parse(fs.readFileSync(file, "utf8")));
}

export function publishEventCapabilityRuntime(output, record) {
  eventFaultVariant(record.invocationId);
  const directory = path.join(output, record.invocationId);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assert.equal(fs.realpathSync(directory), directory, "EVENT_TRANSITION_ACK_ALIAS");
  const file = path.join(directory, "runtime-input.json");
  const temporary = path.join(directory, `.${randomUUID()}.json`);
  try {
    writeJsonAtomic(temporary, record);
    // A hard link publishes the complete record atomically and cannot replace an earlier ACK.
    fs.linkSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { path: path.relative(output, file), digest: digestBytes(fs.readFileSync(file)) };
}

export function validateEventCapabilityTransitionRequest(input, request) {
  assert.deepEqual(request, eventCapabilityTransitionRequest(input), "EVENT_TRANSITION_REQUEST_MISMATCH");
}

// The parent supplies this record only after baseline removal and independent fault import verification.
export function selectEventCapabilityRuntime(input, invocationId, record) {
  const request = eventCapabilityTransitionRequest(input);
  const variant = eventFaultVariant(invocationId);
  assert.deepEqual(Object.keys(record).sort(), [
    "apiContracts", "ccd", "credentials", "definition", "definitionImportDigest",
    "invocationId", "requestDigest", "runId", "schemaVersion",
  ], "EVENT_TRANSITION_RECORD_FIELDS");
  assert.equal(record.schemaVersion, 1, "EVENT_TRANSITION_SCHEMA");
  assert.equal(record.runId, input.runId, "EVENT_TRANSITION_RUN");
  assert.equal(record.invocationId, invocationId, "EVENT_TRANSITION_INVOCATION");
  assert.equal(record.requestDigest, digestBytes(JSON.stringify(request)), "EVENT_TRANSITION_REQUEST_BINDING");
  assert.equal(record.ccd.fixtureSelection, `event-capability-${variant}`, "EVENT_TRANSITION_VARIANT");
  assert.equal(record.ccd.ready, true, "EVENT_TRANSITION_RUNTIME_NOT_READY");
  assert.equal(record.ccd.definitionImported, true, "EVENT_TRANSITION_IMPORT_REQUIRED");
  assert(/^[a-f0-9]{64}$/.test(record.ccd.namespace), "EVENT_TRANSITION_NAMESPACE");
  assert(/^harness-[a-f0-9]{16}$/.test(record.ccd.owner), "EVENT_TRANSITION_CCD_OWNER");
  assert.notEqual(record.ccd.namespace, input.ccd.namespace, "EVENT_TRANSITION_NAMESPACE_REUSE");
  assert.notEqual(record.ccd.owner, input.ccd.owner, "EVENT_TRANSITION_OWNER_REUSE");
  assert.deepEqual(record.ccd.images, input.ccd.images, "EVENT_TRANSITION_IMAGE_DRIFT");
  assert.deepEqual(record.apiContracts, input.apiContracts, "EVENT_TRANSITION_API_DRIFT");
  assert.equal(record.definition.fixtureDigest, binding()[variant].workbookDigest, "EVENT_TRANSITION_FAULT_DEFINITION");
  assert(digest(record.definition.observedDefinitionDigest), "EVENT_TRANSITION_OBSERVED_DEFINITION");
  assert.notEqual(record.definition.observedDefinitionDigest, input.definition.observedDefinitionDigest, "EVENT_TRANSITION_DEFINITION_UNCHANGED");
  assert(Number.isInteger(record.definition.definitionVersion) && record.definition.definitionVersion > 0, "EVENT_TRANSITION_DEFINITION_VERSION");
  assert(digest(record.definitionImportDigest), "EVENT_TRANSITION_IMPORT_DIGEST");
  assert.notEqual(record.definitionImportDigest, input.definitionImportDigest, "EVENT_TRANSITION_IMPORT_REUSE");
  assert.deepEqual(Object.keys(record.credentials).sort(), ["allowed", "courtadmin", "judge", "observer"], "EVENT_TRANSITION_ACTORS");
  const actors = Object.values(record.credentials);
  assert(actors.every((actor) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(actor.userId)), "EVENT_TRANSITION_ACTOR_ID");
  assert.equal(new Set(actors.map((actor) => actor.userId)).size, 4, "EVENT_TRANSITION_ACTOR_COLLISION");
  assert(actors.every((actor) => /^Bearer \S+$/.test(actor.headers?.Authorization ?? "")), "EVENT_TRANSITION_ACTOR_BEARER");
  assert.equal(new Set(actors.map((actor) => actor.headers.Authorization)).size, 4, "EVENT_TRANSITION_BEARER_COLLISION");
  for (const persona of ["courtadmin", "judge"])
    assert.deepEqual(record.credentials[persona].roles?.slice().sort(), [
      "caseworker", "caseworker-harness", `caseworker-privatelaw-${persona}`,
    ], "EVENT_TRANSITION_SOURCE_ROLES");
  return {
    ...input,
    ccd: record.ccd,
    credentials: record.credentials,
    definition: record.definition,
    definitionImportDigest: record.definitionImportDigest,
  };
}
