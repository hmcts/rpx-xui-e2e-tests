import {SELECTOR_EVENT_SCOPE} from './exui-selector-event-row-contract.mjs';
import {validateSelectorEventEvidence} from './exui-selector-event-row-evidence.mjs';
import {captureSelectorFaultOwnership} from './exui-native-ci-ownership.mjs';
import {APPLICANT_RESULTS_SCOPE} from './exui-applicant-results-contract.mjs';
import {validateApplicantResultsEvidence} from './exui-applicant-results-evidence.mjs';
import {captureApplicantFaultOwnership} from './exui-native-ci-ownership.mjs';
import {CALLBACK_SCOPE} from './exui-recipient-callback-contract.mjs';
import {validateCallbackTransitionEvidence} from './exui-recipient-callback-transition.mjs';
import {captureCallbackFaultOwnership} from './exui-native-ci-ownership.mjs';
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
import { captureNativeOwnership, captureEventFaultOwnership } from "./exui-native-ci-ownership.mjs";
import { EVENT_CAPABILITY_SCOPE } from "./exui-ccd-event-capability.mjs";
import { validateCompleteNativeProofs, validateNativeOutcome } from "./exui-native-proof-validation.mjs";
import { validateEventTransitionEvidence } from "./exui-ccd-event-transition.mjs";
import { ARM64_BROWSER_RUNTIME } from "./exui-oci-runtime.mjs";
import { HARNESS_SOURCE_FILES } from "./exui-candidate-runtime.mjs";
import { CCD_HARNESS_SOURCE_FILES } from "./exui-ccd-browser-runtime.mjs";
import {
  assertRoutingInterpreter,
  ROUTING_SCOPE,
} from "./exui-routing-contract.mjs";
import { nativeIdentity } from "./exui-native-contract.mjs";
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const safePath = (value) =>
  typeof value === "string" && path.isAbsolute(value) && !/[\r\n,]/.test(value);
