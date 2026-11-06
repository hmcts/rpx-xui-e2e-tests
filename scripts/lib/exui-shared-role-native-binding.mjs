import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSharedPolicyContracts } from './exui-shared-policy-contracts.mjs';
import { getReleasePolicy } from './exui-release-policy.mjs';
import { validateRunManifest } from './exui-release-evidence.mjs';
import { digestBytes, loadRunEvidence } from './exui-evidence-io.mjs';
import { validateCompleteNativeProofs, validateNativeOutcome } from './exui-native-proof-validation.mjs';
import { validateNativePhaseFinalization } from './exui-native-ci-ownership.mjs';
import { loadCommittedConfigurationCatalogue } from './exui-configuration-runtime-coverage.mjs';
import { bindEventCoverage } from './exui-event-coverage-binding.mjs';
import { bindSharedRoleToolkitArtifact } from './exui-shared-role-toolkit.mjs';
import { sharedRoleObservationBinding, replaySharedRoleDenial, replaySharedRoleRevocation } from './exui-shared-role-observations.mjs';
import { NATIVE_HARNESS_SOURCE_FILES } from './exui-native-sources.mjs';
import { readSharedRoleArtifact } from './exui-shared-role-artifacts.mjs';
import { replaySharedRoleEventObservation } from './exui-shared-role-event-observations.mjs';
import { reproduceSharedRoleCcdSource, bindSharedRoleCcdRuntime, reproduceSharedRoleAmd64Source, bindSharedRoleAmd64Runtime, reproduceSharedRoleStandardArmSource, bindSharedRoleStandardArmRuntime } from './exui-shared-role-ccd-provenance.mjs';

const contract = () => buildSharedPolicyContracts().find(item => item.id === 'configuration-shared:role-policy');
const scopes = { ccd: 'exui-ccd-pilot', eventCapability: 'exui-ccd-event-capability-pilot',sharedNested:'exui-shared-nested-renderer-pilot' };
const variants = {
  'ccd-remove-courtadmin-recipient-read': 'read-mutant',
  'ccd-remove-readonly-recipient-read': 'readonly-read-mutant',
  'ccd-remove-courtadmin-event-create': 'courtadmin-update-mutant',
  'ccd-enable-readonly-recipient-update': 'readonly-update-mutant',
};
const cellProofs = {
  'courtadmin-read': 'ccd-courtadmin-read-recipient-shapes',
  'readonly-read': 'ccd-readonly-read-recipient-shapes',
  'courtadmin-update': 'ccd-courtadmin-update-recipient-shapes',
  'readonly-update': 'ccd-readonly-update-recipient-shapes-denied',
};
export function sharedRoleNativePlan() {
  const role = contract();
  const record = (id, phase, invocationId, proofId, failureId = null) => ({
    id, phase, releaseScopeId: scopes[phase], invocationId, proofId, failureId,
    importPath: phase === 'ccd' ? 'ccd-runtime/definition-import.json' : `event-${variants[invocationId] ?? 'baseline'}-runtime/definition-import.json`,
    fixtureSelection: phase === 'ccd' ? 'nested-prl' : 'event-capability-' + (variants[invocationId] ?? 'baseline'),
  });
  return [
    ...role.facets.map(facet => record(facet.id, 'eventCapability', 'baseline', cellProofs[`${facet.role.endsWith('courtadmin') ? 'courtadmin' : 'readonly'}-${facet.action}`])),
    ...role.faults.map(fault => record(fault.id, Object.hasOwn(variants, fault.id) ? 'eventCapability' : 'ccd', fault.id, fault.reusableProof, fault.failureId)),
    record('denied-data-and-write-integrity', 'ccd', 'baseline', 'ccd-role-policy'),
    record('revoked-warmed-session', 'ccd', 'baseline', 'ccd-role-revocation'),
  ];
}
const canonicalBytes = (root, name) => {
  const base = fs.realpathSync(root), target = path.resolve(base, name);
  assert(typeof name === 'string' && !path.isAbsolute(name) && !name.split('/').includes('..') && target.startsWith(base + path.sep), 'SHARED_ROLE_PATH_ESCAPE');
  assert(fs.lstatSync(target).isFile() && fs.realpathSync(target) === target, 'SHARED_ROLE_FILE_ALIAS');
  assert(fs.statSync(target).size <= 16 * 1024 * 1024, 'SHARED_ROLE_FILE_SIZE');
  return fs.readFileSync(target);
};
const json = (root, name) => JSON.parse(canonicalBytes(root, name));
const sharedIdentity = manifest => ({
  harnessCommit: manifest.harnessCommit,
  identity: Object.fromEntries(Object.entries(manifest.identity).filter(([key]) => !['configurationDigest', 'definitionDigests'].includes(key))),
  runtime: Object.fromEntries(['harnessSourceState', 'harnessSourceDigest', 'harnessDependencyDigest', 'browserDigest'].map(key => [key, manifest.runtimeMetadata[key]])),
});
export function assertSharedRolePhaseIdentity(ccd, event) {
  for (const [phase, manifest] of [['ccd', ccd], ['eventCapability', event]]) {
    validateRunManifest(manifest);
    assert.equal(manifest.releaseScopeId, scopes[phase], 'SHARED_ROLE_PHASE_SCOPE');
    assert.equal(manifest.runtimeMetadata.harnessSourceState, 'clean', 'SHARED_ROLE_CLEAN_PRODUCER_REQUIRED');
    for (const key of ['harnessSourceDigest', 'harnessDependencyDigest', 'browserDigest'])
      assert(/^sha256:[a-f0-9]{64}$/.test(manifest.runtimeMetadata[key] ?? ''), 'SHARED_ROLE_PHASE_PROVENANCE');
  }
  assert.deepEqual(sharedIdentity(ccd), sharedIdentity(event), 'SHARED_ROLE_CROSS_PHASE_IDENTITY');
}

