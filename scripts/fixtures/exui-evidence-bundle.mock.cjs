const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { completeRun } = require('./exui-release-evidence.mock.cjs');

function writeRunBundle(directory, policy, options = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const source = completeRun();
  const manifest = { ...source.manifest, runtimeMetadata: { ...source.manifest.runtimeMetadata, ...options.runtimeMetadata }, releaseScopeId: policy.releaseScopeId, policyDigest: policy.policyDigest, requiredObligationIds: [...policy.requiredObligationIds] };
  const definition = policy.mutationDefinitions[0];
  const report = (proofId, status, failureId = null) => ({
    schemaVersion: 1, complete: true, status, globalErrors: [],
    tests: [{ proofId, expectedStatus: 'passed', status, retry: 0, failureId, unattributedErrors: 0 }]
  });
  const write = (name, value) => {
    const bytes = JSON.stringify(value);
    fs.writeFileSync(path.join(directory, name), bytes);
    return { path: name, digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex') };
  };
  const baselineReport = options.baselineReport ?? report(definition.baselineProofId, 'passed');
  const mutantReport = options.mutantReport ?? report(definition.mutantProofId, 'failed', definition.expectedFailureId);
  const baseline = {
    ...source.executions[0], unexpectedGlobalErrors: baselineReport.globalErrors,
    resultArtifact: write('baseline-report.json', baselineReport),
    runnerExitCode: options.baselineExit ?? 0,
    terminalState: options.terminalState ?? 'completed'
  };
  baselineReport.context ??= reportContext(manifest, baseline);
  baseline.resultArtifact = write('baseline-report.json', baselineReport);
  const mutant = {
    ...source.executions[1], unexpectedGlobalErrors: mutantReport.globalErrors,
    resultArtifact: write('mutant-report.json', mutantReport)
  };
  mutantReport.context ??= reportContext(manifest, mutant);
  mutant.resultArtifact = write('mutant-report.json', mutantReport);
  const derivationArtifact = write('derivation.json', {
    baselineIdentity: baseline.identity, mutantIdentity: mutant.identity,
    mutationDefinitionDigest: definition.definitionDigest
  });
  const run = {
    schemaVersion: 1, manifest,
    executionArtifacts: [write('baseline-execution.json', baseline), write('mutant-execution.json', mutant)],
    mutations: [{ mutationId: definition.mutationId, baselineInvocationId: baseline.invocationId, mutantInvocationId: mutant.invocationId, derivationArtifact }]
  };
  const runPath = path.join(directory, 'run.json');
  fs.writeFileSync(runPath, JSON.stringify(run));
  return { runPath, run, baselineReport, mutantReport };
}
function reportContext(manifest, execution) {
  return { runId: execution.runId, invocationId: execution.invocationId, identity: execution.identity, harnessCommit: manifest.harnessCommit, releaseScopeId: manifest.releaseScopeId, policyDigest: manifest.policyDigest, harnessSourceState: manifest.runtimeMetadata.harnessSourceState, harnessSourceDigest: manifest.runtimeMetadata.harnessSourceDigest };
}
module.exports = { writeRunBundle, reportContext };
