#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { installCancellationCleanup } from './lib/exui-oci-runtime.mjs';
import { describeCandidateArtifact, verifyCandidateArtifact } from './lib/exui-candidate-artifact.mjs';
import { candidateBuildPlatform, readCandidateBuildContract, assertCandidateBuildRuntime, candidateBuildContainerArguments } from './lib/exui-candidate-build.mjs';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--source', '--commit', '--output', '--cache', '--platform'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: prepare-harness-candidate.mjs --source <git-repo> --commit <40sha> --output <new-directory> [--cache <seeded-yarn-cache>] [--platform linux/arm64|linux/amd64]');
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.source || !options.output || !/^[a-f0-9]{40}$/.test(options.commit ?? '')) throw new Error('Explicit source, immutable 40-character commit and fresh output are required');
const target = candidateBuildPlatform(options.platform ?? 'linux/arm64');
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
const contract = readCandidateBuildContract(
  JSON.parse(run('git', ['-C', source, 'show', `${options.commit}:package.json`])),
  run('git', ['-C', source, 'show', `${options.commit}:.yarnrc.yml`])
);
const yarnEntry = run('git', ['-C', source, 'ls-tree', options.commit, '--', contract.yarnPath]);
if (!/^100(?:644|755) blob /.test(yarnEntry)) throw new Error('Yarn release must be a committed regular file');
const buildImageReference = target.imageReference;
const buildImage = run('docker', ['image', 'inspect', buildImageReference, '--format', '{{.Id}}']);
const imagePlatform = run('docker', ['image', 'inspect', buildImageReference, '--format', '{{.Os}}/{{.Architecture}}']);
if (imagePlatform !== target.platform) throw new Error('LINUX_BUILD_PLATFORM_MISMATCH');
const buildRuntime = JSON.parse(run('docker', ['run', '--rm', '--network', 'none', '--platform', target.platform, buildImage, 'node', '-p', 'JSON.stringify({nodeVersion:process.version,platform:process.platform,architecture:process.arch,osRelease:require("node:fs").readFileSync("/etc/os-release","utf8")})']));
assertCandidateBuildRuntime(contract, { platform: imagePlatform }, buildRuntime);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output); // Never overwrite an earlier candidate or build.
const build = path.join(output, 'build');
await mkdir(build);
run('git', ['-C', source, 'archive', '--format=tar', `--output=${path.join(output, 'source.tar')}`, options.commit]);
run('tar', ['-xf', path.join(output, 'source.tar'), '-C', build]);
const yarnVersion = run('docker', ['run', '--rm', '--network', 'none', '--platform', target.platform, '--mount', `type=bind,src=${build},dst=/build,readonly`, '--workdir', '/build', buildImage, 'node', contract.yarnPath, '--version']);
if (yarnVersion !== contract.yarnVersion) throw new Error('Committed Yarn executable version disagrees with packageManager');
await cp(options.cache ? path.resolve(options.cache) : path.join(source, '.yarn/cache'), path.join(build, '.yarn/cache'), { recursive: true });
const script = [
  'set -eu',
  'export HOME=/tmp/build-home CI=1 YARN_ENABLE_NETWORK=0 YARN_ENABLE_SCRIPTS=0 YARN_ENABLE_IMMUTABLE_INSTALLS=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PUPPETEER_SKIP_DOWNLOAD=1 HUSKY=0',
  'mkdir -p "$HOME"',
  `node ${contract.yarnPath} install --immutable --immutable-cache`,
  `node ${contract.yarnPath} build`,
  `node ${contract.yarnPath} workspaces focus --all --production`,
  'mkdir runtime && cp /usr/local/bin/node runtime/node',
].join('\n');
const owner = `harness-archive-${randomUUID()}`;
let containerId;
const resources = new Map();
const inspectBuild = () => JSON.parse(run('docker', ['inspect', containerId], { timeout: 10000 }))[0];
function removeBuild(id, expectedOwner) {
  const info = JSON.parse(run('docker', ['inspect', id], { timeout: 10000 }))[0];
  if (info.Config.Labels?.['exui.harness.owner'] !== expectedOwner || info.Image !== buildImage) throw new Error('BUILD_CONTAINER_OWNERSHIP_MISMATCH');
  run('docker', ['rm', '-f', id], { timeout: 10000 });
  resources.delete(id);
}
const recordBuild = (result) => writeFileSync(path.join(output, 'build-execution.json'), JSON.stringify({ owner, containerId, buildImage, buildImageReference, sourceCommit: options.commit, ...result }, null, 2) + '\n', { mode: 0o600 });
const uninstallCancellation = installCancellationCleanup({ resources, remove: removeBuild, onCancel: (signal) => recordBuild({ terminalState: 'interrupted', requestedSignal: signal, exitCode: null }) });
try {
  containerId = run('docker', candidateBuildContainerArguments({ owner, build, image: buildImage, script, platform: target.platform, uid: process.getuid(), gid: process.getgid() }));
  resources.set(containerId, owner);
  recordBuild({ terminalState: 'created', exitCode: null, limits: { memoryBytes: 8589934592, cpus: 4, pids: 512, init: true } });
  const client = spawn('docker', ['start', '--attach', containerId], { env, stdio: 'inherit' });
  const terminal = await new Promise((resolve, reject) => { client.once('error', reject); client.once('exit', (code, signal) => resolve({ code, signal })); });
  const info = inspectBuild();
  recordBuild({ terminalState: 'completed', clientExit: terminal, exitCode: info.State.ExitCode, state: info.State, user: info.Config.User, limits: { memoryBytes: info.HostConfig.Memory, nanoCpus: info.HostConfig.NanoCpus, pids: info.HostConfig.PidsLimit, init: info.HostConfig.Init } });
  if (info.Config.User !== `${process.getuid()}:${process.getgid()}`) throw new Error('BUILD_CONTROLLER_IDENTITY_MISMATCH');
  if (terminal.code !== 0 || terminal.signal || info.State.Running || info.State.Status !== 'exited' || info.State.ExitCode !== 0 || info.State.OOMKilled || info.State.Error) throw new Error('ARCHIVE_BUILD_FAILED');
} finally {
  try { if (containerId) removeBuild(containerId, owner); } finally { uninstallCancellation(); }
}