// File/identity binding only. The top-level reader also replays native receipts,
// imports, lifecycle and denial observations; neither function grants row credit.
export function bindSharedRoleFacet(record, { phase, manifest, execution, proof, importedBytes, observed }) {
  const expected = sharedRoleNativePlan().find(item => item.id === record?.id);
  assert(expected, 'SHARED_ROLE_UNKNOWN_FACET');
  assert.deepEqual(record, expected, 'SHARED_ROLE_FACET_PLAN');
  assert.equal(phase, expected.phase, 'SHARED_ROLE_PHASE');
  validateRunManifest(manifest);
  assert.equal(manifest.releaseScopeId, expected.releaseScopeId, 'SHARED_ROLE_SCOPE');
  assert.equal(execution?.invocationId, expected.invocationId, 'SHARED_ROLE_INVOCATION');
  assert.equal(execution.runId, manifest.runId, 'SHARED_ROLE_RUN');
  assert.deepEqual(execution.identity, manifest.identity, 'SHARED_ROLE_EXECUTION_IDENTITY');
  assert.equal(proof?.proofId, expected.proofId, 'SHARED_ROLE_PROOF');
  assert.equal(proof.invocationId, expected.invocationId, 'SHARED_ROLE_PROOF_INVOCATION');
  assert.equal(proof.runId, manifest.runId, 'SHARED_ROLE_PROOF_RUN');
  assert.deepEqual(proof.identity, manifest.identity, 'SHARED_ROLE_PROOF_IDENTITY');
  assert.equal(proof.outcome, expected.failureId ? 'failed' : 'passed', 'SHARED_ROLE_PROOF_OUTCOME');
  assert.equal(proof.failureId, expected.failureId, 'SHARED_ROLE_PROOF_FAILURE');
  assert.equal(proof.complete, true, 'SHARED_ROLE_PROOF_COMPLETE');
  assert.equal(proof.retryIndex, 0, 'SHARED_ROLE_PROOF_RETRY');
  assert(Buffer.isBuffer(importedBytes), 'SHARED_ROLE_IMPORT_REQUIRED');
  const imported = JSON.parse(importedBytes);
  assert.equal(digestBytes(importedBytes), manifest.runtimeMetadata.definitionImportDigest, 'SHARED_ROLE_IMPORT_DIGEST');
  assert([200, 201].includes(imported.status), 'SHARED_ROLE_IMPORT_FAILED');
  assert.equal(imported.fixtureSelection ?? 'nested-prl', expected.fixtureSelection, 'SHARED_ROLE_IMPORT_VARIANT');
  assert.equal(imported.fixtureDigest, manifest.identity.definitionDigests.HarnessNestedPRL, 'SHARED_ROLE_IMPORT_DEFINITION');
  assert.equal(imported.observedDefinitionDigest, digestBytes(JSON.stringify(observed)), 'SHARED_ROLE_OBSERVED_IMPORT');
  assert.equal(imported.observedDefinitionDigest, manifest.runtimeMetadata.observedDefinitionDigest, 'SHARED_ROLE_OBSERVED_MANIFEST');
  assert.equal(String(imported.definitionVersion), manifest.runtimeMetadata.definitionVersion, 'SHARED_ROLE_IMPORT_VERSION');
  assert.equal(String(observed.version?.number), manifest.runtimeMetadata.definitionVersion, 'SHARED_ROLE_OBSERVED_VERSION');
  assert.equal(observed.id, 'HarnessNestedPRL', 'SHARED_ROLE_OBSERVED_CASE_TYPE');
  for (const [service, dependency] of [['data', 'ccd'], ['definition', 'ccd-definition']])
    assert.equal(imported.images?.[service]?.id, manifest.identity.dependencyIdentities[dependency]?.artifactDigest, 'SHARED_ROLE_IMPORT_IMAGE');
  return { ...expected, runId: manifest.runId, identity: manifest.identity, harnessCommit: manifest.harnessCommit, harnessSourceDigest: manifest.runtimeMetadata.harnessSourceDigest, definitionImportDigest: digestBytes(importedBytes), observedDefinitionDigest: imported.observedDefinitionDigest, definitionVersion: manifest.runtimeMetadata.definitionVersion, ccdNamespace: manifest.runtimeMetadata.ccdNamespace };
}
export function loadSharedNativePhase(harnessRoot, directory, phase) {
  assert.equal(fs.realpathSync(directory), directory, 'SHARED_ROLE_PHASE_ALIAS');
  assert.equal(path.basename(directory), phase, 'SHARED_ROLE_PHASE_DIRECTORY');
  const policy = getReleasePolicy(scopes[phase]);
  const loaded = loadRunEvidence(path.join(directory, 'run.json'), policy);
  assert.deepEqual(json(directory, 'gate.json'), loaded.receipt, 'SHARED_ROLE_RECEIPT_REPLAY');
  validateCompleteNativeProofs(loaded.input, policy);
  validateNativeOutcome(loaded.input, loaded.receipt.verdict);
  validateNativePhaseFinalization(directory, loaded.input.executions, { code: loaded.receipt.verdict.exitCode, signal: null });
  const input = json(directory, 'input.json');
  assert.deepEqual(input.harnessSources, NATIVE_HARNESS_SOURCE_FILES, 'SHARED_ROLE_SOURCE_CLOSURE_MISMATCH');
  const sourceDigest = digestBytes(JSON.stringify(input.harnessSources.map(name => [name, digestBytes(canonicalBytes(harnessRoot, name))])));
  assert.equal(sourceDigest, loaded.input.manifest.runtimeMetadata.harnessSourceDigest, 'SHARED_ROLE_PRODUCER_SOURCE_CHANGED');
  if (phase === 'eventCapability') bindEventCoverage({ harnessRoot, ...loadCommittedConfigurationCatalogue(harnessRoot), directory, loaded });
  return { loaded, directory };
}

