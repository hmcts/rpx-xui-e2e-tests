import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validateRunManifest, evaluateReleaseEvidence, createGateReceipt } from './exui-release-evidence.mjs';

export const digestBytes = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const requireFact = (condition, code) => { if (!condition) throw new Error(code); };
const isWithin = (root, file) => file.startsWith(root + path.sep);

export function readEvidenceArtifactBytes(root, reference) {
  requireFact(reference && typeof reference.path === 'string' && /^sha256:[a-f0-9]{64}$/.test(reference.digest), 'INVALID_ARTIFACT_REFERENCE');
  const evidenceRoot = fs.realpathSync(root);
  const requested = path.resolve(evidenceRoot, reference.path);
  requireFact(!path.isAbsolute(reference.path) && isWithin(evidenceRoot, requested), 'ARTIFACT_OUTSIDE_RUN');
  const resolved = fs.realpathSync(requested);
  requireFact(isWithin(evidenceRoot, resolved) && fs.statSync(resolved).isFile(), 'ARTIFACT_OUTSIDE_RUN');
  const bytes = fs.readFileSync(resolved);
  requireFact(digestBytes(bytes) === reference.digest, 'ARTIFACT_DIGEST_MISMATCH');
  return { bytes, reference };
}
export function readEvidenceArtifact(root, reference) {
  const { bytes } = readEvidenceArtifactBytes(root, reference);
  return { value: JSON.parse(bytes), reference };
}

// Parse one raw execution using the same evidence rules as the complete run loader.
export function readExecutionEvidence(root, reference, manifest, policy) {
  const references = [];
  const results = [];
  const cells = new Map();
  for (const obligation of policy.obligations) {
    if (obligation.boundary !== 'external') for (const proofId of obligation.requiredProofIds) cells.set(proofId, obligation);
  }
  for (const mutation of policy.mutationDefinitions) {
    cells.set(mutation.mutantProofId, policy.obligations.find((item) => item.id === mutation.obligationId));
  }
  const { value: execution } = readEvidenceArtifact(root, reference);
  references.push(reference);
  const { value: report } = readEvidenceArtifact(root, execution.resultArtifact);
  references.push(execution.resultArtifact);
  if (Object.hasOwn(execution, 'sharedRoleArtifacts')) {
    requireFact(manifest.releaseScopeId === 'exui-ccd-pilot' && Array.isArray(execution.sharedRoleArtifacts), 'INVALID_SHARED_ROLE_ARTIFACTS');
    const paths = execution.sharedRoleArtifacts.map(item => item.path);
    requireFact(new Set(paths).size === paths.length && paths.every(name => typeof name === 'string' && name.startsWith(execution.invocationId + '/') && /^(manifest|context|personas|policy-observation|role-revocation-observation)\.json$|^(ccd-requests|fault-actions)\.jsonl$/.test(name.slice(execution.invocationId.length + 1))), 'INVALID_SHARED_ROLE_ARTIFACT_SELECTION');
    for (const ref of execution.sharedRoleArtifacts) {
      readEvidenceArtifactBytes(root, ref);
      references.push(ref);
    }
  }
  requireFact(report.schemaVersion === 1 && report.complete === true && Array.isArray(report.tests) && Array.isArray(report.globalErrors), 'INVALID_FRAMEWORK_REPORT');
  requireFact(['passed', 'failed', 'timedout', 'interrupted'].includes(report.status), 'INVALID_FRAMEWORK_STATUS');
  requireFact(isDeepStrictEqual(execution.unexpectedGlobalErrors, report.globalErrors), 'GLOBAL_ERROR_MISMATCH');
  requireFact(isDeepStrictEqual(report.context, {
    runId: execution.runId, invocationId: execution.invocationId, identity: execution.identity,
    harnessCommit: manifest.harnessCommit, releaseScopeId: manifest.releaseScopeId, policyDigest: manifest.policyDigest,
    harnessSourceState: manifest.runtimeMetadata.harnessSourceState, harnessSourceDigest: manifest.runtimeMetadata.harnessSourceDigest
  }), 'REPORT_CONTEXT_MISMATCH');
  const observedErrors = [...report.globalErrors];
  for (const test of report.tests) {
    const obligation = cells.get(test.proofId);
    requireFact(obligation && test.expectedStatus === 'passed', 'UNKNOWN_OR_EXPECTED_FAILURE_PROOF');
    requireFact(Number.isInteger(test.unattributedErrors) && test.unattributedErrors >= 0, 'INVALID_ERROR_COUNT');
    if (test.unattributedErrors > 0) observedErrors.push('UNATTRIBUTED_TEST_FAILURE');
    const outcomes = { passed: 'passed', failed: 'failed', skipped: 'skipped', timedOut: 'blocked', interrupted: 'blocked' };
    requireFact(Object.hasOwn(outcomes, test.status), 'INVALID_TEST_STATUS');
    results.push({
      proofId: test.proofId, obligationId: obligation.id, runId: execution.runId,
      invocationId: execution.invocationId, identity: execution.identity, boundary: obligation.boundary,
      outcome: outcomes[test.status], retryIndex: test.retry,
      complete: !['timedOut', 'interrupted'].includes(test.status), failureId: test.failureId,
      artifacts: [execution.resultArtifact.path]
    });
  }
  if (report.status === 'interrupted' || report.status === 'timedout') observedErrors.push('INCOMPLETE_FRAMEWORK_EXECUTION');
  if ((report.status === 'passed') !== (execution.runnerExitCode === 0)) observedErrors.push('FRAMEWORK_EXIT_MISMATCH');
  return { execution: { ...execution, unexpectedGlobalErrors: observedErrors }, results, references };
}

