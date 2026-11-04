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

test('AMD64 artifact provenance is sealed and cannot be relabelled as ARM64', async (t) => {
  const { describeCandidateArtifact, verifyCandidateArtifact } = await import('./lib/exui-candidate-artifact.mjs');
  const root = await fixture(t);
  const file = path.join(root, '../' + path.basename(root) + '-amd64.json');
  t.after(() => rm(file, { force: true }));
  const value = await describeCandidateArtifact(root, { ...provenance, platform: 'linux/amd64' });
  await writeFile(file, JSON.stringify(value));
  assert.deepEqual(await verifyCandidateArtifact(file), value);
  value.provenance.platform = 'linux/arm64';
  await writeFile(file, JSON.stringify(value));
  await assert.rejects(verifyCandidateArtifact(file), /identity mismatch/);
  await assert.rejects(describeCandidateArtifact(root, { ...provenance, platform: 'linux/ppc64le' }), /pinned Linux/);
});

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

test('private transport parents can keep stable payload-root execute bits without ignoring file integrity', async t => {
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {digestCandidateTree}=await import('./lib/exui-candidate-artifact.mjs');
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'artifact-mount-mode-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
 const root=path.join(parent,'payload');fs.mkdirSync(root,0o700);const file=path.join(root,'browser');fs.writeFileSync(file,'fixture',{mode:0o700});
 const privateRootDigest=await digestCandidateTree(root);
 fs.chmodSync(root,0o755);const portable=await digestCandidateTree(root);
 assert.notEqual(privateRootDigest,portable);
 fs.chmodSync(root,0o777);assert.equal(await digestCandidateTree(root),portable);
 fs.chmodSync(root,0o755);fs.chmodSync(file,0o600);assert.notEqual(await digestCandidateTree(root),portable);
 fs.chmodSync(file,0o700);fs.writeFileSync(file,'changed');assert.notEqual(await digestCandidateTree(root),portable);
 assert.equal(fs.statSync(parent).mode&0o777,0o700);
});
