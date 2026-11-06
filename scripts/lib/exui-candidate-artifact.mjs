import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { lstat, readFile, readdir, readlink, realpath, cp, lchmod } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import path from 'node:path';

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
// Bound per-file buffering while avoiding stream setup for the many small dependency files.
const MAX_BUFFERED_FILE_BYTES = 1024 * 1024;
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
      const replacement = replacements.get(relative);
      if (replacement != null) digest.update(hash(replacement));
      else if (stat.size <= MAX_BUFFERED_FILE_BYTES) digest.update(hash(await readFile(absolute)));
      else {
        const fileDigest = createHash('sha256');
        for await (const chunk of createReadStream(absolute)) fileDigest.update(chunk);
        digest.update(`sha256:${fileDigest.digest('hex')}`);
      }
    }
  }
  await visit('');
  return `sha256:${digest.digest('hex')}`;
}

export async function describeCandidateArtifact(candidateRoot, provenance) {
  if (!provenance || provenance.sourceMethod !== 'git-archive' || !/^[a-f0-9]{40}$/.test(provenance.webappCommit ?? '') || !/^[a-f0-9]{40}$/.test(provenance.sourceTree ?? '')) {
    throw new Error('Candidate requires an identified immutable git archive source');
  }
  if (!['linux/arm64', 'linux/amd64'].includes(provenance.platform) || !/^sha256:[a-f0-9]{64}$/.test(provenance.buildImage ?? '') || provenance.install !== 'immutable-offline') throw new Error('Candidate requires pinned Linux/arm64 or Linux/amd64 build and immutable offline install');
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

// Shared with scope and Hearing derivation; preserve the existing platform-specific copy behavior.
async function preserveSymlinkModes(source, destination) {
  // Darwin applies the caller's umask when fs.cp recreates a symlink.
  // Linux symlink modes are fixed and lchmod is unsupported.
  if (process.platform !== "darwin") return;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      const { mode } = await lstat(sourcePath);
      await lchmod(destinationPath, mode & 0o777);
    } else if (entry.isDirectory()) {
      await preserveSymlinkModes(sourcePath, destinationPath);
    }
  }
}
export async function copyCandidateArtifact(source, destination) {
  await cp(source, destination, { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE });
  await preserveSymlinkModes(source, destination);
}

// Derivations write only to regular canonical files in a fresh disjoint output.
// These guards assume a quiescent caller-owned filesystem, not a privileged concurrent writer.
export async function assertCandidateDerivationTarget(file) {
  assert(
    (await lstat(file)).isFile(),
    'CANDIDATE_DERIVATION_TARGET_REGULAR_FILE_REQUIRED',
  );
  assert.equal(await realpath(file), file, 'CANDIDATE_DERIVATION_TARGET_ALIAS');
}
export async function assertFreshCandidateDerivationOutput({
  baseline,
  manifestPath,
  output,
}) {
  const destination = path.resolve(output);
  assert.equal(
    await realpath(path.dirname(destination)),
    path.dirname(destination),
    'CANDIDATE_DERIVATION_OUTPUT_ALIAS',
  );
  const within = (root, file) => {
    const relative = path.relative(root, file);
    return (
      relative === '' ||
      (!path.isAbsolute(relative) &&
        relative !== '..' &&
        !relative.startsWith('..' + path.sep))
    );
  };
  assert(
    !within(baseline.candidateRoot, destination) &&
      !within(destination, baseline.candidateRoot) &&
      !within(destination, manifestPath),
    'CANDIDATE_DERIVATION_OUTPUT_INPUT_OVERLAP',
  );
  try {
    await lstat(destination);
    throw Error('FRESH_CANDIDATE_DERIVATION_OUTPUT_REQUIRED');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return destination;
}
