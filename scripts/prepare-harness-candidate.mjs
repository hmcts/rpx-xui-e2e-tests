#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describeCandidateArtifact, verifyCandidateArtifact } from './lib/exui-candidate-artifact.mjs';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--source', '--commit', '--output', '--cache'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: prepare-harness-candidate.mjs --source <git-repo> --commit <40sha> --output <new-directory> [--cache <seeded-yarn-cache>]');
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.source || !options.output || !/^[a-f0-9]{40}$/.test(options.commit ?? '')) throw new Error('Explicit source, immutable 40-character commit and fresh output are required');
const source = path.resolve(options.source);
const output = path.resolve(options.output);
// Child tools receive only transport essentials; no user credentials or service settings.
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONTEXT'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
function run(command, commandArgs, extra = {}) {
  const result = spawnSync(command, commandArgs, { env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...extra });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.error?.message ?? result.stderr ?? ''}`);
  return result.stdout?.trim();
}
if (run('git', ['-C', source, 'rev-parse', `${options.commit}^{commit}`]) !== options.commit) throw new Error('Source identity must name an exact commit object');
const sourceTree = run('git', ['-C', source, 'rev-parse', `${options.commit}^{tree}`]);
const buildImage = run('docker', ['image', 'inspect', 'node:20-bullseye', '--format', '{{.Id}}']);
if (run('docker', ['image', 'inspect', buildImage, '--format', '{{.Os}}/{{.Architecture}}']) !== 'linux/arm64') throw new Error('Cached build image must target Linux/arm64');
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output); // Never overwrite an earlier candidate or build.
const build = path.join(output, 'build');
await mkdir(build);
run('git', ['-C', source, 'archive', '--format=tar', `--output=${path.join(output, 'source.tar')}`, options.commit]);
run('tar', ['-xf', path.join(output, 'source.tar'), '-C', build]);
await cp(options.cache ? path.resolve(options.cache) : path.join(source, '.yarn/cache'), path.join(build, '.yarn/cache'), { recursive: true });
const script = [
  'set -eu',
  'export HOME=/tmp/build-home CI=1 YARN_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 YARN_ENABLE_IMMUTABLE_INSTALLS=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PUPPETEER_SKIP_DOWNLOAD=1 HUSKY=0',
  'mkdir -p "$HOME"',
  'node .yarn/releases/yarn-4.17.1.cjs install --immutable --immutable-cache',
  'node .yarn/releases/yarn-4.17.1.cjs build',
  'node .yarn/releases/yarn-4.17.1.cjs workspaces focus --all --production',
  'mkdir runtime && cp /usr/local/bin/node runtime/node',
].join('\n');
run('docker', ['run', '--rm', '--network', 'none', '--platform', 'linux/arm64', '--mount', `type=bind,src=${build},dst=/build`, '--workdir', '/build', buildImage, 'sh', '-c', script], { stdio: 'inherit' });
const candidateRoot = path.join(output, 'artifact');
await mkdir(candidateRoot);
for (const entry of ['dist', 'api', 'config', 'node_modules', 'package.json', 'yarn.lock', 'runtime']) await rename(path.join(build, entry), path.join(candidateRoot, entry));
const provenance = { sourceMethod: 'git-archive', webappCommit: options.commit, sourceTree, platform: 'linux/arm64', buildImage, install: 'immutable-offline', commands: ['yarn install --immutable --immutable-cache', 'yarn build', 'yarn workspaces focus --all --production', 'cp /usr/local/bin/node runtime/node'], scriptsEnabled: false };
const manifestPath = path.join(output, 'candidate-artifact.json');
await writeFile(manifestPath, `${JSON.stringify(await describeCandidateArtifact(candidateRoot, provenance), null, 2)}\n`);
await verifyCandidateArtifact(manifestPath);
await rm(path.join(output, 'source.tar'));
process.stdout.write(`${manifestPath}\n`);
