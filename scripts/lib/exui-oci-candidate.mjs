import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { digestCandidateTree } from "./exui-candidate-artifact.mjs";
import { digestBytes } from "./exui-evidence-io.mjs";

const sha256 = (value) =>
  typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const commit = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{40}$/.test(value) &&
  value !== "0".repeat(40);
const requireValue = (condition, code) => {
  if (!condition) throw new Error(code);
};

export function validateImageCandidate(candidate) {
  requireValue(
    candidate?.schemaVersion === 1,
    "INVALID_IMAGE_CANDIDATE_SCHEMA",
  );
  const registry =
    typeof candidate.registry === "string"
      ? /^([a-z0-9]+(?:[.-][a-z0-9]+)*)(?::([1-9][0-9]{0,4}))?$/.exec(
          candidate.registry,
        )
      : null;
  requireValue(
    registry && (!registry[2] || Number(registry[2]) <= 65535),
    "INVALID_IMAGE_REGISTRY",
  );
  requireValue(
    typeof candidate.repository === "string" &&
      /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/.test(
        candidate.repository,
      ),
    "INVALID_IMAGE_REPOSITORY",
  );
  requireValue(
    sha256(candidate.digest) && sha256(candidate.observedImageId),
    "IMMUTABLE_IMAGE_DIGEST_REQUIRED",
  );
  requireValue(
    candidate.imageReference ===
      `${candidate.registry}/${candidate.repository}@${candidate.digest}`,
    "IMAGE_REFERENCE_MISMATCH",
  );
  requireValue(
    commit(candidate.sourceCommit) && commit(candidate.sourceTree),
    "IMAGE_SOURCE_IDENTITY_REQUIRED",
  );
  requireValue(
    typeof candidate.producerJob === "string" &&
      candidate.producerJob.trim() === candidate.producerJob &&
      candidate.producerJob.length > 0 &&
      !/\p{Cc}/u.test(candidate.producerJob),
    "IMAGE_PRODUCER_JOB_REQUIRED",
  );
  requireValue(
    typeof candidate.producerBuild === "string" &&
      /^[1-9][0-9]*$/.test(candidate.producerBuild),
    "IMAGE_PRODUCER_BUILD_REQUIRED",
  );
  requireValue(
    typeof candidate.invocationId === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        candidate.invocationId,
      ),
    "IMAGE_INVOCATION_REQUIRED",
  );
  requireValue(
    typeof candidate.buildTag === "string" &&
      /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(candidate.buildTag),
    "INVALID_IMAGE_BUILD_TAG",
  );
  requireValue(
    ["linux/amd64", "linux/arm64"].includes(candidate.platform),
    "UNSUPPORTED_IMAGE_PLATFORM",
  );
  return candidate;
}

export function assertCandidateImage(candidate, inspected) {
  validateImageCandidate(candidate);
  requireValue(
    sha256(inspected?.Id),
    "IMAGE_OBSERVED_ID_REQUIRED",
  );
  requireValue(
    Array.isArray(inspected.RepoDigests) &&
      inspected.RepoDigests.includes(candidate.imageReference),
    "IMAGE_REPOSITORY_DIGEST_MISMATCH",
  );
  requireValue(
    `${inspected.Os}/${inspected.Architecture}` === candidate.platform,
    "IMAGE_PLATFORM_MISMATCH",
  );
}

async function payloadPath(root, relative, directory = false) {
  let target = root;
  for (const part of relative.split("/")) {
    target = path.join(target, part);
    const resolved = await realpath(target);
    requireValue(
      resolved.startsWith(`${root}${path.sep}`),
      "IMAGE_PAYLOAD_SYMLINK_ESCAPE",
    );
  }
  const stat = await lstat(target);
  requireValue(
    directory ? stat.isDirectory() : stat.isFile(),
    "IMAGE_PAYLOAD_ENTRY_MISSING",
  );
  return target;
}

// Runtime toolkit pruning is intentional: its pre-pruning seal comes from metadata inside the verified image.
export async function verifyImageMetadata(candidate, metadata, runtimeRoot) {
  validateImageCandidate(candidate);
  requireValue(metadata?.schemaVersion === 1, "INVALID_IMAGE_METADATA_SCHEMA");
  const provenance = metadata.provenance;
  requireValue(
    provenance?.sourceMethod === "docker-build" &&
      provenance.sourceIdentity === "ci-supplied",
    "VERIFIED_IMAGE_BUILD_METADATA_REQUIRED",
  );
  for (const [producerKey, metadataKey] of Object.entries({
    sourceCommit: "webappCommit",
    sourceTree: "sourceTree",
    producerJob: "producerJob",
    producerBuild: "producerBuild",
    invocationId: "invocationId",
  }))
    requireValue(
      candidate[producerKey] === provenance[metadataKey],
      "IMAGE_BUILD_PROVENANCE_MISMATCH",
    );
  const runtime = provenance.buildRuntime;
  const architecture = { x64: "amd64", arm64: "arm64" }[runtime?.architecture];
  requireValue(
    runtime?.platform === "linux" &&
      `${runtime.platform}/${architecture}` === candidate.platform &&
      /^v\d+\.\d+\.\d+$/.test(runtime.nodeVersion ?? ""),
    "IMAGE_BUILD_RUNTIME_MISMATCH",
  );
  const identity = metadata.identity;
  requireValue(
    identity?.webappCommit === candidate.sourceCommit,
    "IMAGE_SOURCE_IDENTITY_MISMATCH",
  );
  for (const key of [
    "dependencyLockDigest",
    "toolkitDigest",
    "configurationDigest",
    "frontendDigest",
    "apiBundleDigest",
    "distDigest",
    "apiSourceDigest",
  ])
    requireValue(sha256(identity[key]), "IMAGE_METADATA_DIGEST_REQUIRED");
  const root = await realpath(runtimeRoot);
  const packageJson = JSON.parse(
    await readFile(await payloadPath(root, "package.json"), "utf8"),
  );
  requireValue(
    typeof identity.toolkitVersion === "string" &&
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
        identity.toolkitVersion,
      ) &&
      packageJson.dependencies?.["@hmcts/ccd-case-ui-toolkit"] ===
        identity.toolkitVersion,
    "IMAGE_TOOLKIT_PIN_MISMATCH",
  );
  requireValue(
    digestBytes(await readFile(await payloadPath(root, "yarn.lock"))) ===
      identity.dependencyLockDigest,
    "IMAGE_LOCK_DIGEST_MISMATCH",
  );
  for (const [key, relative] of Object.entries({
    configurationDigest: "config",
    frontendDigest: "dist/rpx-exui/browser",
    apiBundleDigest: "dist/rpx-exui/api",
    distDigest: "dist",
    apiSourceDigest: "api",
  }))
    requireValue(
      (await digestCandidateTree(await payloadPath(root, relative, true))) ===
        identity[key],
      "IMAGE_PAYLOAD_DIGEST_MISMATCH",
    );
  await payloadPath(root, "dist/rpx-exui/browser/index.html");
  await payloadPath(root, "dist/rpx-exui/api/server.bundle.js");
  return {
    schemaVersion: 1,
    candidateRoot: root,
    provenance,
    payloadDigest: candidate.digest,
    identity: {
      webappCommit: candidate.sourceCommit,
      artifactDigest: candidate.digest,
      dependencyLockDigest: identity.dependencyLockDigest,
      toolkitVersion: identity.toolkitVersion,
      toolkitDigest: identity.toolkitDigest,
      configurationDigest: identity.configurationDigest,
    },
  };
}
