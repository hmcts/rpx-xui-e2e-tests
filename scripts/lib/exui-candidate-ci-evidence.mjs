import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { getReleasePolicy } from "./exui-release-policy.mjs";
import { validatePromotionReceipt } from "./exui-release-evidence.mjs";
import {
  digestBytes,
  loadRunEvidence,
  writeJsonAtomic,
} from "./exui-evidence-io.mjs";
import { validateNativePhaseFinalization } from "./exui-native-ci-ownership.mjs";
import { captureNativeOwnership } from "./exui-native-ci-ownership.mjs";
import { ARM64_BROWSER_RUNTIME } from "./exui-oci-runtime.mjs";
import { HARNESS_SOURCE_FILES } from "./exui-candidate-runtime.mjs";
import { CCD_HARNESS_SOURCE_FILES } from "./exui-ccd-browser-runtime.mjs";
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const safePath = (value) =>
  typeof value === "string" && path.isAbsolute(value) && !/[\r\n,]/.test(value);
const scopes = {
  family: "exui-wa-family-pilot",
  scope: "exui-wa-scope-pilot",
  ccd: "exui-ccd-pilot",
};
export function validateCiPhase(directory, expected, terminal) {
  assert.equal(terminal.signal, null, "CI_PHASE_TERMINAL_SIGNAL");
  assert([0, 1, 2].includes(terminal.code), "CI_PHASE_TERMINAL_REQUIRED");
  const policy = getReleasePolicy(expected.releaseScopeId);
  const loaded = loadRunEvidence(path.join(directory, "run.json"), policy);
  const bytes = fs.readFileSync(path.join(directory, "gate.json"));
  const receipt = JSON.parse(bytes);
  assert.deepEqual(
    receipt,
    loaded.receipt,
    "CI_PHASE_RECEIPT_RECOMPUTATION_MISMATCH",
  );
  if (expected.nativeAuthority)
    validateNativePhaseFinalization(
      directory,
      loaded.input.executions,
      terminal,
    );
  const promotion = {
    ...expected,
    evidenceManifestDigest: loaded.evidenceManifestDigest,
    receiptArtifactDigest: digestBytes(bytes),
  };
  const verdict = validatePromotionReceipt(receipt, promotion);
  assert.deepEqual(
    verdict,
    receipt.verdict,
    "CI_PHASE_INDEPENDENT_IDENTITY_MISMATCH",
  );
  assert.equal(
    loaded.input.manifest.runtimeMetadata.harnessSourceDigest,
    expected.harnessSourceDigest,
    "CI_PHASE_SOURCE_DIGEST_MISMATCH",
  );
  if (expected.harnessDependencyDigest)
    assert.equal(
      loaded.input.manifest.runtimeMetadata.harnessDependencyDigest,
      expected.harnessDependencyDigest,
      "CI_PHASE_DEPENDENCY_DIGEST_MISMATCH",
    );
  if (expected.browserDigest)
    assert.equal(
      loaded.input.manifest.runtimeMetadata.browserDigest,
      expected.browserDigest,
      "CI_PHASE_BROWSER_DIGEST_MISMATCH",
    );
  assert.equal(
    terminal.code,
    verdict.exitCode,
    "CI_PHASE_EXIT_RECEIPT_MISMATCH",
  );
  writeJsonAtomic(path.join(directory, "promotion-expected.json"), promotion);
  return {
    status: verdict.status,
    exitCode: verdict.exitCode,
    receiptArtifactDigest: promotion.receiptArtifactDigest,
  };
}

