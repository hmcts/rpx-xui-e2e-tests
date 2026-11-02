import { isDeepStrictEqual } from 'node:util';
import { evaluateExternalEvidence } from './exui-external-evidence.mjs';

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/;
const boundaries = ['model', 'dependency', 'candidate', 'ccd', 'external'];
const exitCodes = { PASS: 0, FAIL: 1, BLOCKED: 2 };

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function id(value) {
  return typeof value === 'string' && idPattern.test(value);
}

function digest(value) {
  return typeof value === 'string' && digestPattern.test(value);
}

function ids(values, code, allowEmpty = false) {
  requireValue(Array.isArray(values) && (allowEmpty || values.length > 0) && values.every(id), code);
  requireValue(new Set(values).size === values.length, `${code}:DUPLICATE`);
}

function sameIds(left, right) {
  return isDeepStrictEqual([...left].sort(), [...right].sort());
}

function validateIdentity(value) {
  requireValue(record(value), 'INVALID_IDENTITY');
  requireValue(typeof value.webappCommit === 'string' && commitPattern.test(value.webappCommit), 'INVALID_IDENTITY:SOURCE');
  for (const field of ['artifactDigest', 'dependencyLockDigest', 'toolkitDigest', 'configurationDigest']) {
    requireValue(digest(value[field]), `INVALID_IDENTITY:${field}`);
  }
  requireValue(text(value.toolkitVersion), 'INVALID_IDENTITY:TOOLKIT_VERSION');
  requireValue(record(value.definitionDigests), 'INVALID_IDENTITY:DEFINITIONS');
  for (const [name, valueDigest] of Object.entries(value.definitionDigests)) {
    requireValue(id(name) && digest(valueDigest), 'INVALID_IDENTITY:DEFINITIONS');
  }
  requireValue(record(value.dependencyIdentities), 'INVALID_IDENTITY:DEPENDENCIES');
  for (const [name, dependency] of Object.entries(value.dependencyIdentities)) {
    requireValue(id(name) && record(dependency) && digest(dependency.artifactDigest) && digest(dependency.apiContractDigest), 'INVALID_IDENTITY:DEPENDENCIES');
  }
}

function validateReleaseIdentity(value) {
  requireValue(record(value), 'INVALID_RELEASE_IDENTITY');
  requireValue(id(value.runId) && id(value.releaseScopeId), 'INVALID_RELEASE_IDENTITY:ID');
  requireValue(typeof value.harnessCommit === 'string' && commitPattern.test(value.harnessCommit), 'INVALID_RELEASE_IDENTITY:HARNESS');
  requireValue(digest(value.policyDigest), 'INVALID_RELEASE_IDENTITY:POLICY');
  validateIdentity(value.identity);
}

/** Validate untrusted manifest data; this does not attest to the running candidate. */
export function validateRunManifest(input) {
  validateReleaseIdentity(input);
  requireValue(input.schemaVersion === 1, 'UNSUPPORTED_SCHEMA');
  ids(input.requiredObligationIds, 'INVALID_SELECTION');
  requireValue(record(input.runtimeMetadata) && Object.keys(input.runtimeMetadata).length > 0, 'INVALID_RUNTIME_METADATA');
  requireValue(Object.entries(input.runtimeMetadata).every(([key, value]) => id(key) && text(value)), 'INVALID_RUNTIME_METADATA');
  return structuredClone(input);
}

