const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { completeRun, digest } = require('./fixtures/exui-release-evidence.mock.cjs');

const ROOT = path.resolve(__dirname, '..');
const SCOPE = 'exui-hearing-publication-pilot';
const MUTATION = 'hearing-amendments-use-enabled-map';
const PHASE = 'hearingPublication';
const INVOCATIONS = ['baseline', MUTATION];
const SOURCE_FILES = [
  "src/tests/harness/ccd/workbasket-inputs.spec.ts",
  "scripts/fixtures/ccd/workbasket-input.source.json",
  "scripts/fixtures/ccd/result-columns.source.json",
  "scripts/lib/exui-workbasket-input-definition.mjs",
  "scripts/lib/exui-workbasket-input-import.mjs",
  "scripts/lib/exui-result-columns-definition.mjs",
  "scripts/lib/exui-result-columns.mjs",
  "scripts/prepare-harness-workbasket-input.mjs",
  "src/tests/harness/ccd/source-shapes.spec.ts",
  "src/fixtures/harnessSourceShapes.ts",
  "scripts/lib/exui-source-shape-contract.mjs",
  "scripts/lib/exui-source-shape-dates.mjs",
  "scripts/lib/exui-recipient-callback-contract.mjs",
  "scripts/lib/exui-recipient-callback-observations.mjs",
  "src/fixtures/harnessCallbackJourney.ts",
  "src/tests/harness/ccd/recipient-callback.spec.ts",
  "scripts/lib/exui-recipient-callback-native-import.mjs",
  "scripts/lib/exui-recipient-callback-transition.mjs",
  "scripts/lib/exui-recipient-callback-facets.mjs",
  "scripts/lib/exui-recipient-callback-import.mjs",
  "scripts/lib/exui-recipient-callback-diagnostics.mjs",
  "scripts/fixtures/ccd/recipient-callback-native/baseline/definition.json",
  "scripts/fixtures/ccd/recipient-callback-native/baseline/definition.xlsx",
  "scripts/fixtures/ccd/recipient-callback-native/baseline/binding.json",
  "scripts/fixtures/ccd/recipient-callback-native/binding-omitted/definition.json",
  "scripts/fixtures/ccd/recipient-callback-native/binding-omitted/definition.xlsx",
  "scripts/fixtures/ccd/recipient-callback-native/binding-omitted/binding.json",

  "scripts/fixtures/ccd/event-capability/shape-case-field-recipient-selector-mutant.json",
  "scripts/fixtures/ccd/event-capability/shape-case-field-recipient-selector-mutant.xlsx",
  "scripts/fixtures/ccd/event-capability/shape-required-delivery-radio-mutant.json",
  "scripts/fixtures/ccd/event-capability/shape-required-delivery-radio-mutant.xlsx",
  "scripts/fixtures/ccd/event-capability/shape-conditional-email-complex-mutant.json",
  "scripts/fixtures/ccd/event-capability/shape-conditional-email-complex-mutant.xlsx",
  "scripts/fixtures/ccd/event-capability/shape-conditional-postal-complex-mutant.json",
  "scripts/fixtures/ccd/event-capability/shape-conditional-postal-complex-mutant.xlsx",
  "scripts/fixtures/ccd/event-capability/shape-optional-postal-line-two-mutant.json",
  "scripts/fixtures/ccd/event-capability/shape-optional-postal-line-two-mutant.xlsx",

  'package.json', 'yarn.lock', 'tsconfig.json', 'playwright.harness.config.ts',
  'src/harness/candidate.ts', 'src/fixtures/harness.ts', 'src/fixtures/harnessIdentity.ts',
  'src/fixtures/harnessRouting.ts', 'src/harness/routing.ts', 'src/harness/globalSearch.ts',
  'src/harness/hearingPublication.ts', 'src/tests/harness/hearing-publication/capabilities.spec.ts',
  'src/fixtures/harnessGlobalSearch.ts', 'src/tests/harness/global-search/capability-composition.spec.ts',
  'src/tests/harness/routing/create-entry.spec.ts', 'src/tests/harness/routing/noc-cache.spec.ts',
  'src/fixtures/harnessCcd.ts', 'src/fixtures/harnessCcdEvent.ts',
  'src/tests/harness/ccd/courtadmin-read.spec.ts', 'src/tests/harness/ccd/readonly-update.spec.ts',
  'src/tests/harness/ccd/courtadmin-cell.spec.ts', 'src/tests/harness/ccd/event-capability.spec.ts',
  'src/tests/harness/wa/family-scope.spec.ts',
  'src/tests/harness/scope/organisation-case.spec.ts', 'src/tests/harness/ccd/nested-conditional.spec.ts',
  'src/tests/harness/ccd/case-event-policy.spec.ts', 'src/tests/harness/ccd/role-revocation.spec.ts', 'src/tests/harness/ccd/postal-conditional.spec.ts',
  'scripts/run-harness-candidate.mjs', 'scripts/run-harness-ccd-candidate.mjs',
  'scripts/run-harness-native-tools.mjs', 'scripts/prepare-harness-scope-mutant.mjs',
  'scripts/prepare-harness-hearing-mutant.mjs', 'scripts/prepare-harness-event-capability.mjs',
  'scripts/lib/exui-hearing-publication-mutation.mjs',
  'scripts/fixtures/exui-configuration-review.json', 'scripts/fixtures/exui-configuration-source.json',
  'scripts/fixtures/ccd/linux-amd64-images.json', 'scripts/fixtures/ccd/nested-prl.json', 'scripts/fixtures/ccd/nested-prl.binding.json',
  'scripts/fixtures/ccd/elasticsearch-images.json',
  'scripts/fixtures/ccd/nested-prl.xlsx',
  'scripts/fixtures/ccd/event-capability.source.json',
  'scripts/fixtures/ccd/shared-policy-sources.json',
  'scripts/fixtures/ccd/shared-role-write-collection.source.txt',
  'scripts/fixtures/ccd/event-capability/baseline.json', 'scripts/fixtures/ccd/event-capability/baseline.xlsx',
  'scripts/fixtures/ccd/event-capability/mutant.json', 'scripts/fixtures/ccd/event-capability/mutant.xlsx',
  'scripts/fixtures/ccd/event-capability/read-mutant.json', 'scripts/fixtures/ccd/event-capability/read-mutant.xlsx',
  'scripts/fixtures/ccd/event-capability/readonly-read-mutant.json', 'scripts/fixtures/ccd/event-capability/readonly-read-mutant.xlsx',
  'scripts/fixtures/ccd/event-capability/readonly-update-mutant.json', 'scripts/fixtures/ccd/event-capability/readonly-update-mutant.xlsx',
  'scripts/fixtures/ccd/event-capability/courtadmin-update-mutant.json', 'scripts/fixtures/ccd/event-capability/courtadmin-update-mutant.xlsx',
  'scripts/fixtures/ccd/event-capability/binding.json', 'scripts/fixtures/ccd/workbook.py',
  'scripts/lib/exui-configuration-runtime-coverage.mjs',
  'scripts/lib/exui-event-coverage-binding.mjs', 'scripts/lib/exui-native-proof-validation.mjs',
  'scripts/lib/exui-candidate-ci-evidence.mjs', 'scripts/lib/exui-native-ci-ownership.mjs',
  'scripts/lib/exui-native-sources.mjs', 'scripts/lib/exui-native-contract.mjs',
  'scripts/lib/exui-routing-contract.mjs', 'scripts/lib/exui-global-search-contract.mjs',
  'scripts/lib/exui-global-search-provider.mjs', 'scripts/lib/exui-routing-provider.mjs',
  'scripts/lib/exui-native-host.mjs', 'scripts/lib/exui-native-containers.mjs',
  'scripts/lib/exui-host-invocation.mjs', 'scripts/lib/exui-output-boundary.mjs',
  'scripts/lib/exui-candidate-runtime.mjs', 'scripts/lib/exui-candidate-child.mjs',
  'scripts/lib/exui-configuration-catalogue.mjs', 'scripts/lib/exui-shared-policy-contracts.mjs', 'scripts/lib/exui-definition-discovery.mjs',
  'scripts/lib/exui-shared-role-observations.mjs', 'scripts/lib/exui-shared-role-event-observations.mjs', 'scripts/lib/exui-shared-role-event-observations.d.mts', 'scripts/lib/exui-shared-role-observations.d.mts',
  'scripts/lib/exui-shared-role-artifacts.mjs', 'scripts/lib/exui-shared-role-toolkit.mjs',
  'scripts/lib/exui-shared-role-native-binding.mjs', 'scripts/replay-harness-shared-role.mjs',
  'scripts/lib/exui-shared-role-ccd-provenance.mjs', 'scripts/fixtures/ccd/shared-role-ccd-class-witnesses.json',
  'scripts/fixtures/ccd/shared-role-amd64-source-witnesses.json',
  'scripts/verify-shared-role-ccd-source.py', 'scripts/verify-shared-role-amd64-source.py', 'scripts/verify-local-ccd-oci.py',
  'scripts/lib/exui-definition-references.mjs', 'scripts/lib/exui-deployment-profiles.mjs',
  'scripts/lib/exui-provider-seams.mjs', 'scripts/lib/exui-runtime-network-guard.cjs',
  'scripts/lib/exui-candidate-artifact.mjs', 'scripts/lib/exui-evidence-io.mjs',
  'scripts/lib/exui-harness-dependencies.mjs', 'scripts/lib/exui-external-evidence.mjs',
  'scripts/lib/exui-playwright-evidence-reporter.mjs', 'scripts/lib/exui-release-evidence.mjs',
  'scripts/lib/exui-release-policy.mjs', 'scripts/lib/exui-oci-runtime.mjs',
  'scripts/lib/exui-ccd-role-transition.mjs', 'scripts/lib/exui-ccd-runtime.mjs',
  'scripts/lib/exui-ccd-event-capability.mjs', 'scripts/lib/exui-ccd-event-transition.mjs',
  'scripts/lib/exui-ccd-browser-runtime.mjs',
  'scripts/lib/exui-recipient-callback.mjs', 'scripts/lib/exui-recipient-callback-fixture.mjs',
  'scripts/lib/exui-recipient-callback-auth.mjs',
];

