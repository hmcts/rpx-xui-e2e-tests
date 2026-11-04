const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { completeRun } = require("./exui-release-evidence.mock.cjs");
const hash = value => "sha256:" + createHash("sha256").update(value).digest("hex");
const digest = letter => "sha256:" + letter.repeat(64);
const scope = "exui-ccd-event-capability-pilot";
const mutation = "ccd-enable-judge-event";
const readMutation = "ccd-remove-courtadmin-recipient-read";
const readonlyUpdateMutation = "ccd-enable-readonly-recipient-update";
const readonlyMutation = "ccd-remove-readonly-recipient-read";

// Synthetic transport shape only. Real importer/role behavior is owned by the runtime proof.
function observedDefinition(source) {
  const s = source.sheets;
  const acls = rows => rows.map(row => ({ role: row.UserRole,
    ...Object.fromEntries([["create", "C"], ["read", "R"], ["update", "U"], ["delete", "D"]].map(([key, letter]) => [key, row.CRUD.includes(letter)])),
  }));
  return {
    id: "HarnessNestedPRL", version: { number: 1 }, acls: acls(s.AuthorisationCaseType),
    states: [{ id: "JUDICIAL_REVIEW", acls: acls(s.AuthorisationCaseState) }],
    case_fields: s.CaseField.map(row => ({ id: row.ID, acls: acls(s.AuthorisationCaseField.filter(a => a.CaseFieldID === row.ID)) })),
    events: s.CaseEvent.map(row => ({ id: row.ID, name: row.Name,
      pre_states: row["PreConditionState(s)"]?.split(";") ?? [], post_states: [{ post_state_reference: row.PostConditionState }],
      acls: acls(s.AuthorisationCaseEvent.filter(a => a.CaseEventID === row.ID)), show_summary: true,
      case_fields: s.CaseEventToFields.filter(f => f.CaseEventID === row.ID).map(f => ({
        case_field_id: f.CaseFieldID, display_context: f.DisplayContext, show_condition: f.FieldShowCondition ?? null,
        show_summary_change_option: f.ShowSummaryChangeOption === "Y",
        case_fields_complex: s.EventToComplexTypes.filter(e => e.CaseEventID === row.ID && e.CaseFieldID === f.CaseFieldID)
          .map(e => ({ reference: e.ListElementCode, displayContext: e.DisplayContext, showCondition: e.FieldShowCondition ?? null })),
      })),
    })),
  };
}