export async function replaySharedRoleNativeBindings({ harnessRoot, ccdPhaseDirectory, eventPhaseDirectory, candidateArtifactPath, sourceImageInputs }) {
  assert(ccdPhaseDirectory && eventPhaseDirectory, 'SHARED_ROLE_BOTH_PHASES_REQUIRED');
  const phases = { ccd: loadSharedNativePhase(harnessRoot, ccdPhaseDirectory, 'ccd'), eventCapability: loadSharedNativePhase(harnessRoot, eventPhaseDirectory, 'eventCapability') };
  assertSharedRolePhaseIdentity(phases.ccd.loaded.input.manifest, phases.eventCapability.loaded.input.manifest);
  const toolkit = await bindSharedRoleToolkitArtifact(candidateArtifactPath);
  for (const { loaded } of Object.values(phases))
    for (const key of ['webappCommit', 'artifactDigest', 'dependencyLockDigest', 'toolkitVersion', 'toolkitDigest'])
      assert.equal(loaded.input.manifest.identity[key], toolkit.candidateIdentity[key], 'SHARED_ROLE_ARTIFACT_IDENTITY');
  const records = sharedRoleNativePlan().map(record => {
    const { loaded, directory } = phases[record.phase];
    const manifest = json(directory, record.invocationId + '/manifest.json');
    const execution = loaded.input.executions.find(item => item.invocationId === record.invocationId);
    const proof = [...loaded.input.results, ...loaded.input.mutations.map(item => item.mutantResult)].find(item => item.proofId === record.proofId);
    assert.deepEqual(sharedIdentity(manifest), sharedIdentity(loaded.input.manifest), 'SHARED_ROLE_INVOCATION_PRODUCER');
    assert.equal(manifest.runId, loaded.input.manifest.runId, 'SHARED_ROLE_INVOCATION_RUN');
    const root = path.dirname(directory), importedBytes = canonicalBytes(root, record.importPath);
    if (record.phase === 'ccd') {
      const imported = JSON.parse(importedBytes), expected = json(harnessRoot, 'scripts/fixtures/ccd/nested-prl.binding.json');
      assert.deepEqual(imported.binding, expected, 'SHARED_ROLE_CCD_SOURCE_IMPORT');
      assert.equal(imported.fixtureDigest, digestBytes(canonicalBytes(harnessRoot, 'scripts/fixtures/ccd/nested-prl.xlsx')), 'SHARED_ROLE_CCD_WORKBOOK');
      assert.equal(imported.binding.sourceDigest, digestBytes(canonicalBytes(harnessRoot, 'scripts/fixtures/ccd/nested-prl.json')), 'SHARED_ROLE_CCD_SOURCE');
      assert.equal(imported.sourceRevision, '694b9951e94369f1394380506960c4f04f25755d', 'SHARED_ROLE_CCD_SOURCE_REVISION');
    }
    return bindSharedRoleFacet(record, { phase: record.phase, manifest, execution, proof, importedBytes, observed: json(root, record.importPath.replace('definition-import.json', 'observed-definition.json')) });
  });
  let sourceImage;
  if (sourceImageInputs) {
    const amd64 = sourceImageInputs.platform === 'linux/amd64';
    const standardArm = sourceImageInputs.platform === 'linux/arm64';
    const inputs = {...sourceImageInputs};
    delete inputs.platform;
    const reproduced = amd64 ? reproduceSharedRoleAmd64Source(inputs) : standardArm ? reproduceSharedRoleStandardArmSource(inputs) : reproduceSharedRoleCcdSource(sourceImageInputs);
    const bind = amd64 ? bindSharedRoleAmd64Runtime : standardArm ? bindSharedRoleStandardArmRuntime : bindSharedRoleCcdRuntime;
    sourceImage = { proofDigest: reproduced.proofDigest, bindings: records.map(record => {
      const directory = phases[record.phase].directory;
      return { id: record.id, ...bind(reproduced.proof, json(directory, record.invocationId + '/manifest.json'), canonicalBytes(path.dirname(directory), record.importPath)) };
    }) };
  }
  const ccd = phases.ccd;
  for (const invocation of ['baseline', 'ccd-broaden-access', 'ccd-write-then-deny', 'ccd-stale-revoked-bearer']) {
    const execution = ccd.loaded.input.executions.find(item => item.invocationId === invocation);
    const bytes = name => readSharedRoleArtifact(ccd.directory, execution, name);
    const read = name => JSON.parse(bytes(name));
    const manifest = read('manifest.json');
    const binding = sharedRoleObservationBinding(manifest, read('context.json'));
    // Read credentials locally for exact actor linkage; never return credential material.
    const personas = read('personas.json');
    const names = invocation === 'baseline' ? ['policy', 'role-revocation'] : [invocation === 'ccd-stale-revoked-bearer' ? 'role-revocation' : 'policy'];
    for (const name of names) {
      const value = read(name + '-observation.json');
      const actorId = personas.credentials[name === 'policy' ? 'denied' : 'transitioning'].userId;
      const replay = name === 'policy' ? replaySharedRoleDenial : replaySharedRoleRevocation;
      replay(value, { binding, actorId, mutation: invocation === 'baseline' ? null : invocation });
      if (['ccd-write-then-deny', 'ccd-stale-revoked-bearer'].includes(invocation)) {
        const actions = bytes('fault-actions.jsonl').toString().trim().split('\n').map(line => JSON.parse(line));
        if (invocation === 'ccd-write-then-deny')
          assert.deepEqual(actions, [{ mutation: invocation, caseId: value.caseId, status: 201 }], 'SHARED_ROLE_FAULT_WRITE_APPLICATION');
        else
          assert.deepEqual(actions, [{ mutation: invocation, actorId, caseId: value.caseId, oldTokenDigest: value.identity.oldTokenDigest, status: 200, method: 'GET', upstreamPath: `/internal/cases/${value.caseId}` }], 'SHARED_ROLE_STALE_BEARER_APPLICATION');
      }
    }
  }
  const event = phases.eventCapability, eventObservations = [];
  for (const [invocation, names] of Object.entries({ baseline: ['courtadmin-read', 'readonly-read', 'courtadmin-cell', 'readonly-update'],
    'ccd-remove-courtadmin-recipient-read': ['courtadmin-read'], 'ccd-remove-readonly-recipient-read': ['readonly-read'],
    'ccd-remove-courtadmin-event-create': ['courtadmin-cell'], 'ccd-enable-readonly-recipient-update': ['readonly-update'],
  })) {
    const execution = event.loaded.input.executions.find(item => item.invocationId === invocation);
    const read = name => JSON.parse(readSharedRoleArtifact(event.directory, execution, name, scopes.eventCapability));
    const manifest = read('manifest.json'), context = read('context.json'), personas = read('personas.json');
    const requests = readSharedRoleArtifact(event.directory, execution, 'ccd-requests.jsonl', scopes.eventCapability).toString().trim().split('\n').map(line => JSON.parse(line));
    for (const name of names) eventObservations.push(replaySharedRoleEventObservation(read(name + '-observation.json'), { name, manifest, context, personas, requests }));
  }
  // This is an independent preparation reader; catalogue admission remains explicit.
  return { schemaVersion: 1, obligationId: contract().id, contractDigest: contract().contractDigest, bindingStatus: 'verified', records, toolkit, eventObservations, ...(sourceImage ? {sourceImage} : {}), acceptedObligationIds: [], catalogueCredit: false, runtimeAcceptance: false, missingAcceptanceEvidence: [...(sourceImage ? [] : ['CCD-source-to-running-image-provenance']), 'explicit-shared-role-catalogue-admission'] };
}