function temporary(t, prefix) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function artifacts(root) {
  const config = { services: { idam: {} }, feature: {}, waSupportedJurisdictions: 'IA,CIVIL', sentinel: 'same-input' };
  const baseline = completeRun().manifest.identity;
  const make = (name, artifactDigest) => {
    const candidateRoot = path.join(root, name);
    fs.mkdirSync(path.join(candidateRoot, 'config'), { recursive: true });
    fs.writeFileSync(path.join(candidateRoot, 'config/default.json'), JSON.stringify(config));
    return { candidateRoot, identity: { ...baseline, artifactDigest }, provenance: { platform: "linux/arm64", runtimeNodeVersion: 'v24.22.1' } };
  };
  return { artifact: make('baseline', digest('a')), mutantArtifact: make('derived', digest('f')) };
}

test('support only: Hearing policy binds exact publication proof and fault without expanding fixed CI', async () => {
  const { getReleasePolicy } = await import('./lib/exui-release-policy.mjs');
  const { nativeInvocations } = await import('./lib/exui-native-contract.mjs');
  const policy = getReleasePolicy(SCOPE);
  assert.deepEqual(policy.requiredObligationIds, ['hearing-published-capabilities']);
  assert.deepEqual(policy.obligations, [{
    id: 'hearing-published-capabilities', boundary: 'candidate',
    requiredProofIds: ['hearing-prod-capabilities'], requiredMutationIds: [MUTATION],
  }]);
  assert.equal(policy.mutationDefinitions.length, 1);
  const { definitionDigest, ...mutation } = policy.mutationDefinitions[0];
  assert.match(definitionDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(mutation, {
    mutationId: MUTATION, obligationId: 'hearing-published-capabilities',
    expectedFailureId: 'hearing-amendment-capability-map',
    baselineProofId: 'hearing-prod-capabilities', mutantProofId: 'hearing-amendment-map-broadened',
  });
  assert.deepEqual(nativeInvocations(SCOPE), [
    { invocationId: 'baseline', kind: 'baseline', mutation: null },
    { invocationId: MUTATION, kind: 'mutation', mutation: MUTATION },
  ]);
  const calls = [];
  await (await import('./run-harness-ci.mjs')).runFixedCiPilots({
    phase: async name => { calls.push(name); return { status: 'PASS', exitCode: 0 }; },
    derive: async () => {}, start: async () => {}, stop: async () => {},
    startEvent: async () => {}, stopEvent: async () => {}, startCallback: async () => {}, stopCallback: async () => {},
  });
  assert.deepEqual(calls, ['family', 'scope', 'ccd', 'eventCapability', 'routing', 'recipientCallback']);
});

test('support only: Hearing selects the derived artifact while retaining identical effective configuration', async t => {
  const { nativeInvocation, nativeIdentity, selectedArtifact } = await import('./lib/exui-native-contract.mjs');
  const input = { releaseScopeId: SCOPE, ...artifacts(temporary(t, 'hearing-identity-')) };
  const baseline = nativeInvocation(input, 'baseline'), mutant = nativeInvocation(input, MUTATION);
  assert.equal(selectedArtifact(input, baseline), input.artifact);
  assert.equal(selectedArtifact(input, mutant), input.mutantArtifact);
  const a = nativeIdentity(input, baseline, input.artifact.candidateRoot);
  const b = nativeIdentity(input, mutant, input.mutantArtifact.candidateRoot);
  assert.deepEqual(b.config, a.config);
  assert.equal(b.identity.configurationDigest, a.identity.configurationDigest);
  assert.equal(a.identity.artifactDigest, input.artifact.identity.artifactDigest);
  assert.equal(b.identity.artifactDigest, input.mutantArtifact.identity.artifactDigest);
  assert.notEqual(b.identity.artifactDigest, a.identity.artifactDigest);
  assert.deepEqual({ ...b.identity, artifactDigest: a.identity.artifactDigest }, a.identity);
  for (const id of ['wa-drop-family', 'global-search-wa-capability', 'unknown'])
    assert.throws(() => nativeInvocation(input, id), /UNKNOWN_NATIVE_INVOCATION/);
  assert.throws(() => nativeInvocation({ releaseScopeId: 'unknown' }, 'baseline'), /UNSUPPORTED_RELEASE_SCOPE/);
});

test('support only: native allowlists admit the Hearing pair and reject wrong scopes, unknown IDs and OCI mutation', async t => {
  const { toolContainerArguments, candidateArchiveArguments } = await import('./lib/exui-oci-runtime.mjs');
  const root = temporary(t, 'hearing-arguments-');
  const dirs = Object.fromEntries(['harnessRoot', 'dependenciesRoot', 'candidateRoot', 'output', 'browserRoot', 'sessions', 'diagnostics'].map(key => {
    const value = path.join(root, key); fs.mkdirSync(value); return [key, value];
  }));
  const guard = path.join(root, 'guard.cjs'); fs.writeFileSync(guard, 'readonly');
  const common = { ...dirs, image: digest('a'), owner: 'candidate-11111111-1111-4111-8111-111111111111', platform: 'linux/arm64' };
  const api = { ...common, guard, namespace: 'b'.repeat(64), config: {}, releaseScopeId: SCOPE, evidenceRoot: dirs.output };
  for (const invocationId of INVOCATIONS) {
    const tools = toolContainerArguments({ ...common, invocationId, native: true });
    assert(tools.includes(invocationId));
    assert.equal(tools[tools.indexOf('--network') + 1], 'none');
    assert(tools.includes('scripts/run-harness-native-tools.mjs'));
    const candidate = candidateArchiveArguments({ ...api, invocationId });
    assert.equal(candidate[candidate.indexOf('--network') + 1], 'container:' + 'b'.repeat(64));
    assert(!candidate.includes('--publish'));
  }
  assert.throws(() => toolContainerArguments({ ...common, invocationId: MUTATION, native: false }), /UNSUPPORTED_OCI_INVOCATION/);
  assert.throws(() => toolContainerArguments({ ...common, invocationId: 'unknown', native: true }), /UNSUPPORTED_OCI_INVOCATION/);
  assert.throws(() => candidateArchiveArguments({ ...api, invocationId: MUTATION, releaseScopeId: 'exui-wa-family-pilot' }), /HEARING_PUBLICATION_SCOPE_REQUIRED/);
  assert.throws(() => candidateArchiveArguments({ ...api, invocationId: 'wa-drop-family' }), /UNSUPPORTED_HEARING_PUBLICATION_INVOCATION/);
  assert.throws(() => candidateArchiveArguments({ ...api, invocationId: 'unknown' }), /UNSUPPORTED_NATIVE_INVOCATION/);
});

test('support only: exact shared closure and Hearing selector collect one API proof without execution', async t => {
  const { HARNESS_SOURCE_FILES } = await import('./lib/exui-candidate-runtime.mjs');
  assert.equal(SOURCE_FILES.length, 150);
  assert.deepEqual([...HARNESS_SOURCE_FILES].sort(), [...SOURCE_FILES].sort());
  const root = temporary(t, 'hearing-collection-');
  const { manifest } = completeRun();
  const policy = (await import('./lib/exui-release-policy.mjs')).getReleasePolicy(SCOPE);
  Object.assign(manifest, { releaseScopeId: SCOPE, policyDigest: policy.policyDigest, requiredObligationIds: policy.requiredObligationIds });
  const file = path.join(root, 'manifest.json'); fs.writeFileSync(file, JSON.stringify(manifest));
  const env = {
    PATH: process.env.PATH, EXUI_HARNESS_SELECTION: 'candidate', EXUI_HARNESS_SLICE: 'hearing-publication',
    EXUI_CANDIDATE_RUN_MANIFEST: file, EXUI_CANDIDATE_URL: 'http://127.0.0.1:3100',
    EXUI_EVIDENCE_CONTEXT: path.join(root, 'context.json'), EXUI_EVIDENCE_REPORT: path.join(root, 'report.json'),
  };
  const collect = override => spawnSync(process.execPath, [
    path.join(ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.harness.config.ts', '--list', '--reporter=json',
  ], { cwd: ROOT, env: { ...env, ...override }, encoding: 'utf8' });
  const result = collect({});
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const report = JSON.parse(result.stdout), specs = [];
  const visit = suite => { specs.push(...(suite.specs ?? [])); for (const child of suite.suites ?? []) visit(child); };
  for (const suite of report.suites) visit(suite);
  assert.deepEqual(report.errors, []);
  assert.equal(specs.length, 1);
  assert.match(specs[0].file, /(?:^|\/)hearing-publication\/capabilities\.spec\.ts$/);
  assert.equal(specs[0].tests.length, 1);
  assert.deepEqual(specs[0].tests[0].results, []);
  const wrong = collect({ EXUI_HARNESS_SLICE: 'hearing-publications' });
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stdout + wrong.stderr, /UNKNOWN_HARNESS_SLICE/);
  assert(!fs.existsSync(env.EXUI_EVIDENCE_REPORT));
});

test('support only: both CI Hearing maps bind source, base identity and independently supplied derived artifact', async t => {
  const { captureCiPhaseExpectation } = await import('./lib/exui-candidate-ci-evidence.mjs');
  const { captureNativeOwnership } = await import('./lib/exui-native-ci-ownership.mjs');
  const { HARNESS_SOURCE_FILES } = await import('./lib/exui-candidate-runtime.mjs');
  const { digestBytes } = await import('./lib/exui-evidence-io.mjs');
  const root = temporary(t, 'hearing-ci-'), stateRoot = temporary(t, 'harness-native-state-');
  const dirs = Object.fromEntries(['browserRoot', 'output', 'stagedHarness'].map(key => {
    const value = path.join(root, key); fs.mkdirSync(value); return [key, value];
  }));
  fs.mkdirSync(path.join(dirs.stagedHarness, 'scripts/lib'), { recursive: true });
  fs.writeFileSync(path.join(dirs.stagedHarness, 'scripts/lib/exui-runtime-network-guard.cjs'), 'readonly');
  for (const id of INVOCATIONS) for (const dir of ['sessions', 'diagnostics'])
    fs.mkdirSync(path.join(stateRoot, id, dir), { recursive: true });
  const sourceDigest = digestBytes(JSON.stringify(HARNESS_SOURCE_FILES.map(file => [file, digestBytes(fs.readFileSync(path.join(ROOT, file)))])));
  const input = {
    releaseScopeId: SCOPE, runId: 'candidate-11111111-1111-4111-8111-111111111111',
    ...artifacts(root), browserRoot: dirs.browserRoot, browserRuntimeImage: digest('8'),
    nativeRuntime: { imageId: digest('7'), platform: 'linux/arm64' },
    harnessSources: HARNESS_SOURCE_FILES, harnessCommit: 'b'.repeat(40), harnessSourceState: 'clean',
    harnessSourceDigest: sourceDigest, harnessDependencies: { digest: digest('6') }, browserDigest: digest('5'),
  };
  const context = {
    artifact: structuredClone(input.artifact), mutantArtifact: structuredClone(input.mutantArtifact),
    identity: structuredClone(input.artifact.identity), nativeRuntime: structuredClone(input.nativeRuntime),
    browserRoot: input.browserRoot, browserRuntimeImage: input.browserRuntimeImage, commit: input.harnessCommit,
    dependencies: input.harnessDependencies, browserDigest: input.browserDigest, sourceDigests: { [PHASE]: sourceDigest },
  };
  const handoff = { ...dirs, mode: 'native-separate-api', stateRoot, owner: input.runId };
  const expected = captureCiPhaseExpectation(PHASE, input, handoff, context, dirs.output);
  assert.equal(expected.releaseScopeId, SCOPE);
  assert.equal(expected.policyDigest, (await import('./lib/exui-release-policy.mjs')).getReleasePolicy(SCOPE).policyDigest);
  assert.deepEqual(expected.identity, context.identity);
  assert.equal(expected.nativeAuthority, true);
  assert.equal(expected.harnessSourceDigest, sourceDigest);
  const capture = value => captureNativeOwnership(value, handoff, context, dirs.output, PHASE);
  const owned = capture(input);
  assert.deepEqual(owned.invocations.map(item => item.invocationId), INVOCATIONS);
  for (const [index, artifact] of [input.artifact, input.mutantArtifact].entries()) {
    for (const side of ['candidate', 'tools']) {
      const mount = owned.invocations[index].plan[side].mounts.find(item => item.target === '/candidate');
      assert.deepEqual(mount, { source: artifact.candidateRoot, target: '/candidate', writable: false });
    }
  }
  assert.throws(() => capture({ ...input, mutantArtifact: undefined }), /CI_NATIVE_MUTANT_MISMATCH/);
  assert.throws(() => capture({ ...input, mutantArtifact: input.artifact }), /CI_NATIVE_MUTANT_MISMATCH/);
  assert.throws(() => capture({ ...input, mutantArtifact: { ...input.mutantArtifact, identity: { ...input.mutantArtifact.identity, artifactDigest: digest('9') } } }), /CI_NATIVE_MUTANT_MISMATCH/);
  assert.throws(() => capture({ ...input, releaseScopeId: 'exui-wa-family-pilot' }), /CI_NATIVE_SCOPE_MISMATCH/);
  assert.throws(() => capture({ ...input, only: 'baseline' }), /CI_NATIVE_COMPLETE_SLICE_REQUIRED/);
  assert.throws(() => captureCiPhaseExpectation(PHASE, { ...input, harnessSources: HARNESS_SOURCE_FILES.slice(1) }, handoff, context, dirs.output), /CI_LAUNCH_SOURCE_INVENTORY_MISMATCH/);
  assert.throws(() => captureCiPhaseExpectation(PHASE, { ...input, artifact: input.mutantArtifact }, handoff, context, dirs.output), /CI_LAUNCH_ARTIFACT_MISMATCH/);
});