export function captureCiPhaseExpectation(
  name,
  input,
  handoff,
  context,
  directory,
) {
  const policy = getReleasePolicy(scopes[name]);
  assert.deepEqual(
    input.harnessSources,
    name === "ccd" ? CCD_HARNESS_SOURCE_FILES : HARNESS_SOURCE_FILES,
    "CI_LAUNCH_SOURCE_INVENTORY_MISMATCH",
  );
  assert.equal(
    input.harnessCommit,
    context.commit,
    "CI_LAUNCH_COMMIT_MISMATCH",
  );
  assert.equal(input.harnessSourceState, "clean", "CI_LAUNCH_SOURCE_NOT_CLEAN");
  assert.deepEqual(
    input.artifact.identity,
    context.artifact.identity,
    "CI_LAUNCH_ARTIFACT_MISMATCH",
  );
  assert.equal(
    input.harnessDependencies.digest,
    context.dependencies.digest,
    "CI_LAUNCH_DEPENDENCIES_MISMATCH",
  );
  assert.equal(
    input.browserDigest,
    context.browserDigest,
    "CI_LAUNCH_BROWSER_MISMATCH",
  );
  const sourceDigest = digestBytes(
    JSON.stringify(
      input.harnessSources.map((file) => {
        assert(
          !path.isAbsolute(file) && !file.split("/").includes(".."),
          "CI_LAUNCH_SOURCE_PATH_ESCAPE",
        );
        return [file, digestBytes(fs.readFileSync(path.join(ROOT, file)))];
      }),
    ),
  );
  assert.equal(
    sourceDigest,
    context.sourceDigests[name],
    "CI_PARENT_SOURCE_DIGEST_MISMATCH",
  );
  assert.equal(
    sourceDigest,
    input.harnessSourceDigest,
    "CI_LAUNCH_SOURCE_DIGEST_MISMATCH",
  );
  assert.equal(handoff.owner, input.runId, "CI_LAUNCH_OWNER_MISMATCH");
  if (handoff.mode !== "native-separate-api")
    assert.equal(
      handoff.cidFile,
      path.join(directory, "container-id"),
      "CI_LAUNCH_CID_PATH_MISMATCH",
    );
  assert(
    safePath(handoff.stagedHarness) &&
      fs
        .realpathSync(handoff.stagedHarness)
        .startsWith(fs.realpathSync(os.tmpdir()) + path.sep),
    "CI_PRIVATE_SOURCE_HANDOFF_REQUIRED",
  );
  const identity = name === "ccd" ? context.ccdIdentity : context.identity;
  return {
    runId: input.runId,
    harnessCommit: context.commit,
    releaseScopeId: policy.releaseScopeId,
    policyDigest: policy.policyDigest,
    identity,
    harnessSourceDigest: sourceDigest,
    harnessDependencyDigest: context.dependencies.digest,
    browserDigest: context.browserDigest,
    ...(handoff.mode === "native-separate-api"
      ? { nativeAuthority: true }
      : {}),
  };
}
export function captureCiOwnership(input, handoff, context, directory, name) {
  assert.deepEqual(
    input.harnessSources,
    name === "ccd" ? CCD_HARNESS_SOURCE_FILES : HARNESS_SOURCE_FILES,
    "CI_LAUNCH_SOURCE_INVENTORY_MISMATCH",
  );
  assert.equal(
    input.harnessSourceDigest,
    context.sourceDigests[name],
    "CI_PARENT_SOURCE_DIGEST_MISMATCH",
  );
  assert.equal(handoff.owner, input.runId, "CI_CLEANUP_OWNER_HANDOFF_MISMATCH");
  if (handoff.mode !== "native-separate-api")
    assert.equal(
      handoff.cidFile,
      path.join(directory, "container-id"),
      "CI_CLEANUP_CID_PATH_MISMATCH",
    );
  assert(safePath(handoff.stagedHarness), "CI_PRIVATE_SOURCE_HANDOFF_REQUIRED");
  const stage = fs.realpathSync(handoff.stagedHarness);
  assert.equal(stage, handoff.stagedHarness, "CI_SOURCE_SNAPSHOT_ALIAS");
  assert(
    stage.startsWith(fs.realpathSync(os.tmpdir()) + path.sep),
    "CI_PRIVATE_SOURCE_HANDOFF_REQUIRED",
  );
  const snapshotDigest = digestBytes(
    JSON.stringify(
      input.harnessSources.map((file) => {
        assert(
          !path.isAbsolute(file) && !file.split("/").includes(".."),
          "CI_SOURCE_SNAPSHOT_PATH_ESCAPE",
        );
        const source = path.join(stage, file);
        assert(
          fs.lstatSync(source).isFile() && fs.realpathSync(source) === source,
          "CI_SOURCE_SNAPSHOT_REGULAR_FILE_REQUIRED",
        );
        return [file, digestBytes(fs.readFileSync(source))];
      }),
    ),
  );
  assert.equal(
    snapshotDigest,
    input.harnessSourceDigest,
    "CI_SOURCE_SNAPSHOT_DIGEST_MISMATCH",
  );
  if (handoff.mode === "native-separate-api")
    return captureNativeOwnership(input, handoff, context, directory, name);
  const mounts = [
    { source: stage, target: "/harness", writable: false },
    {
      source: path.join(ROOT, "node_modules"),
      target: "/harness/node_modules",
      writable: false,
    },
    {
      source: context.artifact.candidateRoot,
      target: "/candidate",
      writable: false,
    },
    { source: directory, target: "/output", writable: true },
    { source: context.browserRoot, target: "/browser", writable: false },
  ];
  if (name === "scope")
    mounts.push({
      source: path.join(context.job.output, "private/scope-mutant/artifact"),
      target: "/mutant",
      writable: false,
    });
  return {
    owner: input.runId,
    image: ARM64_BROWSER_RUNTIME,
    network: name === "ccd" ? `container:${context.ccd.namespace}` : "none",
    mounts,
  };
}
