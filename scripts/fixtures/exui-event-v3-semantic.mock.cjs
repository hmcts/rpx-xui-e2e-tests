const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { eventV3Fixture } = require('./exui-event-v3.mock.cjs');
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

// Synthetic raw report/import protocol data; never an executed native proof.
exports.eventV3SemanticFixture = async t => {
  const f = await eventV3Fixture(t), invocationId = 'ccd-enable-judge-event';
  const entry = f.expected.faults[0], capture = f.read(entry.capture.path);
  const saveRun = () => { const bytes = fs.readFileSync(path.join(f.directory, 'run.json')); f.runPin = { path: 'run.json', digest: hash(bytes) }; };
  const run = f.read('run.json'), mutation = run.mutations.find(row => row.mutationId === invocationId);
  const derivation = f.read(mutation.derivationArtifact.path);
  derivation.runtimeRecord = capture.runtimeRecord;
  mutation.derivationArtifact = f.put(mutation.derivationArtifact.path, derivation);
  f.put('run.json', run); saveRun();
  f.changeFaultReport = change => {
    const current = f.read('run.json'), reference = current.executionArtifacts.find(row => row.path.startsWith(invocationId + '/'));
    const execution = f.read(reference.path), report = f.read(execution.resultArtifact.path);
    change(report); execution.resultArtifact = f.put(execution.resultArtifact.path, report);
    Object.assign(reference, f.put(reference.path, execution)); f.put('run.json', current); saveRun();
  };
  f.changeDerivation = change => {
    const current = f.read('run.json'), row = current.mutations.find(item => item.mutationId === invocationId), value = f.read(row.derivationArtifact.path);
    change(value); row.derivationArtifact = f.put(row.derivationArtifact.path, value); f.put('run.json', current); saveRun();
  };
  f.changeFaultImport = change => {
    const capture = f.read(f.expected.faults[0].capture.path), runtime = f.read(capture.runtimeRecord.path);
    const file = path.join(runtime.ccd.output, 'definition-import.json'), receipt = JSON.parse(fs.readFileSync(file));
    change(receipt); const bytes = JSON.stringify(receipt); fs.writeFileSync(file, bytes);
    const pin = hash(bytes);
    f.rewriteRuntime(0, current => { current.definition = receipt; current.definitionImportDigest = pin; });
    const manifest = f.read(invocationId + '/manifest.json'); manifest.runtimeMetadata.definitionImportDigest = pin;
    f.put(invocationId + '/manifest.json', manifest);
    f.changeDerivation(value => { value.runtimeRecord = f.read(f.expected.faults[0].capture.path).runtimeRecord; value.mutantRuntimeMetadata.definitionImportDigest = pin; });
  };
  return Object.assign(f, { invocationId, saveRun });
};
