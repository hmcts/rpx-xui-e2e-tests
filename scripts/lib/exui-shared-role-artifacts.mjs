import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { digestBytes, readEvidenceArtifactBytes } from './exui-evidence-io.mjs';

export function sharedRoleArtifactNames(invocationId) {
  if (!['baseline', 'ccd-broaden-access', 'ccd-write-then-deny', 'ccd-stale-revoked-bearer'].includes(invocationId)) return [];
  return ['manifest.json', 'context.json', 'personas.json', 'ccd-requests.jsonl',
    ...(invocationId === 'baseline' ? ['policy-observation.json', 'role-revocation-observation.json'] : [invocationId === 'ccd-stale-revoked-bearer' ? 'role-revocation-observation.json' : 'policy-observation.json']),
    ...(['ccd-write-then-deny', 'ccd-stale-revoked-bearer'].includes(invocationId) ? ['fault-actions.jsonl'] : []),
  ];
}
// Missing observations are retained as missing evidence on genuine early failures;
// this must not replace the framework's original failure with a collector error.
export function captureSharedRoleArtifacts(root, invocationId) {
  root = fs.realpathSync(root);
  return sharedRoleArtifactNames(invocationId).flatMap(name => {
    const relative = invocationId + '/' + name, file = path.join(root, relative);
    if (!fs.existsSync(file)) return [];
    assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, 'SHARED_ROLE_ARTIFACT_ALIAS');
    assert(fs.statSync(file).size <= 16 * 1024 * 1024, 'SHARED_ROLE_ARTIFACT_SIZE');
    return [{ path: relative, digest: digestBytes(fs.readFileSync(file)) }];
  });
}
export function readSharedRoleArtifact(root, execution, name) {
  root = fs.realpathSync(root);
  const names = sharedRoleArtifactNames(execution.invocationId);
  assert(names.includes(name), 'SHARED_ROLE_ARTIFACT_NAME');
  assert(Array.isArray(execution.sharedRoleArtifacts), 'SHARED_ROLE_EXECUTION_ARTIFACTS_REQUIRED');
  assert.deepEqual(execution.sharedRoleArtifacts.map(ref => ref.path).sort(), names.map(file => execution.invocationId + '/' + file).sort(), 'SHARED_ROLE_EXECUTION_ARTIFACT_SELECTION');
  const ref = execution.sharedRoleArtifacts.find(item => item.path === execution.invocationId + '/' + name);
  const file = path.join(root, ref.path);
  assert(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, 'SHARED_ROLE_ARTIFACT_ALIAS');
  return readEvidenceArtifactBytes(root, ref).bytes;
}
