// Frozen digest algorithm from 210f5249cbeb3a25ebcd3fdf705c3f768de53021; independent compatibility oracle.
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
