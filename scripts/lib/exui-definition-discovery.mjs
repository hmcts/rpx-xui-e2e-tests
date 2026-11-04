import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { isDeepStrictEqual, TextDecoder } from 'node:util';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { buildDefinitionReferenceGraph, definitionDigest, validateDefinitionProjection } from './exui-definition-references.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const relative = value => typeof value === 'string' && !value.startsWith('/') && !value.includes('\\') && value.split('/').every(x => x && x !== '.' && x !== '..');
const emptyGraph = () => ({ schemaVersion: 1, nodes: [], edges: [], gaps: [], dependencies: {} });
function contract(review) {
  const selected = review?.definitionDiscovery;
  assert(selected?.schemaVersion === 1 && selected.repository === 'prl-ccd-definitions' && relative(selected.root) &&
    /^[a-f0-9]{40}$/.test(selected.revision) && /^[a-f0-9]{40}$/.test(selected.gitTree), 'DEFINITION_DISCOVERY_REVIEW_REQUIRED');
  validateDefinitionProjection(selected.projection);
  for (const item of selected.projection) assert(item.path.startsWith(selected.root + '/'), 'PROJECTION_OUTSIDE_DEFINITION_ROOT');
  return selected;
}
function canonicalRoot(root) {
  assert(typeof root === 'string' && path.isAbsolute(root), 'DEFINITION_ROOT_ABSOLUTE_REQUIRED');
  const resolved = path.resolve(root);
  assert(fs.realpathSync(resolved) === resolved, 'DEFINITION_SOURCE_ALIAS');
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    assert(!fs.lstatSync(current).isSymbolicLink(), 'DEFINITION_SOURCE_ALIAS');
  }
  assert(fs.statSync(resolved).isDirectory(), 'DEFINITION_SOURCE_DIRECTORY_REQUIRED');
  return resolved;
}
function gitRead(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024,
  });
}
function expectedBaseline(root, reviewed) {
  const result = { status: 'unavailable', observedHead: null, gitTree: null, entries: [], diffs: [] };
  try { result.observedHead = gitRead(root, ['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim(); } catch { /* explicit unavailable below */ }
  try {
    const revision = gitRead(root, ['rev-parse', '--verify', `${reviewed.revision}^{commit}`]).toString().trim();
    assert.equal(revision, reviewed.revision, 'EXPECTED_DEFINITION_REVISION_MISMATCH');
    result.gitTree = gitRead(root, ['rev-parse', `${reviewed.revision}:${reviewed.root}`]).toString().trim();
    assert.equal(result.gitTree, reviewed.gitTree, 'EXPECTED_DEFINITION_TREE_MISMATCH');
    const raw = gitRead(root, ['ls-tree', '-r', '-z', reviewed.revision, '--', reviewed.root]).toString();
    result.entries = raw.split('\0').filter(Boolean).map(line => {
      const [header, file] = line.split('\t');
      const [mode, type, gitBlob] = header.split(' ');
      assert(relative(file) && file.startsWith(reviewed.root + '/'), 'INVALID_EXPECTED_DEFINITION_PATH');
      return { path: file, mode, type, gitBlob };
    }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    result.status = 'available';
  } catch (error) {
    result.reason = error.code === 'ERR_ASSERTION' ? error.message : 'local-git-object-unavailable';
  }
  return result;
}
function parseDocument(file, bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const value = JSON.parse(text);
  // This dependency is intentionally confined to live source parsing, never native summary imports.
  const ts = createRequire(import.meta.url)('typescript');
  const source = ts.parseJsonText(file, text);
  assert.equal(source.parseDiagnostics.length, 0, `JSON_AST_INCONSISTENCY:${file}`);
  const visit = node => {
    if (ts.isObjectLiteralExpression(node)) {
      const names = new Set();
      for (const property of node.properties) {
        assert(ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name), `JSON_AST_INCONSISTENCY:${file}`);
        const name = property.name.text;
        assert(!names.has(name), `duplicate-json-key:${file}:${name}`); names.add(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const array = Array.isArray(value) && value.every(row => row && typeof row === 'object' && !Array.isArray(row));
  return { path: file, format: array ? 'array' : Array.isArray(value) ? 'unsupported-array' : typeof value === 'object' && value !== null ? 'object' : typeof value,
    rows: array ? value.map((row, index) => ({ index, value: row, rowDigest: definitionDigest(row) })) : [] };
}

export function collectDefinitionDiscovery({ repositoryRoot, review }) {
  const reviewed = contract(review), root = canonicalRoot(repositoryRoot);
  const directory = canonicalRoot(path.join(root, reviewed.root));
  const entries = [], rawFiles = [], documents = [], gaps = [];
  function walk(current) {
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name), rel = path.relative(root, file).split(path.sep).join('/');
      assert(relative(rel), 'INVALID_DEFINITION_PATH');
      const info = fs.lstatSync(file);
      if (info.isDirectory()) { assert.equal(fs.realpathSync(file), file, 'DEFINITION_SOURCE_ALIAS'); walk(file); continue; }
      if (!info.isFile()) {
        entries.push({ path: rel, kind: info.isSymbolicLink() ? 'symlink' : 'special' });
        gaps.push(`nonregular-entry:${rel}`); continue;
      }
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      let bytes;
      try {
        const before = fs.fstatSync(fd); assert(before.isFile(), 'DEFINITION_REGULAR_FILE_REQUIRED');
        bytes = fs.readFileSync(fd); const after = fs.fstatSync(fd), currentInfo = fs.lstatSync(file);
        assert(before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs &&
          currentInfo.ino === after.ino && currentInfo.dev === after.dev && !currentInfo.isSymbolicLink(), 'DEFINITION_CHANGED_DURING_READ');
      } finally { fs.closeSync(fd); }
      const entry = { path: rel, kind: 'regular-file', bytes: bytes.length, sha256: sha(bytes), gitBlob: blob(bytes), mode: info.mode & 0o111 ? '100755' : '100644' };
      entries.push(entry); rawFiles.push({ path: rel, base64: bytes.toString('base64') });
      if (!rel.endsWith('.json')) { gaps.push(`unsupported-extension:${rel}`); documents.push({ path: rel, format: 'unsupported-extension', rows: [] }); continue; }
      try { documents.push(parseDocument(rel, bytes)); }
      catch (error) {
        gaps.push(error.message.includes('duplicate-json-key:') ? error.message : `unsupported-json:${rel}`);
        documents.push({ path: rel, format: 'invalid-json', rows: [] });
      }
    }
  }
  walk(directory); entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const baseline = expectedBaseline(root, reviewed);
  if (baseline.status === 'available') {
    const expected = new Map(baseline.entries.map(entry => [entry.path, entry]));
    const actual = new Map(entries.map(entry => [entry.path, entry]));
    for (const entry of entries) {
      const prior = expected.get(entry.path);
      if (!prior) baseline.diffs.push(`definition-file-added:${entry.path}`);
      else if (entry.kind !== 'regular-file' || prior.type !== 'blob' || entry.mode !== prior.mode || entry.gitBlob !== prior.gitBlob)
        baseline.diffs.push(`definition-file-changed:${entry.path}`);
    }
    for (const entry of baseline.entries) if (!actual.has(entry.path)) baseline.diffs.push(`definition-file-removed:${entry.path}`);
  } else gaps.push('definition-baseline-comparison-unavailable');
  let graph;
  try { graph = buildDefinitionReferenceGraph({ documents, projection: reviewed.projection }); }
  catch (error) { graph = emptyGraph(); gaps.push(`definition-projection-incomplete:${error.message}`); }
  return { schemaVersion: 1, evidenceMode: 'live-source', repositoryRoot: root, repository: reviewed.repository,
    revision: reviewed.revision, root: reviewed.root, observedHead: baseline.observedHead, gitTree: baseline.gitTree,
    entries, rawFiles, baseline, graph, gaps };
}

export function summarizeDefinitionDiscovery(discovery) {
  if (discovery?.evidenceMode === 'pinned-summary') return {
    ...Object.fromEntries(['schemaVersion', 'evidenceMode', 'repository', 'revision', 'root', 'gitTree', 'pins'].map(key => [key, discovery[key]])),
    graphAvailable: false, narrowingAllowed: false,
  };
  const regular = discovery.entries.filter(entry => entry.kind === 'regular-file');
  const manifest = regular.map(({ path: file, bytes, sha256 }) => ({ path: file, kind: 'regular-file', bytes, sha256 })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { schemaVersion: 1, evidenceMode: 'pinned-summary', repository: discovery.repository, revision: discovery.revision,
    root: discovery.root, gitTree: discovery.gitTree, graphAvailable: false, narrowingAllowed: false,
    pins: { manifestDigest: definitionDigest(manifest), graphDigest: definitionDigest(discovery.graph), files: discovery.entries.length,
      regularFiles: regular.length, bytes: regular.reduce((sum, entry) => sum + entry.bytes, 0), rows: discovery.graph.nodes.length,
      edges: discovery.graph.edges.length, graphGaps: discovery.graph.gaps.length } };
}

export function buildDefinitionRootInventory({ profiles, discoveryValidation }) {
  assert(Array.isArray(profiles) && profiles.length, 'SERVICE_DEFINITION_PROFILES_REQUIRED');
  const live = discoveryValidation?.inventory;
  const pinned = Boolean(discoveryValidation?.errors?.length === 0 && live?.baseline?.status === 'available' &&
    Array.isArray(live.baseline.diffs) && live.baseline.diffs.length === 0 && live.observedHead === live.revision && live.summary?.revision === live.revision &&
    live.summary?.repository === live.repository && live.summary?.root === live.root && live.summary?.gitTree === live.gitTree &&
    live.summary?.pins);
  const discoveredRepository = pinned ? `hmcts/${live.repository}` : null;
  const roots = [], gaps = [], families = new Set();
  for (const profile of profiles) {
    assert(typeof profile.serviceFamily === 'string' && !families.has(profile.serviceFamily), 'INVALID_SERVICE_DEFINITION_FAMILY');
    families.add(profile.serviceFamily);
    assert(profile.repos === undefined || Array.isArray(profile.repos), `INVALID_SERVICE_DEFINITION_REPOSITORIES:${profile.serviceFamily}`);
    const repositories = profile.repos ?? [];
    if (!repositories.length) {
      roots.push({ serviceFamily: profile.serviceFamily, repository: null, root: null, declaredRevision: null,
        status: 'unavailable', reason: 'no-repository-declared' });
      gaps.push(`definition-root-unavailable:${profile.serviceFamily}:no-repository-declared`);
      continue;
    }
    for (const repository of repositories) {
      assert(typeof repository.fullName === 'string' && relative(repository.definitionRoot),
        `INVALID_SERVICE_DEFINITION_ROOT:${profile.serviceFamily}`);
      const discovered = profile.serviceFamily === 'PRIVATELAW' && pinned &&
        repository.fullName === discoveredRepository && repository.definitionRoot === live.root;
      const root = { serviceFamily: profile.serviceFamily, repository: repository.fullName, root: repository.definitionRoot,
        declaredRevision: repository.revision ?? null,
        declaredRevisionBasis: repository.revision ? 'source-catalogue-metadata-only' : 'not-declared',
        status: discovered ? 'discovered-and-byte-pinned' : 'unreviewed' };
      if (discovered) {
        root.discoveryRevision = live.revision;
        root.discoveryGitTree = live.gitTree;
        root.referenceGaps = discoveryValidation.graph?.gaps?.length ?? null;
      } else gaps.push(`definition-root-unreviewed:${repository.fullName}:${repository.definitionRoot}`);
      roots.push(root);
    }
  }
  const discoveredRoots = roots.filter(item => item.status === 'discovered-and-byte-pinned').length;
  return { schemaVersion: 1, source: 'src/data/exui-central-assurance-source.json#serviceDefinitionProfiles',
    evidenceMode: 'declared-metadata-with-reviewed-root-match',
    counts: { declaredProfiles: profiles.length, declaredRoots: roots.filter(item => item.repository).length,
      discoveredRoots, unreviewedRoots: roots.filter(item => item.status === 'unreviewed').length,
      unavailableFamilies: roots.filter(item => item.status === 'unavailable').length }, roots, gaps };
}

export function validateDefinitionDiscovery({ discovery, review }) {
  const errors = [], gaps = [];
  let reviewed;
  try { reviewed = contract(review); } catch { return { errors: ['definition-discovery-review-required'], gaps: [], summary: null, graph: null, inventory: null, canFocus: false }; }
  if (!discovery) return { errors: ['definition-discovery-required'], gaps: [], summary: null, graph: null, inventory: null, canFocus: false };
  let actual = discovery, graph = null;
  if (discovery.evidenceMode === 'live-source') {
    // Re-read actual bytes and local expected Git objects: captured or forged readiness cannot authorize narrowing.
    try { actual = collectDefinitionDiscovery({ repositoryRoot: discovery.repositoryRoot, review }); }
    catch (error) { return { errors: [`definition-live-read-failed:${error.message}`], gaps: [], summary: null, graph: null, inventory: null, canFocus: false }; }
    graph = actual.graph;
    for (const error of actual.baseline.diffs) errors.push(error);
    for (const gap of actual.gaps) gaps.push(gap);
    for (const item of graph.gaps) gaps.push(`${item.kind}:${item.id}`);
    if (actual.observedHead !== reviewed.revision) errors.push('definition-source-revision-drift');
    if (actual.gitTree !== reviewed.gitTree && actual.baseline.status === 'available') errors.push('definition-source-tree-drift');
  } else if (discovery.evidenceMode === 'pinned-summary') gaps.push(`definition-discovery-graph-unavailable:${reviewed.repository}`);
  else errors.push('invalid-definition-discovery-mode');
  const summary = ['live-source', 'pinned-summary'].includes(actual.evidenceMode) ? summarizeDefinitionDiscovery(actual) : null;
  for (const name of ['repository', 'revision', 'root', 'gitTree']) if (summary?.[name] !== reviewed[name]) errors.push(`definition-discovery-${name}-drift`);
  if (!reviewed.pins || !isDeepStrictEqual(summary?.pins, reviewed.pins)) errors.push('definition-discovery-pin-drift');
  if (graph) {
    const paths = new Map(graph.nodes.map(node => [node.id, node.path]));
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    for (const witness of reviewed.referenceWitnesses ?? []) {
      const matches = graph.edges.filter(edge => {
        const node = nodes.get(edge.source);
        return node.path === witness.sourcePath && node.index === witness.row && edge.kind === witness.kind &&
          edge.target === witness.target && edge.status === witness.status &&
          isDeepStrictEqual(edge.candidates.map(id => paths.get(id)).sort(), witness.candidatePaths);
      });
      if (matches.length !== 1) errors.push(`definition-reference-witness-drift:${witness.sourcePath}#${witness.row}:${witness.kind}:${witness.target}`);
    }
  }
  for (const family of review.families ?? []) if (family !== 'PRIVATELAW') gaps.push(`definition-inventory-not-supplied:${family}`);
  const inventory = actual.evidenceMode === 'live-source' ? Object.fromEntries(
    ['schemaVersion', 'repository', 'revision', 'root', 'observedHead', 'gitTree', 'entries', 'baseline', 'gaps'].map(key => [key, actual[key]])) : null;
  if (inventory) inventory.summary = summary;
  return { errors: [...new Set(errors)], gaps: [...new Set(gaps)], summary, graph, inventory,
    canFocus: discovery.evidenceMode === 'live-source' && errors.length === 0 && gaps.length === 0 };
}

export function selectReviewedDefinitionSources({ discovery, review }) {
  const reviewed = contract(review);
  assert(discovery?.evidenceMode === 'live-source', 'LIVE_DEFINITION_PROJECTION_REQUIRED');
  const files = new Map(discovery.rawFiles.map(item => [item.path, item]));
  return reviewed.projection.map(selector => {
    const raw = files.get(selector.path); assert(raw, `PROJECTION_SOURCE_MISSING:${selector.path}`);
    const bytes = Buffer.from(raw.base64, 'base64'); assert.equal(bytes.toString('base64'), raw.base64, 'INVALID_SOURCE_BYTES');
    const entry = discovery.entries.find(item => item.path === selector.path);
    assert(entry?.kind === 'regular-file' && sha(bytes) === entry.sha256 && blob(bytes) === entry.gitBlob, 'PROJECTION_SOURCE_BYTE_MISMATCH');
    const parsed = parseDocument(selector.path, bytes); assert.equal(parsed.format, 'array', 'UNSUPPORTED_PROJECTION_DOCUMENT');
    const document = parsed.rows.map(row => row.value).filter(row => selector.allRows || selector.ids.includes(row.ID));
    if (selector.ids) for (const id of selector.ids) assert(document.some(row => row.ID === id), `PROJECTION_SELECTOR_NO_MATCH:${selector.path}:${id}`);
    return { repository: reviewed.repository, revision: discovery.observedHead, tracked: discovery.baseline.entries.some(item => item.path === selector.path),
      path: selector.path, fileDigest: entry.sha256, document };
  });
}