const runtimeNodeVersion = run('docker', ['run', '--rm', '--network', 'none', '--platform', target.platform, '--mount', `type=bind,src=${build},dst=/build,readonly`, '--workdir', '/build', buildImage, './runtime/node', '--version']);
if (runtimeNodeVersion !== buildRuntime.nodeVersion) throw new Error('Sealed runtime Node version differs from observed build Node');
const candidateRoot = path.join(output, 'artifact');
await mkdir(candidateRoot);
for (const entry of ['dist', 'api', 'config', 'node_modules', 'package.json', 'yarn.lock', 'runtime']) await rename(path.join(build, entry), path.join(candidateRoot, entry));
const provenance = { sourceMethod: 'git-archive', webappCommit: options.commit, sourceTree, platform: target.platform, buildImage, buildImageReference, nodeVersion: buildRuntime.nodeVersion, runtimeNodeVersion, sourceNodeEngine: contract.nodeEngine, yarnVersion, yarnPath: contract.yarnPath, install: 'immutable-offline', commands: ['yarn install --immutable --immutable-cache', 'yarn build', 'yarn workspaces focus --all --production', 'cp /usr/local/bin/node runtime/node'], scriptsEnabled: false };
const manifestPath = path.join(output, 'candidate-artifact.json');
await writeFile(manifestPath, `${JSON.stringify(await describeCandidateArtifact(candidateRoot, provenance), null, 2)}\n`);
await verifyCandidateArtifact(manifestPath);
await rm(path.join(output, 'source.tar'));
process.stdout.write(`${manifestPath}\n`);