function validatePolicy(policy) {
  requireValue(record(policy) && id(policy.releaseScopeId) && digest(policy.policyDigest), 'INVALID_POLICY');
  ids(policy.requiredObligationIds, 'INVALID_POLICY_SELECTION');
  requireValue(Array.isArray(policy.obligations) && Array.isArray(policy.mutationDefinitions), 'INVALID_POLICY');
  const obligations = new Map();
  const proofIds = new Set();
  const requiredMutationIds = new Set();
  for (const obligation of policy.obligations) {
    requireValue(record(obligation) && id(obligation.id) && boundaries.includes(obligation.boundary), 'INVALID_OBLIGATION');
    requireValue(!obligations.has(obligation.id), 'DUPLICATE_OBLIGATION');
    ids(obligation.requiredProofIds, 'INVALID_REQUIRED_PROOFS');
    ids(obligation.requiredMutationIds, 'INVALID_REQUIRED_MUTATIONS', true);
    for (const proofId of obligation.requiredProofIds) {
      requireValue(!proofIds.has(proofId), 'DUPLICATE_POLICY_PROOF');
      proofIds.add(proofId);
    }
    for (const mutationId of obligation.requiredMutationIds) {
      requireValue(!requiredMutationIds.has(mutationId), 'DUPLICATE_POLICY_MUTATION');
      requiredMutationIds.add(mutationId);
    }
    obligations.set(obligation.id, obligation);
  }
  for (const obligationId of policy.requiredObligationIds) requireValue(obligations.has(obligationId), 'UNKNOWN_POLICY_OBLIGATION');
  const mutations = new Map();
  for (const definition of policy.mutationDefinitions) {
    requireValue(record(definition) && ['mutationId', 'obligationId', 'expectedFailureId', 'baselineProofId', 'mutantProofId'].every((key) => id(definition[key])) && digest(definition.definitionDigest), 'INVALID_MUTATION_DEFINITION');
    requireValue(!mutations.has(definition.mutationId), 'DUPLICATE_MUTATION_DEFINITION');
    const obligation = obligations.get(definition.obligationId);
    requireValue(obligation?.requiredMutationIds.includes(definition.mutationId) && obligation.requiredProofIds.includes(definition.baselineProofId), 'UNASSIGNED_MUTATION_DEFINITION');
    requireValue(!proofIds.has(definition.mutantProofId), 'DUPLICATE_POLICY_PROOF');
    proofIds.add(definition.mutantProofId);
    mutations.set(definition.mutationId, definition);
  }
  for (const mutationId of requiredMutationIds) requireValue(mutations.has(mutationId), 'MISSING_MUTATION_DEFINITION');
  return { obligations, mutations };
}

function validateProof(proof) {
  requireValue(record(proof) && ['proofId', 'obligationId', 'runId', 'invocationId'].every((key) => id(proof[key])), 'INVALID_PROOF');
  validateIdentity(proof.identity);
  requireValue(boundaries.includes(proof.boundary) && ['passed', 'failed', 'skipped', 'blocked'].includes(proof.outcome), 'INVALID_PROOF_OUTCOME');
  requireValue(typeof proof.complete === 'boolean' && proof.complete, `INCOMPLETE_PROOF:${proof.proofId}`);
  requireValue(proof.retryIndex === 0, `MANDATORY_RETRY:${proof.proofId}`);
  requireValue(proof.outcome === 'failed' ? id(proof.failureId) : proof.failureId === null, `INVALID_FAILURE_ID:${proof.proofId}`);
  requireValue(Array.isArray(proof.artifacts) && proof.artifacts.length > 0 && proof.artifacts.every(text), `MISSING_PROOF_ARTIFACT:${proof.proofId}`);
}

function validateExecution(execution) {
  requireValue(record(execution) && id(execution.invocationId) && id(execution.runId), 'INVALID_EXECUTION');
  validateIdentity(execution.identity);
  requireValue(['baseline', 'mutation'].includes(execution.kind), 'INVALID_EXECUTION_KIND');
  requireValue(execution.terminalState === 'completed', `UNFINALIZED_EXECUTION:${execution.invocationId}`);
  requireValue(execution.runnerExitCode === 0 || execution.runnerExitCode === 1, `UNSUPPORTED_RUNNER_EXIT:${execution.invocationId}`);
  requireValue(Array.isArray(execution.unexpectedGlobalErrors) && execution.unexpectedGlobalErrors.every(text), 'INVALID_GLOBAL_ERRORS');
  requireValue(execution.unexpectedGlobalErrors.length === 0, `GLOBAL_EXECUTION_ERROR:${execution.invocationId}`);
  requireValue(record(execution.resultArtifact) && text(execution.resultArtifact.path) && digest(execution.resultArtifact.digest), `INVALID_EXECUTION_REPORT:${execution.invocationId}`);
}

function verdict(status, reasons = []) {
  return { status, exitCode: exitCodes[status], reasons: [...new Set(reasons)].sort() };
}

