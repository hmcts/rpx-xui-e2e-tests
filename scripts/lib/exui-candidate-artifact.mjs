import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const inside = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);

// Sorted paths, entry kinds, executable bits and content make the seal independent of timestamps.
export async function digestCandidateTree(directory, replacements = new Map()) {
  const root = await realpath(directory);
  const digest = createHash('sha256');
  async function visit(relative) {
    const absolute = path.join(root, relative);
    const stat = await lstat(absolute);
    const kind = stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'directory' : 'file';
    if (!stat.isSymbolicLink() && !stat.isDirectory() && !stat.isFile()) throw new Error(`Unsupported artifact entry: ${relative}`);
    digest.update(JSON.stringify([relative, kind, stat.mode & 0o111]));
    if (stat.isSymbolicLink()) {
      const target = await realpath(absolute);
      if (!inside(root, target)) throw new Error(`Artifact symlink escapes root: ${relative}`);
      digest.update(await readlink(absolute));
    } else if (stat.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) await visit(relative ? `${relative}/${name}` : name);
    } else {
      digest.update(hash(replacements.get(relative) ?? await readFile(absolute)));
    }
  }
  await visit('');
  return `sha256:${digest.digest('hex')}`;
}

export async function describeCandidateArtifact(candidateRoot, provenance) {
  if (!provenance || provenance.sourceMethod !== 'git-archive' || !/^[a-f0-9]{40}$/.test(provenance.webappCommit ?? '') || !/^[a-f0-9]{40}$/.test(provenance.sourceTree ?? '')) {
    throw new Error('Candidate requires an identified immutable git archive source');
  }
  if (provenance.platform !== 'linux/arm64' || !/^sha256:[a-f0-9]{64}$/.test(provenance.buildImage ?? '') || provenance.install !== 'immutable-offline') throw new Error('Candidate requires pinned Linux/arm64 build and immutable offline install');
  const root = await realpath(candidateRoot);
  // Validate the complete tree before reading named inputs through possible symlinks.
  const payloadDigest = await digestCandidateTree(root);
  for (const entry of ['dist/rpx-exui/browser/index.html', 'dist/rpx-exui/api/server.bundle.js', 'package.json', 'yarn.lock', 'node_modules', 'config', 'api', 'runtime/node']) await lstat(path.join(root, entry));
  const toolkitRoot = path.join(root, 'node_modules/@hmcts/ccd-case-ui-toolkit');
  const toolkit = JSON.parse(await readFile(path.join(toolkitRoot, 'package.json'), 'utf8'));
  const declaredToolkit = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).dependencies?.['@hmcts/ccd-case-ui-toolkit'];
  if (toolkit.version !== declaredToolkit) throw new Error('Installed toolkit does not match the pinned package manifest');
  const identity = {
    webappCommit: provenance.webappCommit,
    dependencyLockDigest: hash(await readFile(path.join(root, 'yarn.lock'))),
    toolkitVersion: toolkit.version,
    toolkitDigest: await digestCandidateTree(toolkitRoot),
    configurationDigest: await digestCandidateTree(path.join(root, 'config')),
  };
  return { schemaVersion: 1, candidateRoot: root, provenance, payloadDigest, identity: { ...identity, artifactDigest: hash(JSON.stringify({ provenance, payloadDigest, identity })) } };
}

export async function verifyCandidateArtifact(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || !path.isAbsolute(manifest.candidateRoot ?? '')) throw new Error('Invalid candidate artifact manifest');
  const observed = await describeCandidateArtifact(manifest.candidateRoot, manifest.provenance);
  if (JSON.stringify(observed) !== JSON.stringify(manifest)) throw new Error('Candidate artifact identity mismatch: payload or provenance changed');
  return observed;
}