const scopes = {
  hearingPublication: "exui-hearing-publication-pilot",
  globalSearch: "exui-global-search-pilot",
  routing: "exui-decentralised-routing-pilot",
  family: "exui-wa-family-pilot",
  scope: "exui-wa-scope-pilot",
  ccd: "exui-ccd-pilot",
  eventCapability: EVENT_CAPABILITY_SCOPE,
  recipientCallback: CALLBACK_SCOPE,
  applicantResults: APPLICANT_RESULTS_SCOPE,
  selectorEventRow: SELECTOR_EVENT_SCOPE,
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
  if (expected.nativeAuthority) {
    validateNativePhaseFinalization(
      directory,
      loaded.input.executions,
      terminal,
    );
  }
  if (expected.releaseScopeId === ROUTING_SCOPE) {
    const input = JSON.parse(fs.readFileSync(path.join(directory, "input.json"), "utf8"));
    const review = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fixtures/exui-configuration-review.json"), "utf8"));
    const interpreter = assertRoutingInterpreter(input.artifact, review, input.artifact.identity);
    const run = JSON.parse(fs.readFileSync(path.join(directory, "run.json"), "utf8"));
    assert.equal(input.releaseScopeId, ROUTING_SCOPE, "CI_ROUTING_SCOPE_REQUIRED");
    assert.deepEqual(input.routingInterpreter, interpreter, "CI_ROUTING_IMPLEMENTATION_MISMATCH");
    assert.deepEqual(expected.routingInterpreter, interpreter, "CI_ROUTING_EXPECTATION_MISMATCH");
    assert.equal(input.artifact.identity.artifactDigest, expected.identity.artifactDigest, "CI_ROUTING_CANDIDATE_MISMATCH");
    assert.equal(run.manifest.runtimeMetadata.routingInterpreter, JSON.stringify(interpreter), "CI_ROUTING_RUNTIME_IDENTITY_MISMATCH");
  }
  if (expected.releaseScopeId === EVENT_CAPABILITY_SCOPE) {
    assert.equal(expected.nativeAuthority, true, "CI_EVENT_NATIVE_AUTHORITY_REQUIRED");
    validateCompleteNativeProofs(loaded.input, policy);
    validateNativeOutcome(loaded.input, loaded.receipt.verdict);
    validateEventTransitionEvidence(directory, expected, loaded.input);
  }
  if (expected.releaseScopeId === CALLBACK_SCOPE) {
    assert.equal(expected.nativeAuthority,true,"CI_CALLBACK_NATIVE_AUTHORITY_REQUIRED");
    validateCompleteNativeProofs(loaded.input,policy);
    validateNativeOutcome(loaded.input,loaded.receipt.verdict);
    validateCallbackTransitionEvidence(directory,expected,loaded.input);
  }
  if(expected.releaseScopeId===SELECTOR_EVENT_SCOPE){
    assert.equal(expected.nativeAuthority,true,"CI_SELECTOR_NATIVE_AUTHORITY_REQUIRED");
    validateCompleteNativeProofs(loaded.input,policy);validateNativeOutcome(loaded.input,loaded.receipt.verdict);
    validateSelectorEventEvidence(directory,expected,loaded.input,terminal);
  }
  if(expected.releaseScopeId===APPLICANT_RESULTS_SCOPE){
    assert.equal(expected.nativeAuthority,true,"CI_RESULTS_NATIVE_AUTHORITY_REQUIRED");
    validateCompleteNativeProofs(loaded.input,policy);validateNativeOutcome(loaded.input,loaded.receipt.verdict);
    validateApplicantResultsEvidence(directory,expected,loaded.input,terminal);
  }
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
    ...(expected.releaseScopeId === EVENT_CAPABILITY_SCOPE ? { eventTransition: expected.eventTransition } : {}),
    ...(expected.releaseScopeId === CALLBACK_SCOPE ? {callbackTransition:expected.callbackTransition} : {}),
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
    ["ccd", "eventCapability", "recipientCallback", "applicantResults", "selectorEventRow"].includes(name) ? CCD_HARNESS_SOURCE_FILES : HARNESS_SOURCE_FILES,
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
  if (name === "routing")
    assert.deepEqual(
      input.routingInterpreter,
      assertRoutingInterpreter(
        context.artifact,
        JSON.parse(
          fs.readFileSync(
            path.join(ROOT, "scripts/fixtures/exui-configuration-review.json"),
            "utf8",
          ),
        ),
        context.artifact.identity,
      ),
      "CI_ROUTING_IMPLEMENTATION_MISMATCH",
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
  const identity = ["ccd", "eventCapability", "recipientCallback", "applicantResults", "selectorEventRow"].includes(name)
    ? context.ccdIdentity
    : name === "routing"
      ? nativeIdentity(input, { mutation: null }, context.artifact.candidateRoot).identity
      : context.identity;
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
    ...(name === "routing" ? { routingInterpreter: input.routingInterpreter } : {}),
  };
}
function captureOwnership(input, handoff, context, directory, name, capture) {
  assert.deepEqual(
    input.harnessSources,
    ["ccd", "eventCapability", "recipientCallback", "applicantResults", "selectorEventRow"].includes(name) ? CCD_HARNESS_SOURCE_FILES : HARNESS_SOURCE_FILES,
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
    return capture(input, handoff, context, directory, name);
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

export function captureCiOwnership(input, handoff, context, directory, name) {
  return captureOwnership(input, handoff, context, directory, name, captureNativeOwnership);
}

export function captureCiEventFaultOwnership(input, handoff, context, directory, invocationId) {
  assert.equal(handoff.mode, "native-separate-api", "CI_EVENT_NATIVE_AUTHORITY_REQUIRED");
  return captureOwnership(input, handoff, context, directory, "eventCapability", (input, handoff, context, directory) => captureEventFaultOwnership(input, handoff, context, directory, invocationId));
}

export function captureCiCallbackFaultOwnership(input,handoff,context,directory) {
  assert.equal(handoff.mode,"native-separate-api","CI_CALLBACK_NATIVE_AUTHORITY_REQUIRED");
  return captureOwnership(input,handoff,context,directory,"recipientCallback",(input,handoff,context,directory)=>captureCallbackFaultOwnership(input,handoff,context,directory));
}

export function captureCiApplicantFaultOwnership(input,handoff,context,directory,invocationId){
 assert.equal(handoff.mode,"native-separate-api","CI_RESULTS_NATIVE_AUTHORITY_REQUIRED");
 return captureOwnership(input,handoff,context,directory,"applicantResults",(input,handoff,context,directory)=>captureApplicantFaultOwnership(input,handoff,context,directory,invocationId));
}

export function captureCiSelectorFaultOwnership(input,handoff,context,directory){
 assert.equal(handoff.mode,"native-separate-api","CI_SELECTOR_NATIVE_AUTHORITY_REQUIRED");
 return captureOwnership(input,handoff,context,directory,"selectorEventRow",captureSelectorFaultOwnership);
}