async function createEventTransitionFixture(t, { root: suppliedRoot } = {}) {
  const root = suppliedRoot ?? fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "event-transition-evidence-"));
  if (!suppliedRoot) t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(root, { recursive: true });
  const directory = path.join(root, "eventCapability");
  fs.mkdirSync(directory);
  const put = (name, value, base = directory) => {
    const target = path.join(base, name), bytes = JSON.stringify(value);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    return { path: name, digest: hash(bytes) };
  };
  const read = name => JSON.parse(fs.readFileSync(path.join(directory, name)));
  const runtime = await import("../lib/exui-ccd-runtime.mjs");
  const { nativeIdentity } = await import("../lib/exui-native-contract.mjs");
  const { getReleasePolicy } = await import("../lib/exui-release-policy.mjs");
  const { loadRunEvidence } = await import("../lib/exui-evidence-io.mjs");
  const { readEventBaselineCheckpoint } = await import("../lib/exui-native-proof-validation.mjs");
  const { eventCapabilityTransitionRequest } = await import("../lib/exui-ccd-event-transition.mjs");
  const policy = getReleasePolicy(scope), fixtureBinding = JSON.parse(fs.readFileSync(path.join(__dirname, "ccd/event-capability/binding.json")));
  const candidateRoot = path.join(root, "candidate");
  put("config/default.json", { services: { idam: {} }, feature: {} }, candidateRoot);
  const artifact = { candidateRoot, identity: completeRun().manifest.identity };
  const images = Object.fromEntries(Object.entries(runtime.CCD_IMAGES).map(([name, id]) => [name, { id, architecture: "arm64", repoDigests: [`fixture@${id}`] }]));
  const variants = {};
  for (const [index, variant] of ["baseline", "mutant", "read-mutant", "readonly-read-mutant", "readonly-update-mutant"].entries()) {
    const prepared = runtime.prepareCcdImport(undefined, "event-capability-" + variant);
    const observed = observedDefinition(prepared.source);
    const output = path.join(root, `event-${variant}-runtime`);
    const containers = Object.fromEntries(Object.keys(images).map((name, i) => [name, ["a", "b", "f", "9", "6"][index] + String(i + 1).repeat(63)]));
    const state = { schemaVersion: 1, ready: true, definitionImported: true, owner: "harness-" + String(index + 1).repeat(16),
      output, containers, namespace: containers.database, images, fixtureSelection: "event-capability-" + variant };
    const imported = { binding: prepared.binding, status: 201, fixtureDigest: hash(prepared.file), images,
      sourceRevision: fixtureBinding.sourceRevision, sourceProjectionDigest: fixtureBinding.sourceProjectionDigest,
      fixtureSelection: state.fixtureSelection, observedDefinitionDigest: hash(JSON.stringify(observed)), definitionVersion: 1 };
    put("observed-definition.json", observed, output);
    const importedRef = put("definition-import.json", imported, output);
    variants[variant] = { state, observed, imported, importedRef };
  }
  const credentials = Object.fromEntries(["allowed", "courtadmin", "judge", "observer", "readonly"].map((name, i) => [name, {
    userId: `${i + 1}1111111-1111-4111-8111-111111111111`,
    headers: { Authorization: `Bearer PRIVATE-CANARY-${name}` },
    roles: ["caseworker", "caseworker-harness", `caseworker-privatelaw-${name}`],
  }]));
  const input = { runId: "ccd-11111111-1111-4111-8111-111111111111", releaseScopeId: scope,
    harnessCommit: "b".repeat(40), harnessSourceDigest: digest("4"), artifact,
    ccd: variants.baseline.state, definition: variants.baseline.imported, definitionImportDigest: variants.baseline.importedRef.digest,
    credentials, apiContracts: { data: digest("5"), definition: digest("6") }, gatewayDigest: digest("7"),
    nativeRuntime: { imageId: digest("8") }, browserRuntimeImage: digest("9"),
  };
  const request = eventCapabilityTransitionRequest(input);
  const runtimeRecord = { schemaVersion: 1, runId: input.runId, invocationId: mutation, requestDigest: hash(JSON.stringify(request)),
    ccd: variants.mutant.state, definition: variants.mutant.imported, definitionImportDigest: variants.mutant.importedRef.digest,
    credentials, apiContracts: input.apiContracts };
  const readRuntimeRecord = { ...runtimeRecord, invocationId: readMutation,
    ccd: variants["read-mutant"].state, definition: variants["read-mutant"].imported,
    definitionImportDigest: variants["read-mutant"].importedRef.digest };
  const readonlyRuntimeRecord = { ...runtimeRecord, invocationId: readonlyMutation,
    ccd: variants["readonly-read-mutant"].state, definition: variants["readonly-read-mutant"].imported,
    definitionImportDigest: variants["readonly-read-mutant"].importedRef.digest };
  const readonlyUpdateRuntimeRecord = { ...runtimeRecord, invocationId: readonlyUpdateMutation,
    ccd: variants["readonly-update-mutant"].state, definition: variants["readonly-update-mutant"].imported,
    definitionImportDigest: variants["readonly-update-mutant"].importedRef.digest };
  const readonlyFaultIdentity = nativeIdentity({ ...input, ...readonlyRuntimeRecord }, { mutation: readonlyMutation }, candidateRoot).identity;
  const readonlyUpdateFaultIdentity = nativeIdentity({ ...input, ...readonlyUpdateRuntimeRecord }, { mutation: readonlyUpdateMutation }, candidateRoot).identity;
  const baselineIdentity = nativeIdentity(input, { mutation: null }, candidateRoot).identity;
  const faultInput = { ...input, ccd: runtimeRecord.ccd, definition: runtimeRecord.definition, definitionImportDigest: runtimeRecord.definitionImportDigest };
  const faultIdentity = nativeIdentity(faultInput, { mutation }, candidateRoot).identity;
  const readFaultIdentity = nativeIdentity({ ...input, ...readRuntimeRecord }, { mutation: readMutation }, candidateRoot).identity;
  const expected = { nativeAuthority: true, runId: input.runId, releaseScopeId: scope, harnessCommit: input.harnessCommit,
    policyDigest: policy.policyDigest, identity: baselineIdentity, harnessSourceDigest: input.harnessSourceDigest,
    harnessDependencyDigest: digest("a"), browserDigest: digest("b") };
  const manifest = identity => ({ schemaVersion: 1, runId: input.runId, releaseScopeId: scope, harnessCommit: input.harnessCommit,
    policyDigest: policy.policyDigest, requiredObligationIds: policy.requiredObligationIds, identity,
    runtimeMetadata: { isolation: "native-separate-api-owned-network-none", harnessSourceState: "clean",
      harnessSourceDigest: expected.harnessSourceDigest, harnessDependencyDigest: expected.harnessDependencyDigest,
      browserDigest: expected.browserDigest, gatewayDigest: input.gatewayDigest } });
  const baselineManifest = manifest(baselineIdentity), mutantManifest = manifest(faultIdentity), readMutantManifest = manifest(readFaultIdentity);
  const readonlyMutantManifest = manifest(readonlyFaultIdentity);
  const readonlyUpdateMutantManifest = manifest(readonlyUpdateFaultIdentity);
  Object.assign(baselineManifest.runtimeMetadata, { ccdNamespace: input.ccd.namespace, definitionImportDigest: input.definitionImportDigest,
    observedDefinitionDigest: input.definition.observedDefinitionDigest, definitionVersion: "1", idamSimulatorImage: images.idam.id });
  Object.assign(mutantManifest.runtimeMetadata, { ccdNamespace: runtimeRecord.ccd.namespace, definitionImportDigest: runtimeRecord.definitionImportDigest,
    observedDefinitionDigest: runtimeRecord.definition.observedDefinitionDigest, definitionVersion: "1", idamSimulatorImage: images.idam.id });
  Object.assign(readMutantManifest.runtimeMetadata, { ccdNamespace: readRuntimeRecord.ccd.namespace, definitionImportDigest: readRuntimeRecord.definitionImportDigest,
    observedDefinitionDigest: readRuntimeRecord.definition.observedDefinitionDigest, definitionVersion: "1", idamSimulatorImage: images.idam.id });
  Object.assign(readonlyMutantManifest.runtimeMetadata, { ccdNamespace: readonlyRuntimeRecord.ccd.namespace, definitionImportDigest: readonlyRuntimeRecord.definitionImportDigest,
    observedDefinitionDigest: readonlyRuntimeRecord.definition.observedDefinitionDigest, definitionVersion: "1", idamSimulatorImage: images.idam.id });
  Object.assign(readonlyUpdateMutantManifest.runtimeMetadata, { ccdNamespace: readonlyUpdateRuntimeRecord.ccd.namespace, definitionImportDigest: readonlyUpdateRuntimeRecord.definitionImportDigest,
    observedDefinitionDigest: readonlyUpdateRuntimeRecord.definition.observedDefinitionDigest, definitionVersion: "1", idamSimulatorImage: images.idam.id });
  const makeExecution = (invocationId, current, proofs, failed) => {
    const context = { runId: input.runId, invocationId, identity: current.identity, harnessCommit: input.harnessCommit,
      releaseScopeId: scope, policyDigest: policy.policyDigest, harnessSourceState: "clean", harnessSourceDigest: input.harnessSourceDigest };
    const report = { schemaVersion: 1, complete: true, status: failed ? "failed" : "passed", globalErrors: [], context,
      tests: proofs.map(proofId => ({ proofId, expectedStatus: "passed", status: failed ? "failed" : "passed", retry: 0,
        unattributedErrors: 0, failureId: failed ? ({ [readMutation]: "courtadmin-recipient-read-projection", [readonlyMutation]: "readonly-recipient-read-projection", [readonlyUpdateMutation]: "readonly-update-isolation", [mutation]: "event-capability-isolation" }[invocationId]) : null })) };
    return { current, report, execution: { runId: input.runId, invocationId, kind: failed ? "mutation" : "baseline",
      identity: current.identity, terminalState: "completed", runnerExitCode: failed ? 1 : 0, unexpectedGlobalErrors: [] } };
  };
  const baseline = makeExecution("baseline", baselineManifest, ["ccd-courtadmin-email-one", "ccd-courtadmin-read-recipient-shapes", "ccd-event-create-denied", "ccd-readonly-read-recipient-shapes", "ccd-readonly-update-recipient-shapes-denied"], false);
  const fault = makeExecution(mutation, mutantManifest, ["ccd-event-create-enabled"], true);
  const readFault = makeExecution(readMutation, readMutantManifest, ["ccd-courtadmin-read-shapes-hidden"], true);
  const readonlyFault = makeExecution(readonlyMutation, readonlyMutantManifest, ["ccd-readonly-read-shapes-hidden"], true);
  const readonlyUpdateFault = makeExecution(readonlyUpdateMutation, readonlyUpdateMutantManifest, ["ccd-readonly-update-recipient-shapes-enabled"], true);
  const registry = [
    { name: `${input.runId}-baseline-candidate`, id: "c".repeat(64), owner: input.runId, service: "candidate", image: input.nativeRuntime.imageId, namespace: input.ccd.namespace, removed: true },
    { name: `${input.runId}-baseline-tools`, id: "d".repeat(64), owner: input.runId, service: "browser-provider", image: input.browserRuntimeImage, namespace: input.ccd.namespace, removed: true },
  ];
  const denial = { candidateId: registry[0].id, controllerSourceVisible: false,
    attempts: ["/output/report.json", "/harness/controller.mjs"].map(p => ({ path: p, denied: true })) };
  const lifecycle = { requestedStop: true, before: { Id: registry[0].id, Name: `/${registry[0].name}`, State: { Running: true } },
    after: { Id: registry[0].id, Name: `/${registry[0].name}`, State: { Running: false, ExitCode: 143, OOMKilled: false } } };
  const removal = { schemaVersion: 1, runId: input.runId, baselineNamespace: input.ccd.namespace, baselineOwner: input.ccd.owner,
    native: { removed: registry.map(({ name, id }) => ({ name, id })), bindings: [] },
    ccd: { owner: input.ccd.owner, cleanupComplete: true,
      checkedNames: Object.keys(images).map(name => `${input.ccd.owner}-${name}`), checkedContainerIds: Object.values(input.ccd.containers).sort() } };
  const derivation = { mutationDefinitionDigest: policy.mutationDefinitions[0].definitionDigest, baselineIdentity, mutantIdentity: faultIdentity,
    transformation: mutation, target: "AuthorisationCaseEvent:caseworker-privatelaw-judge:serviceOfDocuments:CRUD",
    transformationRecord: fixtureBinding.transformation, beforeDigest: fixtureBinding.baseline.workbookDigest, afterDigest: fixtureBinding.mutant.workbookDigest };
  const readDerivation = { mutationDefinitionDigest: policy.mutationDefinitions[1].definitionDigest, baselineIdentity, mutantIdentity: readFaultIdentity,
    transformation: readMutation, target: "AuthorisationCaseField:caseworker-privatelaw-courtadmin:sodAdditionalRecipientsList:CRUD",
    transformationRecord: fixtureBinding.readTransformation, beforeDigest: fixtureBinding.baseline.workbookDigest, afterDigest: fixtureBinding["read-mutant"].workbookDigest };
  const readonlyDerivation = { mutationDefinitionDigest: policy.mutationDefinitions[2].definitionDigest, baselineIdentity, mutantIdentity: readonlyFaultIdentity,
    transformation: readonlyMutation, target: "AuthorisationCaseField:caseworker-privatelaw-readonly:sodAdditionalRecipientsList:CRUD",
    transformationRecord: fixtureBinding.readonlyReadTransformation, beforeDigest: fixtureBinding.baseline.workbookDigest, afterDigest: fixtureBinding["readonly-read-mutant"].workbookDigest };
  const readonlyUpdateDerivation = { mutationDefinitionDigest: policy.mutationDefinitions[3].definitionDigest, baselineIdentity, mutantIdentity: readonlyUpdateFaultIdentity,
    transformation: readonlyUpdateMutation, target: "ReadonlyUpdateACLs:caseworker-privatelaw-readonly:serviceOfDocuments:sodAdditionalRecipientsList",
    transformationRecord: fixtureBinding.readonlyUpdateTransformation, beforeDigest: fixtureBinding.baseline.workbookDigest, afterDigest: fixtureBinding["readonly-update-mutant"].workbookDigest };
  const captures = [{ invocationId: mutation, identity: faultIdentity }, { invocationId: readMutation, identity: readFaultIdentity }, { invocationId: readonlyMutation, identity: readonlyFaultIdentity }, { invocationId: readonlyUpdateMutation, identity: readonlyUpdateFaultIdentity }];
  const parent = { schemaVersion: 2, runId: input.runId, releaseScopeId: scope, harnessCommit: input.harnessCommit,
    harnessSourceDigest: input.harnessSourceDigest, capturedBeforeFault: true, capturedAt: "2026-11-03T12:00:00.000Z", faults: captures };
  const write = () => {
    parent.baselineInputDigest = put("input.json", input).digest;
    put("event-transition-request.json", request);
    fs.writeFileSync(path.join(directory, "event-transition-request.json"), JSON.stringify(request, null, 2) + "\n");
    parent.requestDigest = hash(JSON.stringify(request));
    captures[0].runtimeRecord = put(`${mutation}/runtime-input.json`, runtimeRecord);
    captures[1].runtimeRecord = put(`${readMutation}/runtime-input.json`, readRuntimeRecord);
    captures[2].runtimeRecord = put(`${readonlyMutation}/runtime-input.json`, readonlyRuntimeRecord);
    captures[3].runtimeRecord = put(`${readonlyUpdateMutation}/runtime-input.json`, readonlyUpdateRuntimeRecord);
    const executionArtifacts = [baseline, fault, readFault, readonlyFault, readonlyUpdateFault].map(item => {
      const id = item.execution.invocationId;
      put(`${id}/manifest.json`, item.current);
      item.execution.resultArtifact = put(`${id}/report.json`, item.report);
      put(`${id}/framework-terminal.json`, { code: item.execution.runnerExitCode, signal: null });
      return put(`${id}/execution.json`, item.execution);
    });
    parent.baselineCheckpointDigest = readEventBaselineCheckpoint(directory, expected).checkpointDigest;
    removal.native.bindings = [put("baseline/candidate-write-denial.json", denial), put("baseline/candidate-lifecycle.json", lifecycle), put("baseline-owned-resources.json", registry)];
    parent.baselineRemoval = put("baseline-removal.json", removal);
    derivation.runtimeRecord = captures[0].runtimeRecord;
    readDerivation.runtimeRecord = captures[1].runtimeRecord;
    const metadata = item => Object.fromEntries(["definitionImportDigest", "observedDefinitionDigest", "definitionVersion", "ccdNamespace"].map(key => [key, item.current.runtimeMetadata[key]]));
    derivation.baselineRuntimeMetadata ??= metadata(baseline);
    derivation.mutantRuntimeMetadata ??= metadata(fault);
    readDerivation.baselineRuntimeMetadata ??= metadata(baseline);
    readDerivation.mutantRuntimeMetadata ??= metadata(readFault);
    readonlyDerivation.runtimeRecord = captures[2].runtimeRecord;
    readonlyUpdateDerivation.runtimeRecord = captures[3].runtimeRecord;
    readonlyDerivation.baselineRuntimeMetadata ??= metadata(baseline);
    readonlyUpdateDerivation.baselineRuntimeMetadata ??= metadata(baseline);
    readonlyDerivation.mutantRuntimeMetadata ??= metadata(readonlyFault);
    readonlyUpdateDerivation.mutantRuntimeMetadata ??= metadata(readonlyUpdateFault);
    const readonlyDerivationArtifact = put(`${readonlyMutation}/derivation.json`, readonlyDerivation);
    const readonlyUpdateDerivationArtifact = put(`${readonlyUpdateMutation}/derivation.json`, readonlyUpdateDerivation);
    const readDerivationArtifact = put(`${readMutation}/derivation.json`, readDerivation);
    const derivationArtifact = put(`${mutation}/derivation.json`, derivation);
    put("run.json", { schemaVersion: 1, manifest: baselineManifest, executionArtifacts,
      mutations: [{ mutationId: mutation, baselineInvocationId: "baseline", mutantInvocationId: mutation, derivationArtifact }, { mutationId: readMutation, baselineInvocationId: "baseline", mutantInvocationId: readMutation, derivationArtifact: readDerivationArtifact }, { mutationId: readonlyMutation, baselineInvocationId: "baseline", mutantInvocationId: readonlyMutation, derivationArtifact: readonlyDerivationArtifact }, { mutationId: readonlyUpdateMutation, baselineInvocationId: "baseline", mutantInvocationId: readonlyUpdateMutation, derivationArtifact: readonlyUpdateDerivationArtifact }] });
    expected.eventTransition = put("independent-transition.json", parent);
    put(`${mutation}/candidate-write-denial.json`, { ...denial, candidateId: "e".repeat(64) });
    put(`${mutation}/candidate-lifecycle.json`, { ...lifecycle,
      before: { ...lifecycle.before, Id: "e".repeat(64), Name: `/${input.runId}-${mutation}-candidate` },
      after: { ...lifecycle.after, Id: "e".repeat(64), Name: `/${input.runId}-${mutation}-candidate` } });
    put(`${readMutation}/candidate-write-denial.json`, { ...denial, candidateId: "7".repeat(64) });
    put(`${readMutation}/candidate-lifecycle.json`, { ...lifecycle,
      before: { ...lifecycle.before, Id: "7".repeat(64), Name: `/${input.runId}-${readMutation}-candidate` },
      after: { ...lifecycle.after, Id: "7".repeat(64), Name: `/${input.runId}-${readMutation}-candidate` } });
    put(`${readonlyMutation}/candidate-write-denial.json`, { ...denial, candidateId: "8".repeat(64) });
    put(`${readonlyUpdateMutation}/candidate-write-denial.json`, { ...denial, candidateId: "2".repeat(64) });
    put(`${readonlyMutation}/candidate-lifecycle.json`, { ...lifecycle,
      before: { ...lifecycle.before, Id: "8".repeat(64), Name: `/${input.runId}-${readonlyMutation}-candidate` },
      after: { ...lifecycle.after, Id: "8".repeat(64), Name: `/${input.runId}-${readonlyMutation}-candidate` } });
    put(`${readonlyUpdateMutation}/candidate-lifecycle.json`, { ...lifecycle,
      before: { ...lifecycle.before, Id: "2".repeat(64), Name: `/${input.runId}-${readonlyUpdateMutation}-candidate` },
      after: { ...lifecycle.after, Id: "2".repeat(64), Name: `/${input.runId}-${readonlyUpdateMutation}-candidate` } });
    const loaded = loadRunEvidence(path.join(directory, "run.json"), policy);
    expected.evidenceManifestDigest = loaded.evidenceManifestDigest;
    expected.receiptArtifactDigest = put("gate.json", loaded.receipt).digest;
    put("controller-terminal.json", { status: "completed", exitCode: loaded.receipt.verdict.exitCode, cleanupComplete: true });
    return loaded;

  };
  const finalized = write();
  return { policy, terminal: { code: finalized.receipt.verdict.exitCode, signal: null }, manifest: baselineManifest, root, directory, expected, input, request, runtimeRecord, variants, baseline, fault, registry, denial, lifecycle,
    removal, derivation, parent, put, read, write, faultIdentity, readFault, readRuntimeRecord, readFaultIdentity, readDerivation, captures, readonlyUpdateFaultIdentity, readonlyUpdateRuntimeRecord, readonlyUpdateDerivation, readonlyUpdateFault, readonlyFaultIdentity, readonlyRuntimeRecord, readonlyDerivation, readonlyFault,
    loaded: async () => (await import("../lib/exui-evidence-io.mjs")).loadRunEvidence(path.join(directory, "run.json"), policy).input };
}

module.exports = { createEventTransitionFixture };
