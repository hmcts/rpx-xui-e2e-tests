const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, mkdir, writeFile, symlink, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'candidate-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['dist/rpx-exui/api', 'dist/rpx-exui/browser', 'api', 'config', 'runtime', 'node_modules/@hmcts/ccd-case-ui-toolkit']) await mkdir(path.join(root, directory), { recursive: true });
  const files = {
    'dist/rpx-exui/browser/index.html': '<app-root></app-root>',
    'dist/rpx-exui/api/server.bundle.js': 'server',
    'package.json': JSON.stringify({ dependencies: { '@hmcts/ccd-case-ui-toolkit': '7.3.92' } }),
    'yarn.lock': 'lock',
    'config/default.json': '{}',
    'api/package.json': '{"name":"jui"}',
    'runtime/node': 'node-binary-fixture',
    'node_modules/@hmcts/ccd-case-ui-toolkit/package.json': '{"version":"7.3.92"}',
  };
  for (const [name, contents] of Object.entries(files)) await writeFile(path.join(root, name), contents);
  return root;
}
const provenance = { sourceMethod: 'git-archive', webappCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), platform: 'linux/arm64', buildImage: `sha256:${'c'.repeat(64)}`, install: 'immutable-offline' };

test('candidate seal verifies a complete identified payload and rejects UI, dependency, config and provenance tampering', async (t) => {
  const { describeCandidateArtifact, verifyCandidateArtifact } = await import('./lib/exui-candidate-artifact.mjs');
  for (const changed of ['dist/rpx-exui/browser/index.html', 'node_modules/@hmcts/ccd-case-ui-toolkit/package.json', 'config/default.json', 'yarn.lock']) {
    const root = await fixture(t);
    const manifestPath = path.join(path.dirname(root), `${path.basename(root)}.json`);
    t.after(() => rm(manifestPath, { force: true }));
    const manifest = await describeCandidateArtifact(root, provenance);
    await writeFile(manifestPath, JSON.stringify(manifest));
    assert.deepEqual(await verifyCandidateArtifact(manifestPath), manifest);
    await writeFile(path.join(root, changed), 'tampered');
    await assert.rejects(verifyCandidateArtifact(manifestPath));
  }
  const root = await fixture(t);
  await assert.rejects(describeCandidateArtifact(root, { ...provenance, sourceMethod: 'dirty-worktree' }), /immutable git archive/);
  await assert.rejects(describeCandidateArtifact(root, { ...provenance, webappCommit: 'HEAD' }), /immutable git archive/);
  await assert.rejects(describeCandidateArtifact(root, { ...provenance, install: 'existing-node_modules' }), /immutable offline/);
});

test('tree digests are stable, bind entry names and reject symlinks outside the payload', async (t) => {
  const { digestCandidateTree } = await import('./lib/exui-candidate-artifact.mjs');
  const root = await fixture(t);
  assert.equal(await digestCandidateTree(root), await digestCandidateTree(root));
  await symlink('api', path.join(root, 'internal'));
  await digestCandidateTree(root);
  await symlink(os.tmpdir(), path.join(root, 'escape'));
  await assert.rejects(digestCandidateTree(root), /escapes root/);
});

test('installed toolkit version must match the source package pin', async (t) => {
  const { describeCandidateArtifact } = await import('./lib/exui-candidate-artifact.mjs');
  const root = await fixture(t);
  await writeFile(path.join(root, 'node_modules/@hmcts/ccd-case-ui-toolkit/package.json'), '{"version":"7.4.4"}');
  await assert.rejects(describeCandidateArtifact(root, provenance), /Installed toolkit does not match/);
});

test('manifest provenance tampering and missing runtime inputs cannot receive a seal', async (t) => {
  const { describeCandidateArtifact, verifyCandidateArtifact } = await import('./lib/exui-candidate-artifact.mjs');
  const root = await fixture(t);
  const manifestPath = path.join(path.dirname(root), `${path.basename(root)}.json`);
  t.after(() => rm(manifestPath, { force: true }));
  const manifest = await describeCandidateArtifact(root, provenance);
  manifest.provenance.webappCommit = 'd'.repeat(40);
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyCandidateArtifact(manifestPath), /identity mismatch/);
  await rm(path.join(root, 'runtime/node'));
  await assert.rejects(describeCandidateArtifact(root, provenance), /ENOENT/);
});