export async function admitSharedRoleNative(inputs) {
  assert(inputs?.sourceImageInputs, 'SHARED_ROLE_SOURCE_IMAGE_REQUIRED');
  const replay = await replaySharedRoleNativeBindings(inputs);
  const plan = sharedRoleNativePlan();
  assert.equal(replay.bindingStatus, 'verified', 'SHARED_ROLE_BINDING_REQUIRED');
  assert.deepEqual(replay.records.map(item => item.id).sort(), plan.map(item => item.id).sort(), 'SHARED_ROLE_COMPLETE_FACETS_REQUIRED');
  assert.deepEqual(replay.sourceImage?.bindings.map(item => item.id).sort(), plan.map(item => item.id).sort(), 'SHARED_ROLE_COMPLETE_SOURCE_BINDING_REQUIRED');
  assert.equal(replay.eventObservations.length, 8, 'SHARED_ROLE_EVENT_OBSERVATIONS_REQUIRED');
  assert.deepEqual(replay.missingAcceptanceEvidence, ['explicit-shared-role-catalogue-admission'], 'SHARED_ROLE_UNEXPECTED_GAP');
  assert.deepEqual([replay.catalogueCredit, replay.runtimeAcceptance, replay.acceptedObligationIds], [false, false, []], 'SHARED_ROLE_NO_SELF_CREDIT');
  return { obligationId: contract().id, boundary: 'ccd', status: 'passed', sourceImageProofDigest: replay.sourceImage.proofDigest,
    roleFacetCount: replay.records.length, sourceBindingCount: replay.sourceImage.bindings.length,
    eventObservationCount: replay.eventObservations.length, candidateArtifactDigest: replay.toolkit.candidateIdentity.artifactDigest };
}