export function loadRunEvidence(runPath, policy) {
  const root = path.dirname(fs.realpathSync(runPath));
  const runBytes = fs.readFileSync(runPath);
  const run = JSON.parse(runBytes);
  requireFact(run.schemaVersion === 1 && !Object.hasOwn(run, 'policy'), 'INVALID_RUN_ENVELOPE');
  const manifest = validateRunManifest(run.manifest);
  requireFact(Array.isArray(run.executionArtifacts) && Array.isArray(run.mutations), 'MISSING_EXECUTIONS');
  const references = [{ path: path.basename(runPath), digest: digestBytes(runBytes) }];
  const executions = [];
  const allResults = [];
  for (const reference of run.executionArtifacts) {
    const parsed = readExecutionEvidence(root, reference, manifest, policy);
    references.push(...parsed.references);
    executions.push(parsed.execution);
    allResults.push(...parsed.results);
  }
  const mutations = run.mutations.map((witness) => {
    const definition = policy.mutationDefinitions.find((item) => item.mutationId === witness.mutationId);
    requireFact(definition, 'UNKNOWN_MUTATION');
    const baseline = allResults.filter((result) => result.invocationId === witness.baselineInvocationId && result.proofId === definition.baselineProofId);
    const mutant = allResults.filter((result) => result.invocationId === witness.mutantInvocationId && result.proofId === definition.mutantProofId);
    requireFact(baseline.length === 1 && mutant.length === 1, 'MISSING_OR_RETRIED_MUTATION_PROOF');
    const { value: derivation } = readEvidenceArtifact(root, witness.derivationArtifact);
    references.push(witness.derivationArtifact);
    requireFact(derivation.mutationDefinitionDigest === definition.definitionDigest &&
      isDeepStrictEqual(derivation.baselineIdentity, baseline[0].identity) &&
      isDeepStrictEqual(derivation.mutantIdentity, mutant[0].identity), 'MUTATION_DERIVATION_MISMATCH');
    return {
      mutationId: definition.mutationId, obligationId: definition.obligationId, runId: manifest.runId,
      baselineIdentity: baseline[0].identity, mutantIdentity: mutant[0].identity,
      mutationDefinitionDigest: derivation.mutationDefinitionDigest,
      baselineResult: baseline[0], mutantResult: mutant[0]
    };
  });
  const baselineInvocations = new Set(executions.filter((item) => item.kind === 'baseline').map((item) => item.invocationId));
  const results = allResults.filter((result) => baselineInvocations.has(result.invocationId));
  // Every failed/retried/unexpected proof must reach evaluation, including mutant extras.
  const represented = new Set([...results, ...mutations.map((item) => item.mutantResult)]);
  requireFact(allResults.every((result) => represented.has(result)), 'UNACCOUNTED_PROOF');
  requireFact(run.externalResults === undefined || Array.isArray(run.externalResults), 'INVALID_EXTERNAL_RESULTS');
  const externalResults = (run.externalResults ?? []).map((result) => {
    requireFact(result && !Object.hasOwn(result, 'original'), 'EXTERNAL_ORIGINAL_MUST_BE_ARTIFACT');
    const { value: original } = readEvidenceArtifact(root, result.producerArtifact);
    references.push(result.producerArtifact);
    return { ...result, original };
  });
  const evidenceManifestDigest = digestBytes(JSON.stringify(references));
  const input = { manifest, policy, executions, results, mutations, externalResults };
  const verdict = evaluateReleaseEvidence(input);
  return { input, evidenceManifestDigest, receipt: createGateReceipt(manifest, evidenceManifestDigest, verdict) };
}

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function writePublicSummary(file, verdict, receiptAvailable = false) {
  requireFact(['PASS', 'FAIL', 'BLOCKED'].includes(verdict.status), 'INVALID_PUBLIC_STATUS');
  writeJsonAtomic(file, {
    schemaVersion: 1, kind: 'pilot-evidence-summary', status: verdict.status,
    releaseApproval: false, fullReleaseScopeAvailable: false,
    receiptAvailable: receiptAvailable === true,
    reasonCodes: verdict.status === 'PASS' ? [] : ['EVIDENCE_REJECTED']
  });
}

export function validatePublicSummary(file) {
  const bytes = fs.readFileSync(file);
  const summary = JSON.parse(bytes);
  requireFact(summary && ['PASS', 'FAIL', 'BLOCKED'].includes(summary.status) && typeof summary.receiptAvailable === 'boolean', 'INVALID_PUBLIC_SUMMARY');
  requireFact(isDeepStrictEqual(summary, {
    schemaVersion: 1, kind: 'pilot-evidence-summary', status: summary.status,
    releaseApproval: false, fullReleaseScopeAvailable: false,
    receiptAvailable: summary.receiptAvailable,
    reasonCodes: summary.status === 'PASS' ? [] : ['EVIDENCE_REJECTED']
  }), 'UNSAFE_PUBLIC_SUMMARY');
  requireFact(bytes.equals(Buffer.from(JSON.stringify(summary, null, 2) + '\n')), 'UNSAFE_PUBLIC_BYTES');
  return summary;
}
