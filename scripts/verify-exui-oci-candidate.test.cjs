const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  realpath,
} = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const descriptor = () => ({
  schemaVersion: 1,
  registry: "hmctsprod.azurecr.io",
  repository: "rpx/xui-webapp",
  digest: digest("a"),
  imageReference: `hmctsprod.azurecr.io/rpx/xui-webapp@${digest("a")}`,
  sourceCommit: "b".repeat(40),
  sourceTree: "c".repeat(40),
  producerJob: "HMCTS/rpx-xui-webapp/master",
  producerBuild: "41",
  invocationId: "e9fc2b21-e754-43d9-92bd-2f71452f5a14",
  buildTag: "build-e9fc2b21-e754-43d9-92bd-2f71452f5a14",
  platform: "linux/arm64",
  observedImageId: digest("d"),
});
const inspect = (candidate) => ({
  Id: candidate.observedImageId,
  Os: "linux",
  Architecture: "arm64",
  RepoDigests: [candidate.imageReference],
});
async function fixture(t) {
  const { digestCandidateTree } =
    await import("./lib/exui-candidate-artifact.mjs");
  const { digestBytes } = await import("./lib/exui-evidence-io.mjs");
  const root = await mkdtemp(path.join(os.tmpdir(), "oci-candidate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of [
    "dist/rpx-exui/browser",
    "dist/rpx-exui/api",
    "api",
    "config",
  ])
    await mkdir(path.join(root, name), { recursive: true });
  for (const [name, bytes] of Object.entries({
    "dist/rpx-exui/browser/index.html": "<app-root></app-root>",
    "dist/rpx-exui/api/server.bundle.js": "actual server bundle",
    "config/default.json": "{}",
    "api/package.json": '{"name":"jui"}',
    "yarn.lock": "locked dependencies",
    "package.json": '{"dependencies":{"@hmcts/ccd-case-ui-toolkit":"7.3.92"}}',
  }))
    await writeFile(path.join(root, name), bytes);
  const candidate = descriptor();
  const metadata = {
    schemaVersion: 1,
    provenance: {
      sourceMethod: "docker-build",
      sourceIdentity: "ci-supplied",
      webappCommit: candidate.sourceCommit,
      sourceTree: candidate.sourceTree,
      producerJob: candidate.producerJob,
      producerBuild: candidate.producerBuild,
      invocationId: candidate.invocationId,
      buildRuntime: {
        nodeVersion: "v24.22.1",
        platform: "linux",
        architecture: "arm64",
      },
    },
    identity: {
      webappCommit: candidate.sourceCommit,
      dependencyLockDigest: digestBytes("locked dependencies"),
      toolkitVersion: "7.3.92",
      toolkitDigest: digest("e"),
    },
  };
  for (const [key, relative] of Object.entries({
    configurationDigest: "config",
    frontendDigest: "dist/rpx-exui/browser",
    apiBundleDigest: "dist/rpx-exui/api",
    distDigest: "dist",
    apiSourceDigest: "api",
  }))
    metadata.identity[key] = await digestCandidateTree(
      path.join(root, relative),
    );
  return { root, candidate, metadata };
}

test("OCI identity binds the digest reference, inspected image configuration and platform", async () => {
  const { validateImageCandidate, assertCandidateImage } =
    await import("./lib/exui-oci-candidate.mjs");
  const candidate = descriptor();
  assert.deepEqual(validateImageCandidate(candidate), candidate);
  assertCandidateImage(candidate, inspect(candidate));
  // Docker engines expose configuration, manifest or index IDs for the same registry digest.
  assertCandidateImage(candidate, { ...inspect(candidate), Id: digest("f") });
  const local = {
    ...candidate,
    registry: "localhost:18501",
    imageReference: `localhost:18501/${candidate.repository}@${candidate.digest}`,
  };
  assert.deepEqual(validateImageCandidate(local), local);
  for (const patch of [
    { imageReference: "hmctsprod.azurecr.io/rpx/xui-webapp:latest" },
    { digest: digest("f") },
    { sourceCommit: "HEAD" },
    { sourceTree: "0".repeat(40) },
    { producerBuild: "lastSuccessfulBuild" },
    { producerBuild: "0" },
    { invocationId: "reused" },
    { platform: "linux/s390x" },
    { registry: "https://registry.example" },
    { registry: "localhost:0" },
    { registry: "localhost:65536" },
    { registry: "user@registry.example" },
    { repository: "../other" },
  ]) {
    assert.throws(() => validateImageCandidate({ ...candidate, ...patch }));
  }
  for (const patch of [
    { Id: "mutable-image" },
    { RepoDigests: [] },
    { Architecture: "amd64" },
    { Os: "darwin" },
  ])
    assert.throws(() =>
      assertCandidateImage(candidate, { ...inspect(candidate), ...patch }),
    );
});

test("verified metadata derives candidate identity from the actual image and runtime bytes", async (t) => {
  const { verifyImageMetadata } = await import("./lib/exui-oci-candidate.mjs");
  const { root, candidate, metadata } = await fixture(t);
  const actual = await verifyImageMetadata(candidate, metadata, root);
  assert.equal(actual.identity.artifactDigest, candidate.digest);
  assert.equal(actual.identity.webappCommit, candidate.sourceCommit);
  assert.equal(actual.identity.toolkitDigest, metadata.identity.toolkitDigest);
  assert.equal(actual.candidateRoot, await realpath(root));
  assert.equal(actual.provenance.sourceMethod, "docker-build");
});

test("unverified or mismatched producer metadata cannot substitute for this invocation", async (t) => {
  const { verifyImageMetadata } = await import("./lib/exui-oci-candidate.mjs");
  const { root, candidate, metadata } = await fixture(t);
  for (const patch of [
    { sourceIdentity: "unverified" },
    { sourceMethod: "git-archive" },
    { webappCommit: "f".repeat(40) },
    { sourceTree: "f".repeat(40) },
    { producerBuild: "40" },
    { producerJob: "other/job" },
    { invocationId: "a1ef376d-98ee-4462-9ab2-5aa1acfa580a" },
    {
      buildRuntime: {
        nodeVersion: "v24.22.1",
        platform: "linux",
        architecture: "x64",
      },
    },
  ]) {
    await assert.rejects(
      verifyImageMetadata(
        candidate,
        { ...metadata, provenance: { ...metadata.provenance, ...patch } },
        root,
      ),
    );
  }
  for (const patch of [
    { webappCommit: "f".repeat(40) },
    { toolkitVersion: "7.3.91" },
    { toolkitDigest: "unavailable" },
  ])
    await assert.rejects(
      verifyImageMetadata(
        candidate,
        { ...metadata, identity: { ...metadata.identity, ...patch } },
        root,
      ),
    );
});

test("tampered runtime trees, lockfile, missing entrypoints and escaping symlinks are rejected", async (t) => {
  const { verifyImageMetadata } = await import("./lib/exui-oci-candidate.mjs");
  for (const changed of [
    "config/default.json",
    "dist/rpx-exui/browser/index.html",
    "dist/rpx-exui/api/server.bundle.js",
    "api/package.json",
    "yarn.lock",
  ]) {
    const { root, candidate, metadata } = await fixture(t);
    await writeFile(path.join(root, changed), "changed");
    await assert.rejects(verifyImageMetadata(candidate, metadata, root));
  }
  const { root, candidate, metadata } = await fixture(t);
  await rm(path.join(root, "config"), { recursive: true });
  await symlink(os.tmpdir(), path.join(root, "config"));
  await assert.rejects(
    verifyImageMetadata(candidate, metadata, root),
    /escape|outside|symlink/i,
  );
});