/** Evaluate parsed evidence after the caller verifies raw reports, assertion attribution and mutation derivation. */
export function evaluateReleaseEvidence(input, evaluatedAt = new Date().toISOString()) {
  const failures = Array.isArray(input?.results)
    ? input.results.filter((proof) => proof?.outcome === 'failed' && id(proof.proofId) && id(proof.failureId))
      .map((proof) => `OBSERVED_FAILED_RESULT:${proof.proofId}:${proof.failureId}`)
    : [];
  if (Array.isArray(input?.externalResults)) {
    failures.push(...input.externalResults.filter((proof) => proof?.original?.outcome === 'FAIL' && id(proof.proofId))
      .map((proof) => `OBSERVED_FAILED_EXTERNAL_RESULT:${proof.proofId}`));
  }
  try {
    requireValue(record(input), 'INVALID_EVIDENCE');
    const manifest = validateRunManifest(input.manifest);
    const { obligations, mutations: definitions } = validatePolicy(input.policy);
    requireValue(input.policy.releaseScopeId === manifest.releaseScopeId && input.policy.policyDigest === manifest.policyDigest, 'POLICY_IDENTITY_MISMATCH');
    requireValue(sameIds(input.policy.requiredObligationIds, manifest.requiredObligationIds), 'POLICY_SELECTION_MISMATCH');
    requireValue(Array.isArray(input.results) && Array.isArray(input.executions) && Array.isArray(input.mutations), 'INVALID_EVIDENCE_ARRAYS');
    const requiredProofs = new Map();
    const requiredMutations = new Set();
    for (const obligationId of manifest.requiredObligationIds) {
      const obligation = obligations.get(obligationId);
      if (obligation.boundary === 'external') continue;
      if (obligation.boundary === 'ccd') {
        requireValue(record(manifest.identity.dependencyIdentities.ccd) && Object.keys(manifest.identity.definitionDigests).length > 0, `CCD_IDENTITY_UNAVAILABLE:${obligationId}`);
      }
      for (const proofId of obligation.requiredProofIds) requiredProofs.set(proofId, obligation);
      for (const mutationId of obligation.requiredMutationIds) requiredMutations.add(mutationId);
    }
    const executions = new Map();
    for (const execution of input.executions) {
      validateExecution(execution);
      requireValue(!executions.has(execution.invocationId), 'DUPLICATE_EXECUTION');
      requireValue(execution.runId === manifest.runId, 'EXECUTION_RUN_MISMATCH');
      executions.set(execution.invocationId, execution);
    }
    const invocationProofs = new Map();
    const registerProof = (proof, kind, expectedIdentity, obligation) => {
      validateProof(proof);
      requireValue(proof.runId === manifest.runId && isDeepStrictEqual(proof.identity, expectedIdentity), `PROOF_IDENTITY_MISMATCH:${proof.proofId}`);
      requireValue(proof.obligationId === obligation.id && proof.boundary === obligation.boundary, `PROOF_BOUNDARY_MISMATCH:${proof.proofId}`);
      const execution = executions.get(proof.invocationId);
      requireValue(execution && execution.kind === kind && isDeepStrictEqual(execution.identity, expectedIdentity), `PROOF_EXECUTION_MISMATCH:${proof.proofId}`);
      const proofs = invocationProofs.get(proof.invocationId) ?? [];
      proofs.push(proof);
      invocationProofs.set(proof.invocationId, proofs);
    };
    const results = new Map();
    for (const proof of input.results) {
      requireValue(record(proof) && requiredProofs.has(proof.proofId), 'UNSELECTED_PROOF');
      requireValue(!results.has(proof.proofId), `DUPLICATE_PROOF:${proof.proofId}`);
      registerProof(proof, 'baseline', manifest.identity, requiredProofs.get(proof.proofId));
      requireValue(proof.outcome === 'passed' || proof.outcome === 'failed', `UNAVAILABLE_PROOF:${proof.proofId}`);
      results.set(proof.proofId, proof);
    }
    for (const proofId of requiredProofs.keys()) requireValue(results.has(proofId), `MISSING_PROOF:${proofId}`);
    const witnesses = new Set();
    for (const witness of input.mutations) {
      requireValue(record(witness) && requiredMutations.has(witness.mutationId), 'UNSELECTED_MUTATION');
      requireValue(!witnesses.has(witness.mutationId), 'DUPLICATE_MUTATION');
      witnesses.add(witness.mutationId);
      const definition = definitions.get(witness.mutationId);
      requireValue(witness.runId === manifest.runId && witness.obligationId === definition.obligationId && witness.mutationDefinitionDigest === definition.definitionDigest, 'MUTATION_DEFINITION_MISMATCH');
      validateIdentity(witness.baselineIdentity);
      validateIdentity(witness.mutantIdentity);
      requireValue(isDeepStrictEqual(witness.baselineIdentity, manifest.identity), 'MUTATION_BASELINE_IDENTITY_MISMATCH');
      const changedContent = ['artifactDigest', 'dependencyLockDigest', 'toolkitDigest', 'configurationDigest', 'definitionDigests', 'dependencyIdentities']
        .some((field) => !isDeepStrictEqual(witness.mutantIdentity[field], manifest.identity[field]));
      requireValue(changedContent, 'MUTANT_CONTENT_IDENTITY_UNCHANGED');
      const baseline = results.get(definition.baselineProofId);
      requireValue(baseline && baseline.outcome === 'passed' && isDeepStrictEqual(witness.baselineResult, baseline), 'MUTATION_BASELINE_UNAVAILABLE');
      requireValue(witness.mutantResult?.proofId === definition.mutantProofId, 'MUTANT_PROOF_ID_MISMATCH');
      registerProof(witness.mutantResult, 'mutation', witness.mutantIdentity, obligations.get(definition.obligationId));
      requireValue(witness.mutantResult.outcome === 'failed' && witness.mutantResult.failureId === definition.expectedFailureId, 'EXPECTED_MUTATION_ASSERTION_MISSING');
    }
    for (const mutationId of requiredMutations) requireValue(witnesses.has(mutationId), `MISSING_MUTATION:${mutationId}`);
    for (const [invocationId, execution] of executions) {
      const proofs = invocationProofs.get(invocationId);
      requireValue(proofs?.length > 0, `UNREFERENCED_EXECUTION:${invocationId}`);
      const failed = proofs.some((proof) => proof.outcome === 'failed');
      requireValue(execution.runnerExitCode === (failed ? 1 : 0), `INCOHERENT_RUNNER_EXIT:${invocationId}`);
    }
    failures.push(...evaluateExternalEvidence(manifest, input.policy, input.externalResults, evaluatedAt));
    return failures.length ? verdict('FAIL', failures) : verdict('PASS');
  } catch (error) {
    return verdict('BLOCKED', [...failures, error instanceof Error ? error.message : 'INVALID_EVIDENCE']);
  }
}

