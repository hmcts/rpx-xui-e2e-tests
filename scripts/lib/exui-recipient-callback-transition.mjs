import {validateCallbackNativeObservations} from './exui-recipient-callback-observations.mjs';
import {validateIdentity} from './exui-release-evidence.mjs';
import {readCallbackBaselineCheckpoint} from './exui-native-proof-validation.mjs';
import {validateNativeInvocationFinalization} from './exui-native-ci-ownership.mjs';
import {CCD_IMAGES,ccdRuntimeImageIds} from './exui-ccd-runtime.mjs';
import {readNativeCallbackImport} from './exui-recipient-callback-native-import.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
import {CALLBACK_SCOPE,CALLBACK_MUTATION,callbackCanonicalImport,callbackMutationContract} from './exui-recipient-callback-contract.mjs';
const digest=value=>/^sha256:[a-f0-9]{64}$/.test(value??'');
function definition(input,variant) {
 const expected=callbackCanonicalImport(variant),record=input.definition;
 assert.equal(record?.kind,'native-recipient-callback-definition','CALLBACK_TRANSITION_NATIVE_IMPORT_REQUIRED');
 assert.equal(record.releaseScopeId,CALLBACK_SCOPE,'CALLBACK_TRANSITION_IMPORT_SCOPE');
 assert.equal(record.variant,variant,'CALLBACK_TRANSITION_IMPORT_VARIANT');
 assert.equal(record.fixtureDigest,expected.seal.workbookDigest,'CALLBACK_TRANSITION_WORKBOOK');
 assert.equal(record.owner,input.ccd.owner,'CALLBACK_TRANSITION_IMPORT_OWNER');
 assert.equal(record.namespace,input.ccd.namespace,'CALLBACK_TRANSITION_IMPORT_NAMESPACE');
 assert.deepEqual(record.images,input.ccd.images,'CALLBACK_TRANSITION_IMPORT_IMAGES');
 assert.deepEqual(record.sourceBinding,expected.binding,'CALLBACK_TRANSITION_SOURCE');
 assert(digest(record.observedDefinitionDigest)&&digest(record.observedPagesDigest),'CALLBACK_TRANSITION_DESCRIPTOR_DIGEST');
 assert(Number.isSafeInteger(record.definitionVersion)&&record.definitionVersion>0,'CALLBACK_TRANSITION_VERSION');
 assert(digest(input.definitionImportDigest),'CALLBACK_TRANSITION_IMPORT_DIGEST');
}
export function callbackTransitionRequest(input) {
 assert.equal(input.releaseScopeId,CALLBACK_SCOPE,'CALLBACK_TRANSITION_SCOPE');
 assert(/^ccd-[a-f0-9-]{36}$/.test(input.runId),'CALLBACK_TRANSITION_RUN');
 assert.equal(input.ccd.ready,true,'CALLBACK_TRANSITION_NOT_READY');
 assert(/^[a-f0-9]{64}$/.test(input.ccd.namespace),'CALLBACK_TRANSITION_NAMESPACE');
 definition(input,'baseline');
 return {schemaVersion:1,runId:input.runId,releaseScopeId:CALLBACK_SCOPE,invocationIds:[CALLBACK_MUTATION],baselineNamespace:input.ccd.namespace,baselineDefinitionImportDigest:input.definitionImportDigest};
}
export function validateCallbackTransitionRequest(input,request) {
 assert.deepEqual(request,callbackTransitionRequest(input),'CALLBACK_TRANSITION_REQUEST_MISMATCH');
}
export function selectCallbackRuntime(input,invocationId,record) {
 assert.equal(invocationId,CALLBACK_MUTATION,'CALLBACK_TRANSITION_INVOCATION');
 const request=callbackTransitionRequest(input);
 assert.deepEqual(Object.keys(record).sort(),['apiContracts','ccd','credentials','definition','definitionImportDigest','invocationId','requestDigest','runId','schemaVersion'],'CALLBACK_TRANSITION_ACK_FIELDS');
 assert.equal(record.schemaVersion,1,'CALLBACK_TRANSITION_ACK_SCHEMA');
 assert.equal(record.runId,input.runId,'CALLBACK_TRANSITION_ACK_RUN');assert.equal(record.invocationId,invocationId,'CALLBACK_TRANSITION_ACK_INVOCATION');
 assert.equal(record.requestDigest,digestBytes(JSON.stringify(request)),'CALLBACK_TRANSITION_REQUEST_BINDING');
 assert.equal(record.ccd.ready,true,'CALLBACK_TRANSITION_NOT_READY');
 assert(/^[a-f0-9]{64}$/.test(record.ccd.namespace),'CALLBACK_TRANSITION_NAMESPACE');assert(/^harness-[a-f0-9]{16}$/.test(record.ccd.owner),'CALLBACK_TRANSITION_OWNER');
 assert.notEqual(record.ccd.namespace,input.ccd.namespace,'CALLBACK_TRANSITION_NAMESPACE_REUSE');assert.notEqual(record.ccd.owner,input.ccd.owner,'CALLBACK_TRANSITION_OWNER_REUSE');
 assert.deepEqual(record.ccd.images,input.ccd.images,'CALLBACK_TRANSITION_IMAGE_DRIFT');assert.deepEqual(record.apiContracts,input.apiContracts,'CALLBACK_TRANSITION_API_DRIFT');
 definition(record,'binding-omitted');
 assert.notEqual(record.definitionImportDigest,input.definitionImportDigest,'CALLBACK_TRANSITION_IMPORT_REUSE');
 // The callback URL is in page metadata, not necessarily the case-type descriptor.
 assert.notEqual(record.definition.observedPagesDigest,input.definition.observedPagesDigest,'CALLBACK_TRANSITION_PAGE_UNCHANGED');
 const personas=['allowed','courtadmin','judge','observer','readonly'];
 assert.deepEqual(Object.keys(record.credentials).sort(),personas,'CALLBACK_TRANSITION_ACTORS');
 const actors=personas.map(persona=>record.credentials[persona]);
 assert(actors.every(actor=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(actor.userId)),'CALLBACK_TRANSITION_ACTOR_ID');
 assert.equal(new Set(actors.map(actor=>actor.userId)).size,5,'CALLBACK_TRANSITION_ACTOR_COLLISION');
 assert(actors.every(actor=>/^Bearer \S+$/.test(actor.headers?.Authorization??'')),'CALLBACK_TRANSITION_ACTOR_BEARER');assert.equal(new Set(actors.map(actor=>actor.headers.Authorization)).size,5,'CALLBACK_TRANSITION_BEARER_COLLISION');
 for(const persona of ['courtadmin','judge','readonly'])assert.deepEqual(record.credentials[persona].roles?.slice().sort(),['caseworker','caseworker-harness',`caseworker-privatelaw-${persona}`],'CALLBACK_TRANSITION_SOURCE_ROLES');
 return {...input,ccd:record.ccd,credentials:record.credentials,definition:record.definition,definitionImportDigest:record.definitionImportDigest};
}
export function publishCallbackRuntime(output,record) {
 assert.equal(record.invocationId,CALLBACK_MUTATION,'CALLBACK_TRANSITION_INVOCATION');
 const directory=path.join(output,CALLBACK_MUTATION);fs.mkdirSync(directory,{recursive:true,mode:0o700});assert.equal(fs.realpathSync(directory),directory,'CALLBACK_TRANSITION_ACK_ALIAS');
 const file=path.join(directory,'runtime-input.json'),temporary=path.join(directory,`.${randomUUID()}.json`);
 try {writeJsonAtomic(temporary,record);fs.linkSync(temporary,file);}finally{fs.rmSync(temporary,{force:true});}
 return {path:path.relative(output,file),digest:digestBytes(fs.readFileSync(file))};
}
export async function waitForCallbackRuntime(input,output,{isCancelled=()=>false,timeoutMs=360000}={}) {
 const file=path.join(output,CALLBACK_MUTATION,'runtime-input.json'),deadline=Date.now()+timeoutMs;
 while(!fs.existsSync(file)){assert(!isCancelled(),'CALLBACK_TRANSITION_CANCELLED');assert(Date.now()<deadline,'CALLBACK_TRANSITION_ACK_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,10));}
 assert(!isCancelled(),'CALLBACK_TRANSITION_CANCELLED');assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'CALLBACK_TRANSITION_ACK_ALIAS');
 return selectCallbackRuntime(input,CALLBACK_MUTATION,JSON.parse(fs.readFileSync(file,'utf8')));
}

export function validateCallbackTransitionEvidence(directory, expected, loadedInput) {
  assert.equal(expected?.releaseScopeId, CALLBACK_SCOPE, "CALLBACK_TRANSITION_SCOPE");
  assert(path.isAbsolute(directory) && path.normalize(directory) === directory && fs.realpathSync(directory) === directory, "CALLBACK_TRANSITION_DIRECTORY_ALIAS");
  const readFixed = (root, relative) => {
    const file = path.join(root, relative);
    assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, "CALLBACK_TRANSITION_ARTIFACT_ALIAS");
    const bytes = fs.readFileSync(file);
    return { value: JSON.parse(bytes), digest: digestBytes(bytes) };
  };
  const referenced = (reference, relative) => {
    assert.deepEqual(Object.keys(reference ?? {}).sort(), ["digest", "path"], "CALLBACK_TRANSITION_REFERENCE_REQUIRED");
    assert.equal(reference.path, relative, "CALLBACK_TRANSITION_REFERENCE_PATH");
    assert(digest(reference.digest), "CALLBACK_TRANSITION_REFERENCE_DIGEST");
    const actual = readFixed(directory, relative);
    assert.equal(actual.digest, reference.digest, "CALLBACK_TRANSITION_REFERENCE_DIGEST");
    return actual.value;
  };
  const record = referenced(expected.callbackTransition, "independent-callback-transition.json");
  assert.deepEqual(Object.keys(record).sort(), [
    "baselineCheckpointDigest", "baselineInputDigest", "baselineRemoval", "capturedAt", "capturedBeforeFault",
    "faults", "harnessCommit", "harnessSourceDigest", "releaseScopeId", "requestDigest", "runId", "schemaVersion",
  ], "CALLBACK_TRANSITION_CAPTURE_FIELDS");
  assert.equal(record.schemaVersion, 1, "CALLBACK_TRANSITION_CAPTURE_SCHEMA");
  assert.equal(record.capturedBeforeFault, true, "CALLBACK_TRANSITION_CAPTURE_ORDER");
  assert(typeof record.capturedAt === "string" && Number.isFinite(Date.parse(record.capturedAt)) && new Date(record.capturedAt).toISOString() === record.capturedAt, "CALLBACK_TRANSITION_CAPTURE_TIME");
  for (const field of ["runId", "releaseScopeId", "harnessCommit", "harnessSourceDigest"])
    assert.deepEqual(record[field], expected[field], "CALLBACK_TRANSITION_CAPTURE_IDENTITY");
  const capturedInput = readFixed(directory, "input.json"), input = capturedInput.value;
  assert.equal(capturedInput.digest, record.baselineInputDigest, "CALLBACK_TRANSITION_INPUT_DIGEST");
  for (const field of ["runId", "releaseScopeId", "harnessCommit", "harnessSourceDigest"])
    assert.deepEqual(input[field], expected[field], "CALLBACK_TRANSITION_INPUT_IDENTITY");
  assert.equal(input.only, undefined, "CALLBACK_TRANSITION_FULL_SCOPE_REQUIRED");
  const request = readFixed(directory, "callback-transition-request.json");
  assert.equal(digestBytes(JSON.stringify(request.value)), record.requestDigest, "CALLBACK_TRANSITION_REQUEST_DIGEST");
  validateCallbackTransitionRequest(input, request.value);
  const checkpoint = readCallbackBaselineCheckpoint(directory, expected);
  assert.equal(checkpoint.checkpointDigest, record.baselineCheckpointDigest, "CALLBACK_TRANSITION_CHECKPOINT_DIGEST");
  const removal = referenced(record.baselineRemoval, "baseline-removal.json");
  assert.equal(removal.schemaVersion, 1, "CALLBACK_TRANSITION_REMOVAL_SCHEMA");
  assert.equal(removal.runId, input.runId, "CALLBACK_TRANSITION_REMOVAL_RUN");
  assert.equal(removal.baselineNamespace, input.ccd.namespace, "CALLBACK_TRANSITION_REMOVAL_NAMESPACE");
  assert.equal(removal.baselineOwner, input.ccd.owner, "CALLBACK_TRANSITION_REMOVAL_OWNER");
  const services = Object.keys(CCD_IMAGES).sort();
  const validateState = (state) => {
    assert.deepEqual(Object.keys(state.containers).sort(), services, "CALLBACK_TRANSITION_CCD_INVENTORY");
    assert.deepEqual(Object.keys(state.images).sort(), services, "CALLBACK_TRANSITION_IMAGE_INVENTORY");
    assert.equal(new Set(Object.values(state.containers)).size, services.length, "CALLBACK_TRANSITION_CCD_CID_COLLISION");
    assert(Object.values(state.containers).every(id => /^[a-f0-9]{64}$/.test(id)), "CALLBACK_TRANSITION_CCD_CID");
    assert.equal(state.namespace, state.containers.database, "CALLBACK_TRANSITION_CCD_NAMESPACE");
    assert.equal(state.platform ?? "linux/arm64", input.ccd.platform ?? "linux/arm64", "CALLBACK_TRANSITION_CCD_PLATFORM");
    ccdRuntimeImageIds(state);
  };
  validateState(input.ccd);
  assert.equal(removal.ccd.owner, input.ccd.owner, "CALLBACK_TRANSITION_REMOVAL_OWNER");
  assert.equal(removal.ccd.cleanupComplete, true, "CALLBACK_TRANSITION_REMOVAL_INCOMPLETE");
  assert.deepEqual(removal.ccd.checkedNames.slice().sort(), services.map(service => `${input.ccd.owner}-${service}`).sort(), "CALLBACK_TRANSITION_REMOVAL_NAMES");
  assert.deepEqual(removal.ccd.checkedContainerIds.slice().sort(), Object.values(input.ccd.containers).sort(), "CALLBACK_TRANSITION_REMOVAL_CIDS");
  const paths = ["baseline/candidate-write-denial.json", "baseline/candidate-lifecycle.json", "baseline-owned-resources.json"];
  assert.deepEqual(removal.native.bindings.map(item => item.path), paths, "CALLBACK_TRANSITION_NATIVE_BINDINGS");
  const [, , registry] = removal.native.bindings.map((reference, index) => referenced(reference, paths[index]));
  const names = [`${input.runId}-baseline-candidate`, `${input.runId}-baseline-tools`];
  assert.deepEqual(registry.map(item => item.name).sort(), names.slice().sort(), "CALLBACK_TRANSITION_NATIVE_NAMES");
  const captured = names.map((name, index) => {
    const item = registry.find(row => row.name === name);
    assert(/^[a-f0-9]{64}$/.test(item.id), "CALLBACK_TRANSITION_NATIVE_CID");
    assert.equal(item.owner, input.runId, "CALLBACK_TRANSITION_NATIVE_OWNER");
    assert.equal(item.namespace, input.ccd.namespace, "CALLBACK_TRANSITION_NATIVE_NAMESPACE");
    assert.equal(item.service, index ? "browser-provider" : "candidate", "CALLBACK_TRANSITION_NATIVE_SERVICE");
    assert.equal(item.image, index ? input.browserRuntimeImage : input.nativeRuntime.imageId, "CALLBACK_TRANSITION_NATIVE_IMAGE");
    assert.equal(item.removed, true, "CALLBACK_TRANSITION_NATIVE_REMOVAL");
    return { name, id: item.id };
  });
  assert.notEqual(captured[0].id, captured[1].id, "CALLBACK_TRANSITION_NATIVE_CID_COLLISION");
  assert.deepEqual(removal.native.removed, captured, "CALLBACK_TRANSITION_NATIVE_REMOVAL");
  const { denial, lifecycle } = validateNativeInvocationFinalization(directory, { invocationId: "baseline" });
  assert.equal(denial.candidateId, captured[0].id, "CALLBACK_TRANSITION_NATIVE_PROBE_CID");
  for (const observed of [lifecycle.before, lifecycle.after]) {
    assert.equal(observed.Id, captured[0].id, "CALLBACK_TRANSITION_NATIVE_LIFECYCLE_CID");
    assert.equal(observed.Name, `/${captured[0].name}`, "CALLBACK_TRANSITION_NATIVE_LIFECYCLE_NAME");
  }
  assert.equal(lifecycle.after.State.OOMKilled, false, "CALLBACK_TRANSITION_NATIVE_OOM");
  const imported = (selected, variant) => {
    const root = path.join(path.dirname(directory), `callback-${variant}-runtime`);
    const receipt = readFixed(root, "recipient-callback-native-import.json");
    const observed = readNativeCallbackImport(root, selected.ccd, variant);
    assert.equal(receipt.digest, selected.definitionImportDigest, "CALLBACK_TRANSITION_IMPORT_DIGEST");
    assert.deepEqual(observed, selected.definition, "CALLBACK_TRANSITION_IMPORT_IDENTITY");
    return { definitionImportDigest: receipt.digest, observedDefinitionDigest: receipt.value.observedDefinitionDigest,
      observedPagesDigest: receipt.value.observedPagesDigest, definitionVersion: String(receipt.value.definitionVersion), ccdNamespace: selected.ccd.namespace };
  };
  const baselineMetadata = imported(input, "baseline");
  // Parent recomputed this identity before capture. Replay never reopens the original candidate.
  const baselineIdentity = structuredClone(expected.identity);
  validateIdentity(baselineIdentity);
  const dependencyIdentities = Object.fromEntries(["data", "definition"].map(service => [
    service === "data" ? "ccd" : "ccd-definition",
    { artifactDigest: input.ccd.images[service].id, apiContractDigest: input.apiContracts[service] },
  ]));
  assert.deepEqual(baselineIdentity, { ...input.artifact.identity,
    configurationDigest: baselineIdentity.configurationDigest,
    definitionDigests: { HarnessNestedPRL: callbackCanonicalImport().seal.workbookDigest }, dependencyIdentities,
  }, "CALLBACK_TRANSITION_BASELINE_IDENTITY");
  assert.deepEqual(loadedInput.manifest, checkpoint.input.manifest, "CALLBACK_TRANSITION_LOADED_BASELINE");
  for (const [field, value] of Object.entries({ ...baselineMetadata, gatewayDigest: input.gatewayDigest, idamSimulatorImage: input.ccd.images.idam.id }))
    assert.deepEqual(checkpoint.input.manifest.runtimeMetadata[field], value, "CALLBACK_TRANSITION_BASELINE_METADATA");
  const mutationIds = [CALLBACK_MUTATION];
  assert.deepEqual(record.faults?.map(item => item.invocationId), mutationIds, "CALLBACK_TRANSITION_FAULT_SELECTION");
  const run = readFixed(directory, "run.json").value;
  assert.deepEqual(run.mutations.map(item => item.mutationId), mutationIds, "CALLBACK_TRANSITION_MUTATION_SELECTION");
  assert.deepEqual(loadedInput.executions.map(item => item.invocationId), ["baseline", ...mutationIds], "CALLBACK_TRANSITION_EXECUTION_SELECTION");
  const states = [input.ccd], identities = [];
  for (const [index, fault] of record.faults.entries()) {
    assert.deepEqual(Object.keys(fault).sort(), ["identity", "invocationId", "runtimeRecord"], "CALLBACK_TRANSITION_FAULT_FIELDS");
    const invocationId = mutationIds[index], variant = "binding-omitted";
    const runtimeRecord = referenced(fault.runtimeRecord, `${invocationId}/runtime-input.json`);
    const faultInput = selectCallbackRuntime(input, invocationId, runtimeRecord);
    validateState(faultInput.ccd);
    for (const state of states) {
      assert.notEqual(faultInput.ccd.owner, state.owner, "CALLBACK_TRANSITION_CCD_OWNER_REUSE");
      assert.notEqual(faultInput.ccd.namespace, state.namespace, "CALLBACK_TRANSITION_CCD_NAMESPACE_REUSE");
      assert(Object.values(faultInput.ccd.containers).every(id => !Object.values(state.containers).includes(id)), "CALLBACK_TRANSITION_CCD_CID_REUSE");
    }
    states.push(faultInput.ccd);
    for (const [selected, selectedVariant] of [[input, "baseline"], [faultInput, variant]]) {
      const originalOutput = selected.ccd.output;
      assert(typeof originalOutput === "string" && path.isAbsolute(originalOutput) && path.normalize(originalOutput) === originalOutput &&
        path.basename(originalOutput) === `callback-${selectedVariant}-runtime`, "CALLBACK_TRANSITION_IMPORT_ORIGINAL_PATH");
    }
    assert.equal(path.dirname(input.ccd.output), path.dirname(faultInput.ccd.output), "CALLBACK_TRANSITION_IMPORT_ORIGINAL_PARENT");
    const mutantMetadata = imported(faultInput, variant);
    const faultIdentity = { ...baselineIdentity, definitionDigests: { HarnessNestedPRL: callbackCanonicalImport(variant).seal.workbookDigest } };
    assert.deepEqual(faultIdentity, fault.identity, "CALLBACK_TRANSITION_FAULT_IDENTITY");
    const execution = loadedInput.executions.filter(item => item.invocationId === invocationId);
    assert.equal(execution.length, 1, "CALLBACK_TRANSITION_MUTANT_EXECUTION");
    assert.deepEqual(execution[0].identity, faultIdentity, "CALLBACK_TRANSITION_EXECUTION_IDENTITY");
    assert.equal(execution[0].kind, "mutation", "CALLBACK_TRANSITION_EXECUTION_KIND");
    const mutantManifest = readFixed(directory, `${invocationId}/manifest.json`).value;
    for (const field of ["schemaVersion", "runId", "harnessCommit", "releaseScopeId", "policyDigest", "requiredObligationIds"])
      assert.deepEqual(mutantManifest[field], checkpoint.input.manifest[field], "CALLBACK_TRANSITION_MUTANT_MANIFEST");
    assert.deepEqual(mutantManifest.identity, faultIdentity, "CALLBACK_TRANSITION_MUTANT_MANIFEST_IDENTITY");
    for (const field of ["harnessSourceDigest", "harnessDependencyDigest", "browserDigest"])
      assert.equal(mutantManifest.runtimeMetadata[field], expected[field], "CALLBACK_TRANSITION_MUTANT_METADATA");
    for (const [field, value] of Object.entries({ ...mutantMetadata, harnessSourceState: "clean", isolation: "native-separate-api-owned-network-none",
      gatewayDigest: input.gatewayDigest, idamSimulatorImage: faultInput.ccd.images.idam.id }))
      assert.deepEqual(mutantManifest.runtimeMetadata[field], value, "CALLBACK_TRANSITION_MUTANT_METADATA");
    const mutation = run.mutations[index];
    assert.equal(mutation.mutationId, invocationId, "CALLBACK_TRANSITION_MUTATION_SELECTION");
    assert.equal(mutation.baselineInvocationId, "baseline", "CALLBACK_TRANSITION_MUTATION_BASELINE");
    assert.equal(mutation.mutantInvocationId, invocationId, "CALLBACK_TRANSITION_MUTATION_INVOCATION");
    const derivation = referenced(mutation.derivationArtifact, `${invocationId}/derivation.json`);
    const contract = callbackMutationContract();
    assert.equal(derivation.mutationDefinitionDigest, checkpoint.input.policy.mutationDefinitions[index].definitionDigest, "CALLBACK_TRANSITION_DERIVATION_POLICY");
    assert.deepEqual(derivation.baselineIdentity, baselineIdentity, "CALLBACK_TRANSITION_DERIVATION_IDENTITY");
    assert.deepEqual(derivation.mutantIdentity, faultIdentity, "CALLBACK_TRANSITION_DERIVATION_IDENTITY");
    assert.equal(derivation.transformation, invocationId, "CALLBACK_TRANSITION_DERIVATION_MUTATION");
    const faultContract = contract;
    assert.equal(derivation.target, faultContract.target, "CALLBACK_TRANSITION_DERIVATION_TARGET");
    assert.deepEqual(derivation.transformationRecord, contract, "CALLBACK_TRANSITION_DERIVATION_CELL");
    assert.equal(derivation.beforeDigest, contract.beforeDigest, "CALLBACK_TRANSITION_DERIVATION_WORKBOOK");
    assert.equal(derivation.afterDigest, contract.afterDigest, "CALLBACK_TRANSITION_DERIVATION_WORKBOOK");
    assert.deepEqual(derivation.baselineRuntimeMetadata, baselineMetadata, "CALLBACK_TRANSITION_DERIVATION_RUNTIME");
    assert.deepEqual(derivation.mutantRuntimeMetadata, mutantMetadata, "CALLBACK_TRANSITION_DERIVATION_RUNTIME");
    assert.deepEqual(derivation.runtimeRecord, fault.runtimeRecord, "CALLBACK_TRANSITION_DERIVATION_RECORD");
    validateCallbackNativeObservations(directory,input,faultInput,derivation.callbackObservations);
    identities.push({ invocationId, identity: faultIdentity });
  }
  return { transition: structuredClone(expected.callbackTransition), identities };
}

