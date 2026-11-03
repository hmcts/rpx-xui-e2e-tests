// Support-only child preload: real producers/evaluator/filesystem, synthetic runtime/proof boundaries.
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRunEvidence, digestBytes } from '../lib/exui-evidence-io.mjs';
import { getReleasePolicy } from '../lib/exui-release-policy.mjs';
const config = JSON.parse(fs.readFileSync(process.env.PRODUCER_PROBE_CONFIG, 'utf8'));
const original = { rename: fs.renameSync, remove: fs.rmSync, temporary: fs.mkdtempSync, append: fs.appendFileSync, exit: process.exit };
const log = value => original.append(config.events, JSON.stringify(value) + '\n');
const payloads = new Set(), sources = new Set();
let fired = false, signalSent = false, cleanupFault = false;
function evaluated() {
  const run = ['run.json', 'interrupted-run.json', 'incomplete-cleanup-run.json'].map(name => path.join(config.output, name)).find(file => fs.existsSync(file));
  if (!run) throw Error('PROBE_FAULT_BEFORE_RUN');
  const receipt = loadRunEvidence(run, getReleasePolicy('exui-wa-family-pilot')).receipt;
  if (receipt.verdict.status !== 'PASS') throw Error('PROBE_FAULT_BEFORE_VALID_EVIDENCE');
  log({ type: 'evaluated', status: receipt.verdict.status });
  if (!fs.existsSync(config.expected)) {
    const { schemaVersion, verdict, ...expected } = receipt;
    void schemaVersion; void verdict;
    expected.receiptArtifactDigest = digestBytes(JSON.stringify(receipt, null, 2) + '\n');
    fs.writeFileSync(config.expected, JSON.stringify(expected));
  }
}
function fail(name, code = 'EIO') {
  evaluated(); fired = true; log({ type: 'fault', name });
  throw Object.assign(Error('synthetic-finalization-canary'), { code });
}
fs.mkdtempSync = function(prefix, ...args) {
  const directory = original.temporary(prefix, ...args);
  if (String(prefix).endsWith('harness-oci-payload-')) payloads.add(directory);
  if (String(prefix).endsWith('harness-oci-sources-')) sources.add(directory);
  if (['harness-oci-payload-', 'harness-oci-sources-', 'harness-native-state-'].some(name => String(prefix).endsWith(name))) log({ type: 'owned-temporary', path: directory });
  return directory;
};
fs.renameSync = function(from, to) {
  const target = path.resolve(String(to)), name = path.basename(target);
  if (path.dirname(target) === config.output && name === 'run.json' && config.fault === 'cancel-exit' && !signalSent) {
    original.rename(from, to); evaluated(); signalSent = true; log({ type: 'signal' }); process.emit('SIGTERM'); return;
  }
  const publicFile = path.join(config.output, 'public/release-assurance-summary.json');
  const mandatory = target === publicFile || path.dirname(target) === config.output && ['gate.json', 'controller-terminal.json', 'source-snapshot.json'].includes(name);
  if (!mandatory) return original.rename(from, to);
  const value = JSON.parse(fs.readFileSync(from, 'utf8'));
  log({ type: 'write', name: target === publicFile ? 'public' : name, status: value.status ?? value.verdict?.status ?? null });
  if (!fired && ((config.fault === 'public' && target === publicFile && value.status === 'PASS') ||
      (config.fault === 'controller' && name === 'controller-terminal.json') ||
      (['source-record', 'cleanup-source-record'].includes(config.fault) && name === 'source-snapshot.json') ||
      (config.fault === 'cancel-exit' && target === publicFile && new Error().stack.includes('Object.exit')))) fail(config.fault);
  if (name === 'gate.json') evaluated();
  const result = original.rename(from, to);
  if (!fired && config.fault === 'gate-after-rename' && name === 'gate.json') fail(config.fault);
  return result;
};
fs.rmSync = function(file, ...args) {
  const target = path.resolve(String(file));
  if (sources.has(target)) {
    log({ type: 'source-cleanup', path: target });
    if (config.fault === 'retain-source' || config.fault === 'source-record') {
      log({ type: 'retention', code: 'EACCES' }); evaluated();
      if (config.fault === 'retain-source') { fired = true; log({ type: 'fault', name: config.fault }); }
      throw Object.assign(Error('synthetic-retained-source'), { code: 'EACCES' });
    }
    if (!fired && config.fault === 'source-cleanup') fail(config.fault);
  }
  if (payloads.has(target)) {
    log({ type: 'payload-cleanup', path: target });
    if (!fired && config.fault === 'payload-cleanup') fail(config.fault);
  }
  return original.remove(file, ...args);
};
process.exit = code => { log({ type: 'exit', code }); original.exit(code); };
globalThis.fetch = () => { throw Error('PROBE_NETWORK_FORBIDDEN'); };
export function hostDocker(args) {
  if (args[0] !== 'image' || args[1] !== 'inspect') throw Error('PROBE_UNEXPECTED_DOCKER');
  const reference = args[2];
  return JSON.stringify([{ Id: reference.startsWith('sha256:') ? reference : config.descriptor.observedImageId,
    Os: 'linux', Architecture: 'arm64', RepoDigests: [reference] }]);
}
export function inspectHostContainer() { throw Error('PROBE_UNEXPECTED_INSPECTION'); }
export async function runHostInvocation(spec, options) {
  const definition = getReleasePolicy('exui-wa-family-pilot').mutationDefinitions[0];
  const mutant = spec.invocationId !== 'baseline';
  fs.writeFileSync(path.join(spec.directory, 'report.json'), JSON.stringify({ schemaVersion: 1, complete: true,
    status: mutant ? 'failed' : 'passed', globalErrors: [],
    context: JSON.parse(fs.readFileSync(path.join(spec.directory, 'context.json'))),
    tests: [{ proofId: mutant ? definition.mutantProofId : definition.baselineProofId, status: mutant ? 'failed' : 'passed', expectedStatus: 'passed', retry: 0,
      failureId: mutant ? definition.expectedFailureId : null, unattributedErrors: 0 }] }));
  log({ type: 'proof', invocation: spec.invocationId });
  if (config.fault === 'proof-throw' && mutant) throw Error('synthetic-original-proof-error');
  if (config.kind === 'native') options.resources.set(spec.invocationId, { fixtureOwned: true });
  return { terminal: { code: mutant ? 1 : 0, signal: null } };
}
export async function removeHostResource(resources, key) {
  log({ type: 'resource-cleanup', key });
  if (!cleanupFault && ['cleanup', 'cleanup-source-record'].includes(config.fault) && key !== 'baseline') {
    cleanupFault = true;
    if (config.fault === 'cleanup') fail('cleanup');
    evaluated(); log({ type: 'fault', name: 'cleanup' });
    throw Error('synthetic-cleanup-failure');
  }
  resources.delete(key);
}
export function assertCandidateConfigurationSources() { return [{ path: 'synthetic-runtime-admission', digest: config.artifact.identity.configurationDigest }]; }
export async function verifyHarnessDependencies() { return { digest: 'sha256:' + '1'.repeat(64), playwrightVersion: '1.64.1' }; }
export async function withOwnedImageExtraction({ output }) {
  const destination = JSON.parse(fs.readFileSync(path.join(output, 'extracted-files.json'))).root;
  fs.cpSync(config.artifact.candidateRoot, destination, { recursive: true });
  return { ...config.artifact, candidateRoot: destination };
}
childProcess.spawnSync = (command, args) => {
  if (command === 'docker') return { status: 0, stdout: hostDocker(args), stderr: '' };
  if (command === 'git') return { status: 0, stdout: args[0] === 'status' ? '' : 'b'.repeat(40), stderr: '' };
  throw Error('PROBE_UNEXPECTED_PROCESS');
};
childProcess.spawn = () => { throw Error('PROBE_UNEXPECTED_PROCESS'); };
syncBuiltinESMExports();
const replacements = {
  'exui-host-invocation.mjs': ['hostDocker', 'inspectHostContainer', 'runHostInvocation', 'removeHostResource'],
  'exui-harness-dependencies.mjs': ['verifyHarnessDependencies'],
  'exui-oci-extraction.mjs': ['withOwnedImageExtraction'],
  'exui-configuration-catalogue.mjs': ['assertCandidateConfigurationSources'],
};
registerHooks({ load(url, context, nextLoad) {
  const exports = url.startsWith('file:') && replacements[path.basename(fileURLToPath(url))];
  return exports ? { format: 'module', shortCircuit: true, source: `export {${exports.join(',')}} from ${JSON.stringify(import.meta.url)};` } : nextLoad(url, context);
} });