function validateVerdict(value) {
  requireValue(record(value) && Object.hasOwn(exitCodes, value.status) && value.exitCode === exitCodes[value.status], 'INVALID_VERDICT');
  requireValue(Array.isArray(value.reasons) && value.reasons.every(text), 'INVALID_VERDICT_REASONS');
  requireValue(value.status === 'PASS' ? value.reasons.length === 0 : value.reasons.length > 0, 'INVALID_VERDICT_REASONS');
}

/** Create a snapshot of the evaluated decision for immutable publication. */
export function createGateReceipt(manifest, evidenceManifestDigest, evaluatedVerdict) {
  validateRunManifest(manifest);
  requireValue(digest(evidenceManifestDigest), 'INVALID_DIGEST');
  validateVerdict(evaluatedVerdict);
  const { runId, harnessCommit, releaseScopeId, policyDigest, identity } = manifest;
  return structuredClone({ schemaVersion: 1, runId, harnessCommit, releaseScopeId, policyDigest, identity, evidenceManifestDigest, verdict: evaluatedVerdict });
}

/** Expected values must come from the deployment request, never from the checked receipt. */
export function validatePromotionReceipt(receipt, expected) {
  try {
    validateReleaseIdentity(receipt);
    validateReleaseIdentity(expected);
    requireValue(receipt.schemaVersion === 1, 'UNSUPPORTED_GATE_SCHEMA');
    requireValue(digest(receipt.evidenceManifestDigest) && digest(expected.evidenceManifestDigest), 'INVALID_EVIDENCE_DIGEST');
    validateVerdict(receipt.verdict);
    for (const field of ['runId', 'harnessCommit', 'releaseScopeId', 'policyDigest', 'identity', 'evidenceManifestDigest']) {
      requireValue(isDeepStrictEqual(receipt[field], expected[field]), `PROMOTION_IDENTITY_MISMATCH:${field}`);
    }
    return structuredClone(receipt.verdict);
  } catch (error) {
    return verdict('BLOCKED', [error instanceof Error ? error.message : 'INVALID_GATE_RECEIPT']);
  }
}
